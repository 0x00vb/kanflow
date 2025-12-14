import { createServer } from 'http'
import { WebSocketManager } from './WebSocketManager'

const port = parseInt(process.env.WEBSOCKET_PORT || '8080', 10)

const server = createServer()
const wsManager = new WebSocketManager()

wsManager.initialize(server)

// Set up heartbeat check
const heartbeatInterval = setInterval(() => {
  wsManager.pingClients()
}, 30000) // Check every 30 seconds

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down WebSocket server gracefully...')
  clearInterval(heartbeatInterval)
  server.close(() => {
    console.log('WebSocket server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', () => {
  console.log('SIGTERM received')
  shutdown()
})

process.on('SIGINT', () => {
  console.log('SIGINT received')
  shutdown()
})

server.listen(port, () => {
  console.log(`WebSocket server listening on port ${port}`)
})
