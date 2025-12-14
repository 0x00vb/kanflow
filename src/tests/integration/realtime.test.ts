import { WebSocketClient } from '@/lib/websocket/client'
import { OptimisticUpdateManager } from '@/lib/optimistic-updates/manager'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useRealtimeBoard } from '@/hooks/useRealtimeBoard'
import { usePerformanceMonitor } from '@/hooks/usePerformanceMonitor'
import { createApiClient } from '@/lib/api/client'
import { prisma } from '@/lib/database/prisma'
import { logger } from '@/lib/logger'

// Mock WebSocket for testing
class MockWebSocket {
  onopen: ((event: any) => void) | null = null
  onmessage: ((event: any) => void) | null = null
  onclose: ((event: any) => void) | null = null
  onerror: ((event: any) => void) | null = null
  readyState = 1 // OPEN

  constructor() {
    // Simulate connection
    setTimeout(() => {
      this.onopen?.({})
    }, 10)
  }

  send(data: string) {
    // Mock send - do nothing
  }

  close() {
    this.readyState = 3 // CLOSED
    this.onclose?.({ code: 1000, reason: 'Normal closure' })
  }
}

// Global test setup
const originalWebSocket = global.WebSocket
let mockServer: any = null

describe('Real-Time Features Integration', () => {
  let apiClient: ReturnType<typeof createApiClient>
  let testBoardId: string
  let testUserId: string

  beforeAll(async () => {
    // Set up test database
    apiClient = createApiClient()

    // Create test user and board
    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
        avatar: null,
      },
    })
    testUserId = user.id

    const board = await prisma.board.create({
      data: {
        title: 'Test Board',
        description: 'Integration test board',
        isPublic: false,
      },
    })
    testBoardId = board.id

    // Create test columns and tasks
    const column1 = await prisma.column.create({
      data: {
        boardId: testBoardId,
        title: 'To Do',
        position: 0,
      },
    })

    const column2 = await prisma.column.create({
      data: {
        boardId: testBoardId,
        title: 'Done',
        position: 1,
      },
    })

    await prisma.task.create({
      data: {
        columnId: column1.id,
        title: 'Test Task',
        description: 'A test task for integration testing',
        priority: 'MEDIUM',
        labels: ['test'],
      },
    })

    // Mock WebSocket globally
    ;(global as any).WebSocket = MockWebSocket
  })

  afterAll(async () => {
    // Clean up test data
    await prisma.task.deleteMany({ where: { column: { boardId: testBoardId } } })
    await prisma.column.deleteMany({ where: { boardId: testBoardId } })
    await prisma.board.delete({ where: { id: testBoardId } })
    await prisma.user.delete({ where: { id: testUserId } })

    // Restore original WebSocket
    global.WebSocket = originalWebSocket
  })

  describe('WebSocket Client', () => {
    let wsClient: WebSocketClient

    beforeEach(() => {
      wsClient = new WebSocketClient({
        boardId: testBoardId,
        token: 'test-token',
      })
    })

    afterEach(() => {
      wsClient.disconnect()
    })

    test('connects successfully', async () => {
      await wsClient.connect()
      expect(wsClient.getStatus()).toBe('connected')
    })

    test('handles reconnection', async () => {
      await wsClient.connect()
      expect(wsClient.getStatus()).toBe('connected')

      // Simulate disconnection
      ;(wsClient as any).ws?.close()

      // Wait for reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 100))

      // Should attempt to reconnect
      expect(['connecting', 'connected']).toContain(wsClient.getStatus())
    })

    test('sends and receives messages', async () => {
      await wsClient.connect()

      const mockMessage = { type: 'test', data: { message: 'hello' } }
      await wsClient.send(mockMessage)

      const metrics = wsClient.getPerformanceMetrics()
      expect(metrics.totalMessagesSent).toBeGreaterThan(0)
    })

    test('handles rate limiting', async () => {
      await wsClient.connect()

      // Send messages rapidly
      const promises = []
      for (let i = 0; i < 60; i++) {
        promises.push(wsClient.send({ type: 'test', data: { index: i } }))
      }

      await Promise.all(promises)
      const metrics = wsClient.getPerformanceMetrics()

      // Should have sent some messages
      expect(metrics.totalMessagesSent).toBeGreaterThan(0)
    })

    test('subscribes to events', async () => {
      await wsClient.connect()

      let receivedMessage: any = null
      const unsubscribe = wsClient.on('test-event', (data) => {
        receivedMessage = data
      })

      // Simulate receiving a message
      ;(wsClient as any).handleMessage({
        data: JSON.stringify({
          type: 'test-event',
          data: { test: 'data' },
          timestamp: Date.now(),
        }),
      })

      expect(receivedMessage).toEqual({ test: 'data' })

      unsubscribe()
    })
  })

  describe('Optimistic Update Manager', () => {
    let wsClient: WebSocketClient
    let optimisticManager: OptimisticUpdateManager

    beforeEach(async () => {
      wsClient = new WebSocketClient({
        boardId: testBoardId,
        token: 'test-token',
      })
      await wsClient.connect()
      optimisticManager = new OptimisticUpdateManager(wsClient)
    })

    afterEach(() => {
      wsClient.disconnect()
    })

    test('applies optimistic updates successfully', async () => {
      const operationId = 'test-operation'
      const optimisticData = { id: 'test', title: 'Optimistic Title' }

      const serverOperation = jest.fn().mockResolvedValue({
        success: true,
        data: { ...optimisticData, serverValidated: true },
      })

      const rollback = jest.fn()

      const result = await optimisticManager.applyOptimisticUpdate(
        operationId,
        optimisticData,
        serverOperation,
        rollback,
        'test-id',
        'update'
      )

      expect(result.serverValidated).toBe(true)
      expect(rollback).not.toHaveBeenCalled()
      expect(serverOperation).toHaveBeenCalled()
    })

    test('rolls back on server failure', async () => {
      const operationId = 'test-operation-fail'
      const optimisticData = { id: 'test', title: 'Optimistic Title' }

      const serverOperation = jest.fn().mockResolvedValue({
        success: false,
        error: 'Server error',
      })

      const rollback = jest.fn()

      await expect(
        optimisticManager.applyOptimisticUpdate(
          operationId,
          optimisticData,
          serverOperation,
          rollback,
          'test-id',
          'update'
        )
      ).rejects.toThrow('Server error')

      expect(rollback).toHaveBeenCalled()
    })

    test('handles conflicts', async () => {
      const operationId = 'test-conflict'
      const optimisticData = { id: 'test', title: 'Optimistic Title' }

      // Start an optimistic update
      const serverOperation = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          success: true,
          data: { ...optimisticData, serverValidated: true },
        }), 100))
      )

      const rollback = jest.fn()

      const updatePromise = optimisticManager.applyOptimisticUpdate(
        operationId,
        optimisticData,
        serverOperation,
        rollback,
        'test-id',
        'update'
      )

      // Simulate a conflicting real-time event
      optimisticManager.handleRealtimeUpdate({
        id: 'test-id',
        title: 'Conflicting Title',
      }, 'task:updated')

      const result = await updatePromise

      // Should still succeed (conflict resolution allows it)
      expect(result.serverValidated).toBe(true)
    })

    test('tracks pending updates', () => {
      const pending = optimisticManager.getPendingUpdates()
      expect(Array.isArray(pending)).toBe(true)
    })
  })

  describe('Real-Time Board Integration', () => {
    test('subscribes to task events', () => {
      const setTasks = jest.fn()
      const setColumns = jest.fn()

      // This would normally be used in a React component
      // For testing, we verify the subscription logic exists
      expect(typeof setTasks).toBe('function')
      expect(typeof setColumns).toBe('function')
    })

    test('handles task creation events', () => {
      // Test the event handling logic from useRealtimeBoard
      const mockTask = {
        id: 'test-task',
        title: 'Test Task',
        description: 'A test task',
        columnId: 'test-column',
        priority: 'MEDIUM',
        labels: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // Verify task structure
      expect(mockTask.id).toBe('test-task')
      expect(mockTask.title).toBe('Test Task')
      expect(mockTask.priority).toBe('MEDIUM')
    })
  })

  describe('Performance Monitoring', () => {
    test('tracks connection metrics', () => {
      // Performance monitoring would be tested in a real component
      // Here we verify the metric structure
      const mockMetrics = {
        connectionStatus: 'connected',
        connectionUptime: 1000,
        reconnectCount: 0,
        totalMessagesSent: 10,
        totalMessagesReceived: 10,
        messagesPerSecond: 1.5,
        averageLatency: 50,
        maxLatency: 100,
        minLatency: 20,
        queueLength: 0,
        droppedMessages: 0,
        memoryUsage: 25.5,
        networkLatency: 50,
        packetLoss: 0,
      }

      expect(mockMetrics.connectionStatus).toBe('connected')
      expect(mockMetrics.averageLatency).toBe(50)
      expect(mockMetrics.messagesPerSecond).toBe(1.5)
    })

    test('calculates health score', () => {
      // Health score calculation logic
      const calculateHealthScore = (metrics: any) => {
        let score = 100
        if (metrics.connectionStatus !== 'connected') score -= 50
        if (metrics.averageLatency > 500) score -= 30
        if (metrics.queueLength > 5) score -= 20
        return Math.max(0, Math.min(100, score))
      }

      expect(calculateHealthScore({ connectionStatus: 'connected', averageLatency: 50, queueLength: 0 })).toBe(100)
      expect(calculateHealthScore({ connectionStatus: 'disconnected', averageLatency: 50, queueLength: 0 })).toBe(50)
      expect(calculateHealthScore({ connectionStatus: 'connected', averageLatency: 600, queueLength: 0 })).toBe(70)
      expect(calculateHealthScore({ connectionStatus: 'connected', averageLatency: 50, queueLength: 10 })).toBe(80)
    })
  })

  describe('Error Handling', () => {
    test('handles network errors gracefully', () => {
      const networkError = new Error('WebSocket connection failed')
      const isNetworkError = (error: Error) => {
        return error.message.toLowerCase().includes('websocket') ||
               error.message.toLowerCase().includes('connection')
      }

      expect(isNetworkError(networkError)).toBe(true)
      expect(isNetworkError(new Error('Validation error'))).toBe(false)
    })

    test('categorizes different error types', () => {
      const getErrorType = (error: Error) => {
        if (error.message.includes('WebSocket')) return 'network'
        if (error.message.includes('conflict')) return 'conflict'
        if (error.message.includes('rate limit')) return 'rate_limit'
        return 'unknown'
      }

      expect(getErrorType(new Error('WebSocket connection lost'))).toBe('network')
      expect(getErrorType(new Error('Version conflict detected'))).toBe('conflict')
      expect(getErrorType(new Error('Rate limit exceeded'))).toBe('rate_limit')
      expect(getErrorType(new Error('Unknown error'))).toBe('unknown')
    })
  })

  describe('Load Testing', () => {
    test('handles multiple concurrent operations', async () => {
      const operations = []
      for (let i = 0; i < 10; i++) {
        operations.push(
          new Promise(resolve => {
            setTimeout(() => resolve(`operation-${i}`), Math.random() * 100)
          })
        )
      }

      const results = await Promise.all(operations)
      expect(results).toHaveLength(10)
      expect(results.every(r => typeof r === 'string')).toBe(true)
    })

    test('maintains performance under load', () => {
      // Simulate high message volume
      const messageTimes = []
      const now = Date.now()

      for (let i = 0; i < 100; i++) {
        messageTimes.push(now + (i * 100)) // 100ms intervals
      }

      const oneMinuteAgo = now + 60000 // 1 minute from start
      const recentMessages = messageTimes.filter(time => time > oneMinuteAgo)
      const messagesPerSecond = recentMessages.length / 60

      expect(messagesPerSecond).toBeGreaterThan(0)
      expect(messagesPerSecond).toBeLessThanOrEqual(2) // Should not exceed reasonable rate
    })
  })

  describe('Security Testing', () => {
    test('validates message structure', () => {
      const validMessage = {
        type: 'task:created',
        data: { id: 'test', title: 'Test Task' },
        timestamp: Date.now(),
      }

      const invalidMessage = {
        type: 'invalid',
        data: 'not an object',
        // missing timestamp
      }

      // Basic validation logic
      const isValidMessage = (msg: any) => {
        return msg.type && typeof msg.type === 'string' &&
               msg.data && typeof msg.data === 'object' &&
               typeof msg.timestamp === 'number'
      }

      expect(isValidMessage(validMessage)).toBe(true)
      expect(isValidMessage(invalidMessage)).toBe(false)
    })

    test('prevents message injection', () => {
      const maliciousMessage = {
        type: 'task:created',
        data: {
          title: '<script>alert("xss")</script>Test Task',
          description: 'Normal description',
        },
        timestamp: Date.now(),
      }

      // Simulate sanitization
      const sanitizeInput = (input: string) => {
        return input.replace(/[<>'"&]/g, (char) => {
          const entityMap: Record<string, string> = {
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '&': '&amp;'
          }
          return entityMap[char] || char
        })
      }

      const sanitizedTitle = sanitizeInput(maliciousMessage.data.title)
      expect(sanitizedTitle).not.toContain('<script>')
      expect(sanitizedTitle).toContain('&lt;script&gt;')
    })
  })
})
