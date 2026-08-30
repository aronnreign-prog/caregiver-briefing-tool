/**
 * src/lib/ai/model.ts
 * Centralized AI Model provider for CareNote.
 * Single source of truth for Gemini / Google AI configuration.
 */

import { google } from '@ai-sdk/google'

export function getClinicalModel() {
  const modelName = process.env.AI_MODEL || 'gemini-3.7-flash'
  return google(modelName)
}
