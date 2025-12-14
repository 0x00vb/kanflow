import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS } from '@/lib/cache/redis'
import { PUBSUB_CHANNELS } from '@/lib/cache/redis'
import { ActivityType } from '@prisma/client'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

// Debug: Check if metrics are available
if (typeof window === 'undefined') {
  console.log('Activities module loaded, metrics available:', {
    hasMetrics: !!metrics,
    activityEvents: !!metrics?.activityEvents,
    activityErrors: !!metrics?.activityErrors
  })
}

// Rate limiting configuration
const ACTIVITY_RATE_LIMIT = {
  maxActivitiesPerMinute: 100, // Max activities per user per minute
  maxActivitiesPerHour: 1000,  // Max activities per user per hour
  windowMinutes: 1,
  windowHours: 60,
}

/**
 * Check if user is within activity rate limits
 */
async function checkActivityRateLimit(userId: string, boardId: string): Promise<boolean> {
  try {
    const now = Date.now()
    const minuteKey = `activity_rate_limit:${userId}:${boardId}:minute`
    const hourKey = `activity_rate_limit:${userId}:${boardId}:hour`

    // Check minute limit
    const minuteCount = await redisClient.incr(minuteKey)
    if (minuteCount === 1) {
      await redisClient.expire(minuteKey, ACTIVITY_RATE_LIMIT.windowMinutes * 60)
    }

    // Check hour limit
    const hourCount = await redisClient.incr(hourKey)
    if (hourCount === 1) {
      await redisClient.expire(hourKey, ACTIVITY_RATE_LIMIT.windowHours * 60)
    }

    if (minuteCount > ACTIVITY_RATE_LIMIT.maxActivitiesPerMinute) {
      logger.warn({ userId, boardId, minuteCount }, 'Activity rate limit exceeded (per minute)')
      return false
    }

    if (hourCount > ACTIVITY_RATE_LIMIT.maxActivitiesPerHour) {
      logger.warn({ userId, boardId, hourCount }, 'Activity rate limit exceeded (per hour)')
      return false
    }

    return true
  } catch (error) {
    // If Redis fails, allow the activity to proceed (fail open)
    logger.error({ error: error instanceof Error ? error.message : 'Unknown error', userId, boardId }, 'Failed to check activity rate limit')
    return true
  }
}

export interface CreateActivityData {
  boardId: string
  userId: string
  taskId?: string
  type: ActivityType
  data?: any
}

/**
 * Create an activity record in the database
 */
export async function createActivity(activityData: CreateActivityData): Promise<void> {
  try {
    // Check rate limits
    const withinLimits = await checkActivityRateLimit(activityData.userId, activityData.boardId)
    if (!withinLimits) {
      logger.warn({ userId: activityData.userId, boardId: activityData.boardId, type: activityData.type }, 'Activity creation blocked by rate limiting')
      return // Silently drop the activity to avoid disrupting user experience
    }
    const activity = await prisma.activity.create({
      data: {
        boardId: activityData.boardId,
        userId: activityData.userId,
        taskId: activityData.taskId,
        type: activityData.type,
        data: activityData.data ? sanitizeActivityData(activityData.data) : null,
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
        task: {
          select: {
            id: true,
            title: true,
          },
        },
        board: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    })

    // Invalidate activity cache for the board (delete all activity cache keys for this board)
    const cacheKeyPattern = `${CACHE_KEYS.BOARD_ACTIVITIES(activityData.boardId)}:*`
    const keys = await redisClient.keys(cacheKeyPattern)
    if (keys.length > 0) {
      await redisClient.del(keys)
      logger.debug({ boardId: activityData.boardId, keysDeleted: keys.length }, 'Invalidated activity cache keys')
    }

    // Publish real-time activity event
    const activityEvent = {
      type: 'activity:created',
      data: activity,
      timestamp: Date.now(),
      boardId: activityData.boardId,
    }

    await redisClient.publish(PUBSUB_CHANNELS.BOARD_UPDATES(activityData.boardId), JSON.stringify(activityEvent))

    // Record metrics if available (defensive check)
    // Temporarily disabled for debugging
    /*
    try {
      if (metrics && typeof metrics.activityEvents?.inc === 'function') {
        metrics.activityEvents.inc({ activity_type: activityData.type })
      }
    } catch (metricsError) {
      logger.warn({ metricsError: metricsError instanceof Error ? metricsError.message : 'Unknown metrics error' }, 'Failed to record activity metrics')
    }
    */

    logger.debug({
      activityId: activity.id,
      type: activityData.type,
      boardId: activityData.boardId,
      userId: activityData.userId
    }, 'Activity created successfully')

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error({
      error: errorMessage,
      activityData
    }, 'Failed to create activity')

    // Record error metrics if available (defensive check)
    // Temporarily disabled for debugging
    /*
    try {
      if (metrics && typeof metrics.activityErrors?.inc === 'function') {
        metrics.activityErrors.inc({ activity_type: activityData.type })
      }
    } catch (metricsError) {
      logger.warn({ metricsError: metricsError instanceof Error ? metricsError.message : 'Unknown metrics error' }, 'Failed to record activity error metrics')
    }
    */
    throw error
  }
}

/**
 * Get activity type based on operation
 */
export function getActivityType(operation: string, entityType: string): ActivityType | null {
  const typeMap: Record<string, ActivityType> = {
    'task:create': 'TASK_CREATED',
    'task:update': 'TASK_UPDATED',
    'task:delete': 'TASK_DELETED',
    'task:move': 'TASK_MOVED',
    'column:create': 'COLUMN_CREATED',
    'column:update': 'COLUMN_UPDATED',
    'column:delete': 'COLUMN_DELETED',
    'comment:create': 'COMMENT_ADDED',
    'board:create': 'BOARD_CREATED',
    'board:update': 'BOARD_UPDATED',
    'member:add': 'MEMBER_ADDED',
    'member:remove': 'MEMBER_REMOVED',
  }

  const key = `${entityType}:${operation}`
  return typeMap[key] || null
}

/**
 * Get board ID from various entities
 */
export async function getBoardIdFromEntity(entityType: string, entityId: string): Promise<string | null> {
  try {
    switch (entityType) {
      case 'task':
        const task = await prisma.task.findUnique({
          where: { id: entityId },
          select: {
            column: {
              select: { boardId: true }
            }
          }
        })
        return task?.column.boardId || null

      case 'column':
        const column = await prisma.column.findUnique({
          where: { id: entityId },
          select: { boardId: true }
        })
        return column?.boardId || null

      case 'board':
        return entityId

      default:
        return null
    }
  } catch (error) {
    logger.error({ entityType, entityId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to get board ID from entity')
    return null
  }
}

/**
 * Sanitize activity data to remove sensitive information
 */
export function sanitizeActivityData(data: any): any {
  if (!data || typeof data !== 'object') return data

  const sanitized = { ...data }

  // Remove sensitive fields that shouldn't appear in activities
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth']
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]'
    }
  })

  return sanitized
}
