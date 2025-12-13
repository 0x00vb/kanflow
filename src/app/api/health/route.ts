import { NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { redisClient } from '@/lib/cache/redis'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

export async function GET() {
  const startTime = Date.now()

  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`

    // Check Redis connection
    await redisClient.ping()

    const responseTime = Date.now() - startTime

    // Record metrics
    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/health', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'GET', route: '/api/health' }, responseTime / 1000)

    logger.info({ responseTime }, 'Health check passed')

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
      },
      responseTime: `${responseTime}ms`,
    })
  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, responseTime }, 'Health check failed')

    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/api/health', status_code: '500' })

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: errorMessage,
        responseTime: `${responseTime}ms`,
      },
      { status: 500 }
    )
  }
}
