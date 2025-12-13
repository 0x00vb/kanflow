'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { TaskCardProps } from '../types'

export const TaskCard: React.FC<TaskCardProps> = ({ task, onClick }) => (
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
