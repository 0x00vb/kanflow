import { NextRequest, NextResponse } from 'next/server'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { logger } from '@/lib/logger'

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000') // 15 minutes
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')

// In-memory rate limiter (for single instance)
// For production with multiple instances, use Redis
const rateLimiter = new RateLimiterMemory({
  keyPrefix: 'kanflow_ratelimit',
  points: MAX_REQUESTS, // Number of requests
  duration: WINDOW_MS / 1000, // Per WINDOW_MS seconds
})

/**
 * Rate limiting middleware
 */
export async function rateLimit(request: NextRequest): Promise<NextResponse | null> {
  // Get client IP
  const ip = request.ip ||
             request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown'

  try {
    await rateLimiter.consume(ip)

    // Add rate limit headers to response
    const remaining = await rateLimiter.get(ip)
    if (remaining) {
      const response = NextResponse.next()
      response.headers.set('X-RateLimit-Limit', MAX_REQUESTS.toString())
      response.headers.set('X-RateLimit-Remaining', remaining.remainingPoints.toString())
      response.headers.set('X-RateLimit-Reset', (Date.now() + remaining.msBeforeNext).toString())

      return response
    }

    return NextResponse.next()
  } catch (rejRes) {
    logger.warn({ ip, rejRes }, `Rate limit exceeded for IP: ${ip}`)

    const response = NextResponse.json(
      {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.'
      },
      { status: 429 }
    )

    // Set rate limit headers
    response.headers.set('X-RateLimit-Limit', MAX_REQUESTS.toString())
    response.headers.set('X-RateLimit-Remaining', '0')
    response.headers.set('X-RateLimit-Reset', (Date.now() + WINDOW_MS).toString())
    response.headers.set('Retry-After', Math.ceil(WINDOW_MS / 1000).toString())

    return response
  }
}

/**
 * Higher rate limit for sensitive operations (login, etc.)
 */
export const strictRateLimit = new RateLimiterMemory({
  keyPrefix: 'kanflow_strict_ratelimit',
  points: 5, // 5 attempts
  duration: 300, // Per 5 minutes
})

/**
 * Apply strict rate limiting
 */
export async function strictRateLimitMiddleware(request: NextRequest): Promise<NextResponse | null> {
  const ip = request.ip ||
             request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown'

  try {
    await strictRateLimit.consume(ip)
    return null // Rate limit not exceeded, allow request to proceed
  } catch (rejRes) {
    logger.warn({ ip, rejRes }, `Strict rate limit exceeded for IP: ${ip}`)

    return NextResponse.json(
      {
        error: 'Too many attempts',
        message: 'Too many failed attempts. Please wait before trying again.'
      },
      { status: 429 }
    )
  }
}
