import pino from 'pino'

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label }
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
})

export { logger }

// Helper functions for different log levels
// Pino expects (obj, message) format
export const log = {
  info: (message: string, obj?: unknown) => logger.info(obj || {}, message),
  warn: (message: string, obj?: unknown) => logger.warn(obj || {}, message),
  error: (message: string, obj?: unknown) => logger.error(obj || {}, message),
  debug: (message: string, obj?: unknown) => logger.debug(obj || {}, message),
  fatal: (message: string, obj?: unknown) => logger.fatal(obj || {}, message),
}

// Real-time specific logging functions
export const realtimeLogger = {
  // WebSocket connection events
  websocketConnection: (event: string, boardId: string, userId?: string, metadata?: Record<string, unknown>) => {
    logger.info({
      event,
      boardId,
      userId,
      component: 'websocket',
      ...metadata,
    }, `WebSocket ${event}`)
  },

  websocketError: (error: Error, boardId: string, context?: Record<string, unknown>) => {
    logger.error({
      error: error.message,
      stack: error.stack,
      boardId,
      component: 'websocket',
      ...context,
    }, 'WebSocket error')
  },

  // Message events
  websocketMessage: (direction: 'inbound' | 'outbound', type: string, boardId: string, metadata?: Record<string, unknown>) => {
    logger.debug({
      direction,
      type,
      boardId,
      component: 'websocket',
      ...metadata,
    }, `WebSocket message ${direction}`)
  },

  // Optimistic update events
  optimisticUpdate: (operation: string, operationId: string, status: 'started' | 'success' | 'failed' | 'rolled_back', metadata?: Record<string, unknown>) => {
    const level = status === 'failed' ? 'error' : status === 'rolled_back' ? 'warn' : 'info'
    logger[level]({
      operation,
      operationId,
      status,
      component: 'optimistic_update',
      ...metadata,
    }, `Optimistic update ${status}`)
  },

  // Conflict resolution events
  conflictResolution: (operationId: string, strategy: string, resolution: 'accept' | 'reject' | 'merge', metadata?: Record<string, unknown>) => {
    logger.info({
      operationId,
      strategy,
      resolution,
      component: 'conflict_resolution',
      ...metadata,
    }, `Conflict resolved with ${resolution} strategy`)
  },

  // Presence events
  userPresence: (event: string, boardId: string, userId: string, metadata?: Record<string, unknown>) => {
    logger.info({
      event,
      boardId,
      userId,
      component: 'presence',
      ...metadata,
    }, `User presence: ${event}`)
  },

  // Performance monitoring
  performanceMetric: (metric: string, value: number, boardId?: string, metadata?: Record<string, unknown>) => {
    logger.info({
      metric,
      value,
      boardId,
      component: 'performance',
      ...metadata,
    }, `Performance metric: ${metric} = ${value}`)
  },

  // Health monitoring
  healthCheck: (component: string, status: 'healthy' | 'degraded' | 'unhealthy', score?: number, metadata?: Record<string, unknown>) => {
    const level = status === 'unhealthy' ? 'error' : status === 'degraded' ? 'warn' : 'info'
    logger[level]({
      component,
      status,
      score,
      ...metadata,
    }, `Health check: ${component} is ${status}`)
  },

  // Activity logging
  activity: (action: string, boardId: string, userId: string, resourceType?: string, resourceId?: string, metadata?: Record<string, unknown>) => {
    logger.info({
      action,
      boardId,
      userId,
      resourceType,
      resourceId,
      component: 'activity',
      ...metadata,
    }, `Activity: ${action}`)
  },

  // Error boundary events
  errorBoundary: (error: Error, component: string, retryCount?: number, metadata?: Record<string, unknown>) => {
    logger.error({
      error: error.message,
      stack: error.stack,
      component,
      retryCount,
      boundary: true,
      ...metadata,
    }, `Error boundary caught error in ${component}`)
  },

  // Rate limiting events
  rateLimit: (action: string, identifier: string, limit: number, windowMs: number, metadata?: Record<string, unknown>) => {
    logger.warn({
      action,
      identifier,
      limit,
      windowMs,
      component: 'rate_limit',
      ...metadata,
    }, `Rate limit exceeded for ${action}`)
  },
}
