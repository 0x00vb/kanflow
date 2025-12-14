import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'
import path from 'path'

// Load environment variables from .env.local or .env
config({ path: '.env.local' })
config({ path: '.env' })

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    path: path.join(__dirname, './prisma/migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/kanflow',
  },
})
