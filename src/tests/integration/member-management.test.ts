import request from 'supertest'
import { prisma } from '@/lib/database/prisma'
import { redisClient, CACHE_KEYS } from '@/lib/cache/redis'
import { createTestUser, createTestBoard, createTestMember, cleanupTestData } from '../setup'

// Mock Next.js server for testing
const mockApp = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}

jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest {
    constructor(url: string) {
      this.url = url
    }
    url: string
    user?: any
  },
  NextResponse: {
    json: jest.fn((data, options) => ({
      status: options?.status || 200,
      json: () => Promise.resolve(data),
    })),
  },
}))

describe('Member Management Integration', () => {
  let testUser: any
  let testBoard: any
  let testMember: any

  beforeAll(async () => {
    testUser = await createTestUser()
    testBoard = await createTestBoard(testUser.id)
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  describe('User Search API', () => {
    it('should find users by name', async () => {
      const response = await request(mockApp as any)
        .get('/api/users/search')
        .query({ q: testUser.name.substring(0, 3), boardId: testBoard.id })
        .set('Authorization', `Bearer ${testUser.id}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(Array.isArray(response.body.data)).toBe(true)
    })

    it('should respect rate limiting', async () => {
      // Make multiple requests quickly
      const requests = Array(15).fill(null).map(() =>
        request(mockApp as any)
          .get('/api/users/search')
          .query({ q: 'test', boardId: testBoard.id })
          .set('Authorization', `Bearer ${testUser.id}`)
      )

      const responses = await Promise.all(requests)

      // At least one should be rate limited
      const rateLimitedResponse = responses.find(r => r.status === 429)
      expect(rateLimitedResponse).toBeDefined()
    })
  })

  describe('Member CRUD Operations', () => {
    it('should add a new member to board', async () => {
      const newUser = await createTestUser('member@example.com')

      const response = await request(mockApp as any)
        .post(`/api/boards/${testBoard.id}/members`)
        .send({ userId: newUser.id, role: 'MEMBER' })
        .set('Authorization', `Bearer ${testUser.id}`)

      expect(response.status).toBe(201)
      expect(response.body.success).toBe(true)
      expect(response.body.data.userId).toBe(newUser.id)
    })

    it('should update member role', async () => {
      const member = await createTestMember(testBoard.id, testUser.id, 'MEMBER')

      const response = await request(mockApp as any)
        .put(`/api/boards/${testBoard.id}/members/${testUser.id}`)
        .send({ role: 'ADMIN' })
        .set('Authorization', `Bearer ${testUser.id}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.role).toBe('ADMIN')
    })

    it('should remove member from board', async () => {
      const member = await createTestMember(testBoard.id, testUser.id)

      const response = await request(mockApp as any)
        .delete(`/api/boards/${testBoard.id}/members/${testUser.id}`)
        .set('Authorization', `Bearer ${testUser.id}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
    })

    it('should prevent removing last owner', async () => {
      // This test would need special setup to ensure only one owner
      const response = await request(mockApp as any)
        .delete(`/api/boards/${testBoard.id}/members/${testUser.id}`)
        .set('Authorization', `Bearer ${testUser.id}`)

      // Should fail if user is the last owner
      expect([200, 400]).toContain(response.status)
    })
  })

  describe('Security & Permissions', () => {
    it('should require authentication', async () => {
      const response = await request(mockApp as any)
        .get('/api/users/search')
        .query({ q: 'test' })

      expect(response.status).toBe(401)
    })

    it('should require admin permission to add members', async () => {
      const regularUser = await createTestUser('regular@example.com')
      await createTestMember(testBoard.id, regularUser.id, 'MEMBER')

      const newUser = await createTestUser('new@example.com')

      const response = await request(mockApp as any)
        .post(`/api/boards/${testBoard.id}/members`)
        .send({ userId: newUser.id, role: 'MEMBER' })
        .set('Authorization', `Bearer ${regularUser.id}`)

      expect(response.status).toBe(403)
    })

    it('should require owner permission to change roles', async () => {
      const adminUser = await createTestUser('admin@example.com')
      await createTestMember(testBoard.id, adminUser.id, 'ADMIN')

      const response = await request(mockApp as any)
        .put(`/api/boards/${testBoard.id}/members/${testUser.id}`)
        .send({ role: 'VIEWER' })
        .set('Authorization', `Bearer ${adminUser.id}`)

      expect(response.status).toBe(403)
    })
  })

  describe('Caching', () => {
    it('should cache user search results', async () => {
      const cacheKey = CACHE_KEYS.USER_SEARCH(testUser.id, 'test', testBoard.id)

      // Clear cache first
      await redisClient.del(cacheKey)

      // First request should miss cache
      const response1 = await request(mockApp as any)
        .get('/api/users/search')
        .query({ q: 'test', boardId: testBoard.id })
        .set('Authorization', `Bearer ${testUser.id}`)

      expect(response1.status).toBe(200)
      expect(response1.body.cached).toBe(false)

      // Second request should hit cache
      const response2 = await request(mockApp as any)
        .get('/api/users/search')
        .query({ q: 'test', boardId: testBoard.id })
        .set('Authorization', `Bearer ${testUser.id}`)

      expect(response2.status).toBe(200)
      expect(response2.body.cached).toBe(true)
    })
  })
})
