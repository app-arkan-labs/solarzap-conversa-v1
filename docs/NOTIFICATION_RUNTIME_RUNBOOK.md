# Notification Runtime Runbook

## Objetivo
Garantir que as notificações externas (WhatsApp e e-mail) continuem operando sem falha silenciosa por drift de cron/autenticação.

## Escopo
- `notification-worker`
- `ai-digest-worker`
- `evolution-proxy` (chamada interna)
- Jobs `pg_cron` de notificação

## Pré-requisitos
- `SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN` (Management API)
- `SUPABASE_SERVICE_ROLE_KEY`
- `EDGE_INTERNAL_API_KEY`

## 1. Validação rápida de cron
Execute no SQL editor (ou via Management API):

```sql
select jobid, jobname, schedule, active, command
from cron.job
where jobname in (
  'invoke-notification-worker',
  'invoke-ai-digest-worker',
  'invoke-notification-health-scan'
)
order by jobname;
```

Verifique:
- `invoke-notification-worker` em `*/2 * * * *`
- `invoke-ai-digest-worker` em `*/15 * * * *`
- `invoke-notification-health-scan` em `*/5 * * * *`
- `command` contendo `Authorization` e `x-internal-api-key` para os workers HTTP.

## 2. Validar respostas do cron
```sql
select id, status_code, created, content, error_msg
from net._http_response
order by created desc
limit 100;
```

Sinais de problema:
- `401` com `Missing authorization header`
- Alta recorrência de `401/403` nas últimas janelas.

## 3. Validar fila de eventos
```sql
select status, count(*) as total
from public.notification_events
group by status
order by total desc;
```

Backlog suspeito:
```sql
select id, org_id, event_type, status, attempts, next_attempt_at, locked_at, created_at
from public.notification_events
where status = 'pending'
  and coalesce(next_attempt_at, created_at) <= now() - interval '15 minutes'
order by created_at asc
limit 200;
```

## 4. Validar alertas operacionais
```sql
select *
from public.notification_runtime_health_latest
order by alert_type;
```

Histórico:
```sql
select id, dedupe_key, severity, alert_type, details, created_at, resolved_at
from public.notification_runtime_alerts
order by created_at desc
limit 200;
```

## 5. Recuperação padronizada (sem replay antigo)
Regra de negócio: **não reenfileirar falhas históricas antigas**.

### 5.1 Reconfigurar cron com script idempotente
```powershell
powershell -ExecutionPolicy Bypass -File scripts/ops/reconfigure_notification_cron.ps1
```

### 5.2 Teste manual do worker com service-role
```powershell
$headers = @{
  Authorization = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
  "Content-Type" = "application/json"
}
Invoke-WebRequest -Method POST `
  -Uri "https://$env:SUPABASE_PROJECT_REF.supabase.co/functions/v1/notification-worker" `
  -Headers $headers `
  -Body '{}' `
  -UseBasicParsing
```

## 6. Critérios de normalização
- `net._http_response`: ausência de novos `401 Missing authorization header`.
- `notification_events`: sem acúmulo contínuo de `pending` antigos.
- `notification_runtime_health_latest.open_count = 0` após estabilização.
- `notification_dispatch_logs`: retomada de `success` em e-mail/WhatsApp.

## 7. Rollout pós-correção
1. Deploy de `notification-worker` e `ai-digest-worker`.
2. Aplicar migration `20260301193000_notification_runtime_alerts.sql`.
3. Reconfigurar cron com `scripts/ops/reconfigure_notification_cron.ps1`.
4. Rodar smoke operacional e acompanhar por 24h.
