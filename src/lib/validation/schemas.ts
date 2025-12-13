import { z } from 'zod'

// User schemas
export const userSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  avatar: z.string().url('Invalid avatar URL').optional(),
})

export const createUserSchema = userSchema.extend({
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
})

// Board schemas
export const boardSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  isPublic: z.boolean().default(false),
})

export const updateBoardSchema = boardSchema.partial()

// Column schemas
export const columnSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
  position: z.number().int().min(0),
})

// Custom CUID validation
const cuidSchema = z.string().regex(/^[a-z][a-z0-9]{24}$/i, 'Invalid ID format')

// Task schemas
export const taskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(2000, 'Description too long').optional(),
  assigneeId: cuidSchema.optional(),
  dueDate: z.string().datetime('Invalid due date').optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  labels: z.array(z.string()).default([]),
})

// Create a separate schema for updates that includes columnId
export const updateTaskSchema = taskSchema.partial().extend({
  columnId: cuidSchema.optional(),
})

// Update idParamSchema to use CUID
export const idParamSchema = z.object({
  id: cuidSchema,
})

// Comment schemas
export const commentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(1000, 'Comment too long'),
})

// Activity schemas
export const activityFilterSchema = z.object({
  type: z.enum([
    'BOARD_CREATED', 'BOARD_UPDATED', 'COLUMN_CREATED', 'COLUMN_UPDATED',
    'COLUMN_DELETED', 'TASK_CREATED', 'TASK_UPDATED', 'TASK_DELETED',
    'TASK_MOVED', 'COMMENT_ADDED', 'MEMBER_ADDED', 'MEMBER_REMOVED'
  ]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
})

// WebSocket event schemas
export const wsMessageSchema = z.object({
  type: z.string(),
  data: z.any(),
  timestamp: z.number().optional(),
})

// Query parameter schemas
export const paginationSchema = z.object({
  page: z.string().transform(val => parseInt(val)).refine(val => val > 0, 'Page must be positive').optional(),
  limit: z.string().transform(val => parseInt(val)).refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100').optional(),
})

// Type exports
export type CreateUserInput = z.infer<typeof createUserSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type CreateBoardInput = z.infer<typeof boardSchema>
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>
export type CreateColumnInput = z.infer<typeof columnSchema>
export type CreateTaskInput = z.infer<typeof taskSchema>
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>
export type CreateCommentInput = z.infer<typeof commentSchema>
export type ActivityFilterInput = z.infer<typeof activityFilterSchema>
export type WSMessage = z.infer<typeof wsMessageSchema>
export type PaginationInput = z.infer<typeof paginationSchema>
export type IdParam = z.infer<typeof idParamSchema>
