# Sprint 7 — P1 Hardening Audit Report

**Date:** 2026-02-24  
**Scope:** AuthContext, IntegrationsContext, ProtectedRoute, useNotificationSettings, proposalPersonalization, ALL edge functions  
**Focus:** HIGH and MEDIUM severity only

---

## 1. src/contexts/AuthContext.tsx

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| A1 | **HIGH** | **`getSession()` used for initial load instead of `getUser()`** | `getSession()` (line ~128) reads tokens from local storage without server validation. A tampered JWT in localStorage would pass initial auth. Supabase docs recommend `getUser()` for server-validated auth. The `onAuthStateChange` listener also calls `applySessionState` with potentially unvalidated sessions. |
| A2 | **MEDIUM** | **orgId derived from first membership row — no cross-check on session change** | When `onAuthStateChange` fires (e.g., token refresh), `resolveMembership` re-runs but there's no guard verifying the new session's user matches the previous user. A stale closure could set membership for the wrong user if two auth events interleave. |
| A3 | **MEDIUM** | **No session expiry / token-refresh error handling** | If `onAuthStateChange` delivers a `TOKEN_REFRESHED` event that fails (e.g., refresh_token revoked), the code still calls `applySessionState(newSession)` where `newSession` could have a stale access_token. No explicit handling for `SIGNED_OUT` / `TOKEN_REFRESH_FAILED` events. |
| A4 | **MEDIUM** | **`signOut` clears state before network call completes** | `setMembershipState(EMPTY)` is called before `supabase.auth.signOut()`. If signOut fails, the user's local state is cleared but the server session remains alive. |

---

## 2. src/contexts/IntegrationsContext.tsx

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| I1 | **MEDIUM** | **No cleanup of Supabase realtime channel on unmount** | The context delegates all logic to `useIntegrations()` hook. The hook subscribes to a realtime channel (`whatsapp-instances-changes-${orgId}`), and it does clean up. **However**, `user_integrations` queries (line ~72 in hook) are scoped only by `user_id` — not `org_id`. If RLS is missing on `user_integrations`, this could leak cross-org data. |
| I2 | **MEDIUM** | **OAuth callback URL param `message` injected without sanitization** | In `useIntegrations` (line ~148): `toast.error('Erro ao conectar: ${message}')` where `message` comes from `urlParams.get('message')`. If the callback URL is tampered, arbitrary strings appear in the toast. Low XSS risk (React escapes by default), but it's a trust boundary issue for error messages. |

---

## 3. src/components/ProtectedRoute.tsx

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| P1 | **MEDIUM** | **Role check depends on client state only** | `requiredRoles` is checked against `role` from AuthContext. If an attacker manipulates localStorage/session state to alter the role, they could bypass the guard until the next server round-trip. This is mitigated by RLS on the backend, but the frontend renders restricted UI. |
| P2 | **LOW** | No issues beyond P1. Implementation is clean. | - |

---

## 4. src/hooks/useNotificationSettings.ts

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| N1 | **MEDIUM** | **`updateSettings` accepts arbitrary keys from caller** | The `patch` parameter (line ~147) is iterated and all keys except `org_id` are sent to the upsert. A caller could inject unexpected columns (e.g., `id`, `created_at`) into the payload. Should whitelist allowed keys. |
| N2 | **MEDIUM** | **No error surfacing to caller in `fetchSettings`** | The `.catch` on `fetchSettings()` (line ~130) swallows the error. The UI has no way to know the fetch failed beyond `loading` staying false and `settings` being null — same state as "not configured". |

---

## 5. src/utils/proposalPersonalization.ts

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| PP1 | **MEDIUM** | **No output encoding / XSS sanitization on template strings** | `headline` (line ~378) concatenates `input.contact.name` directly into the output string. If `contact.name` contains HTML/script content, and the consuming component renders via `dangerouslySetInnerHTML` or a PDF engine that interprets HTML, this is an injection vector. Same applies to all `normalizeText` outputs used in `executiveSummary`, `proofPoints`, `objectionHandlers`. |
| PP2 | **MEDIUM** | **`formatCurrency` / `formatYears` can produce misleading output on bad input** | `formatCurrency(NaN)` → `"R$ NaN"`. `formatYears(-12)` → `"-1.0 anos"`. No guards on negative/NaN metrics from upstream. Should validate `ProposalMetrics` fields. |

---

## 6. Edge Functions Audit Matrix

### 6.1 Summary Table

| Function | CORS | Auth Validation | try/catch | Generic Errors | Issues |
|----------|------|-----------------|-----------|----------------|--------|
| **ai-digest-worker** | ✅ ALLOWED_ORIGIN | ❌ **None** — uses service_role directly | ✅ | ⚠️ Leaks `error.message` in DB runs | H1 |
| **ai-pipeline-agent** | ✅ ALLOWED_ORIGIN | ❌ **None** — uses service_role directly, invoked internally | ✅ | ⚠️ Leaks `error.message` in responses | H2 |
| **ai-reporter** | ❌ **No CORS headers** | ❌ **No auth at all** | ❌ **No try/catch** | ❌ Leaks raw `error.message` via JSON | **H3 critical** |
| **appointments-api** | ❌ No CORS | ❌ Stub only (no real logic) | N/A | N/A | Low (stub) |
| **evolution-api** | ✅ ALLOWED_ORIGIN | ❌ **No auth** — anyone with the URL can call any action | ✅ | ⚠️ Leaks `error.message` | **H4 critical** |
| **evolution-proxy** | ✅ ALLOWED_ORIGIN | ✅ Full (JWT + service_role + internal key, timing-safe) | ✅ | ✅ Generic-ish | Clean |
| **evolution-webhook** | N/A (proxy) | N/A (proxies to whatsapp-webhook) | Minimal | N/A | Low |
| **google-callback** | ❌ **No CORS** (redirect-only) | ✅ (OAuth state param) | ✅ | ⚠️ Leaks `error.message` in redirect URL | M1 |
| **google-oauth** | ✅ ALLOWED_ORIGIN | ✅ (JWT validated) | ✅ | ⚠️ Leaks `error.message` in 500 response | M2 |
| **integration-disconnect** | ✅ ALLOWED_ORIGIN | ✅ (JWT validated) | ✅ | ⚠️ Leaks `error.message` | M3 |
| **kb-ingest** | ✅ ALLOWED_ORIGIN | ✅ (JWT + org membership) | ✅ | ⚠️ Leaks `error.message` in 500 | M4 |
| **media-resolver** | ✅ ALLOWED_ORIGIN | ❌ **No auth** | ✅ | ❌ Leaks raw `error.message` | **H5** |
| **meta-callback** | ❌ No CORS (redirect) | ✅ (OAuth state param) | ✅ | ⚠️ Leaks `error.message` in redirect | M5 |
| **meta-oauth** | ✅ ALLOWED_ORIGIN | ❌ **No auth** — hardcoded `userId = 'dev-user-test'` | ✅ | ⚠️ Leaks `error.message` | **H6 critical** |
| **meta-webhook** | ✅ ALLOWED_ORIGIN | ⚠️ Verify token is hardcoded plain-text array (not timing-safe) | ✅ | ⚠️ Leaks `error.message` in 200 body | M6 |
| **notification-worker** | ✅ ALLOWED_ORIGIN | ❌ **None** — service_role, invoked by cron/internal | ✅ | ✅ Generic `error.message` | Low (internal) |
| **org-admin** | ✅ ALLOWED_ORIGIN | ✅ Full (JWT + role check) | ✅ | ✅ Generic messages | Clean |
| **process-reminders** | ❌ **No CORS** | ❌ **No auth** — comment says "rely on cron" | ✅ | ❌ Leaks `error.message` in 500 | **H7** |
| **proposal-composer** | ✅ ALLOWED_ORIGIN | ✅ (JWT validated) | ✅ | ⚠️ Leaks `error.message` | M7 |
| **proposal-context-engine** | ✅ ALLOWED_ORIGIN | ✅ (JWT validated) | ✅ | ⚠️ Leaks `error.message` | M8, H8 |
| **proposal-copy-generator** | ✅ ALLOWED_ORIGIN | ✅ (JWT validated) | ✅ | ⚠️ Leaks `error.message` | M9 |
| **proposal-share** | ✅ ALLOWED_ORIGIN | ✅ (HMAC token validation, timing-safe) | ✅ | ✅ Generic errors | Clean |
| **proposal-share-link** | ✅ ALLOWED_ORIGIN | ✅ (JWT + RLS on proposal_versions) | ✅ | ✅ Generic errors | Clean |
| **proposal-storage-intent** | ✅ ALLOWED_ORIGIN | ✅ (JWT validated) | ✅ | ⚠️ Leaks `error.message` in 500 | M10 |
| **reports-dashboard** | ✅ ALLOWED_ORIGIN | ✅ (JWT validated) | ✅ | ⚠️ Leaks `error.message` in 500 | M11 |
| **reports-export** | ✅ ALLOWED_ORIGIN | ✅ (JWT validated) | ✅ | ❌ Leaks `error.message` as 400 | M12 |
| **storage-intent** | ✅ ALLOWED_ORIGIN | ✅ (JWT + org membership) | ✅ | ⚠️ Leaks `error.message` as 400 | M13 |
| **whatsapp-connect** | ✅ ALLOWED_ORIGIN | ✅ (JWT + org membership + role) | ✅ | ⚠️ Throws raw error messages | M14 |
| **whatsapp-webhook** | ✅ ALLOWED_ORIGIN | ✅ (timing-safe HMAC secret, rate limiter, body size limit) | ✅ | ⚠️ Leaks `error.message` in 400 | M15 |

---

### 6.2 HIGH Severity Edge Function Issues

#### H3 — `ai-reporter`: No auth, no CORS, no error handling, no org scoping
- **No CORS headers** at all — no `corsHeaders` object defined.
- **No auth validation** — any caller can invoke it.
- **No try/catch** — unhandled errors crash the function.
- **No org_id filtering** — queries `leads`, `messages` globally (no `user_id` or `org_id` filter on some queries).
- **Leaks OpenAI API key** — reads `openai_api_key` from `ai_settings` table, which is queried without any auth scope.
- **Uses deprecated OpenAI SDK v3** (`openai@3.1.0`).
- **Fix:** Complete rewrite needed. Add CORS, auth check, org scoping, try/catch, generic error messages.

#### H4 — `evolution-api`: No auth — anyone can send WhatsApp messages
- **No authentication whatsoever.** The handler at the bottom accepts any JSON with `action` field and executes it: `createInstance`, `sendMessage`, `deleteInstance`, etc.
- This function appears legacy (superseded by `evolution-proxy` which has full auth). If it's still deployed, it's a critical auth bypass.
- **Fix:** Either delete/undeploy this function or add auth validation matching `evolution-proxy`.

#### H5 — `media-resolver`: No auth
- Accepts any POST with `instanceName`, `waMessageId`, etc. and writes to storage & DB.
- No JWT check, no service-role check, no webhook secret check.
- Leaks raw `error.message` in 500 responses.
- **Fix:** Add auth check (service-role or internal API key since this is called from webhook handlers).

#### H6 — `meta-oauth`: No auth, hardcoded dev user
- Line in handler: `const userId = 'dev-user-test'`
- This is clearly a dev placeholder. Any unauthenticated caller can trigger a Meta OAuth flow that would be associated with `dev-user-test`.
- **Fix:** Port the auth pattern from `google-oauth` (JWT validation before generating OAuth URL).

#### H7 — `process-reminders`: No auth, no CORS
- No CORS headers in responses (only defined but `serve` is used without them in error path).
- No auth — comment says "rely on Supabase Cron executing this internally" but if the function URL is publicly accessible, anyone can trigger reminder processing.
- Leaks raw `error.message` in 500 body.
- **Fix:** Add service-role or internal API key check. Return generic error messages.

#### H1 — `ai-digest-worker`: No auth (internal function)
- Uses `SUPABASE_SERVICE_ROLE_KEY` directly and has no caller auth check.
- Acceptable IF the function is only invoked by cron. But if publicly accessible, any caller can trigger digest processing for all orgs.
- Leaks error details in the `ai_digest_runs` table and response.
- **Fix:** Add service-role bearer check or internal key.

#### H2 — `ai-pipeline-agent`: No auth (internal function)
- Uses service_role, invoked by `whatsapp-webhook`. No direct caller auth.
- Acceptable as internal-only, but if publicly reachable, any caller can trigger AI processing for any lead.
- **Fix:** Add internal API key / service-role bearer validation.

#### H8 — `proposal-context-engine`: org_id derived from user_metadata (bypassable)
- Line ~148: `const orgId = (user.user_metadata as any)?.org_id || user.id;`
- `user_metadata` is *client-writable* in Supabase. An attacker can set `user_metadata.org_id` to any org's UUID and access their data.
- The fallback to `user.id` as org_id is also incorrect — user UUIDs are not org UUIDs.
- **Fix:** Resolve `orgId` via `organization_members` table (server-side lookup) like `org-admin` and `kb-ingest` do.

---

### 6.3 MEDIUM Severity Edge Function Issues

| # | Function | Issue |
|---|----------|-------|
| M1 | **google-callback** | Leaks `error.message` (including potential secrets from token exchange) in redirect URL query string. Should use generic "connection failed" message. |
| M2 | **google-oauth** | Catch block returns `details: error.message` in 500 response. Could leak internal config errors. |
| M3 | **integration-disconnect** | Returns `error.message` as 400. For `deleteError` from Supabase, this could leak table/column names. |
| M4 | **kb-ingest** | Returns `error.message` in 500 catch. Non-critical since auth-gated, but should sanitize. |
| M5 | **meta-callback** | Same as M1 — leaks `error.message` in redirect URL. |
| M6 | **meta-webhook** | Verify tokens in plain-text array, not timing-safe comparison. `VALID_VERIFY_TOKENS` uses `Array.includes()` which is not constant-time. Also leaks `error.message` in POST 200 response body. |
| M7 | **proposal-composer** | Returns `error.message` in 500 response. |
| M8 | **proposal-context-engine** | Returns `error.message` in 500. Also, lead ownership validated via `leadRow.user_id !== user.id` — this is user-scoped, not org-scoped. A team member in the same org cannot access their colleague's leads even if `can_view_team_leads` is true. |
| M9 | **proposal-copy-generator** | Returns `error.message` in 500. Same user-only lead ownership issue as M8. |
| M10 | **proposal-storage-intent** | Returns `error.message` in 500 catch. |
| M11 | **reports-dashboard** | Returns `error.message` in 500 catch. Queries scoped by `user_id` only — not org-aware. |
| M12 | **reports-export** | Returns `error.message` as 400. Same user_id-only scoping as M11. |
| M13 | **storage-intent** | Returns `error.message` as 400. |
| M14 | **whatsapp-connect** | Error handling uses raw `throw new Error(...)` with descriptive messages that surface to client. Evolution API error text is passed through: `Falha ao criar instância na API: ${errText}`. |
| M15 | **whatsapp-webhook** | Catch at end returns `error.message` in 400 body. Could leak internal DB/Evolution error details. |

---

## 7. Priority Fix Recommendations

### Immediate (Sprint 7 — P0/P1)

1. **Delete or auth-gate `evolution-api`** — Critical auth bypass (H4)
2. **Fix `meta-oauth` hardcoded dev user** — Replace with JWT-validated user (H6)
3. **Add auth to `media-resolver`** — Service-role or internal key (H5)
4. **Add auth to `process-reminders`** — Service-role check (H7)
5. **Fix `proposal-context-engine` org_id resolution** — Use `organization_members` lookup, not `user_metadata` (H8)
6. **Rewrite `ai-reporter`** — Full CORS/auth/error/org-scope rewrite or undeploy (H3)
7. **Add auth gates to `ai-digest-worker` and `ai-pipeline-agent`** — Internal key or service-role bearer check (H1, H2)
8. **Fix `AuthContext.tsx`** — Replace `getSession()` with `getUser()` for initial load (A1)

### Next batch (Sprint 7 — P1/P2)

9. **Sanitize all error responses** — Replace `error.message` with generic messages across all 15+ functions flagged (M1–M15)
10. **Fix `meta-webhook` verify token to use timing-safe comparison** (M6)
11. **Whitelist keys in `useNotificationSettings.updateSettings`** (N1)
12. **Add HTML-escape to `proposalPersonalization.ts` output** for strings derived from user input (PP1)
13. **Validate `ProposalMetrics` numeric fields** for NaN/negative (PP2)

---

*Generated by automated audit — 2026-02-24*
