# Notification Runtime Runbook

## Objetivo
Garantir continuidade das notificacoes externas (WhatsApp e e-mail) sem falha silenciosa por drift de cron, auth ou troca indevida de engine de digest.

## Escopo
- `notification-worker`
- `ai-digest-worker`
- `evolution-proxy` (chamada interna)
- jobs `pg_cron` de notificacao e health scan

## Pre-requisitos
- `SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN` (Management API)
- `SUPABASE_SERVICE_ROLE_KEY`
- `EDGE_INTERNAL_API_KEY`

## 1. Contrato do Digest (obrigatorio)
Todos os canais do digest (WhatsApp, e-mail HTML/texto e comentario diario) devem usar exatamente estas secoes:
- `Resumo`
- `Situacao atual`
- `Acoes recomendadas`

Query rapida para validar conteudo recente salvo no run:
```sql
select id, digest_type, date_bucket, status, summary_text
from public.ai_digest_runs
order by created_at desc
limit 20;
```

Nao deve aparecer no novo conteudo:
- `O que aconteceu`
- `Pendencia`
- `Proximo passo`

## 2. Validacao rapida de cron
```sql
select jobid, jobname, schedule, active, command
from cron.job
where jobname in (
  'invoke-notification-worker',
  'invoke-ai-digest-worker',
  'invoke-notification-health-scan',
  'invoke-ai-reporter'
)
   or command ilike '%/functions/v1/ai-reporter%'
order by jobname;
```

Esperado:
- `invoke-notification-worker` em `*/2 * * * *`
- `invoke-ai-digest-worker` em `*/15 * * * *`
- `invoke-notification-health-scan` em `*/5 * * * *`
- `command` dos workers HTTP contendo `Authorization` e `x-internal-api-key`
- nenhum job ativo apontando para `/functions/v1/ai-reporter`

## 3. Validar respostas do cron
```sql
select id, status_code, created, content, error_msg
from net._http_response
order by created desc
limit 100;
```

Sinais de problema:
- `401` com `Missing authorization header`
- recorrencia alta de `401/403`

## 4. Validar fila de eventos
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

## 5. Validar alertas operacionais
```sql
select *
from public.notification_runtime_health_latest
order by alert_type;
```

Tipos importantes:
- `missing_auth_header`
- `pending_backlog`
- `digest_cron_missing`
- `deprecated_digest_engine_active`

Historico:
```sql
select id, dedupe_key, severity, alert_type, details, created_at, resolved_at
from public.notification_runtime_alerts
order by created_at desc
limit 200;
```

## 6. Recuperacao padronizada (sem replay antigo)
Regra de negocio: **nao reenfileirar falhas historicas antigas**.

### 6.1 Reconfigurar cron com script idempotente
```powershell
powershell -ExecutionPolicy Bypass -File scripts/ops/reconfigure_notification_cron.ps1
```

### 6.2 Teste manual dos workers com service-role
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

Invoke-WebRequest -Method POST `
  -Uri "https://$env:SUPABASE_PROJECT_REF.supabase.co/functions/v1/ai-digest-worker" `
  -Headers $headers `
  -Body '{}' `
  -UseBasicParsing
```

### 6.3 Falha de IA no digest
- O worker faz fallback automatico e mantem o envio no mesmo contrato de 3 secoes.
- Nao pausar cron por indisponibilidade temporaria do provedor de IA.

## 7. Criterios de normalizacao
- sem novos `401 Missing authorization header` em `net._http_response`
- sem acumulacao continua de `pending` antigos em `notification_events`
- `notification_runtime_health_latest.open_count = 0` apos estabilizacao
- sem job ativo apontando para `ai-reporter`
- `notification_dispatch_logs` voltando com `success` em e-mail/WhatsApp

## 8. Rollout pos-correcao
1. Deploy de `notification-worker`, `ai-digest-worker` e `ai-reporter`.
2. Aplicar migrations:
   - `20260301193000_notification_runtime_alerts.sql`
   - `20260302100000_digest_engine_guardrail.sql`
3. Reconfigurar cron com `scripts/ops/reconfigure_notification_cron.ps1`.
4. Rodar smoke operacional.
5. Monitorar `public.notification_runtime_health_latest` por 24h.
