'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useApi } from '@/lib/api/client'

interface UseNotificationCountReturn {
  unreadCount: number
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Hook for fetching only the notification count
 * Optimized for components that only need the count (like NotificationBell)
 * Avoids unnecessary notification list fetching
 */
export const useNotificationCount = (): UseNotificationCountReturn => {
  const { user } = useAuth()
  const api = useApi()

  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch unread notification count
  const fetchUnreadCount = useCallback(async () => {
    if (!user) return

    try {
      setIsLoading(true)
      setError(null)

      const response = await api.get('/api/notifications/count')
      if (response.success) {
        setUnreadCount(response.data.count)
      } else {
        setError(response.error || 'Failed to load notification count')
      }
    } catch (err) {
      setError('Failed to load notification count')
      console.error('Error fetching unread count:', err)
    } finally {
      setIsLoading(false)
    }
  }, [user, api])

  // Refresh count
  const refresh = useCallback(async () => {
    await fetchUnreadCount()
  }, [fetchUnreadCount])

  // Initial load and periodic refresh
  useEffect(() => {
    if (user) {
      fetchUnreadCount()

      // Refresh count every 30 seconds for real-time updates
      const interval = setInterval(fetchUnreadCount, 30000)

      return () => clearInterval(interval)
    }
  }, [user, fetchUnreadCount])

  return {
    unreadCount,
    isLoading,
    error,
    refresh,
  }
}

