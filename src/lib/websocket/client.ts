import { WSMessage, wsMessageSchema } from '@/lib/validation/schemas'
import { logger, realtimeLogger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

export interface WebSocketEvent {
  type: string
  data: unknown
  timestamp: number
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting'

export interface WebSocketClientConfig {
  boardId: string
  token: string
  url?: string
  maxReconnectAttempts?: number
  reconnectDelay?: number
  heartbeatInterval?: number
  messageRateLimit?: number
}

interface PendingMessage {
  message: WSMessage
  timestamp: number
  resolve: (value: any) => void
  reject: (reason: any) => void
}

export class WebSocketClient {
  private ws: WebSocket | null = null
  private config: Required<WebSocketClientConfig>
  private connectionStatus: ConnectionStatus = 'disconnected'
  private reconnectAttempts = 0
  private heartbeatInterval: NodeJS.Timeout | null = null
  private reconnectTimeout: NodeJS.Timeout | null = null
  private eventListeners = new Map<string, Set<(data: any) => void>>()
  private statusListeners = new Set<(status: ConnectionStatus) => void>()

  // Rate limiting
  private messageQueue: WSMessage[] = []
  private isProcessingQueue = false
  private lastMessageTime = 0
  private messageCount = 0
  private rateLimitWindow = 1000 // 1 second

  // Performance monitoring
  private messageLatencies: number[] = []
  private connectStartTime: number = 0
  private totalMessagesSent = 0
  private totalMessagesReceived = 0

  constructor(config: WebSocketClientConfig) {
    this.config = {
      url: typeof window !== 'undefined' ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:8080/ws` : '',
      maxReconnectAttempts: 5,
      reconnectDelay: 1000,
      heartbeatInterval: 30000, // 30 seconds
      messageRateLimit: 50, // messages per second
      ...config,
    }
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.connectionStatus === 'connecting' || this.connectionStatus === 'connected') {
      return
    }

    this.setConnectionStatus('connecting')
    this.connectStartTime = Date.now()

    try {
      const wsUrl = `${this.config.url}?boardId=${this.config.boardId}&token=${this.config.token}`
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = this.handleOpen.bind(this)
      this.ws.onmessage = this.handleMessage.bind(this)
      this.ws.onclose = this.handleClose.bind(this)
      this.ws.onerror = this.handleError.bind(this)

      // Set up heartbeat
      this.setupHeartbeat()

      realtimeLogger.websocketConnection('connecting', this.config.boardId, undefined, {
        attempt: this.reconnectAttempts + 1
      })

    } catch (error) {
      realtimeLogger.websocketError(error instanceof Error ? error : new Error('Unknown error'), this.config.boardId)
      this.handleConnectionFailure()
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.clearTimers()
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
    this.setConnectionStatus('disconnected')
    this.reconnectAttempts = 0
  }

  /**
   * Send message with rate limiting and queuing
   */
  async send(message: Omit<WSMessage, 'timestamp'>): Promise<void> {
    return new Promise((resolve, reject) => {
      const fullMessage: WSMessage = {
        ...message,
        timestamp: Date.now(),
      }

      // Rate limiting check
      if (!this.canSendMessage()) {
        this.messageQueue.push(fullMessage)
        this.processQueue()
        resolve()
        return
      }

      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify(fullMessage))
          this.totalMessagesSent++
          this.messageCount++

          // Update rate limiting
          this.lastMessageTime = Date.now()

          // Performance monitoring
          this.messageLatencies.push(0) // Will be updated when pong received

          if (metrics.websocketMessages?.inc) {
            metrics.websocketMessages.inc({
              type: message.type,
              direction: 'outbound',
              board_id: this.config.boardId
            })
          }

          realtimeLogger.websocketMessage('outbound', message.type, this.config.boardId)
          resolve()
        } catch (error) {
          reject(error)
        }
      } else {
        reject(new Error('WebSocket not connected'))
      }
    })
  }

  /**
   * Subscribe to WebSocket events
   */
  on<T extends WebSocketEvent>(eventType: T['type'], handler: (data: T['data']) => void): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set())
    }

    this.eventListeners.get(eventType)!.add(handler)

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(eventType)
      if (listeners) {
        listeners.delete(handler)
        if (listeners.size === 0) {
          this.eventListeners.delete(eventType)
        }
      }
    }
  }

  /**
   * Subscribe to connection status changes
   */
  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(handler)
    return () => this.statusListeners.delete(handler)
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.connectionStatus
  }

  /**
   * Get client configuration
   */
  getConfig() {
    return this.config
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const avgLatency = this.messageLatencies.length > 0
      ? this.messageLatencies.reduce((a, b) => a + b, 0) / this.messageLatencies.length
      : 0

    return {
      averageLatency: Math.round(avgLatency),
      messageRate: this.messageCount,
      reconnectCount: this.reconnectAttempts,
      totalMessagesSent: this.totalMessagesSent,
      totalMessagesReceived: this.totalMessagesReceived,
      queueLength: this.messageQueue.length,
    }
  }

  // Private methods

  private handleOpen(): void {
    this.setConnectionStatus('connected')
    this.reconnectAttempts = 0

    const connectTime = Date.now() - this.connectStartTime
    logger.info({
      boardId: this.config.boardId,
      connectTime
    }, 'WebSocket connected successfully')

      if (metrics.websocketConnections?.inc) {
        metrics.websocketConnections.inc({ board_id: this.config.boardId })
      }

    // Process any queued messages
    this.processQueue()
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WSMessage = JSON.parse(event.data)

      // Validate message
      const validation = wsMessageSchema.safeParse(message)
      if (!validation.success) {
        logger.warn({ errors: validation.error.issues }, 'Invalid WebSocket message received')
        return
      }

      this.totalMessagesReceived++

      // Update latency for ping/pong
      if (message.type === 'pong' && message.timestamp) {
        const latency = Date.now() - message.timestamp
        this.messageLatencies.push(latency)
        // Keep only last 100 latencies
        if (this.messageLatencies.length > 100) {
          this.messageLatencies.shift()
        }
      }

      if (metrics.websocketMessages?.inc) {
        metrics.websocketMessages.inc({
          type: message.type,
          direction: 'inbound',
          board_id: this.config.boardId
        })
      }

      // Emit event to listeners
      const listeners = this.eventListeners.get(message.type)
      if (listeners) {
        listeners.forEach(handler => {
          try {
            handler(message.data)
          } catch (error) {
            logger.error({
              error: error instanceof Error ? error.message : 'Unknown error',
              eventType: message.type
            }, 'Error in WebSocket event handler')
          }
        })
      }

      logger.debug({ type: message.type, boardId: this.config.boardId }, 'WebSocket message received')

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error processing WebSocket message')
    }
  }

  private handleClose(event: CloseEvent): void {
    this.clearTimers()
    this.setConnectionStatus('disconnected')

    logger.info({
      boardId: this.config.boardId,
      code: event.code,
      reason: event.reason
    }, 'WebSocket connection closed')

    if (metrics.websocketConnections?.dec) {
      metrics.websocketConnections.dec({ board_id: this.config.boardId })
    }

    // Attempt reconnection unless it was a clean disconnect
    if (event.code !== 1000) {
      this.handleConnectionFailure()
    }
  }

  private handleError(error: Event): void {
    logger.error({
      boardId: this.config.boardId,
      error: 'WebSocket error occurred'
    }, 'WebSocket error')

    this.setConnectionStatus('error')
  }

  private handleConnectionFailure(): void {
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++
      this.setConnectionStatus('reconnecting')

      const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) // Exponential backoff

      logger.info({
        boardId: this.config.boardId,
        attempt: this.reconnectAttempts,
        delay
      }, 'Scheduling WebSocket reconnection')

      this.reconnectTimeout = setTimeout(() => {
        this.connect()
      }, delay)
    } else {
      this.setConnectionStatus('error')
      logger.error({
        boardId: this.config.boardId,
        maxAttempts: this.config.maxReconnectAttempts
      }, 'WebSocket reconnection failed - max attempts reached')
    }
  }

  private setupHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', data: {} }).catch(error => {
          logger.warn({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Heartbeat ping failed')
        })
      }
    }, this.config.heartbeatInterval)
  }

  private canSendMessage(): boolean {
    const now = Date.now()
    const timeWindow = now - this.lastMessageTime

    if (timeWindow >= this.rateLimitWindow) {
      // Reset counter for new window
      this.messageCount = 0
      this.lastMessageTime = now
      return true
    }

    return this.messageCount < this.config.messageRateLimit
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return
    }

    this.isProcessingQueue = true

    while (this.messageQueue.length > 0 && this.canSendMessage()) {
      const message = this.messageQueue.shift()
      if (message) {
        try {
          await this.send(message)
        } catch (error) {
          logger.warn({
            error: error instanceof Error ? error.message : 'Unknown error',
            type: message.type
          }, 'Failed to send queued message')
          // Put it back at the front of the queue
          this.messageQueue.unshift(message)
          break
        }
      }
    }

    this.isProcessingQueue = false
  }

  private setConnectionStatus(status: ConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status
      this.statusListeners.forEach(handler => {
        try {
          handler(status)
        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'Error in status change handler')
        }
      })
    }
  }

  private clearTimers(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
  }
}
