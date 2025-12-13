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

  // Check for stored token on mount
  useEffect(() => {
    const checkStoredAuth = () => {
      try {
        const storedToken = localStorage.getItem('kanflow_token')
        const storedUser = localStorage.getItem('kanflow_user')

        if (storedToken && storedUser) {
          const parsedUser = JSON.parse(storedUser)
          setUser(parsedUser)
          setToken(storedToken)
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
    setUser(null)
    setToken(null)
    localStorage.removeItem('kanflow_token')
    localStorage.removeItem('kanflow_user')
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
