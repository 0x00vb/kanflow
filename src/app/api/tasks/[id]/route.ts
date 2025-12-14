import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, PUBSUB_CHANNELS } from '@/lib/cache/redis'
import { updateTaskSchema } from '@/lib/validation/schemas'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth, checkPermission } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'
import { createActivity } from '@/lib/activities'

// GET /api/tasks/[id] - Get task details
export const GET = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const taskId = params.id

  try {
    // Get task with board info to check permissions
    const task = await prisma.task.findUnique({
      where: { id: taskId },
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
          include: {
            board: {
              select: {
                id: true,
                title: true,
                isPublic: true,
              },
            },
          },
        },
        _count: {
          select: {
            comments: true,
          },
        },
      },
    })

    if (!task) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/tasks/[id]', status_code: '404' })

      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    // Check permissions
    const hasPermission = await checkPermission(userId, 'board', task.column.board.id)
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/tasks/[id]', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to view this task' },
        { status: 403 }
      )
    }

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/tasks/[id]', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'GET', route: '/api/tasks/[id]' }, responseTime / 1000)

    logger.info({ userId, taskId, boardId: task.column.board.id, responseTime }, 'Retrieved task details')

    return NextResponse.json({
      success: true,
      data: task,
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, taskId, responseTime }, 'Failed to retrieve task')

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/tasks/[id]', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to retrieve task',
      },
      { status: 500 }
    )
  }
})

// PUT /api/tasks/[id] - Update task
export const PUT = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const taskId = params.id

  try {
    // Get current task to check permissions
    const currentTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: {
          select: {
            boardId: true,
          },
        },
      },
    })

    if (!currentTask) {
      metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/tasks/[id]', status_code: '404' })

      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    // Check permissions (must be at least MEMBER)
    const hasPermission = await checkPermission(userId, 'board', currentTask.column.boardId, 'MEMBER')
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/tasks/[id]', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to update this task' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validate input
    const validationResult = updateTaskSchema.safeParse(body)
    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/tasks/[id]', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const updateData = validationResult.data

    // If assignee is being updated, verify they are a board member
    if (updateData.assigneeId) {
      const isMember = await prisma.boardMember.findUnique({
        where: {
          boardId_userId: {
            boardId: currentTask.column.boardId,
            userId: updateData.assigneeId,
          },
        },
      })

      if (!isMember) {
        metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/tasks/[id]', status_code: '400' })

        return NextResponse.json(
          { error: 'Invalid assignee', message: 'Assignee must be a member of the board' },
          { status: 400 }
        )
      }
    }

    // Handle due date conversion
    const processedUpdateData = {
      ...updateData,
      dueDate: updateData.dueDate ? new Date(updateData.dueDate) : updateData.dueDate,
    }

    // Update task
    const task = await prisma.task.update({
      where: { id: taskId },
      data: processedUpdateData,
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
          include: {
            board: {
              select: {
                id: true,
                title: true,
                isPublic: true,
              },
            },
          },
        },
        _count: {
          select: {
            comments: true,
          },
        },
      },
    })

    // Determine if this is a task move (column change) or regular update
    const isTaskMove = updateData.columnId && updateData.columnId !== currentTask.columnId

    // Create activity record
    await createActivity({
      boardId: currentTask.column.boardId,
      userId,
      taskId: task.id,
      type: isTaskMove ? 'TASK_MOVED' : 'TASK_UPDATED',
      data: {
        taskTitle: task.title,
        oldColumnId: isTaskMove ? currentTask.columnId : undefined,
        newColumnId: isTaskMove ? task.columnId : undefined,
      },
    })

    // Invalidate board cache
    await redisClient.del(CACHE_KEYS.BOARD(currentTask.column.boardId))
    await redisClient.del(CACHE_KEYS.USER_BOARDS(userId))

    // Publish WebSocket event for real-time updates
    console.log('📡 Publishing WebSocket event:', { isTaskMove, updateData, currentColumnId: currentTask.columnId, newColumnId: updateData.columnId })

    const taskEvent = {
      type: isTaskMove ? 'task:moved' : 'task:updated',
      data: isTaskMove
        ? {
            id: task.id,
            columnId: task.columnId,
            position: 0, // TODO: Add position calculation if needed
          }
        : task,
      timestamp: Date.now(),
      boardId: currentTask.column.boardId,
    }

    console.log('📡 Publishing event:', taskEvent)
    await redisClient.publish(PUBSUB_CHANNELS.BOARD_UPDATES(currentTask.column.boardId), JSON.stringify(taskEvent))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/tasks/[id]', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'PUT', route: '/api/tasks/[id]' }, responseTime / 1000)

    logger.info({ userId, taskId, boardId: currentTask.column.boardId, responseTime }, 'Task updated successfully')

    return NextResponse.json({
      success: true,
      data: task,
      message: 'Task updated successfully',
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, taskId, responseTime }, 'Failed to update task')

    metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/tasks/[id]', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to update task',
      },
      { status: 500 }
    )
  }
})

// DELETE /api/tasks/[id] - Delete task
export const DELETE = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const taskId = params.id

  try {
    // Get current task to check permissions
    const currentTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: {
          select: {
            boardId: true,
          },
        },
      },
    })

    if (!currentTask) {
      metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/tasks/[id]', status_code: '404' })

      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    // Check permissions (must be at least MEMBER)
    const hasPermission = await checkPermission(userId, 'board', currentTask.column.boardId, 'MEMBER')
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/tasks/[id]', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to delete this task' },
        { status: 403 }
      )
    }

    // Store task info before deletion for activity
    const taskInfo = {
      title: currentTask.title,
      columnId: currentTask.columnId,
    }

    // Delete task
    await prisma.task.delete({
      where: { id: taskId },
    })

    // Create activity record (must be after deletion to avoid foreign key issues)
    await createActivity({
      boardId: currentTask.column.boardId,
      userId,
      taskId: taskId, // Keep taskId even though task is deleted
      type: 'TASK_DELETED',
      data: {
        taskTitle: taskInfo.title,
        columnId: taskInfo.columnId,
      },
    })

    // Invalidate board cache
    await redisClient.del(CACHE_KEYS.BOARD(currentTask.column.boardId))
    await redisClient.del(CACHE_KEYS.USER_BOARDS(userId))

    // Publish WebSocket event for real-time updates
    const taskEvent = {
      type: 'task:deleted',
      data: { taskId },
      timestamp: Date.now(),
      boardId: currentTask.column.boardId,
    }

    await redisClient.publish(PUBSUB_CHANNELS.BOARD_UPDATES(currentTask.column.boardId), JSON.stringify(taskEvent))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/tasks/[id]', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'DELETE', route: '/api/tasks/[id]' }, responseTime / 1000)

    logger.info({ userId, taskId, boardId: currentTask.column.boardId, responseTime }, 'Task deleted successfully')

    return NextResponse.json({
      success: true,
      message: 'Task deleted successfully',
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, taskId, responseTime }, 'Failed to delete task')

    metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/tasks/[id]', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to delete task',
      },
      { status: 500 }
    )
  }
})
