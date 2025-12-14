import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS } from '@/lib/cache/redis'
import { commentSchema } from '@/lib/validation/schemas'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth, checkPermission } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'
import { createActivity } from '@/lib/activities'

// POST /api/tasks/[id]/comments - Add comment
export const POST = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const taskId = params.id

  try {
    // Get task with board info to check permissions
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: {
          select: {
            boardId: true,
          },
        },
      },
    })

    if (!task) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/tasks/[id]/comments', status_code: '404' })

      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    // Check permissions
    const hasPermission = await checkPermission(userId, 'board', task.column.boardId)
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/tasks/[id]/comments', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to comment on this task' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validate input
    const validationResult = commentSchema.safeParse(body)
    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/tasks/[id]/comments', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { content } = validationResult.data

    // Create comment
    const comment = await prisma.comment.create({
      data: {
        taskId,
        userId,
        content,
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
    })

    // Create activity record
    await createActivity({
      boardId: task.column.boardId,
      userId,
      taskId,
      type: 'COMMENT_ADDED',
      data: {
        commentPreview: content.length > 50 ? content.substring(0, 50) + '...' : content,
      },
    })

    // Invalidate board cache
    await redisClient.del(CACHE_KEYS.BOARD(task.column.boardId))
    await redisClient.del(CACHE_KEYS.USER_BOARDS(userId))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/tasks/[id]/comments', status_code: '201' })
    metrics.httpRequestDuration.observe({ method: 'POST', route: '/api/tasks/[id]/comments' }, responseTime / 1000)

    logger.info({ userId, taskId, boardId: task.column.boardId, commentId: comment.id, responseTime }, 'Comment added successfully')

    return NextResponse.json({
      success: true,
      data: comment,
      message: 'Comment added successfully',
    }, { status: 201 })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, taskId, responseTime }, 'Failed to add comment')

    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/tasks/[id]/comments', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to add comment',
      },
      { status: 500 }
    )
  }
})
