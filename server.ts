import { createServer, Server } from 'http'
import { parse } from 'url'
import next from 'next'
import { wsManager } from './src/lib/websocket/server'

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

// Initialize Next.js app
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  // Create HTTP server
  const server: Server = createServer((req, res) => {
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('X-XSS-Protection', '1; mode=block')

    // Handle Next.js requests
    const parsedUrl = parse(req.url || '/', true)
    handle(req, res, parsedUrl)
  })

  // Initialize WebSocket server
  try {
    wsManager.initialize(server)

    // Set up heartbeat check
    const heartbeatInterval = setInterval(() => {
      wsManager.pingClients()
    }, 30000) // Check every 30 seconds

    // Graceful shutdown
    const shutdown = () => {
      console.log('Shutting down gracefully...')
      clearInterval(heartbeatInterval)
      server.close(() => {
        console.log('Server closed')
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

    console.log('WebSocket server initialized successfully')
  } catch (error) {
    console.error('Failed to initialize WebSocket server:', error)
    // Continue without WebSocket support
  }

  // Start server
  server.listen(port, (err?: Error) => {
    if (err) {
      console.error('Failed to start server:', err)
      throw err
    }
    console.log(`> Ready on http://${hostname}:${port}`)
    console.log(`> WebSocket server ${wsManager ? 'enabled' : 'disabled'}`)
  })
}).catch((ex: Error) => {
  console.error('Failed to prepare Next.js app:', ex.stack)
  process.exit(1)
})
