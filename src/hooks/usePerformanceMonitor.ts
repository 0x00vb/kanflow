'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from './useWebSocket'
import { realtimeLogger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

export interface PerformanceMetrics {
  // Connection metrics
  connectionStatus: string
  connectionUptime: number
  reconnectCount: number

  // Message metrics
  totalMessagesSent: number
  totalMessagesReceived: number
  messagesPerSecond: number
  averageLatency: number
  maxLatency: number
  minLatency: number

  // Queue metrics
  queueLength: number
  droppedMessages: number

  // Memory metrics
  memoryUsage: number

  // Network metrics
  networkLatency: number
  packetLoss: number
}

export interface UsePerformanceMonitorReturn extends PerformanceMetrics {
  resetMetrics: () => void
  exportMetrics: () => string
  getHealthScore: () => number
}

const DEFAULT_METRICS: PerformanceMetrics = {
  connectionStatus: 'disconnected',
  connectionUptime: 0,
  reconnectCount: 0,
  totalMessagesSent: 0,
  totalMessagesReceived: 0,
  messagesPerSecond: 0,
  averageLatency: 0,
  maxLatency: 0,
  minLatency: 0,
  queueLength: 0,
  droppedMessages: 0,
  memoryUsage: 0,
  networkLatency: 0,
  packetLoss: 0,
}

export const usePerformanceMonitor = (boardId: string): UsePerformanceMonitorReturn => {
  const { connectionStatus, performance } = useWebSocket(boardId)
  const [metrics, setMetrics] = useState<PerformanceMetrics>(DEFAULT_METRICS)
  const connectionStartTime = useRef<number>(Date.now())
  const messageHistory = useRef<number[]>([])
  const latencyHistory = useRef<number[]>([])
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Update connection uptime
  useEffect(() => {
    if (connectionStatus === 'connected') {
      connectionStartTime.current = Date.now()
    }
  }, [connectionStatus])

  // Performance monitoring loop
  useEffect(() => {
    const updateMetrics = () => {
      const now = Date.now()
      const uptime = connectionStatus === 'connected'
        ? now - connectionStartTime.current
        : 0

      // Calculate messages per second (last 60 seconds)
      const oneMinuteAgo = now - 60000
      const recentMessages = messageHistory.current.filter(time => time > oneMinuteAgo)
      const messagesPerSecond = recentMessages.length / 60

      // Calculate latency statistics
      const latencies = latencyHistory.current
      const avgLatency = latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0
      const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0
      const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0

      // Memory usage (if available)
      const memoryUsage = typeof performance !== 'undefined' && 'memory' in performance
        ? (performance as any).memory.usedJSHeapSize / (1024 * 1024) // MB
        : 0

      // Network latency estimation (using WebSocket latency as proxy)
      const networkLatency = avgLatency

      // Packet loss estimation (very basic)
      const packetLoss = performance.totalMessagesSent > 0
        ? (performance.totalMessagesSent - performance.totalMessagesReceived) / performance.totalMessagesSent
        : 0

      const newMetrics = {
        connectionStatus,
        connectionUptime: uptime,
        reconnectCount: performance.reconnectCount,
        totalMessagesSent: performance.totalMessagesSent,
        totalMessagesReceived: performance.totalMessagesReceived,
        messagesPerSecond: Math.round(messagesPerSecond * 100) / 100,
        averageLatency: Math.round(avgLatency),
        maxLatency,
        minLatency,
        queueLength: performance.queueLength,
        droppedMessages: 0, // TODO: Implement dropped message tracking
        memoryUsage: Math.round(memoryUsage * 100) / 100,
        networkLatency: Math.round(networkLatency),
        packetLoss: Math.round(packetLoss * 10000) / 100, // Percentage
      }

      setMetrics(newMetrics)

      // Update Prometheus metrics (server-side only)
      if (typeof window === 'undefined' && boardId) {
        // Server-side metrics are handled by the metrics module
        // Client-side metrics are not recorded to avoid import issues
      }

      // Log significant performance issues
      if (newMetrics.averageLatency > 1000) {
        realtimeLogger.performanceMetric('high_latency', newMetrics.averageLatency, boardId, {
          maxLatency: newMetrics.maxLatency,
          messagesPerSecond: newMetrics.messagesPerSecond,
        })
      }

      if (newMetrics.queueLength > 10) {
        realtimeLogger.performanceMetric('high_queue_length', newMetrics.queueLength, boardId)
      }
    }

    // Initial update
    updateMetrics()

    // Set up interval for continuous monitoring
    intervalRef.current = setInterval(updateMetrics, 2000) // Update every 2 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [connectionStatus, performance])

  // Track message timestamps for rate calculation
  useEffect(() => {
    const now = Date.now()
    messageHistory.current.push(now)

    // Keep only last 5 minutes of message history
    const fiveMinutesAgo = now - 300000
    messageHistory.current = messageHistory.current.filter(time => time > fiveMinutesAgo)
  }, [performance.totalMessagesSent])

  // Track latency measurements
  useEffect(() => {
    if (performance.averageLatency > 0) {
      latencyHistory.current.push(performance.averageLatency)

      // Keep only last 100 latency measurements
      if (latencyHistory.current.length > 100) {
        latencyHistory.current.shift()
      }
    }
  }, [performance.averageLatency])

  const resetMetrics = useCallback(() => {
    setMetrics(DEFAULT_METRICS)
    messageHistory.current = []
    latencyHistory.current = []
    connectionStartTime.current = Date.now()
  }, [])

  const exportMetrics = useCallback(() => {
    const exportData = {
      timestamp: new Date().toISOString(),
      boardId,
      metrics,
      rawData: {
        messageHistory: messageHistory.current,
        latencyHistory: latencyHistory.current,
      },
    }
    return JSON.stringify(exportData, null, 2)
  }, [metrics, boardId])

  const getHealthScore = useCallback((): number => {
    let score = 100

    // Connection penalties
    if (connectionStatus !== 'connected') score -= 50
    if (metrics.reconnectCount > 5) score -= 20

    // Latency penalties
    if (metrics.averageLatency > 500) score -= 30
    else if (metrics.averageLatency > 200) score -= 15
    else if (metrics.averageLatency > 100) score -= 5

    // Message rate penalties (too high might indicate spam)
    if (metrics.messagesPerSecond > 10) score -= 10

    // Queue length penalties
    if (metrics.queueLength > 5) score -= 20
    else if (metrics.queueLength > 2) score -= 10

    // Memory usage penalties
    if (metrics.memoryUsage > 50) score -= 15 // 50MB threshold

    const finalScore = Math.max(0, Math.min(100, score))

    // Log health status changes
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (finalScore < 30) status = 'unhealthy'
    else if (finalScore < 70) status = 'degraded'

    if (boardId) {
      realtimeLogger.healthCheck('realtime_features', status, finalScore, {
        boardId,
        connectionStatus,
        averageLatency: metrics.averageLatency,
        queueLength: metrics.queueLength,
      })
    }

    return finalScore
  }, [metrics, connectionStatus, boardId])

  return {
    ...metrics,
    resetMetrics,
    exportMetrics,
    getHealthScore,
  }
}
