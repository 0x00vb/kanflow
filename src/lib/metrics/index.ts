import { register, collectDefaultMetrics, Gauge, Counter, Histogram } from 'prom-client'

// Enable default metrics collection
collectDefaultMetrics({ prefix: 'kanflow_' })

// Custom metrics
export const metrics = {
  // HTTP request metrics
  httpRequestsTotal: new Counter({
    name: 'kanflow_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
  }),

  httpRequestDuration: new Histogram({
    name: 'kanflow_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
  }),

  // WebSocket metrics
  websocketConnections: new Gauge({
    name: 'kanflow_websocket_connections',
    help: 'Number of active WebSocket connections',
    labelNames: ['board_id'],
  }),

  websocketMessages: new Counter({
    name: 'kanflow_websocket_messages_total',
    help: 'Total number of WebSocket messages',
    labelNames: ['type', 'board_id'],
  }),

  // Database metrics
  dbQueryDuration: new Histogram({
    name: 'kanflow_db_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['operation', 'table'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  }),

  dbConnections: new Gauge({
    name: 'kanflow_db_connections',
    help: 'Number of active database connections',
  }),

  // Cache metrics
  cacheHits: new Counter({
    name: 'kanflow_cache_hits_total',
    help: 'Total number of cache hits',
    labelNames: ['cache_type'],
  }),

  cacheMisses: new Counter({
    name: 'kanflow_cache_misses_total',
    help: 'Total number of cache misses',
    labelNames: ['cache_type'],
  }),

  // Business metrics
  activeBoards: new Gauge({
    name: 'kanflow_active_boards',
    help: 'Number of active boards',
  }),

  activeUsers: new Gauge({
    name: 'kanflow_active_users',
    help: 'Number of active users',
  }),
}

export { register }
