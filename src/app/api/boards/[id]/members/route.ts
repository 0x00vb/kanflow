import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, PUBSUB_CHANNELS } from '@/lib/cache/redis'
import { addMemberSchema } from '@/lib/validation/schemas'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth, checkPermission } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'
import { createActivity } from '@/lib/activities'

// POST /api/boards/[id]/members - Add board member
export const POST = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId } = getUserFromRequest(request)
  const boardId = params.id

  try {
    // Check permissions (must be at least ADMIN)
    const hasPermission = await checkPermission(userId, 'board', boardId, 'ADMIN')
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards/[id]/members', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to add members to this board' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validate input
    const validationResult = addMemberSchema.safeParse(body)
    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards/[id]/members', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { userId: newMemberId, role } = validationResult.data

    // Use database transaction to prevent race conditions
    const boardMember = await prisma.$transaction(async (tx) => {
      // Verify the user to be added exists
      const userToAdd = await tx.user.findUnique({
        where: { id: newMemberId },
        select: { id: true, name: true, email: true },
      })

      if (!userToAdd) {
        throw new Error('USER_NOT_FOUND')
      }

      // Check if user is already a member (atomic check within transaction)
      const existingMember = await tx.boardMember.findUnique({
        where: {
          boardId_userId: {
            boardId,
            userId: newMemberId,
          },
        },
      })

      if (existingMember) {
        throw new Error('USER_ALREADY_MEMBER')
      }

      // Add member to board
      return await tx.boardMember.create({
        data: {
          boardId,
          userId: newMemberId,
          role,
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
    }, {
      maxWait: 5000, // 5 second timeout
      timeout: 10000, // 10 second transaction timeout
    })

    // Create activity record
    await createActivity({
      boardId,
      userId,
      type: 'MEMBER_ADDED',
      data: {
        addedUserId: newMemberId,
        addedUserName: boardMember.user.name,
        role: boardMember.role,
      },
    })

    // Invalidate caches
    await redisClient.del(CACHE_KEYS.BOARD(boardId))
    await redisClient.del(CACHE_KEYS.BOARD_MEMBERS(boardId))
    await redisClient.del(CACHE_KEYS.USER_BOARDS(newMemberId))

    // Publish WebSocket event for real-time updates
    const memberEvent = {
      type: 'member:added',
      data: boardMember,
      timestamp: Date.now(),
      boardId,
    }

    await redisClient.publish(PUBSUB_CHANNELS.BOARD_UPDATES(boardId), JSON.stringify(memberEvent))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards/[id]/members', status_code: '201' })
    metrics.httpRequestDuration.observe({ method: 'POST', route: '/api/boards/[id]/members' }, responseTime / 1000)

    logger.info({ userId, boardId, newMemberId, role, responseTime }, 'Board member added successfully')

    return NextResponse.json({
      success: true,
      data: boardMember,
      message: 'Member added to board successfully',
    }, { status: 201 })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, userId, boardId, responseTime }, 'Failed to add board member')

    // Handle specific transaction errors
    if (errorMessage === 'USER_NOT_FOUND') {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards/[id]/members', status_code: '404' })
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    if (errorMessage === 'USER_ALREADY_MEMBER') {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards/[id]/members', status_code: '409' })
      return NextResponse.json(
        { error: 'User is already a member of this board' },
        { status: 409 }
      )
    }

    // Handle transaction timeout
    if (errorMessage.includes('Transaction') || errorMessage.includes('timeout')) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards/[id]/members', status_code: '503' })
      return NextResponse.json(
        {
          error: 'Service temporarily unavailable',
          message: 'Please try again in a moment',
        },
        { status: 503 }
      )
    }

    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards/[id]/members', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to add board member',
      },
      { status: 500 }
    )
  }
})
