'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useApi, securityUtils } from '@/lib/api/client'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Board, Column, Task } from '@/types'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface TaskCardProps {
  task: Task & { assignee?: { id: string; name: string; avatar?: string } }
  onClick: () => void
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onClick }) => (
  <Card
    hover
    className="cursor-pointer mb-3 last:mb-0 min-h-11" // Minimum touch target
    onClick={onClick}
  >
    <CardContent className="p-3">
      <div className="space-y-2">
        <h4 className="font-medium text-gray-900 text-sm">{task.title}</h4>

        {task.description && (
          <p className="text-xs text-gray-600 line-clamp-2">{task.description}</p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1 md:space-x-2 flex-wrap">
            {/* Priority indicator */}
            <div className={`priority-indicator priority-${task.priority.toLowerCase()}`}></div>

            {/* Labels */}
            {task.labels && task.labels.length > 0 && (
              <div className="flex space-x-1">
                {task.labels.slice(0, 2).map((label) => (
                  <span
                    key={label}
                    className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 truncate max-w-16"
                    title={label}
                  >
                    {label}
                  </span>
                ))}
                {task.labels.length > 2 && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    +{task.labels.length - 2}
                  </span>
                )}
              </div>
            )}

            {/* Due date */}
            {task.dueDate && (
              <span className={`text-xs px-2 py-1 rounded hidden sm:inline-block ${
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
            <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-medium text-gray-700">
                {task.assignee.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Mobile due date display */}
        {task.dueDate && (
          <div className="sm:hidden">
            <span className={`text-xs px-2 py-1 rounded inline-block ${
              new Date(task.dueDate) < new Date()
                ? 'bg-danger/10 text-danger'
                : 'bg-gray-100 text-gray-600'
            }`}>
              Due: {new Date(task.dueDate).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
)

interface DraggableTaskCardProps {
  task: Task & { assignee?: { id: string; name: string; avatar?: string } }
  onClick: () => void
  isDragging?: boolean
}

const DraggableTaskCard: React.FC<DraggableTaskCardProps> = ({ task, onClick, isDragging }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        hover
        className={`cursor-grab active:cursor-grabbing mb-3 last:mb-0 min-h-11 ${
          isSortableDragging ? 'opacity-50' : ''
        } ${isDragging ? 'rotate-2 shadow-lg' : ''}`}
        onClick={onClick}
      >
        <CardContent className="p-3">
          <div className="space-y-2">
            <h4 className="font-medium text-gray-900 text-sm">{task.title}</h4>

            {task.description && (
              <p className="text-xs text-gray-600 line-clamp-2">{task.description}</p>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1 md:space-x-2 flex-wrap">
                {/* Priority indicator */}
                <div className={`priority-indicator priority-${task.priority.toLowerCase()}`}></div>

                {/* Labels */}
                {task.labels && task.labels.length > 0 && (
                  <div className="flex space-x-1">
                    {task.labels.slice(0, 2).map((label) => (
                      <span
                        key={label}
                        className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 truncate max-w-16"
                        title={label}
                      >
                        {label}
                      </span>
                    ))}
                    {task.labels.length > 2 && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                        +{task.labels.length - 2}
                      </span>
                    )}
                  </div>
                )}

                {/* Due date */}
                {task.dueDate && (
                  <span className={`text-xs px-2 py-1 rounded hidden sm:inline-block ${
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
                <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-medium text-gray-700">
                    {task.assignee.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Mobile due date display */}
            {task.dueDate && (
              <div className="sm:hidden">
                <span className={`text-xs px-2 py-1 rounded inline-block ${
                  new Date(task.dueDate) < new Date()
                    ? 'bg-danger/10 text-danger'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  Due: {new Date(task.dueDate).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface ColumnComponentProps {
  column: Column & { tasks: (Task & { assignee?: { id: string; name: string; avatar?: string } })[] }
  onAddTask: () => void
  onTaskClick: (task: Task) => void
  onEditColumn: (column: Column) => void
}

const ColumnComponent: React.FC<ColumnComponentProps> = ({ column, onAddTask, onTaskClick, onEditColumn }) => (
  <div className="bg-gray-100 rounded-lg p-4 w-full md:min-w-80 md:max-w-80">
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-semibold text-gray-900 text-sm md:text-base">{column.title}</h3>
      <div className="flex items-center space-x-2">
        <span className="text-xs md:text-sm text-gray-500 bg-gray-200 px-2 py-1 rounded">
          {column.tasks.length}
        </span>
        <button
          onClick={() => onEditColumn(column)}
          className="text-gray-400 hover:text-gray-600 p-2 rounded hover:bg-gray-200 min-w-9 min-h-9 flex items-center justify-center" // Touch-friendly
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>
    </div>

    <div className="space-y-3 min-h-32">
      <SortableContext items={column.tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
        {column.tasks.map((task) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task)}
          />
        ))}
      </SortableContext>
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
  boardMembers: any[]
  onCreateTask: (task: { title: string; description?: string; assigneeId?: string; dueDate?: string; priority: string; labels: string[] }) => void
}

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  onClose,
  columnId,
  boardMembers,
  onCreateTask
}) => {
  const [formData, setFormData] = useState<{
    title: string
    description: string
    assigneeId: string
    dueDate: string
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
    labels: string[]
  }>({
    title: '',
    description: '',
    assigneeId: '',
    dueDate: '',
    priority: 'MEDIUM',
    labels: [],
  })
  const [isLoading, setIsLoading] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // CUID validation regex (matches CUID format used in the database)
  const cuidRegex = /^[a-z][a-z0-9]{24}$/i

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    // Title validation (required)
    if (!formData.title.trim()) {
      newErrors.title = 'Task title is required'
    } else if (formData.title.trim().length > 200) {
      newErrors.title = 'Title must be less than 200 characters'
    }

    // Description validation (optional but has max length)
    if (formData.description && formData.description.length > 2000) {
      newErrors.description = 'Description must be less than 2000 characters'
    }

    // Assignee validation (if provided, must be valid CUID)
    if (formData.assigneeId && formData.assigneeId.trim()) {
      const trimmedAssigneeId = formData.assigneeId.trim()

      // Check if it's a valid CUID format
      if (!cuidRegex.test(trimmedAssigneeId)) {
        newErrors.assigneeId = 'Invalid assignee selected'
      }
    }

    // Priority validation
    if (!['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(formData.priority)) {
      newErrors.priority = 'Invalid priority selected'
    }

    // Due date validation (if provided)
    if (formData.dueDate) {
      const dueDate = new Date(formData.dueDate)
      if (isNaN(dueDate.getTime())) {
        newErrors.dueDate = 'Invalid due date'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Client-side validation
    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      // Clean up form data before submitting - convert empty strings to undefined
      const cleanedData = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        assigneeId: formData.assigneeId.trim() || undefined, // Convert empty string to undefined
        dueDate: formData.dueDate || undefined,
        priority: formData.priority,
        labels: formData.labels.filter(label => label.trim()),
      }

      await onCreateTask(cleanedData)
      setFormData({
        title: '',
        description: '',
        assigneeId: '',
        dueDate: '',
        priority: 'MEDIUM',
        labels: [],
      })
      setErrors({})
      onClose()
    } catch (error) {
      console.error('Error creating task:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const addLabel = () => {
    if (newLabel.trim() && !formData.labels.includes(newLabel.trim())) {
      setFormData(prev => ({
        ...prev,
        labels: [...prev.labels, newLabel.trim()]
      }))
      setNewLabel('')
    }
  }

  const removeLabel = (labelToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      labels: prev.labels.filter(label => label !== labelToRemove)
    }))
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Task">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Task Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => {
              setFormData(prev => ({ ...prev, title: e.target.value }))
              if (errors.title) {
                setErrors(prev => ({ ...prev, title: '' }))
              }
            }}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue ${
              errors.title ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="What needs to be done?"
            required
            maxLength={200}
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => {
              setFormData(prev => ({ ...prev, description: e.target.value }))
              if (errors.description) {
                setErrors(prev => ({ ...prev, description: '' }))
              }
            }}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue ${
              errors.description ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Add more details..."
            rows={3}
            maxLength={2000}
          />
          {errors.description && (
            <p className="mt-1 text-sm text-red-600">{errors.description}</p>
          )}
        </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assignee
            </label>
            <select
              value={formData.assigneeId}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, assigneeId: e.target.value }))
                if (errors.assigneeId) {
                  setErrors(prev => ({ ...prev, assigneeId: '' }))
                }
              }}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue ${
                errors.assigneeId ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Unassigned</option>
              {boardMembers.map((member) => (
                <option key={member.user.id} value={member.user.id}>
                  {member.user.name}
                </option>
              ))}
            </select>
            {errors.assigneeId && (
              <p className="mt-1 text-sm text-red-600">{errors.assigneeId}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <select
              value={formData.priority}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, priority: e.target.value as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' }))
                if (errors.priority) {
                  setErrors(prev => ({ ...prev, priority: '' }))
                }
              }}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue ${
                errors.priority ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
            {errors.priority && (
              <p className="mt-1 text-sm text-red-600">{errors.priority}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Due Date
          </label>
          <input
            type="date"
            value={formData.dueDate}
            onChange={(e) => {
              setFormData(prev => ({ ...prev, dueDate: e.target.value }))
              if (errors.dueDate) {
                setErrors(prev => ({ ...prev, dueDate: '' }))
              }
            }}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue ${
              errors.dueDate ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.dueDate && (
            <p className="mt-1 text-sm text-red-600">{errors.dueDate}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Labels
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addLabel())}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue"
              placeholder="Add a label..."
            />
            <Button type="button" onClick={addLabel} variant="outline" size="sm">
              Add
            </Button>
          </div>
          {formData.labels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.labels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700"
                >
                  {label}
                  <button
                    type="button"
                    onClick={() => removeLabel(label)}
                    className="ml-1 text-gray-500 hover:text-gray-700"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
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

interface TaskWithComments extends Task {
  comments?: Array<{
    id: string
    content: string
    createdAt: Date
    user: {
      id: string
      name: string
      email: string
      avatar?: string | null
    }
  }>
}

interface TaskDetailModalProps {
  isOpen: boolean
  onClose: () => void
  task: TaskWithComments | null
  boardMembers: any[]
  currentUser: any
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onAddComment: (taskId: string, content: string) => void
}

interface CreateColumnModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateColumn: (column: { title: string }) => void
}

const CreateColumnModal: React.FC<CreateColumnModalProps> = ({
  isOpen,
  onClose,
  onCreateColumn
}) => {
  const [formData, setFormData] = useState({
    title: '',
  })
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await onCreateColumn(formData)
      setFormData({ title: '' })
      onClose()
    } catch (error) {
      console.error('Error creating column:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Column">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Column Title *
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue"
            placeholder="e.g., In Progress"
            required
          />
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Create Column
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface EditColumnModalProps {
  isOpen: boolean
  onClose: () => void
  column: Column | null
  onUpdateColumn: (columnId: string, updates: { title: string }) => void
  onDeleteColumn: (columnId: string) => void
}

const EditColumnModal: React.FC<EditColumnModalProps> = ({
  isOpen,
  onClose,
  column,
  onUpdateColumn,
  onDeleteColumn,
}) => {
  const [formData, setFormData] = useState({
    title: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (column && isOpen) {
      setFormData({ title: column.title })
    }
  }, [column, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!column) return

    setIsLoading(true)
    try {
      await onUpdateColumn(column.id, formData)
      onClose()
    } catch (error) {
      console.error('Error updating column:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!column) return

    setIsLoading(true)
    try {
      await onDeleteColumn(column.id)
      onClose()
    } catch (error) {
      console.error('Error deleting column:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!column) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Column">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Column Title *
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue"
            placeholder="e.g., In Progress"
            required
          />
        </div>

        <div className="flex justify-between pt-4">
          <Button
            type="button"
            variant="danger"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete Column
          </Button>
          <div className="flex space-x-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isLoading}>
              Update Column
            </Button>
          </div>
        </div>
      </form>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Delete Column</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this column? All tasks in this column will also be deleted. This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                onClick={() => setShowDeleteConfirm(false)}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDelete}
                variant="danger"
                isLoading={isLoading}
              >
                Delete Column
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  isOpen,
  onClose,
  task,
  boardMembers,
  currentUser,
  onUpdateTask,
  onDeleteTask,
  onAddComment,
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<{
    title: string
    description: string
    assigneeId: string
    dueDate: string
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
    labels: string[]
  }>({
    title: '',
    description: '',
    assigneeId: '',
    dueDate: '',
    priority: 'MEDIUM',
    labels: [],
  })
  const [newComment, setNewComment] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (task && isOpen) {
      setEditForm({
        title: task.title,
        description: task.description || '',
        assigneeId: task.assigneeId || '',
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
        priority: task.priority,
        labels: task.labels || [],
      })
    }
  }, [task, isOpen])

  if (!task) return null

  const handleSave = async () => {
    // Client-side validation
    if (!editForm.title.trim()) {
      alert('Task title is required')
      return
    }

    if (editForm.title.trim().length > 200) {
      alert('Task title must be less than 200 characters')
      return
    }

    setIsLoading(true)
    try {
      // Prepare update data, converting empty strings to undefined
      const updateData: any = {
        title: editForm.title.trim(),
        description: editForm.description.trim() || undefined,
        assigneeId: editForm.assigneeId && editForm.assigneeId.trim() ? editForm.assigneeId.trim() : undefined,
        priority: editForm.priority,
        labels: editForm.labels.filter(label => label.trim()),
        dueDate: editForm.dueDate ? new Date(editForm.dueDate).toISOString() : null,
      }

      await onUpdateTask(task.id, updateData)
      setIsEditing(false)
    } catch (error) {
      console.error('Error updating task:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    setIsLoading(true)
    try {
      await onAddComment(task.id, newComment.trim())
      setNewComment('')
    } catch (error) {
      console.error('Error adding comment:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    setIsLoading(true)
    try {
      await onDeleteTask(task.id)
      onClose()
    } catch (error) {
      console.error('Error deleting task:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const addLabel = () => {
    if (newLabel.trim() && !editForm.labels.includes(newLabel.trim())) {
      setEditForm(prev => ({
        ...prev,
        labels: [...prev.labels, newLabel.trim()]
      }))
      setNewLabel('')
    }
  }

  const removeLabel = (labelToRemove: string) => {
    setEditForm(prev => ({
      ...prev,
      labels: prev.labels.filter(label => label !== labelToRemove)
    }))
  }

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date()
  const assignee = boardMembers.find(m => m.user.id === task.assigneeId)?.user

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={task.title} size="xl">
      <div className="space-y-6">
        {/* Task Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between space-y-4 sm:space-y-0">
          <div className="flex-1">
            {isEditing ? (
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                className="w-full text-xl font-semibold border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-blue focus:border-primary-blue"
              />
            ) : (
              <div className="flex items-center space-x-2">
                <div className={`priority-indicator priority-${task.priority.toLowerCase()}`}></div>
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 break-words">{task.title}</h1>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-4 mt-2 text-sm text-gray-500">
              <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
              {task.updatedAt !== task.createdAt && (
                <span className="hidden sm:inline">•</span>
              )}
              {task.updatedAt !== task.createdAt && (
                <span>Updated {new Date(task.updatedAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            {!isEditing ? (
              <>
                <Button onClick={() => setIsEditing(true)} variant="outline" size="sm" className="min-h-9">
                  Edit
                </Button>
                <Button
                  onClick={() => setShowDeleteConfirm(true)}
                  variant="danger"
                  size="sm"
                  className="min-h-9"
                >
                  Delete
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => setIsEditing(false)} variant="secondary" size="sm" className="min-h-9">
                  Cancel
                </Button>
                <Button onClick={handleSave} isLoading={isLoading} size="sm" className="min-h-9">
                  Save
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Task Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              {isEditing ? (
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue"
                  rows={4}
                  placeholder="Add a description..."
                />
              ) : (
                <div className="bg-gray-50 rounded-lg p-3 min-h-[100px]">
                  {task.description ? (
                    <p className="text-gray-700 whitespace-pre-wrap">{task.description}</p>
                  ) : (
                    <p className="text-gray-400 italic">No description provided</p>
                  )}
                </div>
              )}
            </div>

            {isEditing ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assignee
                  </label>
                  <select
                    value={editForm.assigneeId}
                    onChange={(e) => setEditForm(prev => ({ ...prev, assigneeId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue"
                  >
                    <option value="">Unassigned</option>
                    {boardMembers.map((member) => (
                      <option key={member.user.id} value={member.user.id}>
                        {member.user.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={editForm.priority}
                    onChange={(e) => setEditForm(prev => ({ ...prev, priority: e.target.value as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={editForm.dueDate}
                    onChange={(e) => setEditForm(prev => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Labels
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addLabel())}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue"
                      placeholder="Add a label..."
                    />
                    <Button type="button" onClick={addLabel} variant="outline" size="sm">
                      Add
                    </Button>
                  </div>
                  {editForm.labels.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {editForm.labels.map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700"
                        >
                          {label}
                          <button
                            type="button"
                            onClick={() => removeLabel(label)}
                            className="ml-1 text-gray-500 hover:text-gray-700"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assignee
                  </label>
                  <div className="flex items-center space-x-2">
                    {assignee ? (
                      <>
                        <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-700">
                            {assignee.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-gray-700">{assignee.name}</span>
                      </>
                    ) : (
                      <span className="text-gray-400 italic">Unassigned</span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority
                  </label>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                    task.priority === 'LOW' ? 'bg-green-100 text-green-800' :
                    task.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                    task.priority === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {task.priority}
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Due Date
                  </label>
                  {task.dueDate ? (
                    <span className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                      {new Date(task.dueDate).toLocaleDateString()}
                      {isOverdue && ' (Overdue)'}
                    </span>
                  ) : (
                    <span className="text-gray-400 italic">No due date</span>
                  )}
                </div>

                {task.labels && task.labels.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Labels
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {task.labels.map((label) => (
                        <span
                          key={label}
                          className="inline-block px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right Column - Comments */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Comments</h3>

            {/* Add Comment */}
            <div className="mb-4">
              <div className="flex space-x-3">
                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-medium text-gray-700">
                    {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="flex-1">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-blue focus:border-primary-blue resize-none"
                    rows={3}
                    placeholder="Add a comment..."
                  />
                  {newComment.trim() && (
                    <div className="flex justify-end mt-2">
                      <Button onClick={handleAddComment} isLoading={isLoading} size="sm">
                        Comment
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Comments List */}
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {task.comments && task.comments.length > 0 ? (
                task.comments.map((comment) => (
                  <div key={comment.id} className="flex space-x-3">
                    <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-medium text-gray-700">
                        {comment.user.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">
                            {comment.user.name}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(comment.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-400 italic">No comments yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Delete Task</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete this task? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <Button
                  onClick={() => setShowDeleteConfirm(false)}
                  variant="secondary"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDelete}
                  variant="danger"
                  isLoading={isLoading}
                >
                  Delete Task
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

interface BoardViewProps {
  boardId: string
}

export const BoardView: React.FC<BoardViewProps> = ({ boardId }) => {
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
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

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
      // The API client will automatically remove empty assigneeId values
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
      // Empty strings will be removed by the API client's cleanData function
      if (taskData.assigneeId && taskData.assigneeId.trim()) {
        sanitizedData.assigneeId = taskData.assigneeId.trim()
      }

      // Only include dueDate if it's provided
      if (taskData.dueDate) {
        sanitizedData.dueDate = new Date(taskData.dueDate).toISOString()
      }

      const result = await api.post(`/api/columns/${selectedColumnId}/tasks`, sanitizedData)

      if (result.success) {
        await fetchBoardData() // Refresh board data
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
      // Note: API expects string format for dueDate, not Date object
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

      const result = await api.put(`/api/tasks/${taskId}`, sanitizedUpdates)

      if (result.success) {
        await fetchBoardData() // Refresh board data
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
      const result = await api.delete(`/api/tasks/${taskId}`)

      if (result.success) {
        await fetchBoardData() // Refresh board data
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
      // Optimistically update the UI
      setTasks(prevTasks =>
        prevTasks.map(t =>
          t.id === taskId ? { ...t, columnId: targetColumn.id } : t
        )
      )

      const result = await api.put(`/api/tasks/${taskId}`, {
        columnId: targetColumn.id,
      })

      if (!result.success) {
        // Revert on failure
        await fetchBoardData()
        console.error('Failed to move task:', result.error)
      } else {
        // Refresh to get updated data
        await fetchBoardData()
      }
    } catch (error) {
      // Revert on error
      await fetchBoardData()
      console.error('Error moving task:', error)
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
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
