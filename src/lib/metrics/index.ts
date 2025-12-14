// Only import prom-client on the server side
let register: any, collectDefaultMetrics: any, Gauge: any, Counter: any, Histogram: any

if (typeof window === 'undefined') {
  // Server-side only
  const promClient = require('prom-client')
  register = promClient.register
  collectDefaultMetrics = promClient.collectDefaultMetrics
  Gauge = promClient.Gauge
  Counter = promClient.Counter
  Histogram = promClient.Histogram

  // Enable default metrics collection
  collectDefaultMetrics({ prefix: 'kanflow_' })
} else {
  // Client-side stubs
  register = null
  collectDefaultMetrics = () => {}
  Gauge = class { inc() {} observe() {} set() {} }
  Counter = class { inc() {} }
  Histogram = class { observe() {} }
}

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
    labelNames: ['type', 'direction', 'board_id'],
  }),

  websocketMessageLatency: new Histogram({
    name: 'kanflow_websocket_message_latency_seconds',
    help: 'Latency of WebSocket messages in seconds',
    labelNames: ['type'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  }),

  websocketReconnections: new Counter({
    name: 'kanflow_websocket_reconnections_total',
    help: 'Total number of WebSocket reconnections',
    labelNames: ['board_id', 'reason'],
  }),

  websocketConnectionDuration: new Histogram({
    name: 'kanflow_websocket_connection_duration_seconds',
    help: 'Duration of WebSocket connections in seconds',
    labelNames: ['board_id'],
    buckets: [60, 300, 900, 1800, 3600, 7200], // 1min to 2hours
  }),

  // Optimistic update metrics
  optimisticUpdatesTotal: new Counter({
    name: 'kanflow_optimistic_updates_total',
    help: 'Total number of optimistic updates',
    labelNames: ['operation', 'status'],
  }),

  optimisticUpdateConflicts: new Counter({
    name: 'kanflow_optimistic_update_conflicts_total',
    help: 'Total number of optimistic update conflicts',
    labelNames: ['operation', 'resolution'],
  }),

  optimisticUpdateLatency: new Histogram({
    name: 'kanflow_optimistic_update_latency_seconds',
    help: 'Latency of optimistic updates in seconds',
    labelNames: ['operation'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
  }),

  // Real-time presence metrics
  activeUsersPerBoard: new Gauge({
    name: 'kanflow_active_users_per_board',
    help: 'Number of active users per board',
    labelNames: ['board_id'],
  }),

  userPresenceEvents: new Counter({
    name: 'kanflow_user_presence_events_total',
    help: 'Total number of user presence events',
    labelNames: ['event_type', 'board_id'],
  }),

  // Performance metrics
  realtimeHealthScore: new Gauge({
    name: 'kanflow_realtime_health_score',
    help: 'Real-time features health score (0-100)',
    labelNames: ['board_id'],
  }),

  messageQueueLength: new Gauge({
    name: 'kanflow_message_queue_length',
    help: 'Length of WebSocket message queue',
    labelNames: ['board_id'],
  }),

  // Error metrics
  realtimeErrors: new Counter({
    name: 'kanflow_realtime_errors_total',
    help: 'Total number of real-time errors',
    labelNames: ['error_type', 'component'],
  }),

  websocketErrors: new Counter({
    name: 'kanflow_websocket_errors_total',
    help: 'Total number of WebSocket errors',
    labelNames: ['error_type', 'board_id'],
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

  // Activity metrics
  activityEvents: new Counter({
    name: 'kanflow_activity_events_total',
    help: 'Total number of activity events created',
    labelNames: ['activity_type'],
  }),

  activityErrors: new Counter({
    name: 'kanflow_activity_errors_total',
    help: 'Total number of activity creation errors',
    labelNames: ['activity_type'],
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
