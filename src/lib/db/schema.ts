import { pgTable, text, timestamp, jsonb, uuid, boolean } from 'drizzle-orm/pg-core'

// Better Auth core tables
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  expiresAt: timestamp('expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const caregivers = pgTable('caregivers', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: text('user_id').notNull().unique(), // Better Auth user.id (text type)
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const patients = pgTable('patients', {
  id: uuid('id').defaultRandom().primaryKey(),
  caregiver_id: uuid('caregiver_id').notNull().references(() => caregivers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  date_of_birth: text('date_of_birth').notNull(),
  relationship: text('relationship').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  patient_id: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  caregiver_id: uuid('caregiver_id').notNull().references(() => caregivers.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  blob_url: text('blob_url'),
  file_size: text('file_size'),
  mime_type: text('mime_type'),
  status: text('status').notNull().default('uploaded'),
  uploaded_at: timestamp('uploaded_at').defaultNow().notNull(),
  processed_at: timestamp('processed_at'),
  document_date: text('document_date'),
  document_type: text('document_type'),
  error_message: text('error_message'),
})

export const briefings = pgTable('briefings', {
  id: uuid('id').defaultRandom().primaryKey(),
  patient_id: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  caregiver_id: uuid('caregiver_id').notNull().references(() => caregivers.id, { onDelete: 'cascade' }),
  audience: text('audience').notNull(),
  status: text('status').notNull().default('queued'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  completed_at: timestamp('completed_at'),
  source_doc_ids: jsonb('source_doc_ids'),
  briefing_text: text('briefing_text'),
  claims: jsonb('claims'),
  flagged_concerns: jsonb('flagged_concerns'),
  error_message: text('error_message'),
})
