import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'

// Load environment variables from .env.local or .env
config({ path: '.env.local' })
config({ path: '.env' })

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: './prisma/migrations',
  datasource: {
    provider: 'postgresql',
    url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/kanflow',
  },
})
