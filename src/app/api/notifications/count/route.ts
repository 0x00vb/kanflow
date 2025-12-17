import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

// GET /api/notifications/count - Get unread notification count
export const GET = withAuth(async (request: NextRequest) => {
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)

  try {
    // Try to get from cache first
    const cacheKey = CACHE_KEYS.NOTIFICATIONS_COUNT(userId)
    const cachedCount = await redisClient.get(cacheKey)

    if (cachedCount !== null) {
      const responseTime = Date.now() - startTime
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/notifications/count', status_code: '200' })
      metrics.cacheHits.inc({ cache_type: 'redis' })

      logger.info({ userId, responseTime, cached: true }, 'Retrieved notification count from cache')
      return NextResponse.json({
        success: true,
        data: { count: parseInt(cachedCount) },
        cached: true,
      })
    }

    // Get unread notification count from database
    const unreadCount = await prisma.notification.count({
      where: {
        userId,
        read: false,
      },
    })

    // Cache the result
    await redisClient.setEx(cacheKey, CACHE_TTL.NOTIFICATIONS_COUNT, unreadCount.toString())

    const responseTime = Date.now() - startTime
    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/notifications/count', status_code: '200' })
    metrics.cacheMisses.inc({ cache_type: 'redis' })

    logger.info({ userId, unreadCount, responseTime }, 'Retrieved unread notification count')

    return NextResponse.json({
      success: true,
      data: { count: unreadCount },
      cached: false,
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, responseTime }, 'Failed to retrieve notification count')

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/notifications/count', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to retrieve notification count',
      },
      { status: 500 }
    )
  }
})

