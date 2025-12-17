'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useApi, securityUtils } from '@/lib/api/client'
import { useRealtimeBoard } from '@/hooks/useRealtimeBoard'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Board, Column, Task } from '@/types'
import { BoardViewProps } from './types'
import { ColumnComponent } from './columns/ColumnComponent'
import { CreateTaskModal } from './modals/CreateTaskModal'
import { TaskDetailModal } from './modals/TaskDetailModal'
import { CreateColumnModal } from './modals/CreateColumnModal'
import { EditColumnModal } from './modals/EditColumnModal'
import { MemberManagementModal } from './modals/MemberManagementModal'
import { PresenceIndicators } from './PresenceIndicators'
import { ActivityFeed } from './ActivityFeed'










export const BoardView: React.FC<BoardViewProps> = ({ boardId, onBack }) => {
  const { user } = useAuth()
  const api = useApi()
  const [board, setBoard] = useState<Board | null>(null)
  const [columns, setColumns] = useState<Column[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [boardMembers, setBoardMembers] = useState<any[]>([])
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false)
  const [isTaskDetailModalOpen, setIsTaskDetailModalOpen] = useState(false)
  const [selectedColumnId, setSelectedColumnId] = useState<string>('')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [selectedColumn, setSelectedColumn] = useState<Column | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateColumnModalOpen, setIsCreateColumnModalOpen] = useState(false)
  const [isEditColumnModalOpen, setIsEditColumnModalOpen] = useState(false)
  const [isMemberManagementModalOpen, setIsMemberManagementModalOpen] = useState(false)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Real-time features
  const realtimeBoard = useRealtimeBoard(boardId)
  const unsubscribeTaskEvents = useRef<(() => void) | null>(null)
  const unsubscribeColumnEvents = useRef<(() => void) | null>(null)
  const unsubscribeBoardEvents = useRef<(() => void) | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // Set up real-time subscriptions immediately when realtimeBoard is available
  useEffect(() => {
    // Set up subscriptions as soon as realtimeBoard is available
    // (WebSocket client will handle queuing if not connected yet)
    // Clean up any existing subscriptions first
    if (unsubscribeTaskEvents.current) {
      unsubscribeTaskEvents.current()
    }
    if (unsubscribeColumnEvents.current) {
      unsubscribeColumnEvents.current()
    }
    if (unsubscribeBoardEvents.current) {
      unsubscribeBoardEvents.current()
    }

    // Set up new subscriptions
    unsubscribeTaskEvents.current = realtimeBoard.subscribeToTaskEvents(setTasks, setColumns)
    unsubscribeColumnEvents.current = realtimeBoard.subscribeToColumnEvents(setColumns)
    unsubscribeBoardEvents.current = realtimeBoard.subscribeToBoardEvents(setBoard)

    // Cleanup function
    return () => {
      if (unsubscribeTaskEvents.current) {
        unsubscribeTaskEvents.current()
        unsubscribeTaskEvents.current = null
      }
      if (unsubscribeColumnEvents.current) {
        unsubscribeColumnEvents.current()
        unsubscribeColumnEvents.current = null
      }
      if (unsubscribeBoardEvents.current) {
        unsubscribeBoardEvents.current()
        unsubscribeBoardEvents.current = null
      }
    }
  }, [realtimeBoard]) // Re-run when realtimeBoard changes

  // Separate effect for initial data fetch
  useEffect(() => {
    fetchBoardData()
  }, [boardId])

  const fetchBoardData = async () => {
    try {
      setError(null)

      // Validate boardId
      if (!boardId || typeof boardId !== 'string') {
        setError('Invalid board ID')
        return
      }

      // Single optimized API call - the board endpoint already includes columns, tasks, and members
      const boardResult = await api.get(`/api/boards/${boardId}`)

      if (boardResult.success) {
        const boardData = boardResult.data

        // Set board data
        setBoard(boardData)

        // Extract and set columns (already included in board data)
        setColumns(boardData.columns || [])

        // Extract and set members (already included in board data)
        setBoardMembers(boardData.members || [])

        // Extract all tasks from columns
        const allTasks: Task[] = []
        boardData.columns?.forEach((col: any) => {
          if (col.tasks && Array.isArray(col.tasks)) {
            allTasks.push(...col.tasks)
          }
        })
        setTasks(allTasks)

        // Note: Real-time subscriptions are now set up immediately on mount
        // in a separate useEffect to prevent missing events
      } else {
        setError(boardResult.error || 'Failed to fetch board')
      }
    } catch (error) {
      console.error('BoardView: Error fetching board data:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch board data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddTask = (columnId: string) => {
    setSelectedColumnId(columnId)
    setIsCreateTaskModalOpen(true)
  }

  const handleCreateTask = async (taskData: { title: string; description?: string; assigneeId?: string; dueDate?: string; priority: string; labels: string[] }) => {
    try {
      setError(null)

      // Sanitize input for security
      const sanitizedData: any = {
        title: securityUtils.sanitizeInput(taskData.title.trim()),
        priority: taskData.priority,
        labels: taskData.labels?.map(label => securityUtils.sanitizeInput(label.trim())).filter(label => label) || [],
      }

      // Only include description if it has content
      if (taskData.description?.trim()) {
        sanitizedData.description = securityUtils.sanitizeInput(taskData.description.trim())
      }

      // Include assigneeId only if it's a valid non-empty UUID string
      if (taskData.assigneeId && taskData.assigneeId.trim()) {
        sanitizedData.assigneeId = taskData.assigneeId.trim()
      }

      // Only include dueDate if it's provided
      if (taskData.dueDate) {
        sanitizedData.dueDate = new Date(taskData.dueDate).toISOString()
      }

      // Create task on server first
      const result = await api.post(`/api/columns/${selectedColumnId}/tasks`, sanitizedData)

      if (result.success) {
        // Update UI with server response
        const newTask = result.data
        setTasks(prevTasks => [...prevTasks, newTask])
      } else {
        setError(result.error || 'Failed to create task')
      }

    } catch (error) {
      console.error('Error creating task:', error)
      setError(error instanceof Error ? error.message : 'Failed to create task')
    }
  }

  const handleTaskClick = async (task: Task) => {
    try {
      setError(null)
      const result = await api.get(`/api/tasks/${task.id}`)
      if (result.success) {
        setSelectedTask(result.data)
        setIsTaskDetailModalOpen(true)
      } else {
        setError(result.error || 'Failed to fetch task details')
      }
    } catch (error) {
      console.error('Error fetching task details:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch task details')
    }
  }

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    try {
      setError(null)

      // Sanitize input for security and handle empty values
      const sanitizedUpdates: any = {}

      if (updates.title !== undefined) {
        sanitizedUpdates.title = updates.title ? securityUtils.sanitizeInput(updates.title.trim()) : undefined
      }
      if (updates.description !== undefined) {
        sanitizedUpdates.description = updates.description?.trim() ? securityUtils.sanitizeInput(updates.description.trim()) : undefined
      }
      if (updates.labels) {
        sanitizedUpdates.labels = updates.labels.map(label => securityUtils.sanitizeInput(label.trim())).filter(label => label)
      }

      // Handle assigneeId - convert empty string to undefined
      if (updates.assigneeId !== undefined) {
        sanitizedUpdates.assigneeId = updates.assigneeId && updates.assigneeId.trim() ? updates.assigneeId.trim() : undefined
      }

      if (updates.priority !== undefined) {
        sanitizedUpdates.priority = updates.priority
      }
      if (updates.columnId !== undefined) {
        sanitizedUpdates.columnId = updates.columnId
      }

      // Handle dueDate - convert to ISO string or undefined
      if (updates.dueDate !== undefined) {
        if (updates.dueDate === null) {
          sanitizedUpdates.dueDate = null
        } else if (typeof updates.dueDate === 'string') {
          sanitizedUpdates.dueDate = updates.dueDate ? new Date(updates.dueDate).toISOString() : null
        } else if (updates.dueDate instanceof Date) {
          sanitizedUpdates.dueDate = updates.dueDate.toISOString()
        } else {
          sanitizedUpdates.dueDate = null
        }
      }

      // Update task on server first
      const result = await api.put(`/api/tasks/${taskId}`, sanitizedUpdates)

      if (result.success) {
        // Update UI with server response
        const updatedTask = result.data
        setTasks(prevTasks => prevTasks.map(task =>
          task.id === taskId ? updatedTask : task
        ))
      } else {
        setError(result.error || 'Failed to update task')
      }

    } catch (error) {
      console.error('Error updating task:', error)
      setError(error instanceof Error ? error.message : 'Failed to update task')
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      setError(null)

      // Delete task on server first
      const result = await api.delete(`/api/tasks/${taskId}`)

      if (result.success) {
        // Remove task from UI
        setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId))
      } else {
        setError(result.error || 'Failed to delete task')
      }
    } catch (error) {
      console.error('Error deleting task:', error)
      setError(error instanceof Error ? error.message : 'Failed to delete task')
    }
  }

  const handleAddComment = async (taskId: string, content: string) => {
    try {
      setError(null)

      // Sanitize input for security
      const sanitizedContent = securityUtils.sanitizeInput(content)

      const result = await api.post(`/api/tasks/${taskId}/comments`, { content: sanitizedContent })

      if (result.success) {
        await fetchBoardData() // Refresh board data
      } else {
        setError(result.error || 'Failed to add comment')
      }
    } catch (error) {
      console.error('Error adding comment:', error)
      setError(error instanceof Error ? error.message : 'Failed to add comment')
    }
  }

  const handleCreateColumn = async (columnData: { title: string }) => {
    try {
      setError(null)

      // Sanitize input for security
      const sanitizedData = {
        title: securityUtils.sanitizeInput(columnData.title),
        position: columns.length, // Add at the end
      }

      const result = await api.post(`/api/boards/${boardId}/columns`, sanitizedData)

      if (result.success) {
        await fetchBoardData() // Refresh board data
      } else {
        setError(result.error || 'Failed to create column')
      }
    } catch (error) {
      console.error('Error creating column:', error)
      setError(error instanceof Error ? error.message : 'Failed to create column')
    }
  }

  const handleUpdateColumn = async (columnId: string, updates: { title: string }) => {
    try {
      setError(null)

      // Sanitize input for security
      const sanitizedUpdates = {
        title: securityUtils.sanitizeInput(updates.title),
      }

      const result = await api.put(`/api/boards/${boardId}/columns/${columnId}`, sanitizedUpdates)

      if (result.success) {
        await fetchBoardData() // Refresh board data
      } else {
        setError(result.error || 'Failed to update column')
      }
    } catch (error) {
      console.error('Error updating column:', error)
      setError(error instanceof Error ? error.message : 'Failed to update column')
    }
  }

  const handleDeleteColumn = async (columnId: string) => {
    try {
      setError(null)
      const result = await api.delete(`/api/boards/${boardId}/columns/${columnId}`)

      if (result.success) {
        await fetchBoardData() // Refresh board data
      } else {
        setError(result.error || 'Failed to delete column')
      }
    } catch (error) {
      console.error('Error deleting column:', error)
      setError(error instanceof Error ? error.message : 'Failed to delete column')
    }
  }

  const handleEditColumn = (column: Column) => {
    setSelectedColumn(column)
    setIsEditColumnModalOpen(true)
  }

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const task = tasks.find(t => t.id === active.id)
    setActiveTask(task || null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over) return

    const taskId = active.id as string
    const overId = over.id as string

    // Find the task and its current column
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    // Check if we're dropping on a column (not another task)
    const targetColumn = columns.find(col => col.id === overId)
    if (!targetColumn) return

    // If the task is already in this column, no need to update
    if (task.columnId === targetColumn.id) return

    try {
      // Move task on server first
      const result = await api.put(`/api/tasks/${taskId}`, {
        columnId: targetColumn.id,
      })

      if (result.success) {
        // Update UI with server response
        const updatedTask = result.data
        setTasks(prevTasks => prevTasks.map(t =>
          t.id === taskId ? updatedTask : t
        ))
      } else {
        setError(result.error || 'Failed to move task')
      }
    } catch (error) {
      console.error('Error moving task:', error)
      setError(error instanceof Error ? error.message : 'Failed to move task')
    }
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
        <Button onClick={() => fetchBoardData()}>
          Try Again
        </Button>
      </div>
    )
  }

  if (!board) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Board not found</h2>
        <p className="text-gray-600 mt-2">The board you're looking for doesn't exist or you don't have access to it.</p>
      </div>
    )
  }

  // Combine columns with their tasks
  const columnsWithTasks = columns.map(column => ({
    ...column,
    tasks: tasks.filter(task => task.columnId === column.id)
  }))

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">
        {/* Board Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {onBack && (
              <Button variant="outline" size="sm" onClick={onBack}>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{board.title}</h1>
              {board.description && (
                <p className="text-gray-600 mt-1">{board.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={() => setIsMemberManagementModalOpen(true)}>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Members
            </Button>

            <Button variant="outline">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
              </svg>
              Settings
            </Button>
          </div>
        </div>

        {/* Presence Indicators */}
        <PresenceIndicators boardId={boardId} className="mb-4" />

        {/* Columns */}
        <div className="flex flex-col md:flex-row md:space-x-6 md:overflow-x-auto pb-6 space-y-4 md:space-y-0">
          {columnsWithTasks.map((column) => (
            <div key={column.id} id={column.id} className="w-full md:w-auto md:min-w-80 md:max-w-80">
              <ColumnComponent
                column={column}
                onAddTask={() => handleAddTask(column.id)}
                onTaskClick={handleTaskClick}
                onEditColumn={handleEditColumn}
              />
            </div>
          ))}

          {/* Add Column Button */}
          <div className="bg-gray-100 rounded-lg p-4 w-full md:min-w-80 md:flex md:items-center md:justify-center">
            <Button
              variant="outline"
              className="w-full min-h-11 md:min-h-9" // 44px minimum touch target on mobile
              onClick={() => setIsCreateColumnModalOpen(true)}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Column
            </Button>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="mt-8">
          <ActivityFeed boardId={boardId} columns={columns} maxHeight={300} />
        </div>

        <CreateTaskModal
          isOpen={isCreateTaskModalOpen}
          onClose={() => setIsCreateTaskModalOpen(false)}
          columnId={selectedColumnId}
          boardMembers={boardMembers}
          onCreateTask={handleCreateTask}
        />

        <TaskDetailModal
          isOpen={isTaskDetailModalOpen}
          onClose={() => setIsTaskDetailModalOpen(false)}
          task={selectedTask}
          boardId={boardId}
          boardMembers={boardMembers}
          currentUser={user}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onAddComment={handleAddComment}
        />

        <CreateColumnModal
          isOpen={isCreateColumnModalOpen}
          onClose={() => setIsCreateColumnModalOpen(false)}
          onCreateColumn={handleCreateColumn}
        />

        <EditColumnModal
          isOpen={isEditColumnModalOpen}
          onClose={() => setIsEditColumnModalOpen(false)}
          column={selectedColumn}
          onUpdateColumn={handleUpdateColumn}
          onDeleteColumn={handleDeleteColumn}
        />

        <MemberManagementModal
          isOpen={isMemberManagementModalOpen}
          onClose={() => setIsMemberManagementModalOpen(false)}
          boardId={boardId}
          members={boardMembers}
          onMembersChange={setBoardMembers}
        />
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeTask ? (
          <div className="rotate-3 shadow-2xl">
            <Card className="bg-white border-2 border-primary-blue">
              <CardContent className="p-3">
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-900 text-sm">{activeTask.title}</h4>
                  {activeTask.description && (
                    <p className="text-xs text-gray-600 line-clamp-2">{activeTask.description}</p>
                  )}
                  <div className={`priority-indicator priority-${activeTask.priority.toLowerCase()}`}></div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
