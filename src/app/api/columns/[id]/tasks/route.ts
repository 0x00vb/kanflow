import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, PUBSUB_CHANNELS } from '@/lib/cache/redis'
import { taskSchema } from '@/lib/validation/schemas'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth, checkPermission } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'
import { createActivity } from '@/lib/activities'

// GET /api/columns/[id]/tasks - List column tasks
export const GET = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const columnId = params.id

  try {
    // Get column with board info to check permissions
    const column = await prisma.column.findUnique({
      where: { id: columnId },
      select: {
        boardId: true,
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
    })

    if (!column) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/columns/[id]/tasks', status_code: '404' })

      return NextResponse.json(
        { error: 'Column not found' },
        { status: 404 }
      )
    }

    // Check permissions
    const hasPermission = await checkPermission(userId, 'board', column.boardId)
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/columns/[id]/tasks', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to view tasks in this column' },
        { status: 403 }
      )
    }

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/columns/[id]/tasks', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'GET', route: '/api/columns/[id]/tasks' }, responseTime / 1000)

    logger.info({ userId, columnId, boardId: column.boardId, taskCount: column.tasks.length, responseTime }, 'Retrieved column tasks')

    return NextResponse.json({
      success: true,
      data: column.tasks,
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, columnId, responseTime }, 'Failed to retrieve column tasks')

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/columns/[id]/tasks', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to retrieve tasks',
      },
      { status: 500 }
    )
  }
})

// POST /api/columns/[id]/tasks - Create task
export const POST = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const columnId = params.id

  try {
    // Get column with board info to check permissions
    const column = await prisma.column.findUnique({
      where: { id: columnId },
      select: {
        boardId: true,
        board: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    })

    if (!column) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/columns/[id]/tasks', status_code: '404' })

      return NextResponse.json(
        { error: 'Column not found' },
        { status: 404 }
      )
    }

    // Check permissions (must be at least MEMBER)
    const hasPermission = await checkPermission(userId, 'board', column.boardId, 'MEMBER')
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/columns/[id]/tasks', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to create tasks on this board' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validate input
    const validationResult = taskSchema.safeParse(body)
    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/columns/[id]/tasks', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { title, description, assigneeId, dueDate, priority, labels } = validationResult.data

    // If assignee is specified, verify they are a board member
    if (assigneeId) {
      const isMember = await prisma.boardMember.findUnique({
        where: {
          boardId_userId: {
            boardId: column.boardId,
            userId: assigneeId,
          },
        },
      })

      if (!isMember) {
        metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/columns/[id]/tasks', status_code: '400' })

        return NextResponse.json(
          { error: 'Invalid assignee', message: 'Assignee must be a member of the board' },
          { status: 400 }
        )
      }
    }

    // Create task
    const task = await prisma.task.create({
      data: {
        columnId,
        title,
        description,
        assigneeId,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority,
        labels,
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
    })

    // Invalidate board cache
    await redisClient.del(CACHE_KEYS.BOARD(column.boardId))
    await redisClient.del(CACHE_KEYS.USER_BOARDS(userId))

    // Create activity record
    await createActivity({
      boardId: column.boardId,
      userId,
      taskId: task.id,
      type: 'TASK_CREATED',
      data: {
        taskTitle: task.title,
        columnTitle: column.board.title,
      },
    })

    // Publish WebSocket event for real-time updates
    const taskEvent = {
      type: 'task:created',
      data: task,
      timestamp: Date.now(),
      boardId: column.boardId,
    }

    await redisClient.publish(PUBSUB_CHANNELS.BOARD_UPDATES(column.boardId), JSON.stringify(taskEvent))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/columns/[id]/tasks', status_code: '201' })
    metrics.httpRequestDuration.observe({ method: 'POST', route: '/api/columns/[id]/tasks' }, responseTime / 1000)

    logger.info({ userId, columnId, boardId: column.boardId, taskId: task.id, responseTime }, 'Task created successfully')

    return NextResponse.json({
      success: true,
      data: task,
      message: 'Task created successfully',
    }, { status: 201 })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, columnId, responseTime }, 'Failed to create task')

    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/columns/[id]/tasks', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to create task',
      },
      { status: 500 }
    )
  }
})
