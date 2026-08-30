/**
 * src/lib/ai/model.ts
 * Centralized AI Model provider for CareNote.
 * Single source of truth for Gemini / Google AI configuration.
 */

import { google } from '@ai-sdk/google'

export function getClinicalModel() {
  return google(process.env.AI_MODEL || 'Gemini 3 Flash')
}
