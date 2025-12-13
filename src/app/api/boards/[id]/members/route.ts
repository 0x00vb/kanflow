import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS } from '@/lib/cache/redis'
import { withAuth, checkPermission } from '@/middleware/auth'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'
import { z } from 'zod'

// CUID validation
const cuidSchema = z.string().regex(/^[a-z][a-z0-9]{24}$/i, 'Invalid user ID')

const addMemberSchema = z.object({
  userId: cuidSchema,
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
})

// POST /api/boards/[id]/members - Add board member
export const POST = withAuth(async (request: NextRequest, { params }: { params: { id: string } }) => {
  const startTime = Date.now()
  const userId = request.user!.id
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

    // Verify the user to be added exists
    const userToAdd = await prisma.user.findUnique({
      where: { id: newMemberId },
      select: { id: true, name: true, email: true },
    })

    if (!userToAdd) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards/[id]/members', status_code: '404' })

      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if user is already a member
    const existingMember = await prisma.boardMember.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId: newMemberId,
        },
      },
    })

    if (existingMember) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/boards/[id]/members', status_code: '409' })

      return NextResponse.json(
        { error: 'User is already a member of this board' },
        { status: 409 }
      )
    }

    // Add member to board
    const boardMember = await prisma.boardMember.create({
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

    // Invalidate caches
    await redisClient.del(CACHE_KEYS.BOARD(boardId))
    await redisClient.del(CACHE_KEYS.BOARD_MEMBERS(boardId))
    await redisClient.del(CACHE_KEYS.USER_BOARDS(newMemberId))

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
