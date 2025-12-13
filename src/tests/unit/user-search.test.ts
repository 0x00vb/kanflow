import { NextRequest } from 'next/server'
import { GET } from '@/app/api/users/search/route'
import { prisma } from '@/lib/database/prisma'
import { redisClient } from '@/lib/cache/redis'

// Mock dependencies
jest.mock('@/lib/database/prisma')
jest.mock('@/lib/cache/redis')
jest.mock('@/middleware/auth')
jest.mock('@/lib/logger')
jest.mock('@/lib/metrics')

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockRedis = redisClient as jest.Mocked<typeof redisClient>

describe('/api/users/search', () => {
  let mockUser: any

  beforeEach(() => {
    jest.clearAllMocks()

    mockUser = {
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      avatar: null,
    }

    // Mock auth middleware
    const mockWithAuth = jest.fn((handler) => handler)
    jest.mock('@/middleware/auth', () => ({
      withAuth: mockWithAuth,
    }))

    // Mock Redis
    mockRedis.incr.mockResolvedValue(1)
    mockRedis.expire.mockResolvedValue(1)
    mockRedis.get.mockResolvedValue(null)
    mockRedis.setEx.mockResolvedValue('OK')

    // Mock Prisma
    mockPrisma.user.findMany.mockResolvedValue([mockUser])
  })

  it('should return users matching search query', async () => {
    const url = new URL('http://localhost:3000/api/users/search?q=test&boardId=board-1')
    const request = new NextRequest(url)

    // Mock the request.user
    ;(request as any).user = { id: 'user-1' }

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data).toHaveLength(1)
    expect(data.data[0]).toEqual(mockUser)
  })

  it('should exclude already board members', async () => {
    const url = new URL('http://localhost:3000/api/users/search?q=test&boardId=board-1')
    const request = new NextRequest(url)

    // Mock the request.user
    ;(request as any).user = { id: 'user-1' }

    // Mock board members query
    mockPrisma.boardMember.findMany.mockResolvedValue([
      { userId: mockUser.id }
    ])

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data).toHaveLength(0) // User should be excluded
  })

  it('should rate limit requests', async () => {
    // Mock rate limit exceeded
    mockRedis.incr.mockResolvedValue(11) // Over the limit

    const url = new URL('http://localhost:3000/api/users/search?q=test')
    const request = new NextRequest(url)

    // Mock the request.user
    ;(request as any).user = { id: 'user-1' }

    const response = await GET(request)

    expect(response.status).toBe(429)
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
  })

  it('should validate search query', async () => {
    const url = new URL('http://localhost:3000/api/users/search?q=a') // Too short
    const request = new NextRequest(url)

    // Mock the request.user
    ;(request as any).user = { id: 'user-1' }

    const response = await GET(request)

    expect(response.status).toBe(400)
  })
})
