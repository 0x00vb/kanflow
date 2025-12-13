'use client'

import React, { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CreateTaskModalProps } from '../types'

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
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
