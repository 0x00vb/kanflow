import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage } from 'http'
import { redisClient, PUBSUB_CHANNELS } from './lib/cache/redis'
import { logger } from './lib/logger'
import { metrics } from './lib/metrics'
import { verifyToken } from './lib/auth/jwt'
import { WSMessage } from './lib/validation/schemas'

interface ExtendedWebSocket extends WebSocket {
  userId?: string
  boardId?: string
  isAlive?: boolean
}

interface ConnectedClient {
  ws: ExtendedWebSocket
  userId: string
  boardId: string
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null
  private clients: Map<string, ConnectedClient> = new Map()
  private boardConnections: Map<string, Set<ExtendedWebSocket>> = new Map()

  constructor() {
    this.setupRedisSubscription()
  }

  /**
   * Initialize the WebSocket server
   */
  initialize(server: import('http').Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      perMessageDeflate: false,
    })

    this.wss.on('connection', this.handleConnection.bind(this))
    this.wss.on('error', (error) => {
      logger.error({ error }, 'WebSocket server error')
    })

    logger.info({}, 'WebSocket server initialized')
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(ws: ExtendedWebSocket, request: IncomingMessage & { url?: string }): Promise<void> {
    try {
      // Extract board ID and token from URL
      const url = new URL(request.url || '', 'http://localhost')
      const boardId = url.searchParams.get('boardId')
      const token = url.searchParams.get('token')

      if (!boardId || !token) {
        ws.close(1008, 'Missing boardId or token')
        return
      }

      // Verify JWT token
      const payload = verifyToken(token)
      const userId = payload.userId

      // Set up client
      ws.userId = userId
      ws.boardId = boardId
      ws.isAlive = true

      // Store client connection
      const clientId = `${userId}:${boardId}`
      this.clients.set(clientId, { ws, userId, boardId })

      // Add to board connections
      if (!this.boardConnections.has(boardId)) {
        this.boardConnections.set(boardId, new Set())
      }
      this.boardConnections.get(boardId)!.add(ws)

      // Update metrics
      metrics.websocketConnections.set({ board_id: boardId }, this.boardConnections.get(boardId)?.size || 0)

      // Set up event handlers
      ws.on('message', (data: Buffer) => this.handleMessage(ws, data))
      ws.on('close', () => this.handleDisconnection(ws))
      ws.on('error', (error) => this.handleError(ws, error))
      ws.on('pong', () => { ws.isAlive = true })

      // Send welcome message
      this.sendToClient(ws, {
        type: 'connected',
        data: { userId, boardId },
        timestamp: Date.now(),
      })

      // Broadcast user joined event
      this.broadcastToBoard(boardId, {
        type: 'user:joined',
        data: { userId, user: { id: userId } },
        timestamp: Date.now(),
      }, userId)

      logger.info({ userId, boardId }, `User ${userId} connected to board ${boardId}`)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage }, 'WebSocket connection error')
      ws.close(1008, 'Authentication failed')
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(ws: ExtendedWebSocket, data: Buffer): void {
    try {
      const message: WSMessage = JSON.parse(data.toString())

      metrics.websocketMessages.inc({
        type: message.type,
        board_id: ws.boardId || 'unknown'
      })

      // Handle different message types
      switch (message.type) {
        case 'ping':
          this.sendToClient(ws, { type: 'pong', data: {}, timestamp: Date.now() })
          break
        case 'activity':
          // Forward activity to Redis pub/sub for cross-instance communication
          this.publishToRedis(ws.boardId!, message)
          break
        default:
          logger.warn({ messageType: message.type }, `Unknown message type: ${message.type}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage }, 'Error handling WebSocket message')
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnection(ws: ExtendedWebSocket): void {
    const userId = ws.userId
    const boardId = ws.boardId

    if (userId && boardId) {
      // Remove from clients map
      const clientId = `${userId}:${boardId}`
      this.clients.delete(clientId)

      // Remove from board connections
      const boardClients = this.boardConnections.get(boardId)
      if (boardClients) {
        boardClients.delete(ws)
        if (boardClients.size === 0) {
          this.boardConnections.delete(boardId)
        }
        // Update metrics
        metrics.websocketConnections.set({ board_id: boardId }, boardClients.size)
      }

      // Broadcast user left event
      this.broadcastToBoard(boardId, {
        type: 'user:left',
        data: { userId },
        timestamp: Date.now(),
      })

      logger.info({ userId, boardId }, `User ${userId} disconnected from board ${boardId}`)
    }
  }

  /**
   * Handle WebSocket error
   */
  private handleError(ws: ExtendedWebSocket, error: Error): void {
    logger.error({ error: error.message }, 'WebSocket error')
    this.handleDisconnection(ws)
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(ws: ExtendedWebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  /**
   * Broadcast message to all clients in a board
   */
  broadcastToBoard(boardId: string, message: WSMessage, excludeUserId?: string): void {
    const boardClients = this.boardConnections.get(boardId)
    if (!boardClients) return

    boardClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client.userId !== excludeUserId) {
        this.sendToClient(client, message)
      }
    })
  }

  /**
   * Send message to all connections of a specific user
   */
  sendToUser(userId: string, message: WSMessage): void {
    this.clients.forEach(client => {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        this.sendToClient(client.ws, message)
      }
    })
  }

  /**
   * Publish message to Redis for cross-instance communication
   */
  private async publishToRedis(boardId: string, message: WSMessage): Promise<void> {
    try {
      await redisClient.publish(
        PUBSUB_CHANNELS.BOARD_UPDATES(boardId),
        JSON.stringify(message)
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage }, 'Error publishing to Redis')
    }
  }

  /**
   * Set up Redis subscription for cross-instance messages
   */
  private setupRedisSubscription(): void {
    const subscriber = redisClient.duplicate()

    subscriber.on('message', (channel, message) => {
      try {
        const wsMessage: WSMessage = JSON.parse(message)
        const boardId = channel.replace('board:', '').replace(':updates', '')

        // Broadcast to local clients
        this.broadcastToBoard(boardId, wsMessage)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.error({ error: errorMessage }, 'Error processing Redis message')
      }
    })

    // Subscribe to all board update channels (using pattern)
    subscriber.pSubscribe('board:*:updates', (message, channel) => {
      logger.debug(`Received Redis message on channel ${channel}`)
    })
  }

  /**
   * Health check for connections
   */
  pingClients(): void {
    this.clients.forEach(({ ws }) => {
      if (!ws.isAlive) {
        ws.terminate()
        return
      }

      ws.isAlive = false
      ws.ping()
    })
  }

  /**
   * Get connection statistics
   */
  getStats(): { totalClients: number; boardConnections: Record<string, number> } {
    const boardConnections: Record<string, number> = {}

    this.boardConnections.forEach((clients, boardId) => {
      boardConnections[boardId] = clients.size
    })

    return {
      totalClients: this.clients.size,
      boardConnections,
    }
  }
}

// Export singleton instance
export const wsManager = new WebSocketManager()
