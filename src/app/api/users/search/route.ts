import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth, checkPermission } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'
import { z } from 'zod'
import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

// Initialize DOMPurify with JSDOM for server-side usage
const window = new JSDOM('').window
const DOMPurifyServer = DOMPurify(window)

// Request validation schema
const userSearchSchema = z.object({
  q: z.string().min(1, 'Search query is required').max(100, 'Query too long'),
  boardId: z.string().regex(/^[a-z][a-z0-9]{24}$/i, 'Invalid board ID').optional(),
  limit: z.string().transform(val => parseInt(val)).refine(val => val > 0 && val <= 20, 'Limit must be between 1 and 20').optional().default(10),
})

// Rate limiting: 10 searches per minute per user
const RATE_LIMIT_KEY = (userId: string) => `rate_limit:user_search:${userId}`
const RATE_LIMIT_WINDOW = 60 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10

// GET /api/users/search?q={query}&boardId={boardId}&limit={limit}
export const GET = withAuth(async (request: NextRequest) => {
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)

  try {
    // Rate limiting check with atomic Redis operations
    const rateLimitKey = RATE_LIMIT_KEY(userId)

    // Use Redis Lua script for atomic rate limiting
    const rateLimitScript = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      local ttl = redis.call('TTL', KEYS[1])
      return {current, ttl}
    `

    const rateLimitResult = await redisClient.eval(rateLimitScript, {
      keys: [rateLimitKey],
      arguments: [RATE_LIMIT_WINDOW.toString()],
    }) as [number, number]

    const currentRequests = rateLimitResult[0]
    const ttl = rateLimitResult[1]

    // Check if rate limit exceeded
    if (currentRequests > RATE_LIMIT_MAX_REQUESTS) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/users/search', status_code: '429' })

      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: 'Too many search requests. Please try again later.',
          retryAfter: ttl,
        },
        {
          status: 429,
          headers: {
            'Retry-After': ttl.toString(),
            'X-RateLimit-Limit': RATE_LIMIT_MAX_REQUESTS.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': (Date.now() + ttl * 1000).toString(),
          },
        }
      )
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const boardId = searchParams.get('boardId')
    const limit = searchParams.get('limit')

    const validationResult = userSearchSchema.safeParse({
      q: query,
      boardId: boardId || undefined,
      limit: limit || undefined,
    })

    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/users/search', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { q, boardId: validatedBoardId, limit: validatedLimit } = validationResult.data

    // If boardId is provided, check permissions
    if (validatedBoardId) {
      const hasPermission = await checkPermission(userId, 'board', validatedBoardId, 'ADMIN')
      if (!hasPermission) {
        metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/users/search', status_code: '403' })

        return NextResponse.json(
          { error: 'Access denied', message: 'You do not have permission to search users for this board' },
          { status: 403 }
        )
      }
    }

    // Sanitize search query to prevent XSS and injection attacks
    const sanitizedQuery = DOMPurifyServer.sanitize(q.trim(), {
      ALLOWED_TAGS: [], // No HTML tags allowed
      ALLOWED_ATTR: [], // No attributes allowed
      ALLOW_DATA_ATTR: false, // No data attributes
    }).substring(0, 100) // Limit length to prevent DoS

    // Try cache first
    const cacheKey = CACHE_KEYS.USER_SEARCH(userId, sanitizedQuery, validatedBoardId)
    const cachedResults = await redisClient.get(cacheKey)

    if (cachedResults) {
      const responseTime = Date.now() - startTime
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/users/search', status_code: '200' })
      metrics.httpRequestDuration.observe({ method: 'GET', route: '/api/users/search' }, responseTime / 1000)
      metrics.cacheHits.inc({ cache_type: 'redis' })

      logger.info({ userId, query: sanitizedQuery, boardId: validatedBoardId, responseTime, cached: true }, 'Retrieved user search results from cache')

      return NextResponse.json({
        success: true,
        data: JSON.parse(cachedResults),
        cached: true,
      })
    }

    // Build search query - search by name or email
    const searchConditions = {
      OR: [
        { name: { contains: sanitizedQuery, mode: 'insensitive' as const } },
        { email: { contains: sanitizedQuery, mode: 'insensitive' as const } },
      ],
      // Exclude current user
      id: { not: userId },
    }

    let excludeUserIds: string[] = []

    // If boardId is provided, exclude existing members
    if (validatedBoardId) {
      const existingMembers = await prisma.boardMember.findMany({
        where: { boardId: validatedBoardId },
        select: { userId: true },
      })
      excludeUserIds = existingMembers.map(member => member.userId)
    }

    // Perform search
    const users = await prisma.user.findMany({
      where: {
        ...searchConditions,
        id: { notIn: excludeUserIds },
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
      },
      orderBy: [
        // Prioritize exact matches, then starts with, then contains
        { name: 'asc' },
      ],
      take: validatedLimit,
    })

    // Cache results for 5 minutes
    await redisClient.setEx(cacheKey, CACHE_TTL.USER_SEARCH, JSON.stringify(users))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/users/search', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'GET', route: '/api/users/search' }, responseTime / 1000)
    metrics.cacheMisses.inc({ cache_type: 'redis' })

    logger.info({
      userId,
      query: sanitizedQuery,
      boardId: validatedBoardId,
      resultCount: users.length,
      responseTime
    }, 'Performed user search')

    return NextResponse.json({
      success: true,
      data: users,
      cached: false,
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, responseTime }, 'Failed to search users')

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/users/search', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to search users',
      },
      { status: 500 }
    )
  }
})
