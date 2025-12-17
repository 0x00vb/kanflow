'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useApi } from '@/lib/api/client'
import { NotificationWithUser } from '@/types'

interface UseNotificationsReturn {
  notifications: NotificationWithUser[]
  unreadCount: number
  isLoading: boolean
  error: string | null
  markAsRead: (notificationIds: string[]) => Promise<void>
  markAllAsRead: () => Promise<void>
  refresh: () => Promise<void>
}

export const useNotifications = (limit: number = 20): UseNotificationsReturn => {
  const { user } = useAuth()
  const api = useApi()

  const [notifications, setNotifications] = useState<NotificationWithUser[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user) return

    try {
      setIsLoading(true)
      setError(null)

      const response = await api.get(`/api/notifications?limit=${limit}`)
      if (response.success) {
        setNotifications(response.data.notifications || [])
      } else {
        setError(response.error || 'Failed to load notifications')
      }
    } catch (err) {
      setError('Failed to load notifications')
      console.error('Error fetching notifications:', err)
    } finally {
      setIsLoading(false)
    }
  }, [user, api, limit])

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!user) return

    try {
      const response = await api.get('/api/notifications/count')
      if (response.success) {
        setUnreadCount(response.data.count)
      }
    } catch (err) {
      console.error('Error fetching unread count:', err)
    }
  }, [user, api])

  // Mark notifications as read
  const markAsRead = useCallback(async (notificationIds: string[]) => {
    try {
      const response = await api.put('/api/notifications', {
        notificationIds,
        read: true,
      })

      if (response.success) {
        // Update local state
        setNotifications(prev =>
          prev.map(notification =>
            notificationIds.includes(notification.id)
              ? { ...notification, read: true }
              : notification
          )
        )

        // Update unread count
        setUnreadCount(prev => Math.max(0, prev - notificationIds.length))
      }
    } catch (err) {
      console.error('Error marking notifications as read:', err)
      throw err
    }
  }, [api])

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    const unreadNotifications = notifications.filter(n => !n.read)
    if (unreadNotifications.length === 0) return

    try {
      const notificationIds = unreadNotifications.map(n => n.id)
      await markAsRead(notificationIds)
    } catch (err) {
      console.error('Error marking all notifications as read:', err)
      throw err
    }
  }, [notifications, markAsRead])

  // Refresh notifications
  const refresh = useCallback(async () => {
    await Promise.all([fetchNotifications(), fetchUnreadCount()])
  }, [fetchNotifications, fetchUnreadCount])

  // Initial load and periodic refresh
  useEffect(() => {
    if (user) {
      fetchNotifications()
      fetchUnreadCount()

      // Refresh unread count every 30 seconds
      const interval = setInterval(fetchUnreadCount, 30000)

      return () => clearInterval(interval)
    }
  }, [user, fetchNotifications, fetchUnreadCount])

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    refresh,
  }
}
