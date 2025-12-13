'use client'

import React, { useState } from 'react'
import { MemberRole } from '@/types'

export interface MemberRoleSelectorProps {
  value: MemberRole
  onChange: (role: MemberRole) => void
  disabled?: boolean
  canChangeTo?: MemberRole[]
  className?: string
}

export const MemberRoleSelector: React.FC<MemberRoleSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  canChangeTo = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'],
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false)

  const roleConfig = {
    OWNER: {
      label: 'Owner',
      description: 'Full control over board',
      color: 'bg-purple-100 text-purple-800 border-purple-200',
      hoverColor: 'hover:bg-purple-50',
    },
    ADMIN: {
      label: 'Admin',
      description: 'Can manage members and settings',
      color: 'bg-blue-100 text-blue-800 border-blue-200',
      hoverColor: 'hover:bg-blue-50',
    },
    MEMBER: {
      label: 'Member',
      description: 'Can create and edit tasks',
      color: 'bg-green-100 text-green-800 border-green-200',
      hoverColor: 'hover:bg-green-50',
    },
    VIEWER: {
      label: 'Viewer',
      description: 'Read-only access',
      color: 'bg-gray-100 text-gray-800 border-gray-200',
      hoverColor: 'hover:bg-gray-50',
    },
  }

  const currentRole = roleConfig[value]
  const availableRoles = canChangeTo.filter(role => roleConfig[role])

  const handleRoleSelect = (newRole: MemberRole) => {
    if (disabled || newRole === value) return
    onChange(newRole)
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`}>
      {/* Current Role Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
          currentRole.color
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer ' + currentRole.hoverColor}`}
      >
        <span>{currentRole.label}</span>
        {!disabled && (
          <svg
            className={`ml-1 h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg">
            <div className="py-1">
              {availableRoles.map((role) => {
                const config = roleConfig[role]
                const isSelected = role === value

                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleRoleSelect(role)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className={`text-sm font-medium ${
                          isSelected ? 'text-blue-900' : 'text-gray-900'
                        }`}>
                          {config.label}
                        </div>
                        <div className={`text-xs ${
                          isSelected ? 'text-blue-600' : 'text-gray-500'
                        }`}>
                          {config.description}
                        </div>
                      </div>

                      {isSelected && (
                        <svg
                          className="h-4 w-4 text-blue-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Footer with role permissions info */}
            <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
              <div className="text-xs text-gray-600">
                <div className="font-medium mb-1">Role Permissions:</div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span>View board</span>
                    <span className="text-green-600">✓ All</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Edit tasks</span>
                    <span className={value === 'VIEWER' ? 'text-red-600' : 'text-green-600'}>
                      {value === 'VIEWER' ? '✗' : '✓'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Manage members</span>
                    <span className={value === 'OWNER' || value === 'ADMIN' ? 'text-green-600' : 'text-red-600'}>
                      {value === 'OWNER' || value === 'ADMIN' ? '✓' : '✗'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delete board</span>
                    <span className={value === 'OWNER' ? 'text-green-600' : 'text-red-600'}>
                      {value === 'OWNER' ? '✓' : '✗'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
