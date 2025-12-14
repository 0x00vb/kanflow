import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

// Initialize Next.js app
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  // Create HTTP server
  const server = createServer((req, res) => {
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('X-XSS-Protection', '1; mode=block')

    // Handle Next.js requests
    const parsedUrl = parse(req.url || '/', true)
    handle(req, res, parsedUrl)
  })

  // Graceful shutdown
  const shutdown = () => {
    console.log('Shutting down gracefully...')
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

  // Start server
  server.listen(port, (err?: Error) => {
    if (err) {
      console.error('Failed to start server:', err)
      throw err
    }
    console.log(`> Ready on http://${hostname}:${port}`)
  })
}).catch((ex: Error) => {
  console.error('Failed to prepare Next.js app:', ex.stack)
  process.exit(1)
})
