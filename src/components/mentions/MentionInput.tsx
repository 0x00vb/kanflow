'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useApi } from '@/lib/api/client'
import { MentionData } from '@/types'
import { cn } from '@/utils/cn'

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  onMentionsChange?: (mentions: string[]) => void
  placeholder?: string
  boardId: string
  className?: string
  disabled?: boolean
}

interface MentionSuggestion {
  user: {
    id: string
    name: string
    email: string
    avatar?: string
  }
  cursorPosition: number
}

export const MentionInput: React.FC<MentionInputProps> = ({
  value,
  onChange,
  onMentionsChange,
  placeholder = 'Type @ to mention someone...',
  boardId,
  className,
  disabled = false,
}) => {
  const api = useApi()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const lastSearchRef = useRef<string>('')

  const [isMentioning, setIsMentioning] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion['user'][]>([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)

  // Simple in-memory cache for recent searches (per component instance)
  const searchCacheRef = useRef<Map<string, MentionSuggestion['user'][]>>(new Map())

  // Debounced search for board members with optimizations
  const searchUsers = useCallback(async (query: string) => {
    // Minimum 2 characters to reduce API calls
    if (query.length < 2) {
      setMentionSuggestions([])
      return
    }

    // Check local cache first
    const cacheKey = `${boardId}:${query.toLowerCase()}`
    const cachedResults = searchCacheRef.current.get(cacheKey)
    if (cachedResults) {
      setMentionSuggestions(cachedResults)
      setIsLoadingSuggestions(false)
      return
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController()

    setIsLoadingSuggestions(true)
    lastSearchRef.current = query

    try {
      const response = await api.get(
        `/api/boards/${boardId}/members/search?q=${encodeURIComponent(query)}&limit=5`,
        { signal: abortControllerRef.current.signal }
      )

      // Only update if this is still the current search
      if (lastSearchRef.current === query) {
        if (response.success) {
          const results = response.data || []
          setMentionSuggestions(results)

          // Cache the results locally
          searchCacheRef.current.set(cacheKey, results)

          // Limit cache size to prevent memory leaks
          if (searchCacheRef.current.size > 10) {
            const firstKey = searchCacheRef.current.keys().next().value
            if (firstKey) {
              searchCacheRef.current.delete(firstKey)
            }
          }
        } else {
          setMentionSuggestions([])
        }
      }
    } catch (error) {
      // Don't log abort errors as they're expected
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error searching board members:', error)
      }
      setMentionSuggestions([])
    } finally {
      if (lastSearchRef.current === query) {
        setIsLoadingSuggestions(false)
      }
    }
  }, [api, boardId])

  // Clear cache when boardId changes
  useEffect(() => {
    searchCacheRef.current.clear()
    setMentionSuggestions([])
    setMentionQuery('')
    setIsMentioning(false)
  }, [boardId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Debounced mention query handler
  useEffect(() => {
    // Clear previous timeout
    const timeoutId = setTimeout(() => {
      if (mentionQuery && mentionQuery.length >= 2) {
        searchUsers(mentionQuery)
        setSelectedSuggestionIndex(0)
      } else {
        setMentionSuggestions([])
        setIsLoadingSuggestions(false)
      }
    }, 150) // 150ms debounce

    // Cleanup function to clear timeout
    return () => clearTimeout(timeoutId)
  }, [mentionQuery, searchUsers])

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const currentCursorPos = e.target.selectionStart || 0

    onChange(newValue)
    setCursorPosition(currentCursorPos)

    // Check if we're in a mention context
    const textBeforeCursor = newValue.substring(0, currentCursorPos)
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/)

    if (mentionMatch) {
      setIsMentioning(true)
      setMentionQuery(mentionMatch[1])
    } else {
      setIsMentioning(false)
      setMentionQuery('')
      setMentionSuggestions([])
    }
  }

  // Handle keyboard navigation in suggestions
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isMentioning || mentionSuggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev < mentionSuggestions.length - 1 ? prev + 1 : prev
        )
        break

      case 'ArrowUp':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : prev)
        break

      case 'Enter':
        e.preventDefault()
        if (mentionSuggestions[selectedSuggestionIndex]) {
          insertMention(mentionSuggestions[selectedSuggestionIndex])
        }
        break

      case 'Escape':
        e.preventDefault()
        setIsMentioning(false)
        setMentionQuery('')
        setMentionSuggestions([])
        break

      case ' ':
      case 'Tab':
        // Allow these keys to close mention mode
        if (isMentioning) {
          setIsMentioning(false)
          setMentionQuery('')
          setMentionSuggestions([])
        }
        break
    }
  }

  // Insert selected mention into text
  const insertMention = (user: MentionSuggestion['user']) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const textBeforeCursor = value.substring(0, cursorPosition)
    const textAfterCursor = value.substring(cursorPosition)

    // Find the @mention start position
    const mentionStart = textBeforeCursor.lastIndexOf('@')
    if (mentionStart === -1) return

    // Replace the @mention with the selected user
    const newTextBeforeCursor = textBeforeCursor.substring(0, mentionStart) + `@${user.name}`
    const newValue = newTextBeforeCursor + textAfterCursor
    const newCursorPos = newTextBeforeCursor.length

    onChange(newValue)

    // Update mentions for parent component
    if (onMentionsChange) {
      const currentMentions = extractCurrentMentions(newValue)
      onMentionsChange(currentMentions)
    }

    // Reset mention state
    setIsMentioning(false)
    setMentionQuery('')
    setMentionSuggestions([])

    // Update cursor position
    setTimeout(() => {
      textarea.setSelectionRange(newCursorPos, newCursorPos)
      textarea.focus()
    }, 0)
  }

  // Extract current mentions from text
  const extractCurrentMentions = (text: string): string[] => {
    const mentions: string[] = []
    const matches = text.match(/@(\w+)/g)

    if (matches) {
      matches.forEach(match => {
        const username = match.substring(1)
        mentions.push(username)
      })
    }

    return [...new Set(mentions)] // Remove duplicates
  }

  // Handle suggestion click
  const handleSuggestionClick = (user: MentionSuggestion['user']) => {
    insertMention(user)
  }

  return (
    <div className={cn('relative', className)}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue resize-none"
        rows={3}
      />

      {/* Mention Suggestions Dropdown */}
      {isMentioning && (mentionSuggestions.length > 0 || isLoadingSuggestions) && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
          {isLoadingSuggestions ? (
            <div className="px-4 py-3 text-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-blue mx-auto mb-1"></div>
              <p className="text-xs text-gray-600">Searching users...</p>
            </div>
          ) : mentionSuggestions.length > 0 ? (
            <div>
              {mentionSuggestions.map((user, index) => (
                <button
                  key={user.id}
                  onClick={() => handleSuggestionClick(user)}
                  className={cn(
                    'w-full px-4 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none flex items-center space-x-3',
                    index === selectedSuggestionIndex ? 'bg-blue-50' : ''
                  )}
                >
                  <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-medium text-gray-700">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                    <p className="text-xs text-gray-600 truncate">{user.email}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : mentionQuery.length > 0 ? (
            <div className="px-4 py-3 text-center">
              <p className="text-sm text-gray-600">No users found</p>
              <p className="text-xs text-gray-400 mt-1">Try a different name</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
