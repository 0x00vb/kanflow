import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractTokenFromHeader } from '@/lib/auth/jwt'
import { logger } from '@/lib/logger'

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string
    email: string
  }
}

/**
 * Authentication middleware for API routes
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthenticatedRequest> {
  const authHeader = request.headers.get('authorization')
  const token = extractTokenFromHeader(authHeader)

  if (!token) {
    throw new Error('No authentication token provided')
  }

  try {
    const payload = verifyToken(token)

    // Add user to request object
    const authenticatedRequest = request as AuthenticatedRequest
    authenticatedRequest.user = {
      id: payload.userId,
      email: payload.email,
    }

    return authenticatedRequest
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.warn({ error: errorMessage, token: token.substring(0, 20) + '...' }, 'Authentication failed')
    throw new Error('Invalid or expired token')
  }
}

/**
 * Require authentication for a route
 */
export function withAuth<T extends unknown[]>(
  handler: (request: AuthenticatedRequest, ...args: T) => Promise<Response> | Response
) {
  return async (request: NextRequest, ...args: T): Promise<Response> => {
    try {
      const authenticatedRequest = await authenticateRequest(request)
      return await handler(authenticatedRequest, ...args)
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
export async function optionalAuth(request: NextRequest): Promise<AuthenticatedRequest> {
  const authHeader = request.headers.get('authorization')
  const token = extractTokenFromHeader(authHeader)

  if (!token) {
    return request as AuthenticatedRequest
  }

  try {
    const payload = verifyToken(token)
    const authenticatedRequest = request as AuthenticatedRequest
    authenticatedRequest.user = {
      id: payload.userId,
      email: payload.email,
    }
    return authenticatedRequest
  } catch (error) {
    // Silently fail for optional auth
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.debug({ error: errorMessage }, 'Optional auth failed, continuing without user')
    return request as AuthenticatedRequest
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
  const { prisma } = await import('@/lib/database/prisma')

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
