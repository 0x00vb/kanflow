import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

// GET /api/users/[id] - Get user details (public profile info only)
export const GET = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  // Security headers
  const headers = new Headers({
    'Cache-Control': 'private, max-age=1800', // 30 minutes
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  })
  const params = await context.params;
  const startTime = Date.now()
  const { userId: currentUserId } = getUserFromRequest(request)
  const requestedUserId = params.id

  try {
    // Check cache first
    const cacheKey = CACHE_KEYS.USER(requestedUserId)
    const cachedUser = await redisClient.get(cacheKey)

    if (cachedUser) {
      const responseTime = Date.now() - startTime
      metrics.cacheHits.inc({ cache_type: 'redis' })
      logger.debug({ userId: requestedUserId, responseTime, cached: true }, 'Retrieved user from cache')

      return NextResponse.json({
        success: true,
        data: JSON.parse(cachedUser),
        cached: true,
      }, { headers })
    }

    // Fetch user from database (only public profile fields)
    const user = await prisma.user.findUnique({
      where: { id: requestedUserId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        // Note: password is intentionally excluded for security
      },
    })

    if (!user) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/users/[id]', status_code: '404' })
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers }
      )
    }

    // Cache the result (only cache public profile data)
    await redisClient.setEx(cacheKey, CACHE_TTL.USER, JSON.stringify(user))

    const responseTime = Date.now() - startTime
    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/users/[id]', status_code: '200' })
    metrics.cacheMisses.inc({ cache_type: 'redis' })

    logger.info({
      currentUserId,
      requestedUserId,
      responseTime,
      cached: false
    }, 'Retrieved user details')

    return NextResponse.json({
      success: true,
      data: user,
      cached: false,
    }, { headers })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({
      error: errorMessage,
      currentUserId,
      requestedUserId,
      responseTime
    }, 'Failed to retrieve user details')

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/users/[id]', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to retrieve user details',
      },
      { status: 500, headers: new Headers({
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
      }) }
    )
  }
})
