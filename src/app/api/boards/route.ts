import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'
import { boardSchema } from '@/lib/validation/schemas'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

// GET /api/boards - List user's boards
export const GET = withAuth(async (request: NextRequest) => {
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)

  try {
    // Try to get from cache first
    const cacheKey = CACHE_KEYS.USER_BOARDS(userId)
    const cachedBoards = await redisClient.get(cacheKey)

    if (cachedBoards) {
      const responseTime = Date.now() - startTime

      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards', status_code: '200' })
      metrics.httpRequestDuration.observe({ method: 'GET', route: '/api/boards' }, responseTime / 1000)
      metrics.cacheHits.inc({ cache_type: 'redis' })

      logger.info({ userId, responseTime, cached: true }, 'Retrieved user boards from cache')

      return NextResponse.json({
        success: true,
        data: JSON.parse(cachedBoards),
        cached: true,
      })
    }

    // Get boards from database
    const boards = await prisma.board.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: {
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
        _count: {
          select: {
            columns: true,
            members: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    // Cache the result
    await redisClient.setEx(cacheKey, CACHE_TTL.USER_BOARDS, JSON.stringify(boards))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'GET', route: '/api/boards' }, responseTime / 1000)
    metrics.cacheMisses.inc({ cache_type: 'redis' })

    logger.info({ userId, boardCount: boards.length, responseTime }, 'Retrieved user boards from database')

    return NextResponse.json({
      success: true,
      data: boards,
      cached: false,
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, responseTime }, 'Failed to retrieve boards')

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to retrieve boards',
      },
      { status: 500 }
    )
  }
})

// POST /api/boards - Create new board
export const POST = withAuth(async (request: NextRequest) => {
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)

  try {
    const body = await request.json()

    // Validate input
    const validationResult = boardSchema.safeParse(body)
    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { title, description, isPublic } = validationResult.data

    // Create board and add creator as owner
    const board = await prisma.board.create({
      data: {
        title,
        description,
        isPublic,
        members: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
        // Create default columns
        columns: {
          create: [
            { title: 'To Do', position: 0 },
            { title: 'In Progress', position: 1 },
            { title: 'Done', position: 2 },
          ],
        },
      },
      include: {
        members: {
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
        columns: true,
        _count: {
          select: {
            columns: true,
            members: true,
          },
        },
      },
    })

    // Invalidate user's boards cache
    const cacheKey = CACHE_KEYS.USER_BOARDS(userId)
    await redisClient.del(cacheKey)

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards', status_code: '201' })
    metrics.httpRequestDuration.observe({ method: 'POST', route: '/api/boards' }, responseTime / 1000)

    logger.info({ userId, boardId: board.id, responseTime }, 'Board created successfully')

    return NextResponse.json({
      success: true,
      data: board,
      message: 'Board created successfully',
    }, { status: 201 })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, responseTime }, 'Failed to create board')

    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to create board',
      },
      { status: 500 }
    )
  }
})
