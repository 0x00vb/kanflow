'use client'

import { useAuth } from '@/lib/auth/context'

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export class ApiClient {
  private baseURL: string
  private rateLimiter: ReturnType<typeof securityUtils.createRateLimiter>

  constructor() {
    this.baseURL = typeof window !== 'undefined' ? '' : process.env.NEXTAUTH_URL || ''
    // Rate limit: 20 requests per minute
    this.rateLimiter = securityUtils.createRateLimiter(20, 60000)
  }

  private getAuthHeaders(): Record<string, string> {
    // Get token from localStorage directly to avoid React context issues in utility functions
    const token = typeof window !== 'undefined' ? localStorage.getItem('kanflow_token') : null

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest', // CSRF protection
      'X-KanFlow-Client': 'web', // Client identification
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    return headers
  }

  // Remove undefined values and empty strings for optional UUID fields to avoid validation errors
  private cleanData(data: any): any {
    if (data === null || data === undefined) {
      return data
    }

    if (Array.isArray(data)) {
      return data.map(item => this.cleanData(item))
    }

    if (typeof data === 'object') {
      const cleaned: any = {}
      for (const key in data) {
        const value = data[key]
        // Skip undefined values (they will be omitted by JSON.stringify anyway)
        // For optional UUID fields like assigneeId, skip empty strings
        if (value !== undefined) {
          // Only skip empty strings for UUID fields (assigneeId)
          if (key === 'assigneeId' && (value === null || value === '')) {
            continue // Skip this field entirely
          }
          cleaned[key] = this.cleanData(value)
        }
      }
      return cleaned
    }

    return data
  }

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    let data: any = null

    try {
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        data = await response.json()
      }
    } catch (error) {
      console.warn('Failed to parse response as JSON:', error)
    }

    if (!response.ok) {
      // Handle authentication errors
      if (response.status === 401) {
        // Clear invalid token
        if (typeof window !== 'undefined') {
          localStorage.removeItem('kanflow_token')
          localStorage.removeItem('kanflow_user')
        }
        throw new Error('Authentication required. Please log in again.')
      }

      if (response.status === 403) {
        throw new Error('Access denied. You do not have permission to perform this action.')
      }

      const errorMessage = data?.message || data?.error || `HTTP ${response.status}: ${response.statusText}`
      throw new Error(errorMessage)
    }

    return data as ApiResponse<T>
  }

  async get<T = any>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    this.rateLimiter() // Check rate limit
    const response = await fetch(`${this.baseURL}${url}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
      credentials: 'same-origin', // CSRF protection
      ...options,
    })
    return this.handleResponse<T>(response)
  }

  async post<T = any>(url: string, data?: any, options: RequestInit = {}): Promise<ApiResponse<T>> {
    this.rateLimiter() // Check rate limit
    
    // Clean data to remove undefined and empty string values
    const cleanedData = data ? this.cleanData(data) : undefined
    
    const response = await fetch(`${this.baseURL}${url}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      credentials: 'same-origin', // CSRF protection
      body: cleanedData ? JSON.stringify(cleanedData) : undefined,
      ...options,
    })
    return this.handleResponse<T>(response)
  }

  async put<T = any>(url: string, data?: any, options: RequestInit = {}): Promise<ApiResponse<T>> {
    this.rateLimiter() // Check rate limit
    
    // Clean data to remove undefined and empty string values for optional UUID fields
    const cleanedData = data ? this.cleanData(data) : undefined
    
    const response = await fetch(`${this.baseURL}${url}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      credentials: 'same-origin', // CSRF protection
      body: cleanedData ? JSON.stringify(cleanedData) : undefined,
      ...options,
    })
    return this.handleResponse<T>(response)
  }

  async delete<T = any>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    this.rateLimiter() // Check rate limit
    const response = await fetch(`${this.baseURL}${url}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
      credentials: 'same-origin', // CSRF protection
      ...options,
    })
    return this.handleResponse<T>(response)
  }
}

// Hook personalizado para usar en componentes
export const useApi = (): ApiClient => {
  return new ApiClient()
}

// Función utilitaria para uso en server components o utilidades
export const createApiClient = (): ApiClient => {
  return new ApiClient()
}

// Security utility functions
export const securityUtils = {
  // Sanitize input to prevent XSS
  sanitizeInput: (input: string): string => {
    return input.replace(/[<>'"&]/g, (char) => {
      const entityMap: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      }
      return entityMap[char] || char
    })
  },

  // Validate required authentication
  requireAuth: (): void => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('kanflow_token') : null
    if (!token) {
      throw new Error('Authentication required')
    }
  },

  // Rate limiting helper (client-side)
  createRateLimiter: (maxRequests: number, windowMs: number) => {
    let requests: number[] = []

    return () => {
      const now = Date.now()
      requests = requests.filter(time => now - time < windowMs)

      if (requests.length >= maxRequests) {
        throw new Error('Rate limit exceeded. Please wait before making another request.')
      }

      requests.push(now)
    }
  }
}
