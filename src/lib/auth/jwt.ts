import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

const JWT_SECRET: string = process.env.JWT_SECRET || 'fallback-secret-key'
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d'

export interface JWTPayload {
  userId: string
  email: string
  iat?: number
  exp?: number
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12
  return bcrypt.hash(password, saltRounds)
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(
    payload as object,
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'kanflow',
      audience: 'kanflow-users',
    }
  )
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'kanflow',
      audience: 'kanflow-users',
    }) as JWTPayload

    return decoded
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthError('Invalid token')
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthError('Token expired')
    }
    throw new AuthError('Token verification failed')
  }
}

/**
 * Generate a secure random token for various purposes
 */
export function generateSecureToken(): string {
  return uuidv4()
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | null | undefined): string | undefined {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return undefined
  }

  return authHeader.substring(7) // Remove 'Bearer ' prefix
}
