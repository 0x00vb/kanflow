import { WebSocketClient } from '@/lib/websocket/client'
import { logger, realtimeLogger } from '@/lib/logger'
import { metrics } from '@/lib/metrics'

export interface PendingUpdate {
  operationId: string
  optimisticData: any
  rollback: () => void
  timestamp: number
  operation: string
  resourceId: string
  stateUpdate?: () => void // Function to apply optimistic state update
}

export interface ConflictResolutionStrategy {
  resolve: (incomingUpdate: any, pendingUpdate: PendingUpdate) => 'accept' | 'reject' | 'merge'
}

export class ConflictResolver {
  private strategies = new Map<string, ConflictResolutionStrategy>()

  registerStrategy(resourceType: string, strategy: ConflictResolutionStrategy) {
    this.strategies.set(resourceType, strategy)
  }

  resolve(incomingUpdate: any, pendingUpdate: PendingUpdate): 'accept' | 'reject' | 'merge' {
    const strategy = this.strategies.get(pendingUpdate.operation)
    if (strategy) {
      return strategy.resolve(incomingUpdate, pendingUpdate)
    }

    // Default strategy: reject if timestamps are close (within 5 seconds)
    const timeDiff = Math.abs(Date.now() - pendingUpdate.timestamp)
    return timeDiff < 5000 ? 'reject' : 'accept'
  }
}

export class OptimisticUpdateManager {
  private pendingUpdates = new Map<string, PendingUpdate>()
  private conflictResolver = new ConflictResolver()
  private cleanupTimeouts = new Map<string, NodeJS.Timeout>()

  constructor(private wsClient: WebSocketClient) {
    // Set up real-time conflict resolution
    this.setupConflictResolution()

    // Register default conflict resolution strategies
    this.registerDefaultStrategies()
  }

  /**
   * Apply an optimistic update with automatic rollback on failure
   */
  async applyOptimisticUpdate<T>(
    operationId: string,
    optimisticData: T,
    serverOperation: () => Promise<{ success: boolean; data?: T; error?: string }>,
    rollback: () => void,
    resourceId?: string,
    operation?: string,
    stateUpdate?: () => void
  ): Promise<T | null> {
    const update: PendingUpdate = {
      operationId,
      optimisticData,
      rollback,
      timestamp: Date.now(),
      operation: operation || 'update',
      resourceId: resourceId || operationId,
    }

    // Store the pending update
    this.pendingUpdates.set(operationId, update)

    // Apply optimistic state update immediately if provided
    if (stateUpdate) {
      try {
        stateUpdate()
      } catch (error) {
        logger.error({ operationId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to apply optimistic state update')
      }
    }

    // Log optimistic update start
    realtimeLogger.optimisticUpdate(operation || 'update', operationId, 'started', {
      resourceId,
    })

    // Record metric
    metrics.optimisticUpdatesTotal.inc({ operation, status: 'started' })

    // Set up automatic cleanup after 30 seconds (in case of network issues)
    const cleanupTimeout = setTimeout(() => {
      logger.warn({ operationId }, 'Optimistic update cleanup timeout - rolling back')
      this.rollbackUpdate(operationId)
    }, 30000)

    this.cleanupTimeouts.set(operationId, cleanupTimeout)

    try {
      const result = await serverOperation()

      // For delete operations, success is indicated by result.success (no data needed)
      // For other operations, we need both success and data
      const isSuccessful = result.success && (operation === 'delete' ? true : result.data !== undefined)

      if (isSuccessful) {
        // Success - clear pending update
        this.clearPendingUpdate(operationId)

        // Log success and record metrics
        const latency = Date.now() - update.timestamp
        realtimeLogger.optimisticUpdate(operation || 'update', operationId, 'success', {
          latency,
          resourceId,
        })
        metrics.optimisticUpdatesTotal.inc({ operation, status: 'success' })
        metrics.optimisticUpdateLatency.observe({ operation }, latency / 1000)

        // For delete operations, return null, otherwise return the data
        return operation === 'delete' ? null : (result.data || optimisticData)
      } else {
        // Server rejected the update - rollback
        logger.warn({ operationId, error: result.error }, 'Server rejected optimistic update - rolling back')
        this.rollbackUpdate(operationId)
        throw new Error(result.error || 'Server rejected the update')
      }
    } catch (error) {
      // Network or other error - rollback
      logger.error({
        operationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Optimistic update failed - rolling back')
      this.rollbackUpdate(operationId)
      throw error
    }
  }

  /**
   * Handle incoming real-time updates and resolve conflicts
   */
  handleRealtimeUpdate(update: any, updateType: string) {
    // Check for conflicts with pending optimistic updates
    for (const [operationId, pendingUpdate] of this.pendingUpdates) {
      if (this.isConflictingUpdate(update, pendingUpdate, updateType)) {
        const resolution = this.conflictResolver.resolve(update, pendingUpdate)

        switch (resolution) {
          case 'accept':
            // Accept the incoming update, clear our optimistic update
            realtimeLogger.conflictResolution(operationId, 'accept', resolution, {
              incomingType: updateType,
              operation: pendingUpdate.operation,
            })
            metrics.optimisticUpdateConflicts.inc({
              operation: pendingUpdate.operation,
              resolution: 'accept'
            })
            this.clearPendingUpdate(operationId)
            break

          case 'reject':
            // Reject the incoming update (our optimistic update takes precedence)
            realtimeLogger.conflictResolution(operationId, 'reject', resolution, {
              incomingType: updateType,
              operation: pendingUpdate.operation,
            })
            metrics.optimisticUpdateConflicts.inc({
              operation: pendingUpdate.operation,
              resolution: 'reject'
            })
            break

          case 'merge':
            // Attempt to merge the updates
            realtimeLogger.conflictResolution(operationId, 'merge', resolution, {
              incomingType: updateType,
              operation: pendingUpdate.operation,
            })
            metrics.optimisticUpdateConflicts.inc({
              operation: pendingUpdate.operation,
              resolution: 'merge'
            })
            // For now, accept the incoming update and clear optimistic
            this.clearPendingUpdate(operationId)
            break
        }

        break // Only handle one conflict per update
      }
    }
  }

  /**
   * Manually rollback a specific update
   */
  rollbackUpdate(operationId: string): void {
    const update = this.pendingUpdates.get(operationId)
    if (update) {
      try {
        update.rollback()
        logger.debug({ operationId }, 'Optimistic update rolled back successfully')
      } catch (error) {
        logger.error({
          operationId,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Error during optimistic update rollback')
      }
    }
    this.clearPendingUpdate(operationId)
  }

  /**
   * Get all pending updates (for debugging/testing)
   */
  getPendingUpdates(): PendingUpdate[] {
    return Array.from(this.pendingUpdates.values())
  }

  /**
   * Clear all pending updates (use with caution)
   */
  clearAllPendingUpdates(): void {
    for (const [operationId] of this.pendingUpdates) {
      this.clearPendingUpdate(operationId)
    }
    logger.warn({}, 'Cleared all pending optimistic updates')
  }

  // Private methods

  private clearPendingUpdate(operationId: string): void {
    this.pendingUpdates.delete(operationId)

    // Clear cleanup timeout
    const timeout = this.cleanupTimeouts.get(operationId)
    if (timeout) {
      clearTimeout(timeout)
      this.cleanupTimeouts.delete(operationId)
    }
  }

  private isConflictingUpdate(incomingUpdate: any, pendingUpdate: PendingUpdate, updateType: string): boolean {
    // Check if the incoming update affects the same resource as our pending update
    const incomingResourceId = this.extractResourceId(incomingUpdate, updateType)
    return incomingResourceId === pendingUpdate.resourceId
  }

  private extractResourceId(update: any, updateType: string): string {
    // Extract resource ID based on update type
    switch (updateType) {
      case 'task:created':
      case 'task:updated':
      case 'task:deleted':
      case 'task:moved':
        return update.id || update.taskId
      case 'column:created':
      case 'column:updated':
      case 'column:deleted':
        return update.id
      case 'board:updated':
        return update.id
      default:
        return ''
    }
  }

  private setupConflictResolution(): void {
    // Listen for real-time events and handle conflicts
    this.wsClient.on('task:created', (data) => this.handleRealtimeUpdate(data, 'task:created'))
    this.wsClient.on('task:updated', (data) => this.handleRealtimeUpdate(data, 'task:updated'))
    this.wsClient.on('task:deleted', (data) => this.handleRealtimeUpdate(data, 'task:deleted'))
    this.wsClient.on('task:moved', (data) => this.handleRealtimeUpdate(data, 'task:moved'))
    this.wsClient.on('column:created', (data) => this.handleRealtimeUpdate(data, 'column:created'))
    this.wsClient.on('column:updated', (data) => this.handleRealtimeUpdate(data, 'column:updated'))
    this.wsClient.on('column:deleted', (data) => this.handleRealtimeUpdate(data, 'column:deleted'))
    this.wsClient.on('board:updated', (data) => this.handleRealtimeUpdate(data, 'board:updated'))
  }

  private registerDefaultStrategies(): void {
    // Task creation conflict strategy
    this.conflictResolver.registerStrategy('create', {
      resolve: (incomingUpdate, pendingUpdate) => {
        // For creation conflicts, always accept the server's version
        return 'accept'
      }
    })

    // Task update conflict strategy
    this.conflictResolver.registerStrategy('update', {
      resolve: (incomingUpdate, pendingUpdate) => {
        // If the incoming update is very recent, accept it
        const timeDiff = Math.abs(Date.now() - pendingUpdate.timestamp)
        return timeDiff > 2000 ? 'accept' : 'reject'
      }
    })

    // Task movement conflict strategy
    this.conflictResolver.registerStrategy('move', {
      resolve: (incomingUpdate, pendingUpdate) => {
        // For moves, accept the more recent update
        const timeDiff = Math.abs(Date.now() - pendingUpdate.timestamp)
        return timeDiff > 1000 ? 'accept' : 'reject'
      }
    })

    // Deletion conflict strategy
    this.conflictResolver.registerStrategy('delete', {
      resolve: (incomingUpdate, pendingUpdate) => {
        // For deletions, accept the server confirmation
        // The optimistic update should have already removed the item from UI
        return 'accept'
      }
    })
  }
}
