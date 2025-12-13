'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useApi } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Board } from '@/types'

interface DashboardLayoutProps {
  children: React.ReactNode
  currentView?: 'home' | 'board' | 'recent' | 'team'
  onNavigateToHome?: () => void
  onNavigateToRecent?: () => void
  onNavigateToTeam?: () => void
  onBoardSelect?: (boardId: string) => void
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  currentView = 'home',
  onNavigateToHome,
  onNavigateToRecent,
  onNavigateToTeam,
  onBoardSelect
}) => {
  const { user, logout } = useAuth()
  const api = useApi()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [recentBoards, setRecentBoards] = useState<(Board & { _count?: { columns: number; members: number } })[]>([])
  const [isLoadingRecent, setIsLoadingRecent] = useState(false)

  const fetchRecentBoards = async () => {
    if (!user) return

    try {
      setIsLoadingRecent(true)
      const result = await api.get('/api/boards')
      if (result.success) {
        // Take only the first 5 most recent boards
        setRecentBoards(result.data?.slice(0, 5) || [])
      }
    } catch (error) {
      console.error('Error fetching recent boards:', error)
    } finally {
      setIsLoadingRecent(false)
    }
  }

  useEffect(() => {
    fetchRecentBoards()
  }, [user])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-blue rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">K</span>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">KanFlow</h1>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search boards, tasks..."
                className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue"
              />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* User menu */}
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-gray-700">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <span className="text-sm font-medium text-gray-700">{user?.name}</span>
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`bg-white border-r border-gray-200 transition-all duration-300 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}>
          <nav className="p-4 space-y-2">
            {!sidebarCollapsed && (
              <>
                <div className="mb-6">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Workspace</h2>
                </div>

                <button
                  onClick={onNavigateToHome}
                  className={`w-full flex items-center space-x-3 px-3 py-2 text-left rounded-lg transition-colors duration-200 ${
                    currentView === 'home' ? 'bg-primary-blue text-white' : 'hover:bg-gray-100'
                  }`}
                >
                  <svg className={`w-5 h-5 ${currentView === 'home' ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
                  </svg>
                  <span className="text-sm font-medium">Boards</span>
                </button>

                <button
                  onClick={onNavigateToRecent}
                  className={`w-full flex items-center space-x-3 px-3 py-2 text-left rounded-lg transition-colors duration-200 ${
                    currentView === 'recent' ? 'bg-primary-blue text-white' : 'hover:bg-gray-100'
                  }`}
                >
                  <svg className={`w-5 h-5 ${currentView === 'recent' ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium">Recent</span>
                </button>

                <button
                  onClick={onNavigateToTeam}
                  className={`w-full flex items-center space-x-3 px-3 py-2 text-left rounded-lg transition-colors duration-200 ${
                    currentView === 'team' ? 'bg-primary-blue text-white' : 'hover:bg-gray-100'
                  }`}
                >
                  <svg className={`w-5 h-5 ${currentView === 'team' ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="text-sm font-medium">Team</span>
                </button>

                <div className="border-t border-gray-200 my-4"></div>

                <div className="mb-2">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Recent Boards</h2>
                </div>

                <div className="space-y-1">
                  {isLoadingRecent ? (
                    <div className="px-3 py-2 text-sm text-gray-400">
                      Loading...
                    </div>
                  ) : recentBoards.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-400">
                      No recent boards
                    </div>
                  ) : (
                    recentBoards.map((board) => (
                      <div
                        key={board.id}
                        className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg cursor-pointer truncate"
                        onClick={() => onBoardSelect?.(board.id)}
                        title={board.title}
                      >
                        {board.title}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {sidebarCollapsed && (
              <div className="space-y-2">
                <button
                  onClick={onNavigateToHome}
                  className={`w-full p-2 rounded-lg transition-colors duration-200 ${
                    currentView === 'home' ? 'bg-primary-blue' : 'hover:bg-gray-100'
                  }`}
                >
                  <svg className={`w-5 h-5 mx-auto ${currentView === 'home' ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                  </svg>
                </button>
                <button
                  onClick={onNavigateToRecent}
                  className={`w-full p-2 rounded-lg transition-colors duration-200 ${
                    currentView === 'recent' ? 'bg-primary-blue' : 'hover:bg-gray-100'
                  }`}
                >
                  <svg className={`w-5 h-5 mx-auto ${currentView === 'recent' ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                <button
                  onClick={onNavigateToTeam}
                  className={`w-full p-2 rounded-lg transition-colors duration-200 ${
                    currentView === 'team' ? 'bg-primary-blue' : 'hover:bg-gray-100'
                  }`}
                >
                  <svg className={`w-5 h-5 mx-auto ${currentView === 'team' ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </button>
              </div>
            )}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
