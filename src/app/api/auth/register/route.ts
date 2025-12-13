import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database/prisma'
import { hashPassword, generateToken } from '@/lib/auth/jwt'
import { createUserSchema } from '@/lib/validation/schemas'
import { strictRateLimitMiddleware } from '@/middleware/rateLimit'
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Apply strict rate limiting for registration attempts
    const rateLimitResponse = await strictRateLimitMiddleware(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const body = await request.json()

    // Validate input
    const validationResult = createUserSchema.safeParse(body)
    if (!validationResult.success) {
      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/auth/register', status_code: '400' })

      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { email, password, name, avatar } = validationResult.data

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (existingUser) {
      logger.warn({ email }, 'Registration attempt with existing email')

      metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/auth/register', status_code: '409' })

      return NextResponse.json(
        { error: 'User already exists with this email' },
        { status: 409 }
      )
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        avatar,
      },
    })

    // Remove password from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...userWithoutPassword } = user

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
    })

    const responseTime = Date.now() - startTime

    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/auth/register', status_code: '201' })
    metrics.httpRequestDuration.observe({ method: 'POST', route: '/api/auth/register' }, responseTime / 1000)

    logger.info({ userId: user.id, email, responseTime }, 'User registered successfully')

    return NextResponse.json({
      success: true,
      data: {
        user: userWithoutPassword,
        token,
      },
      message: 'Registration successful',
    }, { status: 201 })

  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error({ error: errorMessage, responseTime }, 'Registration error')

    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/auth/register', status_code: '500' })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Something went wrong during registration',
      },
      { status: 500 }
    )
  }
}
