import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { verifyPassword, generateToken } from '@/lib/auth/jwt'
import { loginSchema } from '@/lib/validation/schemas'
import { strictRateLimitMiddleware } from '@/middleware/rateLimit'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Apply strict rate limiting for login attempts
    const rateLimitResponse = await strictRateLimitMiddleware(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const body = await request.json()

    // Validate input
    const validationResult = loginSchema.safeParse(body)
    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/auth/login', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { email, password: inputPassword } = validationResult.data

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (!user) {
      logger.warn({ email }, 'Login attempt with non-existent email')

      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/auth/login', status_code: '401' })

      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Verify password
    const isValidPassword = await verifyPassword(inputPassword, user.password)

    if (!isValidPassword) {
      logger.warn({ email, userId: user.id }, 'Login attempt with invalid password')

      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/auth/login', status_code: '401' })

      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
    })

    // Remove password from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...userWithoutPassword } = user

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/auth/login', status_code: '200' })
    metrics.httpRequestDuration.observe({ method: 'POST', route: '/api/auth/login' }, responseTime / 1000)

    logger.info({ userId: user.id, email, responseTime }, 'User logged in successfully')

    return NextResponse.json({
      success: true,
      data: {
        user: userWithoutPassword,
        token,
      },
      message: 'Login successful',
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, responseTime }, 'Login error')

    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/auth/login', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Something went wrong during login',
      },
      { status: 500 }
    )
  }
}
