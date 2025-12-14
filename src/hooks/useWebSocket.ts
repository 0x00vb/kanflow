'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAuth } from '@/lib/auth/context'
import { WebSocketClient, ConnectionStatus, WebSocketEvent } from '@/lib/websocket/client'
import { OptimisticUpdateManager } from '@/lib/optimistic-updates/manager'
import { User } from '@/types'
import { logger, realtimeLogger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

interface PresenceUser extends User {
  joinedAt: number
  lastActivity: number
}

export interface UseWebSocketReturn {
  connectionStatus: ConnectionStatus
  presenceUsers: PresenceUser[]
  isConnected: boolean
  sendMessage: (type: string, data: any) => Promise<void>
  subscribe: <T extends WebSocketEvent>(eventType: T['type'], handler: (data: T['data']) => void) => () => void
  optimisticManager: OptimisticUpdateManager
  performance: {
    averageLatency: number
    messageRate: number
    reconnectCount: number
    totalMessagesSent: number
    totalMessagesReceived: number
    queueLength: number
  }
}

export const useWebSocket = (boardId: string): UseWebSocketReturn => {
  const { user, token } = useAuth()
  const wsClientRef = useRef<WebSocketClient | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([])
  const [performance, setPerformance] = useState({
    averageLatency: 0,
    messageRate: 0,
    reconnectCount: 0,
    totalMessagesSent: 0,
    totalMessagesReceived: 0,
    queueLength: 0,
  })

  // Performance monitoring interval
  const performanceIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Cache for user details to avoid repeated API calls
  const userCacheRef = useRef<Map<string, User>>(new Map())

  // Circuit breaker for API failures
  const circuitBreakerRef = useRef({
    failures: 0,
    lastFailureTime: 0,
    state: 'closed' as 'closed' | 'open' | 'half-open',
    nextAttemptTime: 0,
  })

  // Performance monitoring for user fetches
  const fetchMetricsRef = useRef({
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    lastRequestTime: 0,
  })

  // Function to fetch user details with production-ready features
  const fetchUserDetails = useCallback(async (userId: string): Promise<User | null> => {
    const startTime = Date.now()

    // Input validation
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      logger.warn({ userId }, 'Invalid userId provided to fetchUserDetails')
      return null
    }

    // Circuit breaker check
    const circuitBreaker = circuitBreakerRef.current
    const now = Date.now()

    if (circuitBreaker.state === 'open') {
      if (now < circuitBreaker.nextAttemptTime) {
        logger.debug({ userId }, 'Circuit breaker open, skipping request')
        return null
      }
      // Half-open state
      circuitBreaker.state = 'half-open'
    }

    // Check cache first
    if (userCacheRef.current.has(userId)) {
      const cachedUser = userCacheRef.current.get(userId)
      if (cachedUser) {
        logger.debug({ userId }, 'Retrieved user from cache')
        return cachedUser
      }
      // Cached as null (404), return null
      return null
    }

    // Prevent concurrent requests for the same user
    const requestKey = `fetch_${userId}`
    if (userCacheRef.current.has(requestKey)) {
      logger.debug({ userId }, 'Waiting for concurrent user fetch request')
      return null
    }

    // Rate limiting: max 10 concurrent user fetches
    const activeRequests = Array.from(userCacheRef.current.keys())
      .filter(key => key.startsWith('fetch_')).length

    if (activeRequests >= 10) {
      logger.warn({ userId, activeRequests }, 'Too many concurrent user fetch requests, skipping')
      return null
    }

    // Mark request as in progress
    userCacheRef.current.set(requestKey, {} as User)

    try {
      fetchMetricsRef.current.totalRequests++
      logger.debug({ userId }, 'Fetching user details from API')

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

      const response = await fetch(`/api/users/${userId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', // CSRF protection
          'X-KanFlow-Client': 'web', // Client identification
        },
        credentials: 'same-origin',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      const responseTime = Date.now() - startTime

      // Update performance metrics
      fetchMetricsRef.current.lastRequestTime = responseTime
      fetchMetricsRef.current.averageResponseTime =
        (fetchMetricsRef.current.averageResponseTime + responseTime) / 2

      if (!response.ok) {
        if (response.status === 404) {
          logger.warn({ userId, status: response.status }, 'User not found')
          // Cache null result to avoid repeated 404s
          userCacheRef.current.set(userId, null as any)
          fetchMetricsRef.current.successfulRequests++
          return null
        }

        if (response.status === 401 || response.status === 403) {
          logger.warn({ userId, status: response.status }, 'Unauthorized to fetch user details')
          fetchMetricsRef.current.failedRequests++
          return null
        }

        if (response.status === 429) {
          logger.warn({ userId }, 'Rate limited when fetching user details')
          // Don't update circuit breaker for rate limiting
          return null
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const responseData = await response.json()

      if (!responseData.success || !responseData.data) {
        logger.warn({ userId, responseData }, 'Invalid response format from user API')
        fetchMetricsRef.current.failedRequests++
        throw new Error('Invalid API response format')
      }

      // Validate required fields
      const userData = responseData.data
      if (!userData.id || !userData.name || !userData.email) {
        logger.warn({ userId, userData }, 'User data missing required fields')
        fetchMetricsRef.current.failedRequests++
        throw new Error('User data missing required fields')
      }

      // Create User object with required password field
      const user: User = {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        password: 'placeholder', // Never used for display/authentication
        avatar: userData.avatar || null,
        createdAt: new Date(userData.createdAt),
        updatedAt: new Date(userData.updatedAt),
      }

      // Cache the user details
      userCacheRef.current.set(userId, user)

      // Reset circuit breaker on success
      if (circuitBreaker.state === 'half-open') {
        circuitBreaker.state = 'closed'
        circuitBreaker.failures = 0
      }

      fetchMetricsRef.current.successfulRequests++
      logger.info({
        userId,
        cached: responseData.cached,
        responseTime
      }, 'Successfully fetched and cached user details')

      return user

    } catch (error) {
      fetchMetricsRef.current.failedRequests++

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({
        error: errorMessage,
        userId,
        stack: error instanceof Error ? error.stack : undefined
      }, 'Failed to fetch user details from API')

      // Update circuit breaker
      circuitBreaker.failures++
      circuitBreaker.lastFailureTime = now

      if (circuitBreaker.failures >= 3) {
        circuitBreaker.state = 'open'
        circuitBreaker.nextAttemptTime = now + (circuitBreaker.failures * 1000) // Exponential backoff
        logger.warn({
          userId,
          failures: circuitBreaker.failures,
          nextAttemptIn: circuitBreaker.nextAttemptTime - now
        }, 'Circuit breaker opened due to repeated failures')
      }

      // Return null on error to prevent crashes
      return null

    } finally {
      // Clean up the request marker
      userCacheRef.current.delete(requestKey)
    }
  }, [token])

  // Initialize WebSocket client
  const wsClient = useMemo(() => {
    if (!boardId || !token || !user) {
      return null
    }

    if (wsClientRef.current?.getConfig().boardId !== boardId) {
      // Disconnect existing client if board changed
      wsClientRef.current?.disconnect()
      wsClientRef.current = null
    }

    if (!wsClientRef.current) {
      wsClientRef.current = new WebSocketClient({
        boardId,
        token,
        maxReconnectAttempts: 5,
        reconnectDelay: 1000,
        heartbeatInterval: 30000,
        messageRateLimit: 50,
      })

      // Set up status change listener
      wsClientRef.current.onStatusChange((status) => {
        setConnectionStatus(status)
      })
    }

    return wsClientRef.current
  }, [boardId, token, user])

  // Optimistic update manager
  const optimisticManager = useMemo(() => {
    if (wsClient) {
      return new OptimisticUpdateManager(wsClient)
    }
    return null
  }, [wsClient])

  // Connect/disconnect based on dependencies
  useEffect(() => {
    if (wsClient && boardId && token && user) {
      // Add current user to presence list immediately
      if (user) {
        userCacheRef.current.set(user.id, user)
        setPresenceUsers(prev => {
          const filtered = prev.filter(u => u.id !== user.id)
          return [...filtered, {
            ...user,
            joinedAt: Date.now(),
            lastActivity: Date.now(),
          }]
        })
      }

      wsClient.connect().catch(error => {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error',
          boardId
        }, 'Failed to connect WebSocket')
      })
    }

    return () => {
      if (wsClientRef.current) {
        wsClientRef.current.disconnect()
        wsClientRef.current = null
      }
      // Clear presence users on disconnect
      setPresenceUsers([])
    }
  }, [wsClient, boardId, token, user])

  // Set up presence tracking
  useEffect(() => {
    if (!wsClient) return

    const unsubscribePresenceJoined = wsClient.on('user:joined', async (data) => {
      const { userId, user: partialUser } = data as { userId: string; user?: Partial<User> }
      realtimeLogger.userPresence('joined', boardId, userId)
      metrics.userPresenceEvents.inc({ event_type: 'joined', board_id: boardId })

      // Ensure we have complete user information
      let user = partialUser as User | undefined

      if (!user || !user.name || !user.email) {
        // Fetch complete user details if partial
        const fetchedUser = await fetchUserDetails(userId)
        if (fetchedUser) {
          user = fetchedUser
        }
      }

      if (user && user.name && user.email) {
        setPresenceUsers(prev => {
          // Remove existing user if already present
          const filtered = prev.filter(u => u.id !== userId)

          return [...filtered, {
            ...user,
            joinedAt: Date.now(),
            lastActivity: Date.now(),
          } as PresenceUser]
        })
      }
    })

    const unsubscribePresenceLeft = wsClient.on('user:left', (data) => {
      const { userId } = data as { userId: string }
      realtimeLogger.userPresence('left', boardId, userId)
      metrics.userPresenceEvents.inc({ event_type: 'left', board_id: boardId })

      setPresenceUsers(prev => prev.filter(u => u.id !== userId))
    })

    const unsubscribeActivity = wsClient.on('user:activity', (data) => {
      const { userId } = data as { userId: string }
      setPresenceUsers(prev => prev.map(u =>
        u.id === userId
          ? { ...u, lastActivity: Date.now() }
          : u
      ))
    })

    return () => {
      unsubscribePresenceJoined()
      unsubscribePresenceLeft()
      unsubscribeActivity()
    }
  }, [wsClient])

  // Performance monitoring
  useEffect(() => {
    if (!wsClient) return

    performanceIntervalRef.current = setInterval(() => {
      const metrics = wsClient.getPerformanceMetrics()
      setPerformance(metrics)
    }, 5000) // Update every 5 seconds

    return () => {
      if (performanceIntervalRef.current) {
        clearInterval(performanceIntervalRef.current)
        performanceIntervalRef.current = null
      }
    }
  }, [wsClient])

  // Update active users metric
  useEffect(() => {
    if (boardId) {
      metrics.activeUsersPerBoard.set({ board_id: boardId }, presenceUsers.length)
    }
  }, [presenceUsers.length, boardId])

  // Send message wrapper
  const sendMessage = useCallback(async (type: string, data: any): Promise<void> => {
    if (!wsClient) {
      throw new Error('WebSocket not connected')
    }

    await wsClient.send({ type, data })
  }, [wsClient])

  // Subscribe wrapper
  const subscribe = useCallback(<T extends WebSocketEvent>(
    eventType: T['type'],
    handler: (data: T['data']) => void
  ): (() => void) => {
    if (!wsClient) {
      return () => {} // Return no-op if not connected
    }

    return wsClient.on(eventType, handler)
  }, [wsClient])

  // Periodic cache cleanup to prevent memory leaks
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now()
      const keysToDelete: string[] = []

      // Clean up old cache entries (older than 1 hour)
      userCacheRef.current.forEach((user, userId) => {
        if (user && user.updatedAt && (now - user.updatedAt.getTime()) > 3600000) {
          keysToDelete.push(userId)
        }
      })

      keysToDelete.forEach(key => {
        userCacheRef.current.delete(key)
        logger.debug({ userId: key }, 'Cleaned up old user cache entry')
      })

      // Reset circuit breaker periodically
      const circuitBreaker = circuitBreakerRef.current
      if (circuitBreaker.state === 'open' && (now - circuitBreaker.lastFailureTime) > 300000) { // 5 minutes
        circuitBreaker.state = 'half-open'
        circuitBreaker.failures = 0
        logger.info('Circuit breaker reset to half-open state')
      }

    }, 600000) // Clean up every 10 minutes

    return () => clearInterval(cleanupInterval)
  }, [])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (performanceIntervalRef.current) {
        clearInterval(performanceIntervalRef.current)
      }
      if (wsClientRef.current) {
        wsClientRef.current.disconnect()
      }

      // Clear all caches on unmount
      userCacheRef.current.clear()
      logger.debug('Cleaned up user cache on unmount')
    }
  }, [])

  return {
    connectionStatus,
    presenceUsers,
    isConnected: connectionStatus === 'connected',
    sendMessage,
    subscribe,
    optimisticManager: optimisticManager!,
    performance,
  }
}
