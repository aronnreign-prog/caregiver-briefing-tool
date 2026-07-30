-- Revoke anon role execution on reset_stale_jobs (P0 security fix)
-- Prevents unauthenticated callers from resetting job state

REVOKE EXECUTE ON FUNCTION public.reset_stale_jobs(int) FROM anon;

-- Ensure authenticated and service_role retain access
GRANT EXECUTE ON FUNCTION public.reset_stale_jobs(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_stale_jobs(int) TO service_role;

-- Verify grants
SELECT
  grantee::regrole AS role,
  privilege_type,
  is_grantable
FROM information_schema.role_routine_grants
WHERE routine_name = 'reset_stale_jobs'
  AND routine_schema = 'public'
ORDER BY grantee;