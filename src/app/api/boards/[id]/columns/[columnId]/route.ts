import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, PUBSUB_CHANNELS } from '@/lib/cache/redis'
import { columnSchema } from '@/lib/validation/schemas'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth, checkPermission } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

// PUT /api/boards/[id]/columns/[columnId] - Update column
export const PUT = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string; columnId: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const boardId = params.id
  const columnId = params.columnId

  try {
    // Check permissions (must be at least MEMBER)
    const hasPermission = await checkPermission(userId, 'board', boardId, 'MEMBER')
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]/columns/[columnId]', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to update columns on this board' },
        { status: 403 }
      )
    }

    // Verify column belongs to board
    const column = await prisma.column.findFirst({
      where: {
        id: columnId,
        boardId,
      },
    })

    if (!column) {
      metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]/columns/[columnId]', status_code: '404' })

      return NextResponse.json(
        { error: 'Column not found' },
        { status: 404 }
      )
    }

    const body = await request.json()

    // Validate input
    const validationResult = columnSchema.safeParse(body)
    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]/columns/[columnId]', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { title, position } = validationResult.data

    // If position changed, handle reordering
    if (position !== column.position) {
      // Shift other columns
      if (position > column.position) {
        // Moving right - shift columns between old and new position left
        await prisma.column.updateMany({
          where: {
            boardId,
            position: {
              gt: column.position,
              lte: position,
            },
          },
          data: {
            position: {
              decrement: 1,
            },
          },
        })
      } else {
        // Moving left - shift columns between new and old position right
        await prisma.column.updateMany({
          where: {
            boardId,
            position: {
              gte: position,
              lt: column.position,
            },
          },
          data: {
            position: {
              increment: 1,
            },
          },
        })
      }
    }

    // Update column
    const updatedColumn = await prisma.column.update({
      where: { id: columnId },
      data: {
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

    // Invalidate board cache
    await redisClient.del(CACHE_KEYS.BOARD(boardId))
    await redisClient.del(CACHE_KEYS.USER_BOARDS(userId))

    // Publish WebSocket event for real-time updates
    const columnEvent = {
      type: 'column:updated',
      data: updatedColumn,
      timestamp: Date.now(),
      boardId,
    }

    await redisClient.publish(PUBSUB_CHANNELS.BOARD_UPDATES(boardId), JSON.stringify(columnEvent))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]/columns/[columnId]', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'PUT', route: '/api/boards/[id]/columns/[columnId]' }, responseTime / 1000)

    logger.info({ userId, boardId, columnId, responseTime }, 'Column updated successfully')

    return NextResponse.json({
      success: true,
      data: updatedColumn,
      message: 'Column updated successfully',
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, boardId, columnId, responseTime }, 'Failed to update column')

    metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]/columns/[columnId]', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to update column',
      },
      { status: 500 }
    )
  }
})

// DELETE /api/boards/[id]/columns/[columnId] - Delete column
export const DELETE = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string; columnId: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const boardId = params.id
  const columnId = params.columnId

  try {
    // Check permissions (must be at least ADMIN)
    const hasPermission = await checkPermission(userId, 'board', boardId, 'ADMIN')
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/boards/[id]/columns/[columnId]', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to delete columns on this board' },
        { status: 403 }
      )
    }

    // Verify column belongs to board
    const column = await prisma.column.findFirst({
      where: {
        id: columnId,
        boardId,
      },
    })

    if (!column) {
      metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/boards/[id]/columns/[columnId]', status_code: '404' })

      return NextResponse.json(
        { error: 'Column not found' },
        { status: 404 }
      )
    }

    // Delete column (cascade will handle tasks)
    await prisma.column.delete({
      where: { id: columnId },
    })

    // Reorder remaining columns
    await prisma.column.updateMany({
      where: {
        boardId,
        position: {
          gt: column.position,
        },
      },
      data: {
        position: {
          decrement: 1,
        },
      },
    })

    // Invalidate board cache
    await redisClient.del(CACHE_KEYS.BOARD(boardId))
    await redisClient.del(CACHE_KEYS.USER_BOARDS(userId))

    // Publish WebSocket event for real-time updates
    const columnEvent = {
      type: 'column:deleted',
      data: { columnId },
      timestamp: Date.now(),
      boardId,
    }

    await redisClient.publish(PUBSUB_CHANNELS.BOARD_UPDATES(boardId), JSON.stringify(columnEvent))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/boards/[id]/columns/[columnId]', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'DELETE', route: '/api/boards/[id]/columns/[columnId]' }, responseTime / 1000)

    logger.info({ userId, boardId, columnId, responseTime }, 'Column deleted successfully')

    return NextResponse.json({
      success: true,
      message: 'Column deleted successfully',
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, boardId, columnId, responseTime }, 'Failed to delete column')

    metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/boards/[id]/columns/[columnId]', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to delete column',
      },
      { status: 500 }
    )
  }
})
