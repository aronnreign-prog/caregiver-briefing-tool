-- FK indexes for filtered queries and join performance
-- Abseil Principle 12: O(N) sequential scan → O(log N) index lookup

CREATE INDEX IF NOT EXISTS idx_patients_caregiver ON patients(caregiver_id);
CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_documents_caregiver ON documents(caregiver_id);
CREATE INDEX IF NOT EXISTS idx_briefings_patient ON briefings(patient_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_caregivers_auth_user ON caregivers(auth_user_id);
