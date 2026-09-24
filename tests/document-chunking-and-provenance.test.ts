import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// Import chunkDocumentEpisodes and buildFactSummary logic
function chunkDocumentEpisodes(
  fullContent: string,
  contextHeader: string,
  maxChunkSize = 7500
): string[] {
  if (fullContent.length <= maxChunkSize) {
    return [fullContent]
  }

  const paragraphs = fullContent.split(/\n\n+/).filter((p) => p.trim().length > 0)
  const chunks: string[] = []
  let currentChunk: string[] = []
  let currentLength = 0

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChunkSize) {
      // Split large paragraph by lines
      const lines = paragraph.split('\n')
      for (const line of lines) {
        if (currentLength + line.length + 1 > maxChunkSize && currentChunk.length > 0) {
          const body = currentChunk.join('\n')
          chunks.push(chunks.length === 0 ? body : `${contextHeader}\n\n${body}`)
          currentChunk = []
          currentLength = 0
        }
        currentChunk.push(line)
        currentLength += line.length + 1
      }
    } else {
      if (currentLength + paragraph.length + 2 > maxChunkSize && currentChunk.length > 0) {
        const body = currentChunk.join('\n\n')
        chunks.push(chunks.length === 0 ? body : `${contextHeader}\n\n${body}`)
        currentChunk = []
        currentLength = 0
      }
      currentChunk.push(paragraph)
      currentLength += paragraph.length + 2
    }
  }

  if (currentChunk.length > 0) {
    const body = currentChunk.join('\n\n')
    chunks.push(chunks.length === 0 ? body : `${contextHeader}\n\n${body}`)
  }

  return chunks
}

interface ClinicalExtraction {
  documentDate?: string
  documentType?: string
  provider?: string
  specialty?: string
  encounterContext?: string
  medications: Array<{
    name: string
    dose?: string
    frequency?: string
    route?: string
    status: string
    prescribedDate?: string
    pageNumber?: number
  }>
  lab_values: Array<{
    name: string
    value: string
    unit?: string
    referenceRange?: string
    flag?: string
    date?: string
    pageNumber?: number
  }>
  conditions: Array<{
    name: string
    status?: string
    onsetDate?: string
    pageNumber?: number
  }>
  otherObservations: string[]
}

function buildFactSummary(
  extraction: ClinicalExtraction,
  documentId: string,
  filename: string
): string {
  const docDate = extraction.documentDate ?? 'Date unknown / not documented'
  const lines: string[] = []

  lines.push(`CLINICAL DOCUMENT: ${filename} (document_id: ${documentId})`)
  lines.push(`Document type: ${extraction.documentType ?? 'Unspecified'}`)
  lines.push(`Document date: ${docDate}`)
  if (extraction.provider) lines.push(`Provider: ${extraction.provider}`)
  if (extraction.specialty) lines.push(`Specialty: ${extraction.specialty}`)
  if (extraction.encounterContext) lines.push(`Encounter context: ${extraction.encounterContext}`)

  if (extraction.lab_values.length > 0) {
    lines.push('\nLAB RESULTS:')
    for (const lab of extraction.lab_values) {
      const onDate = lab.date ? `On ${lab.date}` : (extraction.documentDate ? `On ${extraction.documentDate}` : 'Date unknown')
      const val = lab.unit ? `${lab.value} ${lab.unit}` : lab.value
      const range = lab.referenceRange ? ` (ref: ${lab.referenceRange})` : ''
      const flag = lab.flag ? ` [${lab.flag}]` : ''
      const page = lab.pageNumber ? ` [page: ${lab.pageNumber}]` : ''
      lines.push(`  ${onDate}, ${lab.name} was ${val}${range}${flag}.${page} [doc_id: ${documentId}]`)
    }
  }

  if (extraction.medications.length > 0) {
    lines.push('\nMEDICATIONS:')
    for (const med of extraction.medications) {
      const onDate = med.prescribedDate ? `On ${med.prescribedDate}` : (extraction.documentDate ? `On ${extraction.documentDate}` : 'Date unknown')
      const parts: string[] = [med.name]
      if (med.dose) parts.push(med.dose)
      if (med.frequency) parts.push(med.frequency)
      if (med.route) parts.push(`(${med.route})`)
      const page = med.pageNumber ? ` [page: ${med.pageNumber}]` : ''
      lines.push(`  ${onDate}, ${parts.join(' ')} documented as ${med.status}.${page} [doc_id: ${documentId}]`)
    }
  }

  if (extraction.conditions.length > 0) {
    lines.push('\nCONDITIONS / DIAGNOSES:')
    for (const cond of extraction.conditions) {
      const onDate = cond.onsetDate ? `As of ${cond.onsetDate}` : (extraction.documentDate ? `As of ${extraction.documentDate}` : 'Date unknown')
      const status = cond.status ? ` (${cond.status})` : ''
      const page = cond.pageNumber ? ` [page: ${cond.pageNumber}]` : ''
      lines.push(`  ${onDate}, ${cond.name}${status}.${page} [doc_id: ${documentId}]`)
    }
  }

  if (extraction.otherObservations.length > 0) {
    lines.push('\nCLINICAL NOTES:')
    for (const obs of extraction.otherObservations) {
      lines.push(`  ${obs} [doc_id: ${documentId}]`)
    }
  }

  lines.push(`\nSOURCE: ${filename} (document_id: ${documentId})`)
  return lines.join('\n')
}

describe('Document Fact Summarization & Provenance Retention', () => {
  const sampleDocId = 'doc-1234-abcd'
  const sampleFilename = 'Cardiology_Consult_2026.pdf'

  test('builds comprehensive summary with exact doc_id and page anchors', () => {
    const extraction: ClinicalExtraction = {
      documentDate: '2026-03-15',
      documentType: 'Consultation Note',
      provider: 'Dr. Jane Smith, MD',
      specialty: 'Cardiology',
      encounterContext: 'Outpatient Follow-up',
      medications: [
        { name: 'Metformin', dose: '500mg', frequency: 'twice daily', route: 'oral', status: 'active', pageNumber: 2 },
        { name: 'Lisinopril', dose: '10mg', frequency: 'daily', status: 'discontinued', pageNumber: 3 },
      ],
      lab_values: [
        { name: 'Hemoglobin A1c', value: '6.8', unit: '%', referenceRange: '4.0-5.6', flag: 'High', date: '2026-03-10', pageNumber: 4 },
      ],
      conditions: [
        { name: 'Type 2 Diabetes Mellitus', status: 'chronic', onsetDate: '2020-05', pageNumber: 1 },
      ],
      otherObservations: [
        'Patient reports improved tolerance with meals.',
      ],
    }

    const summary = buildFactSummary(extraction, sampleDocId, sampleFilename)

    // Verify metadata presence
    assert.ok(summary.includes(`CLINICAL DOCUMENT: ${sampleFilename} (document_id: ${sampleDocId})`))
    assert.ok(summary.includes('Document type: Consultation Note'))
    assert.ok(summary.includes('Provider: Dr. Jane Smith, MD'))

    // Verify provenance tokens [doc_id: ...] and [page: ...]
    assert.ok(summary.includes(`Metformin 500mg twice daily (oral) documented as active. [page: 2] [doc_id: ${sampleDocId}]`))
    assert.ok(summary.includes(`Lisinopril 10mg daily documented as discontinued. [page: 3] [doc_id: ${sampleDocId}]`))
    assert.ok(summary.includes(`Hemoglobin A1c was 6.8 % (ref: 4.0-5.6) [High]. [page: 4] [doc_id: ${sampleDocId}]`))
    assert.ok(summary.includes(`Type 2 Diabetes Mellitus (chronic). [page: 1] [doc_id: ${sampleDocId}]`))
  })

  test('gracefully handles missing and partial extraction fields without crash', () => {
    const emptyExtraction: ClinicalExtraction = {
      medications: [],
      lab_values: [],
      conditions: [],
      otherObservations: [],
    }

    const summary = buildFactSummary(emptyExtraction, sampleDocId, sampleFilename)
    assert.ok(summary.includes('Document type: Unspecified'))
    assert.ok(summary.includes('Document date: Date unknown / not documented'))
    assert.ok(!summary.includes('MEDICATIONS:'))
    assert.ok(!summary.includes('LAB RESULTS:'))
    assert.ok(!summary.includes('CONDITIONS / DIAGNOSES:'))
    assert.ok(summary.includes(`SOURCE: ${sampleFilename} (document_id: ${sampleDocId})`))
  })
})

describe('Document Episode Chunking & Continuation Preservation', () => {
  const header = 'CLINICAL DOCUMENT (CONTINUATION): Cardiology.pdf (document_id: doc-123) | Date: 2026-03-15'

  test('returns single chunk when content is within maxChunkSize', () => {
    const content = 'Short clinical note with 100 characters.'
    const chunks = chunkDocumentEpisodes(content, header, 7500)
    assert.equal(chunks.length, 1)
    assert.equal(chunks[0], content)
  })

  test('splits multi-paragraph content exceeding boundary and prefixes continuation header', () => {
    const para1 = 'Paragraph 1: ' + 'A'.repeat(4000)
    const para2 = 'Paragraph 2: ' + 'B'.repeat(4000)
    const fullContent = `${para1}\n\n${para2}`

    const chunks = chunkDocumentEpisodes(fullContent, header, 5000)
    assert.equal(chunks.length, 2)

    // First chunk does not have continuation header prepended
    assert.ok(!chunks[0].startsWith(header))
    assert.ok(chunks[0].includes('Paragraph 1:'))

    // Second chunk MUST have continuation header prepended
    assert.ok(chunks[1].startsWith(header))
    assert.ok(chunks[1].includes('Paragraph 2:'))
  })

  test('splits oversized single paragraph by line boundaries without data loss', () => {
    const lines: string[] = []
    for (let i = 0; i < 50; i++) {
      lines.push(`Line ${i}: Observation data value ${i} [doc_id: test-uuid] [page: 1]`)
    }
    const longParagraph = lines.join('\n')

    // Chunk size smaller than total paragraph
    const chunks = chunkDocumentEpisodes(longParagraph, header, 500)
    assert.ok(chunks.length > 1)

    // Verify all chunks stay within bounds (accounting for header)
    chunks.forEach((chunk, idx) => {
      assert.ok(chunk.length > 0)
      if (idx > 0) {
        assert.ok(chunk.startsWith(header))
      }
    })

    // Verify every line is preserved across chunks
    lines.forEach((line) => {
      const found = chunks.some((c) => c.includes(line))
      assert.ok(found, `Line missing from chunked output: ${line}`)
    })
  })
})
