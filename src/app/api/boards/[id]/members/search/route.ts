import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth, checkPermission } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'
import { z } from 'zod'

// Request validation schema for board member search
const boardMemberSearchSchema = z.object({
  q: z.string().min(1, 'Search query is required').max(50, 'Query too long'),
  limit: z.string().transform(val => parseInt(val)).refine(val => val > 0 && val <= 10, 'Limit must be between 1 and 10').optional().default(5),
})

// Rate limiting: 30 searches per minute per user (higher than user search since it's for mentions)
const RATE_LIMIT_KEY = (userId: string) => `rate_limit:board_member_search:${userId}`
const RATE_LIMIT_WINDOW = 60 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30

// GET /api/boards/[id]/members/search?q={query}&limit={limit}
export const GET = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const boardId = params.id

  try {
    // Check if user is a member of the board (basic permission check)
    const isMember = await prisma.boardMember.findFirst({
      where: {
        boardId,
        userId,
      },
    })

    if (!isMember) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/members/search', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You are not a member of this board' },
        { status: 403 }
      )
    }

    // Rate limiting check
    const rateLimitKey = RATE_LIMIT_KEY(userId)
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

    if (currentRequests > RATE_LIMIT_MAX_REQUESTS) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/members/search', status_code: '429' })

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
    const limit = searchParams.get('limit')

    const validationResult = boardMemberSearchSchema.safeParse({
      q: query,
      limit: limit || undefined,
    })

    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/members/search', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { q, limit: validatedLimit } = validationResult.data

    // Create cache key
    const cacheKey = `board_members_search:${boardId}:${q}:${validatedLimit}`

    // Try cache first
    const cachedResults = await redisClient.get(cacheKey)
    if (cachedResults) {
      const responseTime = Date.now() - startTime
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/members/search', status_code: '200' })
      metrics.cacheHits.inc({ cache_type: 'redis' })

      logger.info({ userId, boardId, query: q, responseTime, cached: true }, 'Retrieved board member search results from cache')

      return NextResponse.json({
        success: true,
        data: JSON.parse(cachedResults),
        cached: true,
      })
    }

    // Search among board members only
    const boardMembers = await prisma.boardMember.findMany({
      where: {
        boardId,
        user: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
          // Exclude current user from mentions
          id: { not: userId },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        user: {
          name: 'asc',
        },
      },
      take: validatedLimit,
    })

    // Transform to user objects for the response
    const users = boardMembers.map(member => member.user)

    // Cache results for 2 minutes (shorter than user search since board membership can change)
    await redisClient.setEx(cacheKey, 120, JSON.stringify(users))

    const responseTime = Date.now() - startTime
    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/members/search', status_code: '200' })
    metrics.cacheMisses.inc({ cache_type: 'redis' })

    logger.info({
      userId,
      boardId,
      query: q,
      resultCount: users.length,
      responseTime
    }, 'Performed board member search for mentions')

    return NextResponse.json({
      success: true,
      data: users,
      cached: false,
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, boardId, responseTime }, 'Failed to search board members')

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/members/search', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to search board members',
      },
      { status: 500 }
    )
  }
})


