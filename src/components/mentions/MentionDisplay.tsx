'use client'

import React, { useMemo } from 'react'
import { User } from '@/types'
import { cn } from '@/utils/cn'

interface MentionDisplayProps {
  text: string
  mentionedUsers?: User[]
  className?: string
}

export const MentionDisplay: React.FC<MentionDisplayProps> = ({
  text,
  mentionedUsers = [],
  className,
}) => {
  // Create a map of user IDs to user data for quick lookup
  const userMap = useMemo(() => {
    const map: Record<string, User> = {}
    mentionedUsers.forEach(user => {
      map[user.id] = user
    })
    return map
  }, [mentionedUsers])

  // Process text to highlight mentions
  const processedContent = useMemo(() => {
    if (!text) return []

    // Split text by @mentions and process each part
    const parts: Array<{ text: string; isMention: boolean; userId?: string }> = []
    let lastIndex = 0

    // Find all @mentions
    const mentionRegex = /@(\w+)/g
    let match

    while ((match = mentionRegex.exec(text)) !== null) {
      // Add text before mention
      if (match.index > lastIndex) {
        parts.push({
          text: text.substring(lastIndex, match.index),
          isMention: false,
        })
      }

      // Find user by name (case-insensitive)
      const mentionName = match[1]
      let mentionedUser: User | undefined

      // Try exact name match first
      mentionedUser = mentionedUsers.find(user =>
        user.name.toLowerCase() === mentionName.toLowerCase()
      )

      // If no exact match, try partial match
      if (!mentionedUser) {
        mentionedUser = mentionedUsers.find(user =>
          user.name.toLowerCase().includes(mentionName.toLowerCase())
        )
      }

      // Add mention
      parts.push({
        text: `@${mentionName}`,
        isMention: true,
        userId: mentionedUser?.id,
      })

      lastIndex = mentionRegex.lastIndex
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({
        text: text.substring(lastIndex),
        isMention: false,
      })
    }

    return parts
  }, [text, mentionedUsers])

  if (!text) {
    return <span className={cn('text-gray-600 italic', className)}>No content</span>
  }

  if (processedContent.length === 0) {
    return <span className={cn('whitespace-pre-wrap', className)}>{text}</span>
  }

  return (
    <div className={cn('whitespace-pre-wrap', className)}>
      {processedContent.map((part, index) => {
        if (part.isMention && part.userId) {
          const user = userMap[part.userId]
          return (
            <span
              key={index}
              className="inline-flex items-center px-1 py-0.5 mx-0.5 bg-blue-100 text-blue-800 rounded text-sm font-medium hover:bg-blue-200 transition-colors duration-150 cursor-pointer"
              title={user ? `Click to view ${user.name}'s profile` : 'User not found'}
              onClick={() => {
                if (user) {
                  // Could navigate to user profile or trigger some action
                  console.log('Mention clicked for user:', user.name)
                }
              }}
            >
              {part.text}
            </span>
          )
        }

        return (
          <span key={index} className="text-gray-700">
            {part.text}
          </span>
        )
      })}
    </div>
  )
}
