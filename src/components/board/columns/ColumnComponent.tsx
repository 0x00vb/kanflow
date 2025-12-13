'use client'

import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Button } from '@/components/ui/Button'
import { DraggableTaskCard } from '../cards/DraggableTaskCard'
import { ColumnComponentProps } from '../types'

export const ColumnComponent: React.FC<ColumnComponentProps> = ({ column, onAddTask, onTaskClick, onEditColumn }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  })

  return (
    <div
      ref={setNodeRef}
      className={`bg-gray-100 rounded-lg p-4 w-full md:min-w-80 md:max-w-80 transition-colors ${
        isOver ? 'bg-blue-50 border-2 border-blue-300' : ''
      }`}
    >
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
        {column.tasks.map((task) => (
          <DraggableTaskCard
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
}
