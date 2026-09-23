import { neon } from '@neondatabase/serverless'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const sql = neon(databaseUrl)

async function testLiveDatabase() {
  console.log('Testing live connectivity to Neon Postgres demo_requests table...')
  
  // 1. Check table existence
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_name = 'demo_requests';
  `
  if (tables.length === 0) {
    throw new Error('Table demo_requests does not exist in Neon!')
  }
  console.log('✓ demo_requests table confirmed live.')

  // 2. Insert a test record
  const testEmail = `test-demo-${Date.now()}@example.com`
  const insertResult = await sql`
    INSERT INTO demo_requests (name, email, organization, role, use_case, status)
    VALUES ('Dr. Jane Doe', ${testEmail}, 'Mayo Clinic', 'Physician', 'Evaluating for memory care', 'pending')
    RETURNING id, name, email, organization, role, use_case, status, created_at;
  `
  const inserted = insertResult[0]
  console.log('✓ Successfully inserted demo request:', inserted)

  // 3. Test status update (simulating approval or rejection)
  const updateResult = await sql`
    UPDATE demo_requests
    SET status = 'approved', approved_at = NOW(), created_user_id = 'test-user-id'
    WHERE id = ${inserted.id}
    RETURNING id, status, approved_at, created_user_id;
  `
  console.log('✓ Successfully updated demo request status:', updateResult[0])

  // 4. Cleanup test record
  await sql`DELETE FROM demo_requests WHERE id = ${inserted.id};`
  console.log('✓ Successfully cleaned up test record from Neon.')

  console.log('\nAll live database tests passed successfully!')
}

testLiveDatabase().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
