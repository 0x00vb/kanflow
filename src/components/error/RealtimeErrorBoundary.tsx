'use client'

import React, { Component, ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  onRetry?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
  retryCount: number
  lastErrorTime: number
  isRetrying: boolean
}

export class RealtimeErrorBoundary extends Component<Props, State> {
  private retryTimeoutId: NodeJS.Timeout | null = null
  private maxRetries = 3
  private retryDelay = 2000 // 2 seconds

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
      lastErrorTime: Date.now(),
      isRetrying: false,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      lastErrorTime: Date.now(),
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error
    console.error('Real-time Error Boundary caught an error:', error, errorInfo)

    // Call the onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // Check if we should auto-retry
    this.handleAutoRetry(error)
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId)
    }
  }

  private handleAutoRetry = (error: Error) => {
    // Only auto-retry for network-related errors
    const isNetworkError = this.isNetworkError(error)
    const timeSinceLastError = Date.now() - this.state.lastErrorTime

    if (isNetworkError && this.state.retryCount < this.maxRetries && timeSinceLastError > 5000) {
      this.setState({ isRetrying: true })

      this.retryTimeoutId = setTimeout(() => {
        this.handleRetry()
      }, this.retryDelay)
    }
  }

  private isNetworkError = (error: Error): boolean => {
    const networkErrorMessages = [
      'WebSocket',
      'network',
      'connection',
      'timeout',
      'fetch',
      'Failed to fetch',
      'NetworkError',
    ]

    const errorMessage = error.message.toLowerCase()
    return networkErrorMessages.some(msg => errorMessage.includes(msg.toLowerCase()))
  }

  private handleRetry = () => {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId)
      this.retryTimeoutId = null
    }

    this.setState(prevState => ({
      hasError: false,
      error: null,
      retryCount: prevState.retryCount + 1,
      isRetrying: false,
    }))

    // Call the onRetry callback if provided
    if (this.props.onRetry) {
      this.props.onRetry()
    }
  }

  private handleManualRetry = () => {
    this.setState(prevState => ({
      retryCount: 0, // Reset retry count for manual retry
    }))
    this.handleRetry()
  }

  private getErrorType = (error: Error): string => {
    if (this.isNetworkError(error)) {
      return 'network'
    }
    if (error.message.includes('conflict') || error.message.includes('optimistic')) {
      return 'conflict'
    }
    if (error.message.includes('rate limit') || error.message.includes('throttle')) {
      return 'rate_limit'
    }
    return 'unknown'
  }

  private renderErrorFallback = () => {
    if (this.props.fallback) {
      return this.props.fallback
    }

    const { error, retryCount, isRetrying } = this.state
    const errorType = error ? this.getErrorType(error) : 'unknown'

    const getErrorMessage = () => {
      switch (errorType) {
        case 'network':
          return 'Real-time connection lost. Some features may not work properly.'
        case 'conflict':
          return 'There was a conflict with recent changes. Please refresh the page.'
        case 'rate_limit':
          return 'Too many requests. Please wait a moment before trying again.'
        default:
          return 'Something went wrong with real-time features.'
      }
    }

    const getErrorIcon = () => {
      switch (errorType) {
        case 'network':
          return (
            <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728m0 0L5.636 18.364m12.728-12.728L5.636 5.636m12.728 12.728L18.364 18.364" />
            </svg>
          )
        case 'conflict':
          return (
            <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          )
        case 'rate_limit':
          return (
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        default:
          return (
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
      }
    }

    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {getErrorIcon()}
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-red-800">
              Real-Time Features Error
            </h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{getErrorMessage()}</p>
              {error && (
                <details className="mt-2">
                  <summary className="cursor-pointer font-medium">Technical Details</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs bg-red-100 p-2 rounded">
                    {error.message}
                    {process.env.NODE_ENV === 'development' && error.stack && (
                      <div className="mt-2 pt-2 border-t border-red-200">
                        {error.stack}
                      </div>
                    )}
                  </pre>
                </details>
              )}
            </div>
            <div className="mt-4 flex space-x-2">
              <Button
                size="sm"
                onClick={this.handleManualRetry}
                disabled={isRetrying}
                isLoading={isRetrying}
              >
                {isRetrying ? 'Retrying...' : 'Try Again'}
              </Button>
              {retryCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </Button>
              )}
            </div>
            {retryCount > 0 && (
              <p className="mt-2 text-xs text-red-600">
                Retry attempts: {retryCount}/{this.maxRetries}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  render() {
    if (this.state.hasError) {
      return this.renderErrorFallback()
    }

    return this.props.children
  }
}

// Hook version for functional components
export const useRealtimeErrorHandler = () => {
  const [error, setError] = React.useState<Error | null>(null)
  const [isRetrying, setIsRetrying] = React.useState(false)

  const handleError = React.useCallback((error: Error) => {
    setError(error)
    console.error('Real-time error:', error)
  }, [])

  const retry = React.useCallback(async () => {
    setIsRetrying(true)
    // Simulate retry delay
    await new Promise(resolve => setTimeout(resolve, 1000))
    setError(null)
    setIsRetrying(false)
  }, [])

  const reset = React.useCallback(() => {
    setError(null)
  }, [])

  return {
    error,
    isRetrying,
    handleError,
    retry,
    reset,
    hasError: error !== null,
  }
}
