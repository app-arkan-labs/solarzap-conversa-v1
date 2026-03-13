# STAGING Backup and Retention Policy

## Objective
Guarantee controlled recovery in staging with documented retention, drill cadence, and validation evidence.

## Data classes
- `critical`: `organizations`, `organization_members`, billing tables, notification runtime alerts, campaign tables
- `important`: `leads`, `interacoes`, `propostas`, `proposal_versions`, `kb_items`, `kb_item_chunks`
- `ephemeral`: temporary debug artifacts and ad-hoc smoke entities

## Backup schedule
1. Daily logical backup snapshot (full schema + data)
- Frequency: every day
- Retention: 14 days

2. Weekly extended snapshot
- Frequency: once per week
- Retention: 8 weeks

3. Pre-release checkpoint snapshot
- Trigger: before migration batches touching billing, worker queue, or RLS
- Retention: until release closes plus 14 days

## Retention and storage
- Keep backups encrypted at rest.
- Keep at least two independent restore points (daily + weekly).
- Tag every backup with `environment=staging`, `schema_version`, and UTC timestamp.

## Restore drill cadence
- Minimum: once per sprint, before staging sign-off.
- Drill type: controlled restore rehearsal in staging only.
- Evidence required:
  - drill timestamp
  - backup artifact identifier
  - elapsed restore time
  - validation query outputs

## Drill procedure
1. Capture pre-drill fingerprints:

```sql
SELECT now() AS captured_at;
SELECT count(*) FROM public.organizations;
SELECT count(*) FROM public.leads;
SELECT count(*) FROM public.broadcast_campaigns;
SELECT count(*) FROM public.notification_runtime_alerts;
```

2. Execute controlled canary drill script:

```sql
\i scripts/ops/staging_backup_restore_drill.sql
```

3. Validate operational invariants:

```sql
SELECT * FROM public.notification_runtime_health_latest ORDER BY alert_type;
SELECT public.scan_notification_runtime_health();
```

4. Record outcome in release notes with pass/fail and root cause (if failed).

## Acceptance criteria for drill
- Canary row restored with exact payload/hash.
- No data corruption in critical tables.
- Health scan completes successfully.
- No new open critical alert in `notification_runtime_health_latest` caused by the drill.
