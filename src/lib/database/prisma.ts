import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'

// Load environment variables if not already loaded
config({ path: '.env.local' })
config({ path: '.env' })

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pool: Pool | undefined
}

// Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// Create and reuse pool globally to prevent closing
if (!globalForPrisma.pool) {
  globalForPrisma.pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 0, // Don't close idle clients automatically
    connectionTimeoutMillis: 10000,
  })

  // Handle pool errors to keep pool alive
  globalForPrisma.pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err)
  })

  console.log('✅ PostgreSQL pool initialized')
}

// Create adapter with the global pool
const adapter = new PrismaPg(globalForPrisma.pool)

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
