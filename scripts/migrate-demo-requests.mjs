import { neon } from '@neondatabase/serverless'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is not set in environment or .env.local')
  process.exit(1)
}

const sql = neon(databaseUrl)

async function runMigration() {
  console.log('Applying demo_requests table migration to Neon Postgres...')
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS demo_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        organization TEXT,
        role TEXT,
        use_case TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMP,
        created_user_id TEXT
      );
    `
    console.log('Successfully created demo_requests table (if not exists).')

    // Verify table structure
    const cols = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'demo_requests'
      ORDER BY ordinal_position;
    `
    console.log('Columns in demo_requests:')
    console.table(cols)
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
