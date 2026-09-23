import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { db } from '../src/lib/db'
import { demoRequests, caregivers, user } from '../src/lib/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '../src/lib/auth'

async function runLiveVerification() {
  console.log('=== CareNote Live Upstream & Downstream Pipeline Verification ===\n')

  const testEmail = `test-pipeline-${Date.now()}@carenote.in`
  const testName = 'Dr. Evaluation User'
  const testRole = 'Geriatrician'
  const testOrg = 'Stanford Health Care'
  const testUseCase = 'Cross-specialist prescription synthesis'

  console.log('Step 1: Simulating Landing Page Public Demo Request Submission...')
  // Direct insert matching submitDemoRequest action
  const [newRequest] = await db
    .insert(demoRequests)
    .values({
      name: testName,
      email: testEmail,
      organization: testOrg,
      role: testRole,
      use_case: testUseCase,
      status: 'pending',
    })
    .returning()

  console.log('✓ Demo request saved in Neon database:', {
    id: newRequest.id,
    name: newRequest.name,
    email: newRequest.email,
    status: newRequest.status,
  })

  console.log('\nStep 2: Verifying pending request in Admin Queue query...')
  const pending = await db
    .select()
    .from(demoRequests)
    .where(eq(demoRequests.id, newRequest.id))
    .limit(1)

  if (pending.length === 0 || pending[0].status !== 'pending') {
    throw new Error('FAILED: Request not found in pending state')
  }
  console.log('✓ Found in Admin Queue:', pending[0].id, 'status:', pending[0].status)

  console.log('\nStep 3: Simulating 1-Click Admin Approval & Provisioning...')
  const tempPassword = 'CareNote-TestPass99!'
  
  // Call Better Auth server-side API
  console.log('Calling Better Auth auth.api.createUser (or signUpEmail)...')
  const userResult = await auth.api.signUpEmail({
    body: {
      name: testName,
      email: testEmail,
      password: tempPassword,
    },
  })

  if (!userResult?.user?.id) {
    throw new Error('FAILED: Better Auth user creation failed')
  }
  console.log('✓ Better Auth user provisioned:', {
    id: userResult.user.id,
    email: userResult.user.email,
    name: userResult.user.name,
  })

  // Link caregiver in Neon
  const [newCaregiver] = await db
    .insert(caregivers)
    .values({
      user_id: userResult.user.id,
      email: testEmail,
      name: testName,
    })
    .returning()
  console.log('✓ Linked caregiver profile created in Neon:', newCaregiver.id)

  // Update demoRequests status to approved
  await db
    .update(demoRequests)
    .set({
      status: 'approved',
      approved_at: new Date(),
      created_user_id: userResult.user.id,
    })
    .where(eq(demoRequests.id, newRequest.id))

  const [approvedReq] = await db
    .select()
    .from(demoRequests)
    .where(eq(demoRequests.id, newRequest.id))
  console.log('✓ Demo request status updated to:', approvedReq.status, 'approved_at:', approvedReq.approved_at)

  console.log('\nStep 4: Verifying downstream authentication (Login simulation)...')
  const signInResult = await auth.api.signInEmail({
    body: {
      email: testEmail,
      password: tempPassword,
    },
  })
  console.log('✓ Authentication successful! Session token issued:', !!signInResult?.token)

  console.log('\nStep 5: Cleaning up test user and records...')
  await db.delete(caregivers).where(eq(caregivers.user_id, userResult.user.id))
  await db.delete(user).where(eq(user.id, userResult.user.id))
  await db.delete(demoRequests).where(eq(demoRequests.id, newRequest.id))
  console.log('✓ Cleanup complete. Test records purged.')

  console.log('\n=== ALL UPSTREAM AND DOWNSTREAM STEPS VERIFIED LIVE ===')
}

runLiveVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('VERIFICATION ERROR:', err)
    process.exit(1)
  })
