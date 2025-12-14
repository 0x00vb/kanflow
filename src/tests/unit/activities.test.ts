import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { createActivity, getActivityType, sanitizeActivityData } from '@/lib/activities'
import { prisma } from '@/lib/database/prisma'
import { redisClient } from '@/lib/cache/redis'

// Mock dependencies
jest.mock('@/lib/database/prisma', () => ({
  prisma: {
    activity: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/metrics', () => ({
  metrics: {
    activityEvents: {
      inc: jest.fn(),
    },
    activityErrors: {
      inc: jest.fn(),
    },
  },
}))

describe('Activity Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('getActivityType', () => {
    it('should return correct activity type for task operations', () => {
      expect(getActivityType('create', 'task')).toBe('TASK_CREATED')
      expect(getActivityType('update', 'task')).toBe('TASK_UPDATED')
      expect(getActivityType('delete', 'task')).toBe('TASK_DELETED')
      expect(getActivityType('move', 'task')).toBe('TASK_MOVED')
    })

    it('should return correct activity type for column operations', () => {
      expect(getActivityType('create', 'column')).toBe('COLUMN_CREATED')
      expect(getActivityType('update', 'column')).toBe('COLUMN_UPDATED')
      expect(getActivityType('delete', 'column')).toBe('COLUMN_DELETED')
    })

    it('should return correct activity type for comment operations', () => {
      expect(getActivityType('create', 'comment')).toBe('COMMENT_ADDED')
    })

    it('should return correct activity type for board operations', () => {
      expect(getActivityType('create', 'board')).toBe('BOARD_CREATED')
      expect(getActivityType('update', 'board')).toBe('BOARD_UPDATED')
    })

    it('should return correct activity type for member operations', () => {
      expect(getActivityType('add', 'member')).toBe('MEMBER_ADDED')
      expect(getActivityType('remove', 'member')).toBe('MEMBER_REMOVED')
    })

    it('should return null for unknown operations', () => {
      expect(getActivityType('unknown', 'task')).toBeNull()
    })
  })

  describe('sanitizeActivityData', () => {
    it('should sanitize sensitive data', () => {
      const input = {
        title: 'Test Task',
        password: 'secret123',
        token: 'abc123',
        description: 'Some description',
        secret: 'hidden',
      }

      const result = sanitizeActivityData(input)

      expect(result.title).toBe('Test Task')
      expect(result.description).toBe('Some description')
      expect(result.password).toBe('[REDACTED]')
      expect(result.token).toBe('[REDACTED]')
      expect(result.secret).toBe('[REDACTED]')
    })

    it('should handle non-object data', () => {
      expect(sanitizeActivityData(null)).toBeNull()
      expect(sanitizeActivityData('string')).toBe('string')
      expect(sanitizeActivityData(123)).toBe(123)
    })

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: 'John',
          password: 'secret',
        },
        task: {
          title: 'Task',
          apiKey: 'key123',
        },
      }

      const result = sanitizeActivityData(input)

      expect(result.user.name).toBe('John')
      expect(result.user.password).toBe('[REDACTED]')
      expect(result.task.title).toBe('Task')
      expect(result.task.apiKey).toBe('[REDACTED]')
    })
  })

  describe('createActivity', () => {
    it('should create activity successfully', async () => {
      const mockActivity = {
        id: 'activity-1',
        boardId: 'board-1',
        userId: 'user-1',
        type: 'TASK_CREATED',
        data: { title: 'Test Task' },
        createdAt: new Date(),
        user: { id: 'user-1', name: 'Test User' },
        task: { id: 'task-1', title: 'Test Task' },
        board: { id: 'board-1', title: 'Test Board' },
      }

      ;(prisma.activity.create as jest.Mock).mockResolvedValue(mockActivity)
      ;(redisClient.incr as jest.Mock).mockResolvedValue(1)

      await createActivity({
        boardId: 'board-1',
        userId: 'user-1',
        taskId: 'task-1',
        type: 'TASK_CREATED',
        data: { title: 'Test Task' },
      })

      expect(prisma.activity.create).toHaveBeenCalledWith({
        data: {
          boardId: 'board-1',
          userId: 'user-1',
          taskId: 'task-1',
          type: 'TASK_CREATED',
          data: { title: 'Test Task' },
        },
        include: expect.any(Object),
      })

      expect(redisClient.del).toHaveBeenCalledWith('board:board-1:activities')
      expect(redisClient.publish).toHaveBeenCalled()
    })

    it('should handle rate limiting', async () => {
      ;(redisClient.incr as jest.Mock).mockResolvedValue(150) // Above limit

      await createActivity({
        boardId: 'board-1',
        userId: 'user-1',
        type: 'TASK_CREATED',
      })

      // Should not create activity when rate limited
      expect(prisma.activity.create).not.toHaveBeenCalled()
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      ;(prisma.activity.create as jest.Mock).mockRejectedValue(error)
      ;(redisClient.incr as jest.Mock).mockResolvedValue(1)

      await expect(createActivity({
        boardId: 'board-1',
        userId: 'user-1',
        type: 'TASK_CREATED',
      })).rejects.toThrow('Database error')
    })
  })
})
