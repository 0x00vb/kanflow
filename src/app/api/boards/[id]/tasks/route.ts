import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { withAuth, checkPermission } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

// GET /api/boards/[id]/tasks - List all board tasks
export const GET = withAuth(async (request: NextRequest, { params }: { params: { id: string } }) => {
  const startTime = Date.now()
  const userId = request.user!.id
  const boardId = params.id

  try {
    // Check permissions
    const hasPermission = await checkPermission(userId, 'board', boardId)
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/tasks', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to view tasks on this board' },
        { status: 403 }
      )
    }

    // Get all tasks from all columns in the board
    const tasks = await prisma.task.findMany({
      where: {
        column: {
          boardId,
        },
      },
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
        column: {
          select: {
            id: true,
            title: true,
            position: true,
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
    })

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/tasks', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'GET', route: '/api/boards/[id]/tasks' }, responseTime / 1000)

    logger.info({ userId, boardId, taskCount: tasks.length, responseTime }, 'Retrieved board tasks')

    return NextResponse.json({
      success: true,
      data: tasks,
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, boardId, responseTime }, 'Failed to retrieve board tasks')

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/boards/[id]/tasks', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to retrieve tasks',
      },
      { status: 500 }
    )
  }
})
