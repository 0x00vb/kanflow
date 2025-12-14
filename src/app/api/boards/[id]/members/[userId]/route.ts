import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS, PUBSUB_CHANNELS } from '@/lib/cache/redis'
import { updateMemberSchema } from '@/lib/validation/schemas'
import { getUserFromRequest } from '@/lib/auth'
import { withAuth, checkPermission } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'
import { createActivity } from '@/lib/activities'

// PUT /api/boards/[id]/members/[userId] - Update member role
export const PUT = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string; userId: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId: requestingUserId } = getUserFromRequest(request)
  const boardId = params.id
  const memberToUpdateId = params.userId

  try {
    // Get the membership to check current state
    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId: memberToUpdateId,
        },
      },
    })

    if (!membership) {
      metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]/members/[userId]', status_code: '404' })

      return NextResponse.json(
        { error: 'Member not found on this board' },
        { status: 404 }
      )
    }

    // Only OWNER can change roles
    const hasPermission = await checkPermission(requestingUserId, 'board', boardId, 'OWNER')
    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]/members/[userId]', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'Only board owners can change member roles' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validate input
    const validationResult = updateMemberSchema.safeParse(body)
    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]/members/[userId]', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { role: newRole } = validationResult.data

    // Prevent demoting the last owner
    if (membership.role === 'OWNER' && newRole !== 'OWNER') {
      const ownerCount = await prisma.boardMember.count({
        where: {
          boardId,
          role: 'OWNER',
        },
      })

      if (ownerCount <= 1) {
        metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]/members/[userId]', status_code: '400' })

        return NextResponse.json(
          { error: 'Cannot change role', message: 'Boards must have at least one owner' },
          { status: 400 }
        )
      }
    }

    // Prevent users from changing their own role to something lower than OWNER
    if (requestingUserId === memberToUpdateId && newRole !== 'OWNER') {
      metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]/members/[userId]', status_code: '400' })

      return NextResponse.json(
        { error: 'Cannot change own role', message: 'You cannot demote yourself from owner' },
        { status: 400 }
      )
    }

    // Update member role
    const updatedMember = await prisma.boardMember.update({
      where: {
        boardId_userId: {
          boardId,
          userId: memberToUpdateId,
        },
      },
      data: {
        role: newRole,
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

    // Invalidate caches
    await redisClient.del(CACHE_KEYS.BOARD(boardId))
    await redisClient.del(CACHE_KEYS.BOARD_MEMBERS(boardId))
    await redisClient.del(CACHE_KEYS.USER_BOARDS(memberToUpdateId))

    // Publish WebSocket event for real-time updates
    const memberEvent = {
      type: 'member:updated',
      data: updatedMember,
      timestamp: Date.now(),
      boardId,
    }

    await redisClient.publish(PUBSUB_CHANNELS.BOARD_UPDATES(boardId), JSON.stringify(memberEvent))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]/members/[userId]', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'PUT', route: '/api/boards/[id]/members/[userId]' }, responseTime / 1000)

    logger.info({
      requestingUserId,
      boardId,
      memberToUpdateId,
      oldRole: membership.role,
      newRole,
      responseTime
    }, 'Member role updated successfully')

    return NextResponse.json({
      success: true,
      data: updatedMember,
      message: 'Member role updated successfully',
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({
      error: errorMessage,
      requestingUserId,
      boardId,
      memberToUpdateId,
      responseTime
    }, 'Failed to update member role')

    metrics.httpRequestsTotal.inc({ method: 'PUT', route: '/api/boards/[id]/members/[userId]', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to update member role',
      },
      { status: 500 }
    )
  }
})

// DELETE /api/boards/[id]/members/[userId] - Remove board member
export const DELETE = withAuth(async (request: NextRequest, context: { params: Promise<{ id: string; userId: string }> }) => {
  const params = await context.params;
  const startTime = Date.now()
  const { userId: requestingUserId } = getUserFromRequest(request)
  const boardId = params.id
  const memberToRemoveId = params.userId

  try {
    // Get the membership to check roles
    const membership = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId: memberToRemoveId,
        },
      },
    })

    if (!membership) {
      metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/boards/[id]/members/[userId]', status_code: '404' })

      return NextResponse.json(
        { error: 'Member not found on this board' },
        { status: 404 }
      )
    }

    // Users can remove themselves, or admins/owners can remove others
    let hasPermission = false

    if (requestingUserId === memberToRemoveId) {
      // Users can always remove themselves
      hasPermission = true
    } else {
      // Check if current user has admin/owner permissions
      hasPermission = await checkPermission(requestingUserId, 'board', boardId, 'ADMIN')
    }

    if (!hasPermission) {
      metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/boards/[id]/members/[userId]', status_code: '403' })

      return NextResponse.json(
        { error: 'Access denied', message: 'You do not have permission to remove members from this board' },
        { status: 403 }
      )
    }

    // Prevent removing the last owner
    if (membership.role === 'OWNER') {
      const ownerCount = await prisma.boardMember.count({
        where: {
          boardId,
          role: 'OWNER',
        },
      })

      if (ownerCount <= 1) {
        metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/boards/[id]/members/[userId]', status_code: '400' })

        return NextResponse.json(
          { error: 'Cannot remove last owner', message: 'Boards must have at least one owner' },
          { status: 400 }
        )
      }
    }

    // Get user info for activity record before deletion
    const userInfo = await prisma.user.findUnique({
      where: { id: memberToRemoveId },
      select: { name: true },
    })

    // Remove member from board
    await prisma.boardMember.delete({
      where: {
        boardId_userId: {
          boardId,
          userId: memberToRemoveId,
        },
      },
    })

    // Create activity record
    await createActivity({
      boardId,
      userId: requestingUserId,
      type: 'MEMBER_REMOVED',
      data: {
        removedUserId: memberToRemoveId,
        removedUserName: userInfo?.name || 'Unknown User',
        removedBySelf: requestingUserId === memberToRemoveId,
      },
    })

    // If user removed themselves, also remove their assignments from tasks
    if (requestingUserId === memberToRemoveId) {
      await prisma.task.updateMany({
        where: {
          column: {
            boardId,
          },
          assigneeId: memberToRemoveId,
        },
        data: {
          assigneeId: null,
        },
      })
    }

    // Invalidate caches
    await redisClient.del(CACHE_KEYS.BOARD(boardId))
    await redisClient.del(CACHE_KEYS.BOARD_MEMBERS(boardId))
    await redisClient.del(CACHE_KEYS.USER_BOARDS(memberToRemoveId))

    // Publish WebSocket event for real-time updates
    const memberEvent = {
      type: 'member:removed',
      data: { userId: memberToRemoveId },
      timestamp: Date.now(),
      boardId,
    }

    await redisClient.publish(PUBSUB_CHANNELS.BOARD_UPDATES(boardId), JSON.stringify(memberEvent))

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/boards/[id]/members/[userId]', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'DELETE', route: '/api/boards/[id]/members/[userId]' }, responseTime / 1000)

    logger.info({ requestingUserId, boardId, memberToRemoveId, responseTime }, 'Board member removed successfully')

    return NextResponse.json({
      success: true,
      message: 'Member removed from board successfully',
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, requestingUserId, boardId, memberToRemoveId, responseTime }, 'Failed to remove board member')

    metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/boards/[id]/members/[userId]', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to remove board member',
      },
      { status: 500 }
    )
  }
})