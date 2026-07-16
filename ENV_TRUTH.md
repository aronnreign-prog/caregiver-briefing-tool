# ENV_TRUTH.md — Source of Truth vs What Tools Saw

> Research artifact. Documents confirmed mismatches between on-disk code and what
> build tools / MCP / agents observed. NO source code was modified.

## Truth Table

| Artifact | On-disk / committed state | Deployed / running state | What the tool actually targeted | Mismatch? |
|---|---|---|---|---|
| `python/graphiti-wrapper/requirements.txt` line 9 | `https://huggingface.co/.../en_core_med7_lg-any-py3-none-any.whl` (correct, verified HTTP 200) | Build emitted `en-core-med7-lg==any` | **Stale BuildKit layer** from an OLD requirements.txt (ghost string lives in NO repo file) | YES — build cache, not code |
| `supabase/config.toml` Edge Function env | No `OPENROUTER_API_KEY`/`LAYER_1_VISION_MODEL` declared; functions read them from secrets | `.env.local` MISSING `OPENROUTER_API_KEY` | `.env.local` is used only for local `supabase start`; prod reads Supabase Secrets | YES — key absent locally |
| `FALKORDB_URI` in `.env.local` | `bolt://localhost:7687` | Wrapper + compose use `FALKORDB_HOST=localhost`/`PORT=6379` (Redis protocol) | `.env.local` bolt:// is wrong scheme for this stack | YES — wrong scheme |
| `.agents/MODELS.md` L16 | claims default `qwen/qwen-2-vl-7b-instruct:free` | code fallback (`index.ts:89`) = `nvidia/nemotron-nano-12b-v2-vl:free` | Docs out of sync with code | YES — doc drift |
| `process-document/index.ts` | working copy: trailing-newline edit (uncommitted) | HEAD lacks the newline | disk ≠ committed HEAD (trivial, not the "deployed" mismatch) | Minor |
| Supabase MCP `apply_migration` | — | targets **preview branch** (features=branching) | vs `execute_sql`/`list_tables` → **prod/main** | YES — branch vs prod |

## Mismatch #1 Root Cause (requirements.txt ghost)
- `en-core-med7-lg==any` exists in **no** file in the repo (searched all `requirements.txt`, hidden, build dirs). Only one requirements file, line 9 correct.
- No `.dockerignore` exists, so no duplication there.
- Docker build cache (`docker builder du`) shows reclaimable layers from prior builds.
- Conclusion: the bad line came from a **stale BuildKit layer** of `requirements.txt` cached before the wheel-URL fix was made (Docker `COPY requirements.txt .` + `RUN pip install` layer was reused despite `--no-cache` applying to RUN instructions but BuildKit recipe-hash caching / previous inline-cache still resolving the old hash in some setups).
- Offending path: **none on disk** — it is in the Docker daemon's content-addressable cache, not the filesystem.
- Exact fix:
  `docker builder prune -f` (then `docker compose build --no-cache graphiti-wrapper`)

## Mismatch #2 Root Cause (MCP DB binding)
- `opencode.json` has ONE mcp server: `type: http`, `url=https://mcp.supabase.com/mcp?project_ref=qtwxthxhwwqovpcqrdqj&features=branching,functions,...`.
- `project_ref` correctly binds the project, BUT `features=branching` exposes branch-aware tools. `apply_migration` writes to a **linked preview branch** (default when branching enabled), while `execute_sql`/`list_tables` (database feature) read **production/main** — which is why `public.jobs` "does not exist" in the branch context yet exists in prod. The single URL is bound correctly; the **feature/branch scope** is what splits prod vs branch, not a misconfigured ref.

## Verify before trusting any tool output
1. After ANY `docker compose build`, run `docker builder prune -f` if a layer looks stale — code may be correct but cache wrong.
2. For Supabase MCP: know whether the tool hits prod/main or a branch (`apply_migration`=branch, `execute_sql`=prod). Confirm with `list_tables` on each.
3. Check `.env.local` actually contains every key the Edge Functions REQUIRE (`OPENROUTER_API_KEY` is missing locally — set it before `supabase start`).
4. `FALKORDB_URI` in `.env.local` is `bolt://` but the stack uses Redis `host:port` (6379) — do not trust that key for the running wrapper.
5. `.agents/MODELS.md` default models are out of date vs code fallbacks — trust the `|| "..."` in `index.ts`, not the doc.
6. Disk vs deployed Edge Function: the Supabase-deployed `index.ts` may differ from local (edited by another assistant) — diff with `supabase functions list` / dashboard before assuming parity.

## Lessons (ingrained from post-mortem)

- **Introspect, don't trust docs.** `graphiti-core` resolved to `0.29.2`; `main`-branch
  docs (`graphiti_core.driver.falkordb`) were wrong — actual path is
  `graphiti_core.driver.falkordb_driver.FalkorDriver`. Before any import, run
  `docker run --rm <img> python -c "import graphiti_core.driver; print([m for m in dir(graphiti_core.driver) if 'falkor' in m.lower()])"`.
- **websearch the EXACT error first.** `ResolutionImpossible: graphiti-core 0.29.2
  depends on pydantic>=2.11.5` is a documented, one-line fix (loosen the pin). The
  session instead re-ran `docker compose build` 4+ times on the same broken file.
- **Hard stop after 2 identical failures.** No code change between builds = blind
  retry. Use websearch/docs/introspection instead.
- **Use connected tools.** Don't hand-roll an MCP SSE client in PowerShell — the MCP
  tools + `supabase` CLI already work.
- **MCP scope:** `apply_migration`=branch, `execute_sql`/`list_tables`=prod/main.
  `public.jobs` "missing" in a branch context is expected, not a bug.
- **med7 caveat:** the `en_core_med7_lg` model was REMOVED from `requirements.txt`
  this session (was `==any` ghost from a stale BuildKit layer). Entity extraction
  now uses OpenRouter LLM only — do not re-add med7 without resolving the wheel URL.
