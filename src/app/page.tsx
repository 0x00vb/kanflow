'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { LoginForm } from '@/components/forms/LoginForm'
import { RegisterForm } from '@/components/forms/RegisterForm'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DashboardHome } from '@/components/dashboard/DashboardHome'
import { BoardView } from '@/components/board/BoardView'
import { User } from '@/types'

// Landing page component for unauthenticated users
const LandingPage = () => {
  const [showLogin, setShowLogin] = useState(true)

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-blue to-primary-green flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <span className="text-2xl font-bold text-primary-blue">K</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to KanFlow</h1>
          <p className="text-white/80">
            Real-time collaborative task management for modern teams
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {showLogin ? (
            <LoginForm
              isOpen={true}
              onClose={() => {}} // Modal is always open for landing page
              onSwitchToRegister={() => setShowLogin(false)}
            />
          ) : (
            <RegisterForm
              isOpen={true}
              onClose={() => {}} // Modal is always open for landing page
              onSwitchToLogin={() => setShowLogin(true)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// Dashboard page component for authenticated users
const DashboardPage = () => {
  const searchParams = useSearchParams()
  const [currentView, setCurrentView] = useState<'home' | 'board' | 'recent' | 'team'>('home')
  const [currentBoardId, setCurrentBoardId] = useState<string>('')

  // Handle boardId from URL query parameters (for direct links)
  useEffect(() => {
    const boardId = searchParams.get('boardId')
    if (boardId) {
      setCurrentBoardId(boardId)
      setCurrentView('board')
      // Clean up the URL by removing the query parameter
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [searchParams])

  const handleBoardSelect = (boardId: string) => {
    setCurrentBoardId(boardId)
    setCurrentView('board')
  }

  const handleNavigateToHome = () => {
    setCurrentView('home')
    setCurrentBoardId('')
  }

  const handleNavigateToRecent = () => {
    setCurrentView('recent')
    setCurrentBoardId('')
  }

  const handleNavigateToTeam = () => {
    setCurrentView('team')
    setCurrentBoardId('')
  }

  const handleBackToHome = () => {
    setCurrentView('home')
    setCurrentBoardId('')
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case 'home':
        return <DashboardHome onBoardSelect={handleBoardSelect} />
      case 'board':
        return <BoardView boardId={currentBoardId} onBack={handleBackToHome} />
      case 'recent':
        return <DashboardHome onBoardSelect={handleBoardSelect} showRecentOnly />
      case 'team':
        return <div className="p-8 text-center">Team management view coming soon...</div>
      default:
        return <DashboardHome onBoardSelect={handleBoardSelect} />
    }
  }

  return (
    <DashboardLayout
      currentView={currentView}
      onNavigateToHome={handleNavigateToHome}
      onNavigateToRecent={handleNavigateToRecent}
      onNavigateToTeam={handleNavigateToTeam}
      onBoardSelect={handleBoardSelect}
    >
      {renderCurrentView()}
    </DashboardLayout>
  )
}

export default function Home() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-blue"></div>
      </div>
    )
  }

  return user ? <DashboardPage /> : <LandingPage />
}
