'use client'

import React, { useState, useEffect } from 'react'
import { useNotificationCount } from '@/hooks/useNotificationCount'
import { useWebSocket } from '@/hooks/useWebSocket'
import { NotificationPanel } from './NotificationPanel'
import { cn } from '@/utils/cn'

interface NotificationBellProps {
  className?: string
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ className }) => {
  const { unreadCount, refresh } = useNotificationCount()
  const [showPanel, setShowPanel] = useState(false)

  // Handle bell click
  const handleBellClick = () => {
    setShowPanel(!showPanel)
  }

  // Handle panel close
  const handlePanelClose = () => {
    setShowPanel(false)
  }

  // Handle notifications read (refresh count)
  const handleNotificationsRead = async () => {
    await refresh()
  }

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={handleBellClick}
        className={cn(
          'relative p-2 rounded-lg transition-colors duration-200',
          'hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-blue focus:ring-offset-2',
          showPanel ? 'bg-gray-100' : ''
        )}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      >
        <svg
          className={cn(
            'w-5 h-5 transition-colors duration-200',
            unreadCount > 0 ? 'text-primary-blue' : 'text-gray-600'
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-5 5v-5zM15 17H9a6 6 0 01-6-6V9a6 6 0 0110.71-4.36L15 9v8z"
          />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}

      </button>

      {/* Notification Panel */}
      {showPanel && (
        <NotificationPanel
          onClose={handlePanelClose}
          onNotificationsRead={handleNotificationsRead}
        />
      )}
    </div>
  )
}
