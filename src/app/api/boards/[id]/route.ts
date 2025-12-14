import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'
import { boardSchema, updateBoardSchema } from '@/lib/validation/schemas'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth, checkPermission } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

// GET /api/boards/[id] - Get board details
export const GET = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const boardId = params.id

  try {
    // Check permissions
    const hasPermission = await checkPermission(userId, 'board', boardId)
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to view this board' },
        { status: 403 }
      )
    }

    // Try to get from cache first
    const cacheKey = CACHE_KEYS.BOARD(boardId)
    const cachedBoard = await redisClient.get(cacheKey)

    if (cachedBoard) {
      const responseTime = Date.now() - startTime

      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]', status_code: '200' })
      metrics.httpRequestDuration.observe({ method: 'GET', route: '/api/boards/[id]' }, responseTime / 1000)
      metrics.cacheHits.inc({ cache_type: 'redis' })

      logger.info({ userId, boardId, responseTime, cached: true }, 'Retrieved board from cache')

      return NextResponse.json({
        success: true,
        data: JSON.parse(cachedBoard),
        cached: true,
      })
    }

    // Get board from database
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        members: {
          select: {
            id: true,
            boardId: true,
            userId: true,
            role: true,
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
        },
        columns: {
          include: {
            tasks: {
              include: {
                assignee: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    avatar: true,
                  },
                },
                comments: {
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
                    createdAt: 'asc',
                  },
                },
                _count: {
                  select: {
                    comments: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
          orderBy: {
            position: 'asc',
          },
        },
        _count: {
          select: {
            columns: true,
            members: true,
          },
        },
      },
    })

    if (!board) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]', status_code: '404' })

      return NextResponse.json(
        { error: 'Board not found' },
        { status: 404 }
      )
    }

    // Cache the result
    await redisClient.setEx(cacheKey, CACHE_TTL.BOARD, JSON.stringify(board))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'GET', route: '/api/boards/[id]' }, responseTime / 1000)
    metrics.cacheMisses.inc({ cache_type: 'redis' })

    logger.info({ userId, boardId, responseTime }, 'Retrieved board from database')

    return NextResponse.json({
      success: true,
      data: board,
      cached: false,
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, boardId, responseTime }, 'Failed to retrieve board')

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to retrieve board',
      },
      { status: 500 }
    )
  }
})

// PUT /api/boards/[id] - Update board
export const PUT = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const boardId = params.id

  try {
    // Check permissions (must be at least ADMIN)
    const hasPermission = await checkPermission(userId, 'board', boardId, 'ADMIN')
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to update this board' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validate input
    const validationResult = updateBoardSchema.safeParse(body)
    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const updateData = validationResult.data

    // Update board
    const board = await prisma.board.update({
      where: { id: boardId },
      data: updateData,
      include: {
        members: {
          select: {
            id: true,
            boardId: true,
            userId: true,
            role: true,
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
        },
        columns: {
          include: {
            tasks: {
              include: {
                assignee: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    avatar: true,
                  },
                },
                comments: {
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
                    createdAt: 'asc',
                  },
                },
                _count: {
                  select: {
                    comments: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
          orderBy: {
            position: 'asc',
          },
        },
        _count: {
          select: {
            columns: true,
            members: true,
          },
        },
      },
    })

    // Invalidate caches
    await redisClient.del(CACHE_KEYS.BOARD(boardId))
    await redisClient.del(CACHE_KEYS.USER_BOARDS(userId))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'PUT', route: '/api/boards/[id]' }, responseTime / 1000)

    logger.info({ userId, boardId, responseTime }, 'Board updated successfully')

    return NextResponse.json({
      success: true,
      data: board,
      message: 'Board updated successfully',
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, boardId, responseTime }, 'Failed to update board')

    metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to update board',
      },
      { status: 500 }
    )
  }
})

// DELETE /api/boards/[id] - Delete board
export const DELETE = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const boardId = params.id

  try {
    // Check permissions (must be OWNER)
    const hasPermission = await checkPermission(userId, 'board', boardId, 'OWNER')
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/boards/[id]', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'Only the board owner can delete this board' },
        { status: 403 }
      )
    }

    // Delete board (cascade will handle related records)
    await prisma.board.delete({
      where: { id: boardId },
    })

    // Invalidate caches
    await redisClient.del(CACHE_KEYS.BOARD(boardId))
    await redisClient.del(CACHE_KEYS.USER_BOARDS(userId))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/boards/[id]', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'DELETE', route: '/api/boards/[id]' }, responseTime / 1000)

    logger.info({ userId, boardId, responseTime }, 'Board deleted successfully')

    return NextResponse.json({
      success: true,
      message: 'Board deleted successfully',
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, boardId, responseTime }, 'Failed to delete board')

    metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/boards/[id]', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to delete board',
      },
      { status: 500 }
    )
  }
})
