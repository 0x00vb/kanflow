'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { useApi } from '@/lib/api/client'
import { SearchResult, SearchFilters } from '@/types'
import { cn } from '@/utils/cn'

interface GlobalSearchProps {
  className?: string
}

interface SearchResultItemProps {
  result: SearchResult
  onClick: () => void
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({ result, onClick }) => {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'board':
        return (
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )
      case 'task':
        return (
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'user':
        return (
          <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        )
      default:
        return (
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        )
    }
  }

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'URGENT': return 'bg-red-100 text-red-800'
      case 'HIGH': return 'bg-orange-100 text-orange-800'
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800'
      case 'LOW': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none transition-colors duration-150"
    >
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-0.5">
          {getTypeIcon(result.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <h4
              className="text-sm font-medium text-gray-900 truncate"
              dangerouslySetInnerHTML={{ __html: result.highlightedText || result.title }}
            />
            <span className="inline-block px-1.5 py-0.5 text-xs font-medium text-gray-600 bg-gray-100 rounded capitalize">
              {result.type}
            </span>
          </div>

          {result.description && (
            <p className="text-xs text-gray-600 mt-1 line-clamp-1">
              {result.description}
            </p>
          )}

          <div className="flex items-center space-x-2 mt-2">
            {result.type === 'task' && result.priority && (
              <span className={cn('inline-block px-1.5 py-0.5 text-xs font-medium rounded-full', getPriorityColor(result.priority))}>
                {result.priority}
              </span>
            )}

            {result.type === 'task' && result.dueDate && (
              <span className={cn(
                'text-xs px-2 py-1 rounded',
                new Date(result.dueDate) < new Date()
                  ? 'bg-red-100 text-red-800'
                  : 'bg-gray-100 text-gray-600'
              )}>
                Due: {new Date(result.dueDate).toLocaleDateString()}
              </span>
            )}

            {result.type === 'task' && result.labels && result.labels.length > 0 && (
              <div className="flex space-x-1">
                {result.labels.slice(0, 2).map((label) => (
                  <span key={label} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded truncate max-w-16">
                    {label}
                  </span>
                ))}
                {result.labels.length > 2 && (
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                    +{result.labels.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ className }) => {
  const { user } = useAuth()
  const router = useRouter()
  const api = useApi()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([])
      return
    }

    setIsLoading(true)
    try {
      const response = await api.get(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=8`)
      if (response.success) {
        setResults(response.data.results || [])
        setIsOpen(true)
      }
    } catch (error) {
      console.error('Search error:', error)
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [api])

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) {
        performSearch(query)
      } else {
        setResults([])
        setIsOpen(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, performSearch])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => Math.max(prev - 1, -1))
          break
        case 'Enter':
          e.preventDefault()
          if (selectedIndex >= 0 && results[selectedIndex]) {
            handleResultClick(results[selectedIndex])
          }
          break
        case 'Escape':
          setIsOpen(false)
          setSelectedIndex(-1)
          inputRef.current?.blur()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, results])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSelectedIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleResultClick = (result: SearchResult) => {
    setIsOpen(false)
    setQuery('')
    setSelectedIndex(-1)

    // Navigate based on result type
    switch (result.type) {
      case 'board':
        router.push(`/boards/${result.id}`)
        break
      case 'task':
        // Navigate to board and focus on task
        router.push(`/boards/${result.boardId}?task=${result.id}`)
        break
      case 'user':
        // Could navigate to user profile or search results
        break
    }
  }

  const handleInputFocus = () => {
    if (results.length > 0) {
      setIsOpen(true)
    }
  }

  return (
    <div ref={searchRef} className={cn('relative', className)}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleInputFocus}
          placeholder="Search boards, tasks..."
          className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue transition-colors duration-200"
        />
        <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>

        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute right-3 top-2.5">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-blue"></div>
          </div>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && (results.length > 0 || isLoading) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {isLoading && results.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-blue mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Searching...</p>
            </div>
          ) : results.length > 0 ? (
            <div>
              {results.map((result, index) => (
                <SearchResultItem
                  key={`${result.type}-${result.id}`}
                  result={result}
                  onClick={() => handleResultClick(result)}
                />
              ))}

              {/* Show more results link */}
              {results.length >= 8 && (
                <div className="px-4 py-3 border-t border-gray-100">
                  <button
                    onClick={() => {
                      // Navigate to full search results page
                      router.push(`/search?q=${encodeURIComponent(query)}`)
                      setIsOpen(false)
                      setQuery('')
                    }}
                    className="w-full text-left text-sm text-primary-blue hover:text-blue-700 font-medium"
                  >
                    View all results →
                  </button>
                </div>
              )}
            </div>
          ) : query.length >= 2 && !isLoading ? (
            <div className="px-4 py-8 text-center">
              <svg className="w-8 h-8 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.29-.966-5.5-2.5" />
              </svg>
              <p className="text-sm text-gray-600">No results found</p>
              <p className="text-xs text-gray-400 mt-1">Try different keywords</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}


