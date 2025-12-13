'use client'

import React, { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { EditColumnModalProps } from '../types'

export const EditColumnModal: React.FC<EditColumnModalProps> = ({
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
