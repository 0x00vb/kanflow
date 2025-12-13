'use client'

import React, { useState, useCallback, useRef, useMemo } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { User, MemberRole } from '@/types'
import { useApi } from '@/lib/api/client'

export interface UserSearchProps {
  boardId: string
  onUserSelect: (user: User, role?: MemberRole) => void
  excludeUserIds?: string[]
  disabled?: boolean
  placeholder?: string
}

export const UserSearch: React.FC<UserSearchProps> = ({
  boardId,
  onUserSelect,
  excludeUserIds = [],
  disabled = false,
  placeholder = "Search for users to add...",
}) => {
  const api = useApi()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<MemberRole>('MEMBER')

  const searchTimeoutRef = useRef<NodeJS.Timeout>()
  const abortControllerRef = useRef<AbortController>()

  // Debounced search function
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([])
      return
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController()

    setIsSearching(true)
    setError(null)

    try {
      const result = await api.get(
        `/api/users/search?q=${encodeURIComponent(searchQuery)}&boardId=${boardId}&limit=10`,
        { signal: abortControllerRef.current.signal }
      )

      if (result.success) {
        // Filter out excluded users
        const filteredResults = result.data.filter((user: User) =>
          !excludeUserIds.includes(user.id)
        )
        setResults(filteredResults)
      } else {
        setError(result.error || 'Failed to search users')
        setResults([])
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError('Failed to search users')
        setResults([])
      }
    } finally {
      setIsSearching(false)
    }
  }, [api, boardId, excludeUserIds])

  // Debounced search handler
  const handleSearchChange = useCallback((value: string) => {
    setQuery(value)

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Clear results immediately if query is too short
    if (value.length < 2) {
      setResults([])
      setError(null)
      return
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value)
    }, 300) // 300ms debounce
  }, [performSearch])

  // Handle user selection
  const handleUserSelect = useCallback((user: User) => {
    setIsLoading(true)
    try {
      onUserSelect(user, selectedRole)
      // Clear search after selection
      setQuery('')
      setResults([])
      setError(null)
    } catch (err) {
      setError('Failed to add user')
    } finally {
      setIsLoading(false)
    }
  }, [onUserSelect, selectedRole])

  // Role options
  const roleOptions = useMemo(() => [
    { value: 'MEMBER' as MemberRole, label: 'Member', description: 'Can create and edit tasks' },
    { value: 'ADMIN' as MemberRole, label: 'Admin', description: 'Can manage members and settings' },
    { value: 'VIEWER' as MemberRole, label: 'Viewer', description: 'Read-only access' },
  ], [])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Input
          type="text"
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full"
        />

        {/* Loading indicator */}
        {isSearching && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-blue"></div>
          </div>
        )}
      </div>

      {/* Role Selection */}
      {query.length >= 2 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Role for new member:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {roleOptions.map((role) => (
              <label
                key={role.value}
                className={`relative flex cursor-pointer rounded-lg border p-3 shadow-sm focus:outline-none ${
                  selectedRole === role.value
                    ? 'border-primary-blue bg-blue-50'
                    : 'border-gray-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={role.value}
                  checked={selectedRole === role.value}
                  onChange={(e) => setSelectedRole(e.target.value as MemberRole)}
                  className="sr-only"
                />
                <div className="flex-1">
                  <div className="flex items-center">
                    <div className="text-sm">
                      <p className={`font-medium ${
                        selectedRole === role.value ? 'text-primary-blue' : 'text-gray-900'
                      }`}>
                        {role.label}
                      </p>
                      <p className={`text-xs ${
                        selectedRole === role.value ? 'text-blue-600' : 'text-gray-500'
                      }`}>
                        {role.description}
                      </p>
                    </div>
                  </div>
                </div>
                <div className={`absolute -inset-px rounded-lg border-2 pointer-events-none ${
                  selectedRole === role.value ? 'border-primary-blue' : 'border-transparent'
                }`} aria-hidden="true" />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Search Results */}
      {results.length > 0 && (
        <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
          <div className="p-2">
            <div className="text-xs text-gray-500 mb-2">
              {results.length} user{results.length !== 1 ? 's' : ''} found
            </div>
            <div className="space-y-1">
              {results.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    {/* User Avatar */}
                    <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-medium text-gray-700">
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* User Info */}
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {user.name}
                      </div>
                      <div className="text-xs text-gray-600">
                        {user.email}
                      </div>
                    </div>
                  </div>

                  {/* Add Button */}
                  <Button
                    size="sm"
                    onClick={() => handleUserSelect(user)}
                    disabled={disabled || isLoading}
                    className="text-xs"
                  >
                    {isLoading ? 'Adding...' : 'Add'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* No Results */}
      {query.length >= 2 && !isSearching && results.length === 0 && !error && (
        <div className="text-sm text-gray-500 text-center py-4">
          No users found matching "{query}"
        </div>
      )}

      {/* Search Hint */}
      {query.length < 2 && query.length > 0 && (
        <div className="text-xs text-gray-500 text-center">
          Type at least 2 characters to search
        </div>
      )}
    </div>
  )
}
