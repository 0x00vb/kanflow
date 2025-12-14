import { jest } from '@jest/globals'

// Mock environment variables
if (!process.env.NODE_ENV) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: 'test',
    writable: true,
  })
}
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.REDIS_URL = 'redis://localhost:6379'
process.env.JWT_SECRET = 'test-jwt-secret'
process.env.NEXTAUTH_SECRET = 'test-nextauth-secret'

// Mock Redis
jest.mock('@/lib/cache/redis', () => ({
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
    ping: jest.fn(),
    publish: jest.fn(),
    subscribe: jest.fn(),
    pSubscribe: jest.fn(),
    on: jest.fn(),
  },
  CACHE_KEYS: {
    BOARD: (id: string) => `board:${id}`,
    BOARD_ACTIVITY: (id: string) => `board:${id}:activity`,
    USER_BOARDS: (id: string) => `user:${id}:boards`,
    BOARD_MEMBERS: (id: string) => `board:${id}:members`,
  },
  CACHE_TTL: {
    BOARD: 300,
    BOARD_ACTIVITY: 60,
    USER_BOARDS: 600,
    BOARD_MEMBERS: 900,
  },
  PUBSUB_CHANNELS: {
    BOARD_UPDATES: (id: string) => `board:${id}:updates`,
    CACHE_INVALIDATION: 'cache:invalidation',
    PRESENCE: (boardId: string) => `presence:${boardId}`,
  },
}))

// Mock Prisma
jest.mock('@/lib/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    board: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    // Add other models as needed
  },
}))

// Test helper functions
export const createTestUser = async (email = 'test@example.com', name = 'Test User') => {
  const { prisma } = require('@/lib/database/prisma')
  return await prisma.user.create({
    data: {
      email,
      name,
      password: 'hashedpassword',
    },
  })
}

export const createTestBoard = async (ownerId: string, title = 'Test Board') => {
  const { prisma } = require('@/lib/database/prisma')
  return await prisma.board.create({
    data: {
      title,
      description: 'Test board description',
      ownerId,
    },
  })
}

export const createTestMember = async (boardId: string, userId: string, role = 'MEMBER') => {
  const { prisma } = require('@/lib/database/prisma')
  return await prisma.boardMember.create({
    data: {
      boardId,
      userId,
      role,
    },
  })
}

export const cleanupTestData = async () => {
  const { prisma } = require('@/lib/database/prisma')
  await prisma.boardMember.deleteMany({})
  await prisma.board.deleteMany({})
  await prisma.user.deleteMany({})
}

// Global test utilities
global.beforeEach(() => {
  jest.clearAllMocks()
})

global.afterEach(() => {
  jest.clearAllTimers()
})
