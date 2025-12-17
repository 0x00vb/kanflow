import { Task, Column } from '@/types'

export interface TaskCardProps {
  task: Task & { assignee?: { id: string; name: string; avatar?: string } }
  onClick: () => void
}

export interface DraggableTaskCardProps {
  task: Task & { assignee?: { id: string; name: string; avatar?: string } }
  onClick: () => void
  isDragging?: boolean
}

export interface ColumnComponentProps {
  column: Column & { tasks: (Task & { assignee?: { id: string; name: string; avatar?: string } })[] }
  onAddTask: () => void
  onTaskClick: (task: Task) => void
  onEditColumn: (column: Column) => void
}

export interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
  columnId: string
  boardMembers: any[]
  onCreateTask: (task: { title: string; description?: string; assigneeId?: string; dueDate?: string; priority: string; labels: string[] }) => void
}

export interface TaskWithComments extends Task {
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

export interface TaskDetailModalProps {
  isOpen: boolean
  onClose: () => void
  task: TaskWithComments | null
  boardId: string
  boardMembers: any[]
  currentUser: any
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onAddComment: (taskId: string, content: string) => void
}

export interface CreateColumnModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateColumn: (column: { title: string }) => void
}

export interface EditColumnModalProps {
  isOpen: boolean
  onClose: () => void
  column: Column | null
  onUpdateColumn: (columnId: string, updates: { title: string }) => void
  onDeleteColumn: (columnId: string) => void
}

export interface BoardViewProps {
  boardId: string
  onBack?: () => void
}
