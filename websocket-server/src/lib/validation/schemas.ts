import { z } from 'zod'

// WebSocket event schemas
export const wsMessageSchema = z.object({
  type: z.string(),
  data: z.any(),
  timestamp: z.number().optional(),
})

// Type exports
export type WSMessage = z.infer<typeof wsMessageSchema>
