'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useApi, securityUtils } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Board, Activity } from '@/types'

interface BoardCardProps {
  board: Board & { _count?: { columns: number; members: number } }
  onClick: () => void
}

const BoardCard: React.FC<BoardCardProps> = ({ board, onClick }) => (
  <Card hover className="cursor-pointer" onClick={onClick}>
    <CardContent className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-gray-900 truncate">{board.title}</h3>
        {board.isPublic && (
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </div>
      {board.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{board.description}</p>
      )}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{board._count?.columns || 0} columns</span>
        <span>{board._count?.members || 0} members</span>
      </div>
    </CardContent>
  </Card>
)

interface CreateBoardModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateBoard: (board: { title: string; description?: string; isPublic: boolean }) => void
}

const CreateBoardModal: React.FC<CreateBoardModalProps> = ({ isOpen, onClose, onCreateBoard }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    isPublic: false,
  })
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await onCreateBoard(formData)
      setFormData({ title: '', description: '', isPublic: false })
      onClose()
    } catch (error) {
      console.error('Error creating board:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Board">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Board Title *
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue"
            placeholder="e.g., Product Roadmap"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue"
            placeholder="Brief description of the board..."
            rows={3}
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="isPublic"
            checked={formData.isPublic}
            onChange={(e) => setFormData(prev => ({ ...prev, isPublic: e.target.checked }))}
            className="rounded border-gray-300 text-primary-blue focus:ring-primary-blue"
          />
          <label htmlFor="isPublic" className="ml-2 text-sm text-gray-700">
            Make this board public
          </label>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Create Board
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface DashboardHomeProps {
  onBoardSelect?: (boardId: string) => void
  showRecentOnly?: boolean
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({ onBoardSelect, showRecentOnly = false }) => {
  const { user } = useAuth()
  const api = useApi()
  const [boards, setBoards] = useState<(Board & { _count?: { columns: number; members: number } })[]>([])
  const [recentActivity, setRecentActivity] = useState<Activity[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchBoards()
  }, [])

  const fetchBoards = async () => {
    try {
      setError(null)
      const result = await api.get('/api/boards')
      if (result.success) {
        setBoards(result.data || [])
      } else {
        setError(result.error || 'Failed to fetch boards')
      }
    } catch (error) {
      console.error('Error fetching boards:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch boards')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateBoard = async (boardData: { title: string; description?: string; isPublic: boolean }) => {
    try {
      setError(null)

      // Sanitize input for security
      const sanitizedData = {
        title: securityUtils.sanitizeInput(boardData.title),
        description: boardData.description ? securityUtils.sanitizeInput(boardData.description) : undefined,
        isPublic: boardData.isPublic,
      }

      const result = await api.post('/api/boards', sanitizedData)

      if (result.success) {
        await fetchBoards() // Refresh the boards list
      } else {
        setError(result.error || 'Failed to create board')
      }
    } catch (error) {
      console.error('Error creating board:', error)
      setError(error instanceof Error ? error.message : 'Failed to create board')
    }
  }

  const handleBoardClick = (boardId: string) => {
    onBoardSelect?.(boardId)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-blue"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Error</h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <Button onClick={() => fetchBoards()}>
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {showRecentOnly ? 'Recent Boards' : `Welcome back, ${user?.name?.split(' ')[0] || 'User'}!`}
          </h1>
          <p className="text-gray-600 mt-1">
            {showRecentOnly ? 'Your recently accessed boards' : "Here's what's happening with your projects today."}
          </p>
        </div>
        {!showRecentOnly && (
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Create Board
          </Button>
        )}
      </div>

      {/* Recent Boards */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Boards</h2>
        {boards.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="space-y-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">No boards yet</h3>
                <p className="text-gray-600 mt-1">Create your first board to get started with KanFlow.</p>
              </div>
              <Button onClick={() => setIsCreateModalOpen(true)}>
                Create Your First Board
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {boards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                onClick={() => handleBoardClick(board.id)}
              />
            ))}
            <Card
              hover
              className="cursor-pointer border-2 border-dashed border-gray-300 hover:border-primary-blue"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <CardContent className="p-8 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <h3 className="font-medium text-gray-900">Create new board</h3>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                {recentActivity.slice(0, 5).map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-600">U</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-600">
                        {/* TODO: Format activity based on type */}
                        Activity description here
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(activity.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <CreateBoardModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateBoard={handleCreateBoard}
      />
    </div>
  )
}
