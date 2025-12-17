'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'

export default function BoardPage() {
  const router = useRouter()
  const params = useParams()
  const { user, isLoading } = useAuth()

  useEffect(() => {
    if (isLoading) return // Wait for auth to load

    if (!user) {
      // Redirect to home if not authenticated
      router.push('/')
      return
    }

    // Redirect to home page with board ID in query params
    // The main page will handle loading the board view
    const boardId = params.id as string
    router.push(`/?boardId=${boardId}`)
  }, [user, isLoading, router, params.id])

  // Show loading spinner while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-blue"></div>
    </div>
  )
}
