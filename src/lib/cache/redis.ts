import { createClient, RedisClientType } from 'redis'

declare global {
  // eslint-disable-next-line no-var
  var redis: RedisClientType | undefined
}

let redisClient: RedisClientType

if (!global.redis) {
  const redisOptions: any = {
    url: process.env.REDIS_URL,
  };

  // Only set password if it's provided and non-empty
  const redisPassword = process.env.REDIS_PASSWORD?.trim();
  if (redisPassword && redisPassword.length > 0) {
    redisOptions.password = redisPassword;
  }

  redisClient = createClient(redisOptions);

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
  BOARD_ACTIVITIES: (id: string) => `board:${id}:activities`,
  USER: (id: string) => `user:${id}`,
  USER_BOARDS: (id: string) => `user:${id}:boards`,
  BOARD_MEMBERS: (id: string) => `board:${id}:members`,
  USER_SEARCH: (userId: string, query: string, boardId?: string) =>
    `user_search:${userId}:${query}:${boardId || 'global'}`,
  TEMPLATES_PREFIX: 'templates',
  TEMPLATES: (category?: string, limit?: number, offset?: number) =>
    `templates:${category || 'all'}:${limit || 20}:${offset || 0}`,
  TEMPLATE: (id: string) => `template:${id}`,
  USER_NOTIFICATIONS: (userId: string) => `user:${userId}:notifications`,
  NOTIFICATIONS_COUNT: (userId: string) => `user:${userId}:notifications:count`,
    SEARCH_RESULTS: (userId: string, q: string, type?: string, boardId?: string, assigneeId?: string, priority?: string, dueDateFrom?: string, dueDateTo?: string, labels?: string, limit?: number, offset?: number) =>
      `search:${userId}:${q || ''}:${type || 'all'}:${boardId || 'all'}:${assigneeId || 'all'}:${priority || 'all'}:${dueDateFrom || 'all'}:${dueDateTo || 'all'}:${labels || 'all'}:${limit || 20}:${offset || 0}`,
} as const

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  BOARD: 300, // 5 minutes
  BOARD_ACTIVITY: 60, // 1 minute
  BOARD_ACTIVITIES: 120, // 2 minutes (activities change more frequently)
  USER: 1800, // 30 minutes (user data changes less frequently)
  USER_BOARDS: 600, // 10 minutes
  BOARD_MEMBERS: 900, // 15 minutes
  USER_SEARCH: 300, // 5 minutes
  TEMPLATES: 3600, // 1 hour (templates change infrequently)
  TEMPLATE: 1800, // 30 minutes
  USER_NOTIFICATIONS: 60, // 1 minute (notifications change frequently)
  NOTIFICATIONS_COUNT: 30, // 30 seconds
  SEARCH_RESULTS: 300, // 5 minutes (search results can be cached briefly)
} as const

// Pub/Sub channel constants
export const PUBSUB_CHANNELS = {
  BOARD_UPDATES: (id: string) => `board:${id}:updates`,
  CACHE_INVALIDATION: 'cache:invalidation',
  PRESENCE: (boardId: string) => `presence:${boardId}`,
} as const
