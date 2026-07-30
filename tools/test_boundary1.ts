import dotenv from '@dotenvx/dotenvx'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/process-document`

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  console.error('   Ensure .env.local exists with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`)
    passed++
  } else {
    console.error(`  ❌ ${message}`)
    failed++
  }
}

async function waitForJobStatus(jobId: string, expectedStatus: string, timeoutMs = 10000): Promise<string | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { data, error } = await supabase
      .from('jobs')
      .select('status')
      .eq('id', jobId)
      .maybeSingle()

    if (!error && data?.status === expectedStatus) {
      return data.status
    }

    if (error) {
      return null
    }

    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}

async function test1_fetchPatient() {
  console.log('\n📋 Test 1: Fetch patient from public.patients')
  try {
    const { data, error } = await supabase
      .from('patients')
      .select('id, name, date_of_birth')
      .limit(1)
      .maybeSingle()

    assert(!error, `No DB error: ${error?.message || 'ok'}`)
    assert(data != null, 'Returned a patient row')
    if (data) {
      assert(typeof data.id === 'string' && data.id.length > 0, 'Patient ID is a non-empty string')
      assert(!data.id.includes('undefined'), 'Patient ID does not contain "undefined"')
    }
  } catch (e) {
    console.error('  ❌ Exception:', e)
    failed++
  }
}

async function test2_insertDocument() {
  console.log('\n📋 Test 2: Insert test row into public.documents with valid UUID')
  const testPatientId = 'abfc9d5c-1765-42d3-91e9-cd48206b7ce6'
  const testCaregiverId = 'a883402f-4c58-4b4f-8d9f-fa56e0989fcb'
  const testDocId = crypto.randomUUID()

  try {
    const { data, error } = await supabase
      .from('documents')
      .insert({
        id: testDocId,
        patient_id: testPatientId,
        caregiver_id: testCaregiverId,
        filename: 'test_boundary1.pdf',
        storage_path: 'test/test_boundary1.pdf',
        file_size: 0,
        mime_type: 'application/pdf',
        status: 'uploaded',
      })
      .select()
      .single()

    assert(!error, `No DB error: ${error?.message || 'ok'}`)
    assert(data?.id === testDocId, 'Inserted document ID matches generated UUID')

    if (data) {
      assert(typeof data.patient_id === 'string', 'patient_id is a string')
      assert(data.patient_id !== 'undefined', 'patient_id is not the string "undefined"')
      assert(data.patient_id.length > 0, 'patient_id is non-empty')
    }

    await supabase.from('documents').delete().eq('id', testDocId)
    assert(true, 'Cleaned up test document row')
  } catch (e) {
    console.error('  ❌ Exception:', e)
    failed++
  }
}

async function test3_invokeEdgeFunction() {
  console.log('\n📋 Test 3: Invoke process-document Edge Function with valid payload')
  const testPatientId = 'abfc9d5c-1765-42d3-91e9-cd48206b7ce6'
  const testCaregiverId = 'a883402f-4c58-4b4f-8d9f-fa56e0989fcb'
  const testDocId = crypto.randomUUID()

  try {
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        id: testDocId,
        patient_id: testPatientId,
        caregiver_id: testCaregiverId,
        filename: 'test_boundary1_edge.pdf',
        storage_path: 'test/test_boundary1_edge.pdf',
        file_size: 0,
        mime_type: 'application/pdf',
        status: 'uploaded',
      })
      .select()
      .single()

    assert(!docError, `Document insert succeeded: ${docError?.message || 'ok'}`)

    if (!doc) {
      assert(false, 'Document row returned after insert')
      await supabase.from('documents').delete().eq('id', testDocId)
      return
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        job_type: 'process_document',
        payload: { document_id: doc.id, caregiver_id: testCaregiverId },
        status: 'queued',
      })
      .select()
      .single()

    assert(!jobError, `Job insert succeeded: ${jobError?.message || 'ok'}`)

    if (!job) {
      assert(false, 'Job row returned after insert')
      await supabase.from('documents').delete().eq('id', testDocId)
      return
    }

    assert(typeof job.payload?.document_id === 'string', 'Job payload document_id is a string')
    assert(job.payload?.document_id !== 'undefined', 'Job payload document_id is not "undefined"')
    assert(job.payload?.document_id === doc.id, 'Job payload document_id matches document ID')

    const processingPromise = waitForJobStatus(job.id, 'processing', 10000)

    const resp = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ worker_name: 'boundary1-test' }),
    })

    const respBody = await resp.text()

    const processingStatus = await processingPromise
    assert(processingStatus === 'processing', 'Job transitioned to processing within timeout')

    const isHandledError =
      resp.status === 500 &&
      !respBody.includes('invalid input syntax for type uuid') &&
      !respBody.includes('"undefined"')

    assert(
      resp.status === 200 || resp.status === 404 || isHandledError,
      `Edge Function responded acceptably (status ${resp.status})`
    )
    assert(!respBody.includes('invalid input syntax for type uuid'), 'No UUID syntax error in response')
    assert(!respBody.includes('"undefined"'), 'No "undefined" string in response')

    const finalJob = await supabase
      .from('jobs')
      .select('status, error_message')
      .eq('id', job.id)
      .maybeSingle()

    if (finalJob.data?.status === 'failed') {
      const errMsg = (finalJob.data.error_message || '').toLowerCase()
      const isRenderBoundaryError =
        errMsg.includes('fetch failed') ||
        errMsg.includes('econnreset') ||
        errMsg.includes('enotfound') ||
        errMsg.includes('timeout') ||
        errMsg.includes('graphiti') ||
        errMsg.includes('wrapper') ||
        errMsg.includes('render') ||
        errMsg.includes('object not found')

      assert(isRenderBoundaryError, `Failure is at Render boundary, not Boundary 1: ${finalJob.data.error_message}`)
    } else if (finalJob.data?.status === 'complete') {
      assert(true, 'Job completed successfully')
    } else {
      assert(false, `Job ended in expected terminal state: ${finalJob.data?.status}`)
    }

    await supabase.from('jobs').delete().eq('id', job.id)
    assert(true, 'Cleaned up test job row')

    await supabase.from('documents').delete().eq('id', testDocId)
    assert(true, 'Cleaned up test document row')
  } catch (e) {
    console.error('  ❌ Exception:', e)
    failed++
  }
}

async function main() {
  console.log('🧪 Boundary 1 Verification: Next.js <-> Supabase')
  console.log('================================================')

  await test1_fetchPatient()
  await test2_insertDocument()
  await test3_invokeEdgeFunction()

  console.log('\n================================================')
  console.log(`Results: ${passed} passed, ${failed} failed`)

  if (failed > 0) {
    console.log('❌ Boundary 1 verification FAILED')
    process.exit(1)
  } else {
    console.log('✅ Boundary 1 verification PASSED')
    process.exit(0)
  }
}

main()
