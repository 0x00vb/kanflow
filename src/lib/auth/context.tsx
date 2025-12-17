'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { User } from '@/types'

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (user: User, token: string) => void
  logout: () => void
  updateUser: (user: User) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check for stored token on mount and validate it
  useEffect(() => {
    const checkStoredAuth = async () => {
      try {
        const storedToken = localStorage.getItem('kanflow_token')
        const storedUser = localStorage.getItem('kanflow_user')

        if (storedToken && storedUser) {
          // Validate token by making a test request
          try {
            const response = await fetch('/api/health', {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${storedToken}`,
                'X-Requested-With': 'XMLHttpRequest',
              },
              credentials: 'same-origin',
            })

            if (response.ok) {
              const parsedUser = JSON.parse(storedUser)
              setUser(parsedUser)
              setToken(storedToken)
            } else {
              // Token is invalid, clear stored data
              localStorage.removeItem('kanflow_token')
              localStorage.removeItem('kanflow_user')
              console.warn('Stored token is invalid, cleared authentication data')
            }
          } catch (error) {
            // Network error or other issue, clear stored data for security
            localStorage.removeItem('kanflow_token')
            localStorage.removeItem('kanflow_user')
            console.warn('Failed to validate stored token, cleared authentication data')
          }
        }
      } catch (error) {
        console.error('Error loading stored auth:', error)
        // Clear invalid stored data
        localStorage.removeItem('kanflow_token')
        localStorage.removeItem('kanflow_user')
      } finally {
        setIsLoading(false)
      }
    }

    checkStoredAuth()
  }, [])

  const login = (userData: User, authToken: string) => {
    setUser(userData)
    setToken(authToken)
    localStorage.setItem('kanflow_token', authToken)
    localStorage.setItem('kanflow_user', JSON.stringify(userData))
  }

  const logout = () => {
    // Clear all authentication data
    setUser(null)
    setToken(null)
    localStorage.removeItem('kanflow_token')
    localStorage.removeItem('kanflow_user')
    // Clear any cached data that might contain sensitive information
    localStorage.clear()
    // Redirect to login page
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }

  const updateUser = (userData: User) => {
    setUser(userData)
    localStorage.setItem('kanflow_user', JSON.stringify(userData))
  }

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    login,
    logout,
    updateUser,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
