'use client'

import React from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { cn } from '@/utils/cn'

interface PresenceIndicatorsProps {
  boardId: string
  maxVisible?: number
  className?: string
}

interface UserAvatarProps {
  user: {
    id: string
    name: string
    email: string
    avatar?: string | null
  }
  size?: 'sm' | 'md' | 'lg'
  showStatus?: boolean
  isOnline?: boolean
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  size = 'md',
  showStatus = true,
  isOnline = true
}) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  }

  const statusSizeClasses = {
    sm: 'w-2 h-2 -bottom-0.5 -right-0.5',
    md: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5',
    lg: 'w-3 h-3 -bottom-1 -right-1',
  }

  const getInitials = (name: string): string => {
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return '?' // Default to '?' for unknown user
    }
    return name
      .trim()
      .split(/\s+/)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getAvatarColor = (userId: string): string => {
    // Generate consistent color based on user ID
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-red-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500',
    ]
    const index = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    return colors[index]
  }

  return (
    <div className="relative inline-block">
      {user.avatar ? (
        <img
          src={user.avatar}
          alt={`${user.name} avatar`}
          className={cn(
            'rounded-full border-2 border-white shadow-sm',
            sizeClasses[size]
          )}
          onError={(e) => {
            // Fallback to initials if image fails to load
            const target = e.target as HTMLImageElement
            target.style.display = 'none'
            const parent = target.parentElement
            if (parent) {
              const initialsDiv = document.createElement('div')
              initialsDiv.className = cn(
                'rounded-full border-2 border-white shadow-sm flex items-center justify-center text-white font-medium text-xs',
                sizeClasses[size],
                getAvatarColor(user.id)
              )
              initialsDiv.textContent = getInitials(user.name)
              parent.appendChild(initialsDiv)
            }
          }}
        />
      ) : (
        <div
          className={cn(
            'rounded-full border-2 border-white shadow-sm flex items-center justify-center text-white font-medium',
            sizeClasses[size],
            getAvatarColor(user.id),
            size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base'
          )}
          title={user.name}
        >
          {getInitials(user.name)}
        </div>
      )}

      {/* Online status indicator */}
      {showStatus && (
        <div
          className={cn(
            'absolute rounded-full border border-white',
            statusSizeClasses[size],
            isOnline ? 'bg-green-400' : 'bg-gray-400'
          )}
          title={isOnline ? 'Online' : 'Offline'}
        />
      )}
    </div>
  )
}

const ConnectionStatusIndicator: React.FC<{ status: string }> = ({ status }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'bg-green-400'
      case 'connecting':
      case 'reconnecting':
        return 'bg-yellow-400 animate-pulse'
      case 'error':
        return 'bg-red-400'
      default:
        return 'bg-gray-400'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Real-time connected'
      case 'connecting':
        return 'Connecting...'
      case 'reconnecting':
        return 'Reconnecting...'
      case 'error':
        return 'Connection error'
      case 'disconnected':
        return 'Disconnected'
      default:
        return 'Unknown status'
    }
  }

  return (
    <div className="flex items-center space-x-2 mr-2">
      <div
        className={cn('w-2 h-2 rounded-full', getStatusColor())}
        title={getStatusText()}
      />
      <span className="text-xs text-gray-600 hidden sm:inline">
        {status === 'connected' ? '' : getStatusText()}
      </span>
    </div>
  )
}

export const PresenceIndicators: React.FC<PresenceIndicatorsProps> = ({
  boardId,
  maxVisible = 5,
  className
}) => {
  const { presenceUsers, connectionStatus } = useWebSocket(boardId)

  // Sort users by join time (most recent first)
  const sortedUsers = [...presenceUsers].sort((a, b) => b.joinedAt - a.joinedAt)
  const visibleUsers = sortedUsers.slice(0, maxVisible)
  const overflowCount = Math.max(0, sortedUsers.length - maxVisible)

  // Check if users are actively online (activity within last 5 minutes)
  const isUserActive = (lastActivity: number): boolean => {
    return Date.now() - lastActivity < 5 * 60 * 1000 // 5 minutes
  }

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      {/* Connection status indicator */}
      <ConnectionStatusIndicator status={connectionStatus} />

      {/* User avatars */}
      <div className="flex items-center -space-x-1">
        {visibleUsers
          .filter(user => user && user.id && user.name) // Filter out invalid users
          .map((user) => (
            <div
              key={user.id}
              className="relative"
              title={`${user.name || 'Unknown User'} (${isUserActive(user.lastActivity) ? 'Active' : 'Away'})`}
            >
              <UserAvatar
                user={user}
                size="md"
                isOnline={isUserActive(user.lastActivity)}
              />
            </div>
          ))}

        {/* Overflow indicator */}
        {overflowCount > 0 && (
          <div className="relative">
            <div className={cn(
              'w-8 h-8 rounded-full bg-gray-200 border-2 border-white shadow-sm flex items-center justify-center text-xs font-medium text-gray-600'
            )}>
              +{overflowCount}
            </div>
          </div>
        )}
      </div>

      {/* User count text */}
      {presenceUsers.length > 0 && (
        <span className="text-xs text-gray-600 ml-2">
          {presenceUsers.length} user{presenceUsers.length !== 1 ? 's' : ''} online
        </span>
      )}
    </div>
  )
}
