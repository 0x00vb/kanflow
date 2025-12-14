'use client'

import React, { useState, useCallback } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BoardMemberWithUser, User, MemberRole } from '@/types'
import { useAuth } from '@/lib/auth/context'
import { useApi } from '@/lib/api/client'
import { UserSearch } from '../UserSearch'
import { MemberRoleSelector } from '../MemberRoleSelector'

export interface MemberManagementModalProps {
  isOpen: boolean
  onClose: () => void
  boardId: string
  members: BoardMemberWithUser[]
  onMembersChange?: (members: BoardMemberWithUser[]) => void
}

export const MemberManagementModal: React.FC<MemberManagementModalProps> = ({
  isOpen,
  onClose,
  boardId,
  members,
  onMembersChange,
}) => {
  const { user: currentUser } = useAuth()
  const api = useApi()

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localMembers, setLocalMembers] = useState<BoardMemberWithUser[]>(members)

  // Update local state when members prop changes
  React.useEffect(() => {
    setLocalMembers(members)
  }, [members])

  // Check if current user can manage members (ADMIN or OWNER)
  const canManageMembers = React.useMemo(() => {
    const currentMember = localMembers.find(m => m.user.id === currentUser?.id)
    return !!currentMember && (currentMember.role === 'OWNER' || currentMember.role === 'ADMIN')
  }, [localMembers, currentUser])

  // Check if current user can change roles (only OWNER)
  const canChangeRoles = React.useMemo(() => {
    const currentMember = localMembers.find(m => m.user.id === currentUser?.id)
    return !!currentMember && currentMember.role === 'OWNER'
  }, [localMembers, currentUser])

  const handleAddMember = useCallback(async (user: User, role: MemberRole = 'MEMBER') => {
    if (!canManageMembers) return

    setIsLoading(true)
    setError(null)

    try {
      const result = await api.post(`/api/boards/${boardId}/members`, {
        userId: user.id,
        role,
      })

      if (result.success) {
        const newMember = {
          ...result.data,
          user,
        } as BoardMemberWithUser

        const updatedMembers = [...localMembers, newMember]
        setLocalMembers(updatedMembers)
        onMembersChange?.(updatedMembers)
      } else {
        setError(result.error || 'Failed to add member')
      }
    } catch (err) {
      setError('Failed to add member')
      console.error('Error adding member:', err)
    } finally {
      setIsLoading(false)
    }
  }, [api, boardId, canManageMembers, localMembers, onMembersChange])

  const handleRemoveMember = useCallback(async (member: BoardMemberWithUser) => {
    if (!canManageMembers) return

    // Prevent removing yourself if you're the last owner
    const ownerCount = localMembers.filter(m => m.role === 'OWNER').length
    if (member.user.id === currentUser?.id && ownerCount <= 1) {
      setError('Cannot remove yourself as the last owner')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await api.delete(`/api/boards/${boardId}/members/${member.user.id}`)

      if (result.success) {
        const updatedMembers = localMembers.filter(m => m.user.id !== member.user.id)
        setLocalMembers(updatedMembers)
        onMembersChange?.(updatedMembers)
      } else {
        setError(result.error || 'Failed to remove member')
      }
    } catch (err) {
      setError('Failed to remove member')
      console.error('Error removing member:', err)
    } finally {
      setIsLoading(false)
    }
  }, [api, boardId, canManageMembers, localMembers, currentUser, onMembersChange])

  const handleRoleChange = useCallback(async (member: BoardMemberWithUser, newRole: MemberRole) => {
    if (!canChangeRoles) return

    setIsLoading(true)
    setError(null)

    try {
      const result = await api.put(`/api/boards/${boardId}/members/${member.user.id}`, {
        role: newRole,
      })

      if (result.success) {
        const updatedMembers = localMembers.map(m =>
          m.user.id === member.user.id
            ? { ...m, role: newRole }
            : m
        )
        setLocalMembers(updatedMembers)
        onMembersChange?.(updatedMembers)
      } else {
        setError(result.error || 'Failed to update role')
      }
    } catch (err) {
      setError('Failed to update role')
      console.error('Error updating role:', err)
    } finally {
      setIsLoading(false)
    }
  }, [api, boardId, canChangeRoles, localMembers, onMembersChange])

  const getRoleBadgeColor = (role: MemberRole) => {
    switch (role) {
      case 'OWNER': return 'bg-purple-100 text-purple-800'
      case 'ADMIN': return 'bg-blue-100 text-blue-800'
      case 'MEMBER': return 'bg-green-100 text-green-800'
      case 'VIEWER': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Board Members"
      size="lg"
    >
      <div className="space-y-6">
        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Add Member Section */}
        {canManageMembers && (
          <div className="border-b border-gray-200 pb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Add Member</h3>
            <UserSearch
              boardId={boardId}
              onUserSelect={handleAddMember}
              excludeUserIds={localMembers.map(m => m.user.id)}
              disabled={isLoading}
            />
          </div>
        )}

        {/* Members List */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Members ({localMembers.length})
          </h3>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {localMembers.map((member) => (
              <div
                key={member.user.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  {/* User Avatar */}
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                    {member.user.avatar ? (
                      <img
                        src={member.user.avatar}
                        alt={member.user.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-medium text-gray-700">
                        {member.user.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* User Info */}
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">
                        {member.user.name}
                        {member.user.id === currentUser?.id && (
                          <span className="text-xs text-gray-500 ml-2">(You)</span>
                        )}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">{member.user.email}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  {/* Role Selector */}
                  {canChangeRoles ? (
                    <MemberRoleSelector
                      value={member.role}
                      onChange={(newRole) => handleRoleChange(member, newRole)}
                      disabled={isLoading || member.user.id === currentUser?.id}
                      canChangeTo={['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']}
                    />
                  ) : (
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(member.role)}`}>
                      {member.role}
                    </span>
                  )}

                  {/* Remove Button */}
                  {canManageMembers && member.user.id !== currentUser?.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveMember(member)}
                      disabled={isLoading}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-6 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
