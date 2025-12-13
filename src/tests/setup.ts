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
    ping: jest.fn().mockResolvedValue('PONG' as unknown),
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

// Global test utilities
global.beforeEach(() => {
  jest.clearAllMocks()
})

global.afterEach(() => {
  jest.clearAllTimers()
})
