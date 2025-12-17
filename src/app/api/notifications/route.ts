import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

// GET /api/notifications - Get user's notifications
export const GET = withAuth(async (request: NextRequest) => {
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)

  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
    const offset = parseInt(searchParams.get('offset') || '0')
    const unreadOnly = searchParams.get('unreadOnly') === 'true'

    // Create cache key
    const cacheKey = CACHE_KEYS.USER_NOTIFICATIONS(userId)

    // Try to get from cache first (but skip if filtering by unread)
    const cachedNotifications = !unreadOnly ? await redisClient.get(cacheKey) : null

    if (cachedNotifications) {
      const responseTime = Date.now() - startTime
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/notifications', status_code: '200' })
      metrics.cacheHits.inc({ cache_type: 'redis' })

      logger.info({ userId, limit, offset, unreadOnly, responseTime, cached: true }, 'Retrieved notifications from cache')
      return NextResponse.json({
        success: true,
        data: JSON.parse(cachedNotifications),
        cached: true,
      })
    }

    // Build where clause
    const whereClause: any = {
      userId,
    }

    if (unreadOnly) {
      whereClause.read = false
    }

    // Get notifications from database
    const [notifications, totalCount] = await Promise.all([
      prisma.notification.findMany({
        where: whereClause,
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({
        where: whereClause,
      }),
    ])

    const result = {
      notifications,
      pagination: {
        page: Math.floor(offset / limit) + 1,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    }

    // Cache the result (only if not filtering by unread)
    if (!unreadOnly) {
      await redisClient.setEx(cacheKey, CACHE_TTL.USER_NOTIFICATIONS, JSON.stringify(result))
    }

    const responseTime = Date.now() - startTime
    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/notifications', status_code: '200' })
    metrics.cacheMisses.inc({ cache_type: 'redis' })

    logger.info({
      userId,
      limit,
      offset,
      unreadOnly,
      notificationCount: notifications.length,
      totalCount,
      responseTime,
    }, 'Retrieved user notifications')

    return NextResponse.json({
      success: true,
      data: result,
      cached: false,
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, responseTime }, 'Failed to retrieve notifications')

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/notifications', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to retrieve notifications',
      },
      { status: 500 }
    )
  }
})

// PUT /api/notifications - Mark notifications as read/unread
export const PUT = withAuth(async (request: NextRequest) => {
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)

  try {
    const body = await request.json()
    const { notificationIds, read } = body

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return NextResponse.json(
        { error: 'notificationIds must be a non-empty array' },
        { status: 400 }
      )
    }

    if (typeof read !== 'boolean') {
      return NextResponse.json(
        { error: 'read must be a boolean' },
        { status: 400 }
      )
    }

    // Update notifications (only user's own notifications)
    const updateResult = await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId, // Security: only update user's own notifications
      },
      data: {
        read,
      },
    })

    // Invalidate caches
    await redisClient.del(CACHE_KEYS.USER_NOTIFICATIONS(userId))
    await redisClient.del(CACHE_KEYS.NOTIFICATIONS_COUNT(userId))

    const responseTime = Date.now() - startTime
    metrics.httpRequestsTotal.inc({ method: 'PATCH', route: '/api/notifications', status_code: '200' })

    logger.info({
      userId,
      notificationIds,
      read,
      updatedCount: updateResult.count,
      responseTime,
    }, 'Updated notification read status')

    return NextResponse.json({
      success: true,
      data: {
        updatedCount: updateResult.count,
      },
      message: `Marked ${updateResult.count} notification(s) as ${read ? 'read' : 'unread'}`,
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, responseTime }, 'Failed to update notifications')

    metrics.httpRequestsTotal.inc({ method: 'PATCH', route: '/api/notifications', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to update notifications',
      },
      { status: 500 }
    )
  }
})
