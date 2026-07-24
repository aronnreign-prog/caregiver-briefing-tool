-- Migration: Fix RLS policies and permissions for document processing pipeline
-- Date: 2026-07-24
-- Fixes: 42501 insufficient_privilege on public.jobs INSERT, missing RLS on all pipeline tables

-- ============================================================================
-- 1. ENABLE ROW LEVEL SECURITY ON ALL PIPELINE TABLES
-- ============================================================================

ALTER TABLE public.caregivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. CAREGIVERS — caregivers can read their own profile
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'caregivers' AND policyname = 'caregivers_select_own'
  ) THEN
    CREATE POLICY caregivers_select_own ON public.caregivers
      FOR SELECT TO authenticated
      USING (auth.uid() = auth_user_id);
  END IF;
END$$;

-- ============================================================================
-- 3. PATIENTS — caregivers can read/write their own patients
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patients' AND policyname = 'patients_select_own'
  ) THEN
    CREATE POLICY patients_select_own ON public.patients
      FOR SELECT TO authenticated
      USING (caregiver_id IN (SELECT id FROM caregivers WHERE auth_user_id = auth.uid()));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patients' AND policyname = 'patients_insert_own'
  ) THEN
    CREATE POLICY patients_insert_own ON public.patients
      FOR INSERT TO authenticated
      WITH CHECK (caregiver_id IN (SELECT id FROM caregivers WHERE auth_user_id = auth.uid()));
  END IF;
END$$;

-- ============================================================================
-- 4. DOCUMENTS — caregivers can read/write their own patient documents
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'documents' AND policyname = 'documents_select_own'
  ) THEN
    CREATE POLICY documents_select_own ON public.documents
      FOR SELECT TO authenticated
      USING (caregiver_id IN (SELECT id FROM caregivers WHERE auth_user_id = auth.uid()));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'documents' AND policyname = 'documents_insert_own'
  ) THEN
    CREATE POLICY documents_insert_own ON public.documents
      FOR INSERT TO authenticated
      WITH CHECK (caregiver_id IN (SELECT id FROM caregivers WHERE auth_user_id = auth.uid()));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'documents' AND policyname = 'documents_update_own'
  ) THEN
    CREATE POLICY documents_update_own ON public.documents
      FOR UPDATE TO authenticated
      USING (caregiver_id IN (SELECT id FROM caregivers WHERE auth_user_id = auth.uid()))
      WITH CHECK (caregiver_id IN (SELECT id FROM caregivers WHERE auth_user_id = auth.uid()));
  END IF;
END$$;

-- ============================================================================
-- 5. BRIEFINGS — caregivers can read/write their own patient briefings
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'briefings' AND policyname = 'briefings_select_own'
  ) THEN
    CREATE POLICY briefings_select_own ON public.briefings
      FOR SELECT TO authenticated
      USING (caregiver_id IN (SELECT id FROM caregivers WHERE auth_user_id = auth.uid()));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'briefings' AND policyname = 'briefings_insert_own'
  ) THEN
    CREATE POLICY briefings_insert_own ON public.briefings
      FOR INSERT TO authenticated
      WITH CHECK (caregiver_id IN (SELECT id FROM caregivers WHERE auth_user_id = auth.uid()));
  END IF;
END$$;

-- ============================================================================
-- 6. JOBS — authenticated users can create and read their own jobs
-- ============================================================================
-- FIX: The 42501 error occurred because no INSERT policy existed for authenticated users.
-- Edge Functions use service_role to bypass RLS entirely, so this policy only affects client-side job creation.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'jobs_select_own'
  ) THEN
    CREATE POLICY jobs_select_own ON public.jobs
      FOR SELECT TO authenticated
      USING (CAST(payload->>'caregiver_id' AS uuid) IN (
        SELECT id FROM caregivers WHERE auth_user_id = auth.uid()
      ));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'jobs_insert_own'
  ) THEN
    CREATE POLICY jobs_insert_own ON public.jobs
      FOR INSERT TO authenticated
      WITH CHECK (CAST(payload->>'caregiver_id' AS uuid) IN (
        SELECT id FROM caregivers WHERE auth_user_id = auth.uid()
      ));
  END IF;
END$$;

-- ============================================================================
-- 7. AUDIT LOG — caregivers can read their own audit entries
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'audit_log' AND policyname = 'audit_log_select_own'
  ) THEN
    CREATE POLICY audit_log_select_own ON public.audit_log
      FOR SELECT TO authenticated
      USING (caregiver_id IN (SELECT id FROM caregivers WHERE auth_user_id = auth.uid()));
  END IF;
END$$;

-- ============================================================================
-- 8. SERVICE ROLE BYPASS (already granted — this migration is idempotent)
-- ============================================================================
-- The service_role key (used by Edge Functions) bypasses all RLS by design.
-- No additional grants needed; this comment documents the design.