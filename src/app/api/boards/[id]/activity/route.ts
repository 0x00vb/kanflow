import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'
import { activityFilterSchema } from '@/lib/validation/schemas'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth, checkPermission } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

// GET /api/boards/[id]/activity - Get board activity feed
export const GET = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const boardId = params.id

  try {
    // Check permissions - user must be a board member
    const hasPermission = await checkPermission(userId, 'board', boardId)
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/activity', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to view activities on this board' },
        { status: 403 }
      )
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const queryParams = {
      type: searchParams.get('type') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
    }

    // Validate query parameters
    const validationResult = activityFilterSchema.safeParse(queryParams)
    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/activity', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { type, limit, offset } = validationResult.data

    // Try to get from cache first
    const cacheKey = CACHE_KEYS.BOARD_ACTIVITIES(boardId)
    const cacheFilterKey = `${cacheKey}:${type || 'all'}:${limit}:${offset}`

    const cachedActivities = await redisClient.get(cacheFilterKey)
    if (cachedActivities) {
      const responseTime = Date.now() - startTime

      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/activity', status_code: '200' })
      metrics.cacheHits.inc({ cache_type: 'redis' })

      logger.info({ userId, boardId, type, limit, offset, responseTime, cached: true }, 'Retrieved board activities from cache')

      return NextResponse.json({
        success: true,
        data: JSON.parse(cachedActivities),
        cached: true,
      })
    }

    // Build where clause
    const whereClause: any = {
      boardId,
    }

    if (type) {
      whereClause.type = type
    }

    // Get activities from database with pagination
    const activities = await prisma.activity.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
          },
        },
        board: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    })

    // Get total count for pagination
    const totalCount = await prisma.activity.count({
      where: whereClause,
    })

    const result = {
      activities,
      pagination: {
        page: Math.floor(offset / limit) + 1,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    }

    // Cache the result
    await redisClient.setEx(cacheFilterKey, CACHE_TTL.BOARD_ACTIVITIES, JSON.stringify(result))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/activity', status_code: '200' })
    metrics.cacheMisses.inc({ cache_type: 'redis' })

    logger.info({
      userId,
      boardId,
      type,
      limit,
      offset,
      activityCount: activities.length,
      totalCount,
      responseTime
    }, 'Retrieved board activities from database')

    return NextResponse.json({
      success: true,
      data: result,
      cached: false,
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, boardId, responseTime }, 'Failed to retrieve board activities')

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/activity', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to retrieve activities',
      },
      { status: 500 }
    )
  }
})
