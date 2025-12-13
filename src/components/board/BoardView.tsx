'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Board, Column, Task } from '@/types'

interface TaskCardProps {
  task: Task & { assignee?: { id: string; name: string; avatar?: string } }
  onClick: () => void
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onClick }) => (
  <Card
    hover
    className="cursor-pointer mb-3 last:mb-0"
    onClick={onClick}
  >
    <CardContent className="p-3">
      <div className="space-y-2">
        <h4 className="font-medium text-gray-900 text-sm">{task.title}</h4>

        {task.description && (
          <p className="text-xs text-gray-600 line-clamp-2">{task.description}</p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {/* Priority indicator */}
            <div className={`priority-indicator priority-${task.priority.toLowerCase()}`}></div>

            {/* Due date */}
            {task.dueDate && (
              <span className={`text-xs px-2 py-1 rounded ${
                new Date(task.dueDate) < new Date()
                  ? 'bg-danger/10 text-danger'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {new Date(task.dueDate).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Assignee avatar */}
          {task.assignee && (
            <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-xs font-medium text-gray-700">
                {task.assignee.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>
    </CardContent>
  </Card>
)

interface ColumnComponentProps {
  column: Column & { tasks: (Task & { assignee?: { id: string; name: string; avatar?: string } })[] }
  onAddTask: () => void
  onTaskClick: (task: Task) => void
}

const ColumnComponent: React.FC<ColumnComponentProps> = ({ column, onAddTask, onTaskClick }) => (
  <div className="bg-gray-100 rounded-lg p-4 min-w-80 max-w-80">
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-semibold text-gray-900">{column.title}</h3>
      <span className="text-sm text-gray-500 bg-gray-200 px-2 py-1 rounded">
        {column.tasks.length}
      </span>
    </div>

    <div className="space-y-3 min-h-32">
      {column.tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onClick={() => onTaskClick(task)}
        />
      ))}
    </div>

    <Button
      variant="ghost"
      className="w-full mt-3 justify-start text-gray-600 hover:text-gray-900"
      onClick={onAddTask}
    >
      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
      Add a task
    </Button>
  </div>
)

interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
  columnId: string
  onCreateTask: (task: { title: string; description?: string }) => void
}

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  onClose,
  columnId,
  onCreateTask
}) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
  })
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await onCreateTask(formData)
      setFormData({ title: '', description: '' })
      onClose()
    } catch (error) {
      console.error('Error creating task:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Task">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Task Title *
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue"
            placeholder="What needs to be done?"
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
            placeholder="Add more details..."
            rows={3}
          />
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Create Task
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface BoardViewProps {
  boardId: string
}

export const BoardView: React.FC<BoardViewProps> = ({ boardId }) => {
  const [board, setBoard] = useState<Board | null>(null)
  const [columns, setColumns] = useState<Column[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false)
  const [selectedColumnId, setSelectedColumnId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchBoardData()
  }, [boardId])

  const fetchBoardData = async () => {
    try {
      const [boardResponse, columnsResponse] = await Promise.all([
        fetch(`/api/boards/${boardId}`),
        fetch(`/api/boards/${boardId}/columns`),
      ])

      if (boardResponse.ok) {
        const boardData = await boardResponse.json()
        setBoard(boardData.data)
        // Extract tasks from board data
        const allTasks: Task[] = []
        boardData.data.columns.forEach((col: any) => {
          allTasks.push(...col.tasks)
        })
        setTasks(allTasks)
      }

      if (columnsResponse.ok) {
        const columnsData = await columnsResponse.json()
        setColumns(columnsData.data || [])
      }
    } catch (error) {
      console.error('Error fetching board data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddTask = (columnId: string) => {
    setSelectedColumnId(columnId)
    setIsCreateTaskModalOpen(true)
  }

  const handleCreateTask = async (taskData: { title: string; description?: string }) => {
    try {
      const response = await fetch(`/api/columns/${selectedColumnId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(taskData),
      })

      if (response.ok) {
        await fetchBoardData() // Refresh board data
      }
    } catch (error) {
      console.error('Error creating task:', error)
    }
  }

  const handleTaskClick = (task: Task) => {
    // TODO: Open task detail modal
    console.log('Task clicked:', task)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-blue"></div>
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
    <div className="space-y-6">
      {/* Board Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{board.title}</h1>
          {board.description && (
            <p className="text-gray-600 mt-1">{board.description}</p>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <Button variant="outline">
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

      {/* Columns */}
      <div className="flex space-x-6 overflow-x-auto pb-6">
        {columnsWithTasks.map((column) => (
          <ColumnComponent
            key={column.id}
            column={column}
            onAddTask={() => handleAddTask(column.id)}
            onTaskClick={handleTaskClick}
          />
        ))}

        {/* Add Column Button */}
        <div className="bg-gray-100 rounded-lg p-4 min-w-80 flex items-center justify-center">
          <Button variant="outline" className="w-full">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Column
          </Button>
        </div>
      </div>

      <CreateTaskModal
        isOpen={isCreateTaskModalOpen}
        onClose={() => setIsCreateTaskModalOpen(false)}
        columnId={selectedColumnId}
        onCreateTask={handleCreateTask}
      />
    </div>
  )
}
