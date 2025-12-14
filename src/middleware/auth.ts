import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, JWTPayload } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/database'

export interface AuthenticatedRequest extends NextRequest {
  user: JWTPayload
}

/**
 * Authentication middleware for API routes
 */
export function authenticateRequest(request: NextRequest): AuthenticatedRequest {
  try {
    const user = getUserFromRequest(request as AuthenticatedRequest)
    const authenticatedRequest = request as AuthenticatedRequest
    authenticatedRequest.user = user
    return authenticatedRequest
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.warn({ error: errorMessage }, 'Authentication failed')
    throw new Error('Invalid or expired token')
  }
}

/**
 * Require authentication for a route
 */
export function withAuth<T extends unknown[]>(
  handler: (request: AuthenticatedRequest, ...args: T) => Promise<Response> | Response
) {
  return (request: NextRequest, ...args: T): Promise<Response> | Response => {
    try {
      const authenticatedRequest = authenticateRequest(request)
      return handler(authenticatedRequest, ...args)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage }, 'Authentication middleware error')

      return NextResponse.json(
        { error: 'Authentication required', message: errorMessage },
        { status: 401 }
      )
    }
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export function optionalAuth(request: NextRequest): AuthenticatedRequest | NextRequest {
  try {
    const user = getUserFromRequest(request as AuthenticatedRequest)
    const authenticatedRequest = request as AuthenticatedRequest
    authenticatedRequest.user = user
    return authenticatedRequest
  } catch (error) {
    // Silently fail for optional auth
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.debug({ error: errorMessage }, 'Optional auth failed, continuing without user')
    return request
  }
}

/**
 * Check if user has permission for a resource
 */
export async function checkPermission(
  userId: string,
  resourceType: 'board' | 'task',
  resourceId: string,
  requiredRole?: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
): Promise<boolean> {
  try {
    if (resourceType === 'board') {
      const membership = await prisma.boardMember.findUnique({
        where: {
          boardId_userId: {
            boardId: resourceId,
            userId: userId,
          },
        },
      })

      if (!membership) return false

      if (requiredRole) {
        const roleHierarchy = { OWNER: 4, ADMIN: 3, MEMBER: 2, VIEWER: 1 }
        return roleHierarchy[membership.role] >= roleHierarchy[requiredRole]
      }

      return true
    } else if (resourceType === 'task') {
      // Check if user has access to the board containing the task
      const task = await prisma.task.findUnique({
        where: { id: resourceId },
        include: {
          column: {
            include: {
              board: {
                include: {
                  members: {
                    where: { userId },
                  },
                },
              },
            },
          },
        },
      })

      return !!(task?.column.board.members.length)
    }

    return false
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ error: errorMessage }, 'Permission check failed')
    return false
  }
}
