'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useWebSocket } from './useWebSocket'
import { Task, Column, Board, User } from '@/types'
import { logger } from '@/lib/logger'

interface RealtimeBoardState {
  tasks: Task[]
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
  columns: Column[]
  setColumns: React.Dispatch<React.SetStateAction<Column[]>>
  board: Board | null
  setBoard: React.Dispatch<React.SetStateAction<Board | null>>
}

export interface UseRealtimeBoardReturn {
  isRealtimeEnabled: boolean
  lastUpdateTimestamp: number
  conflictCount: number
  subscribeToTaskEvents: (
    setTasks: React.Dispatch<React.SetStateAction<Task[]>>,
    setColumns?: React.Dispatch<React.SetStateAction<Column[]>>
  ) => () => void
  subscribeToColumnEvents: (
    setColumns: React.Dispatch<React.SetStateAction<Column[]>>
  ) => () => void
  subscribeToBoardEvents: (
    setBoard: React.Dispatch<React.SetStateAction<Board | null>>
  ) => () => void
}

export const useRealtimeBoard = (boardId: string): UseRealtimeBoardReturn => {
  const { subscribe, isConnected, connectionStatus } = useWebSocket(boardId)
  const lastUpdateTimestampRef = useRef<number>(0)
  const conflictCountRef = useRef<number>(0)
  const pendingUpdatesRef = useRef<Map<string, { timestamp: number; operation: string }>>(new Map())

  // Track optimistic updates to avoid conflicts
  const trackOptimisticUpdate = useCallback((operationId: string, operation: string) => {
    pendingUpdatesRef.current.set(operationId, {
      timestamp: Date.now(),
      operation
    })
  }, [])

  const clearOptimisticUpdate = useCallback((operationId: string) => {
    pendingUpdatesRef.current.delete(operationId)
  }, [])

  // Check if an incoming update conflicts with pending optimistic updates
  const hasConflictingUpdate = useCallback((resourceId: string, operation: string): boolean => {
    for (const [operationId, update] of pendingUpdatesRef.current) {
      if (operationId.includes(resourceId) && update.operation === operation) {
        // Same operation on same resource - likely our optimistic update
        if (Date.now() - update.timestamp < 5000) { // Within 5 seconds
          return false // Not a conflict, it's our update
        }
      }
    }
    return false
  }, [])

  // Subscribe to task-related real-time events
  const subscribeToTaskEvents = useCallback((
    setTasks: React.Dispatch<React.SetStateAction<Task[]>>,
    setColumns?: React.Dispatch<React.SetStateAction<Column[]>>
  ): (() => void) => {
    // Always set up subscriptions - WebSocket client will handle queuing if not connected
    // if (!isConnected) {
    //   return () => {} // Return no-op if not connected
    // }

    const unsubscribers = [
      // Task created event
      subscribe('task:created', (data) => {
        const task = data as Task
        logger.debug({ taskId: task.id, boardId }, 'Received task:created event')

        setTasks(prevTasks => {
          // Check for conflicts
          if (hasConflictingUpdate(task.id, 'create')) {
            conflictCountRef.current++
            logger.warn({ taskId: task.id }, 'Conflict detected for task creation')
            return prevTasks // Don't apply conflicting update
          }

          // Check if task already exists (avoid duplicates)
          const existingIndex = prevTasks.findIndex(t => t.id === task.id)
          if (existingIndex >= 0) {
            // Update existing task
            const updated = [...prevTasks]
            updated[existingIndex] = task
            return updated
          } else {
            // Check if there's an optimistic task that should be replaced
            // Look for tasks with similar properties that might be optimistic versions
            const optimisticIndex = prevTasks.findIndex(t =>
              t.title === task.title &&
              t.columnId === task.columnId &&
              t.id.startsWith('temp-task-') // Our optimistic task IDs start with this
            )

            if (optimisticIndex >= 0) {
              // Replace the optimistic task with the real one
              const updated = [...prevTasks]
              updated[optimisticIndex] = task
              return updated
            } else {
              // Add new task
              return [...prevTasks, task]
            }
          }
        })

        lastUpdateTimestampRef.current = Date.now()
      }),

      // Task updated event
      subscribe('task:updated', (data) => {
        const updatedTask = data as Task
        logger.debug({ taskId: updatedTask.id, boardId }, 'Received task:updated event')

        setTasks(prevTasks => {
          // Check for conflicts
          if (hasConflictingUpdate(updatedTask.id, 'update')) {
            conflictCountRef.current++
            logger.warn({ taskId: updatedTask.id }, 'Conflict detected for task update')
            return prevTasks // Don't apply conflicting update
          }

          return prevTasks.map(task =>
            task.id === updatedTask.id ? { ...task, ...updatedTask } : task
          )
        })

        lastUpdateTimestampRef.current = Date.now()
      }),

      // Task deleted event
      subscribe('task:deleted', (data) => {
        const { taskId } = data as { taskId: string }
        logger.debug({ taskId, boardId }, 'Received task:deleted event')

        setTasks(prevTasks => {
          // Check for conflicts
          if (hasConflictingUpdate(taskId, 'delete')) {
            conflictCountRef.current++
            logger.warn({ taskId }, 'Conflict detected for task deletion')
            return prevTasks // Don't apply conflicting update
          }

          return prevTasks.filter(task => task.id !== taskId)
        })

        lastUpdateTimestampRef.current = Date.now()
      }),

      // Task moved event (cross-column movement)
      subscribe('task:moved', (data) => {
        const { id, columnId, position } = data as { id: string; columnId: string; position: number }
        console.log('🎯 Real-time task:moved event received:', { id, columnId, position })
        logger.debug({ taskId: id, newColumnId: columnId, boardId }, 'Received task:moved event')

        setTasks(prevTasks => {
          // Check for conflicts
          if (hasConflictingUpdate(id, 'move')) {
            conflictCountRef.current++
            console.log('⚠️ Conflict detected for task movement, skipping update')
            logger.warn({ taskId: id }, 'Conflict detected for task movement')
            return prevTasks // Don't apply conflicting update
          }

          console.log('✅ Applying real-time task move update')
          return prevTasks.map(task =>
            task.id === id ? { ...task, columnId } : task
          )
        })

        lastUpdateTimestampRef.current = Date.now()
      }),
    ]

    // Return cleanup function
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe())
    }
  }, [subscribe, boardId, hasConflictingUpdate])

  // Subscribe to column-related real-time events
  const subscribeToColumnEvents = useCallback((
    setColumns: React.Dispatch<React.SetStateAction<Column[]>>
  ): (() => void) => {
    // Always set up subscriptions - WebSocket client will handle queuing if not connected
    // if (!isConnected) {
    //   return () => {} // Return no-op if not connected
    // }

    const unsubscribers = [
      // Column created event
      subscribe('column:created', (data) => {
        const column = data as Column
        logger.debug({ columnId: column.id, boardId }, 'Received column:created event')

        setColumns(prevColumns => {
          // Check for conflicts
          if (hasConflictingUpdate(column.id, 'create')) {
            conflictCountRef.current++
            logger.warn({ columnId: column.id }, 'Conflict detected for column creation')
            return prevColumns
          }

          // Check if column already exists
          const existingIndex = prevColumns.findIndex(c => c.id === column.id)
          if (existingIndex >= 0) {
            const updated = [...prevColumns]
            updated[existingIndex] = column
            return updated
          } else {
            return [...prevColumns, column]
          }
        })

        lastUpdateTimestampRef.current = Date.now()
      }),

      // Column updated event
      subscribe('column:updated', (data) => {
        const column = data as Column
        logger.debug({ columnId: column.id, boardId }, 'Received column:updated event')

        setColumns(prevColumns => {
          // Check for conflicts
          if (hasConflictingUpdate(column.id, 'update')) {
            conflictCountRef.current++
            logger.warn({ columnId: column.id }, 'Conflict detected for column update')
            return prevColumns
          }

          return prevColumns.map(col =>
            col.id === column.id ? { ...col, ...column } : col
          )
        })

        lastUpdateTimestampRef.current = Date.now()
      }),

      // Column deleted event
      subscribe('column:deleted', (data) => {
        const { id } = data as { id: string }
        logger.debug({ columnId: id, boardId }, 'Received column:deleted event')

        setColumns(prevColumns => {
          // Check for conflicts
          if (hasConflictingUpdate(id, 'delete')) {
            conflictCountRef.current++
            logger.warn({ columnId: id }, 'Conflict detected for column deletion')
            return prevColumns
          }

          return prevColumns.filter(col => col.id !== id)
        })

        lastUpdateTimestampRef.current = Date.now()
      }),
    ]

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe())
    }
  }, [subscribe, boardId, hasConflictingUpdate])

  // Subscribe to board-related real-time events
  const subscribeToBoardEvents = useCallback((
    setBoard: React.Dispatch<React.SetStateAction<Board | null>>
  ): (() => void) => {
    // Always set up subscriptions - WebSocket client will handle queuing if not connected
    // if (!isConnected) {
    //   return () => {} // Return no-op if not connected
    // }

    const unsubscribers = [
      // Board updated event
      subscribe('board:updated', (data) => {
        const updatedBoard = data as Board
        logger.debug({ boardId: updatedBoard.id }, 'Received board:updated event')

        setBoard(prevBoard => {
          if (!prevBoard) return updatedBoard

          // Check for conflicts
          if (hasConflictingUpdate(updatedBoard.id, 'update')) {
            conflictCountRef.current++
            logger.warn({ boardId: updatedBoard.id }, 'Conflict detected for board update')
            return prevBoard
          }

          return { ...prevBoard, ...updatedBoard }
        })

        lastUpdateTimestampRef.current = Date.now()
      }),
    ]

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe())
    }
  }, [subscribe, boardId, hasConflictingUpdate])

  // Clean up pending updates on disconnect
  useEffect(() => {
    if (connectionStatus === 'disconnected' || connectionStatus === 'error') {
      pendingUpdatesRef.current.clear()
    }
  }, [connectionStatus])

  return {
    isRealtimeEnabled: isConnected,
    lastUpdateTimestamp: lastUpdateTimestampRef.current,
    conflictCount: conflictCountRef.current,
    subscribeToTaskEvents,
    subscribeToColumnEvents,
    subscribeToBoardEvents,
  }
}
