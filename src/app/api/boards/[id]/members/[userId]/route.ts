import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS } from '@/lib/cache/redis'
import { withAuth, checkPermission } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

// DELETE /api/boards/[id]/members/[userId] - Remove board member
export const DELETE = withAuth(async (request: NextRequest, { params }: { params: { id: string; userId: string } }) => {
  const startTime = Date.now()
  const currentUserId = request.user!.id
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

    if (currentUserId === memberToRemoveId) {
      // Users can always remove themselves
      hasPermission = true
    } else {
      // Check if current user has admin/owner permissions
      hasPermission = await checkPermission(currentUserId, 'board', boardId, 'ADMIN')
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

    // Remove member from board
    await prisma.boardMember.delete({
      where: {
        boardId_userId: {
          boardId,
          userId: memberToRemoveId,
        },
      },
    })

    // If user removed themselves, also remove their assignments from tasks
    if (currentUserId === memberToRemoveId) {
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

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'DELETE', route: '/api/boards/[id]/members/[userId]', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'DELETE', route: '/api/boards/[id]/members/[userId]' }, responseTime / 1000)

    logger.info({ currentUserId, boardId, memberToRemoveId, responseTime }, 'Board member removed successfully')

    return NextResponse.json({
      success: true,
      message: 'Member removed from board successfully',
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, currentUserId, boardId, memberToRemoveId, responseTime }, 'Failed to remove board member')

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
