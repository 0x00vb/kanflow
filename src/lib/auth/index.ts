import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, JWTPayload } from './jwt';

export * from './jwt';
export * from './context';

interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload;
}

export function getUserFromRequest(request: AuthenticatedRequest): JWTPayload {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.substring(7);
  try {
    const decoded = verifyToken(token);
    if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
      return decoded;
    }
    throw new Error('Invalid token payload');
  } catch (error) {
    throw new Error('Invalid token');
  }
}
