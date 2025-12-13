import { createClient, RedisClientType } from 'redis'

declare global {
  // eslint-disable-next-line no-var
  var redis: RedisClientType | undefined
}

let redisClient: RedisClientType

if (!global.redis) {
  redisClient = createClient({
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD || undefined,
  })

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err)
  })

  redisClient.on('connect', () => {
    console.log('✅ Connected to Redis')
  })

  // IMPORTANT: Actually connect to Redis
  redisClient.connect().catch((err) => {
    console.error('❌ Failed to connect to Redis:', err)
  })

  global.redis = redisClient
} else {
  redisClient = global.redis
}

export { redisClient }

// Cache key constants
export const CACHE_KEYS = {
  BOARD: (id: string) => `board:${id}`,
  BOARD_ACTIVITY: (id: string) => `board:${id}:activity`,
  USER_BOARDS: (id: string) => `user:${id}:boards`,
  BOARD_MEMBERS: (id: string) => `board:${id}:members`,
  USER_SEARCH: (userId: string, query: string, boardId?: string) =>
    `user_search:${userId}:${query}:${boardId || 'global'}`,
} as const

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  BOARD: 300, // 5 minutes
  BOARD_ACTIVITY: 60, // 1 minute
  USER_BOARDS: 600, // 10 minutes
  BOARD_MEMBERS: 900, // 15 minutes
  USER_SEARCH: 300, // 5 minutes
} as const

// Pub/Sub channel constants
export const PUBSUB_CHANNELS = {
  BOARD_UPDATES: (id: string) => `board:${id}:updates`,
  CACHE_INVALIDATION: 'cache:invalidation',
  PRESENCE: (boardId: string) => `presence:${boardId}`,
} as const
