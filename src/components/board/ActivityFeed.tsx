'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useApi } from '@/lib/api/client'
import { Activity, ActivityWithRelations, User } from '@/types'
import { cn } from '@/utils/cn'
import { logger } from '@/lib/logger'

interface ActivityFeedProps {
  boardId: string
  className?: string
  maxHeight?: number
  showHeader?: boolean
}

interface ActivityItemProps {
  activity: ActivityWithRelations
  isNew?: boolean
}

// Simple virtual scrolling implementation (can be replaced with react-window later)
const VirtualizedList: React.FC<{
  items: ActivityWithRelations[]
  itemHeight: number
  containerHeight: number
  renderItem: (item: ActivityWithRelations, index: number) => React.ReactNode
  className?: string
}> = ({ items, itemHeight, containerHeight, renderItem, className }) => {
  const [scrollTop, setScrollTop] = useState(0)

  const visibleRange = useMemo(() => {
    const start = Math.floor(scrollTop / itemHeight)
    const end = Math.min(
      start + Math.ceil(containerHeight / itemHeight) + 1, // Add buffer
      items.length
    )
    return { start: Math.max(0, start - 1), end } // Add buffer before
  }, [scrollTop, itemHeight, containerHeight, items.length])

  const visibleItems = items.slice(visibleRange.start, visibleRange.end)
  const totalHeight = items.length * itemHeight
  const offsetY = visibleRange.start * itemHeight

  return (
    <div
      className={cn('overflow-auto', className)}
      style={{ height: containerHeight }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((item, index) => (
            <div key={item.id} style={{ height: itemHeight }}>
              {renderItem(item, visibleRange.start + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const ActivityItem: React.FC<ActivityItemProps> = ({ activity, isNew = false }) => {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'TASK_CREATED':
        return (
          <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
        )
      case 'TASK_UPDATED':
        return (
          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
        )
      case 'TASK_DELETED':
        return (
          <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
        )
      case 'TASK_MOVED':
        return (
          <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
        )
      case 'COMMENT_ADDED':
        return (
          <div className="w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
        )
      case 'COLUMN_CREATED':
      case 'COLUMN_UPDATED':
      case 'COLUMN_DELETED':
        return (
          <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </div>
        )
      default:
        return (
          <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )
    }
  }

  const getActivityDescription = (activity: ActivityWithRelations): string => {
    const userName = activity.user.name
    const taskTitle = activity.task?.title || 'Unknown task'

    switch (activity.type) {
      case 'TASK_CREATED':
        return `${userName} created "${taskTitle}"`
      case 'TASK_UPDATED':
        return `${userName} updated "${taskTitle}"`
      case 'TASK_DELETED':
        return `${userName} deleted "${taskTitle}"`
      case 'TASK_MOVED':
        return `${userName} moved "${taskTitle}"`
      case 'COMMENT_ADDED':
        return `${userName} commented on "${taskTitle}"`
      case 'COLUMN_CREATED':
        return `${userName} created a new column`
      case 'COLUMN_UPDATED':
        return `${userName} updated a column`
      case 'COLUMN_DELETED':
        return `${userName} deleted a column`
      case 'BOARD_CREATED':
        return `${userName} created this board`
      case 'BOARD_UPDATED':
        return `${userName} updated the board`
      default:
        return `${userName} performed an action`
    }
  }

  const formatTimeAgo = (date: Date): string => {
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    return `${Math.floor(diffInSeconds / 86400)}d ago`
  }

  return (
    <div className={cn(
      'flex items-start space-x-3 p-3 rounded-lg transition-colors',
      isNew ? 'bg-blue-50 border-l-4 border-blue-400' : 'hover:bg-gray-50'
    )}>
      {getActivityIcon(activity.type)}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900">
          {getActivityDescription(activity)}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {formatTimeAgo(activity.createdAt)}
        </p>
      </div>
      {isNew && (
        <div className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0 mt-2" />
      )}
    </div>
  )
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  boardId,
  className,
  maxHeight = 400,
  showHeader = true
}) => {
  const [activities, setActivities] = useState<ActivityWithRelations[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const api = useApi()
  const { isConnected } = useWebSocket(boardId)

  // Track new activities for highlighting
  const [newActivityIds, setNewActivityIds] = useState<Set<string>>(new Set())

  // Fetch initial activities
  useEffect(() => {
    const fetchActivities = async () => {
      try {
        setError(null)
        // TODO: Implement activity API endpoint
        // For now, we'll start with empty activities and rely on real-time updates
        setActivities([])
      } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to fetch activities')
        setError('Failed to load activities')
      } finally {
        setIsLoading(false)
      }
    }

    fetchActivities()
  }, [boardId])

  // Real-time activity updates
  useEffect(() => {
    if (!isConnected) return

    // Subscribe to activity events (when implemented)
    // For now, we'll simulate activity creation from task events

    const handleTaskEvent = (eventType: string, taskData: any) => {
      const activityType = eventType.toUpperCase().replace(':', '_')
      const activity: ActivityWithRelations = {
        id: `activity-${Date.now()}-${Math.random()}`,
        boardId,
        userId: 'current-user', // TODO: Get from auth context
        taskId: taskData.id,
        type: activityType as any,
        data: null,
        createdAt: new Date(),
        user: {
          id: 'current-user',
          name: 'Current User',
          email: 'user@example.com',
          password: 'placeholder', // Not used in display
          avatar: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        task: taskData,
        board: {
          id: boardId,
          title: 'Board',
          description: '',
          isPublic: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }

      setActivities(prev => [activity, ...prev.slice(0, 99)]) // Keep last 100 activities
      setNewActivityIds(prev => new Set([activity.id, ...Array.from(prev).slice(0, 9)])) // Highlight for 10 seconds
    }

    // TODO: Subscribe to actual activity events when API is implemented
    // For now, this is a placeholder

    return () => {
      // Cleanup subscriptions
    }
  }, [isConnected, boardId])

  // Clear new activity highlights after 10 seconds
  useEffect(() => {
    if (newActivityIds.size === 0) return

    const timer = setTimeout(() => {
      setNewActivityIds(new Set())
    }, 10000)

    return () => clearTimeout(timer)
  }, [newActivityIds])

  if (error) {
    return (
      <div className={cn('p-4 text-center', className)}>
        <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    )
  }

  return (
    <div className={cn('bg-white border border-gray-200 rounded-lg', className)}>
      {showHeader && (
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900">Activity Feed</h3>
          <p className="text-xs text-gray-500 mt-1">
            Recent changes and updates
            {!isConnected && (
              <span className="ml-2 text-yellow-600">(Offline)</span>
            )}
          </p>
        </div>
      )}

      <div className="p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-blue"></div>
            <span className="ml-2 text-sm text-gray-600">Loading activities...</span>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm text-gray-600">No recent activity</p>
            <p className="text-xs text-gray-400 mt-1">Activity will appear here as team members work on the board</p>
          </div>
        ) : (
          <VirtualizedList
            items={activities}
            itemHeight={70}
            containerHeight={maxHeight - (showHeader ? 60 : 0) - 16}
            renderItem={(activity, index) => (
              <ActivityItem
                key={activity.id}
                activity={activity}
                isNew={newActivityIds.has(activity.id)}
              />
            )}
          />
        )}
      </div>
    </div>
  )
}
