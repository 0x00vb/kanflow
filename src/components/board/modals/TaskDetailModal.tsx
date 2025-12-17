'use client'

import React, { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { MentionInput } from '@/components/mentions/MentionInput'
import { MentionDisplay } from '@/components/mentions/MentionDisplay'
import { TaskDetailModalProps } from '../types'

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  isOpen,
  onClose,
  task,
  boardId,
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
                  <MentionInput
                    value={newComment}
                    onChange={setNewComment}
                    boardId={boardId}
                    placeholder="Add a comment... Type @ to mention someone"
                    disabled={isLoading}
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
                        <MentionDisplay
                          text={comment.content}
                          mentionedUsers={boardMembers.map(m => m.user)}
                          className="text-sm"
                        />
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
