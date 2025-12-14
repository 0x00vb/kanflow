import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, PUBSUB_CHANNELS } from '@/lib/cache/redis'
import { columnSchema } from '@/lib/validation/schemas'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth, checkPermission } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'
import { createActivity } from '@/lib/activities'

// GET /api/boards/[id]/columns - List board columns
export const GET = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const boardId = params.id

  try {
    // Check permissions
    const hasPermission = await checkPermission(userId, 'board', boardId)
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/columns', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to view this board' },
        { status: 403 }
      )
    }

    // Get columns from database
    const columns = await prisma.column.findMany({
      where: { boardId },
      include: {
        _count: {
          select: {
            tasks: true,
          },
        },
      },
      orderBy: {
        position: 'asc',
      },
    })

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/columns', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'GET', route: '/api/boards/[id]/columns' }, responseTime / 1000)

    logger.info({ userId, boardId, columnCount: columns.length, responseTime }, 'Retrieved board columns')

    return NextResponse.json({
      success: true,
      data: columns,
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, boardId, responseTime }, 'Failed to retrieve columns')

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/columns', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to retrieve columns',
      },
      { status: 500 }
    )
  }
})

// POST /api/boards/[id]/columns - Create column
export const POST = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const boardId = params.id

  try {
    // Check permissions (must be at least MEMBER)
    const hasPermission = await checkPermission(userId, 'board', boardId, 'MEMBER')
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards/[id]/columns', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to create columns on this board' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validate input
    const validationResult = columnSchema.safeParse(body)
    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards/[id]/columns', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { title, position } = validationResult.data

    // Check if position is already taken and adjust if necessary
    const existingColumn = await prisma.column.findFirst({
      where: {
        boardId,
        position,
      },
    })

    if (existingColumn) {
      // Shift existing columns to make room
      await prisma.column.updateMany({
        where: {
          boardId,
          position: {
            gte: position,
          },
        },
        data: {
          position: {
            increment: 1,
          },
        },
      })
    }

    // Create column
    const column = await prisma.column.create({
      data: {
        boardId,
        title,
        position,
      },
      include: {
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    })

    // Create activity record
    await createActivity({
      boardId,
      userId,
      type: 'COLUMN_CREATED',
      data: {
        columnTitle: column.title,
        position: column.position,
      },
    })

    // Invalidate board cache
    await redisClient.del(CACHE_KEYS.BOARD(boardId))
    await redisClient.del(CACHE_KEYS.USER_BOARDS(userId))

    // Publish WebSocket event for real-time updates
    const columnEvent = {
      type: 'column:created',
      data: column,
      timestamp: Date.now(),
      boardId,
    }

    await redisClient.publish(PUBSUB_CHANNELS.BOARD_UPDATES(boardId), JSON.stringify(columnEvent))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards/[id]/columns', status_code: '201' })
    metrics.httpRequestDuration.observe({ method: 'POST', route: '/api/boards/[id]/columns' }, responseTime / 1000)

    logger.info({ userId, boardId, columnId: column.id, responseTime }, 'Column created successfully')

    return NextResponse.json({
      success: true,
      data: column,
      message: 'Column created successfully',
    }, { status: 201 })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, boardId, responseTime }, 'Failed to create column')

    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards/[id]/columns', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to create column',
      },
      { status: 500 }
    )
  }
})
