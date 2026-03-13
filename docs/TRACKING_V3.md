# Tracking v3

## Visao geral
O subsistema v3 cobre:
- atribuicao de origem (UTM/click-id/CTWA/trigger message)
- roteamento de conversoes por mudanca de etapa (stage -> event -> deliveries)
- dispatcher com retry, lock e cron
- webhook publico de atribuicao + snippet universal

Tudo nasce com `tracking_enabled=false` por org para rollout seguro.

## Tabelas principais
- `lead_attribution`
- `attribution_touchpoints`
- `conversion_events`
- `conversion_deliveries`
- `ad_platform_credentials`
- `org_tracking_settings`
- `ad_trigger_messages`

## Configuracao por org (rollout seguro)
1. Abra `Integracoes -> Tracking & Conversoes`.
2. Gere `webhook_public_key` (header `x-szap-org-key`).
3. Configure credenciais de plataforma:
   - metadados em `ad_platform_credentials`
   - segredos no `vault.secrets` (via edge function `tracking-credentials`)
4. Defina `stage_event_map` (ou mantenha default).
5. Teste conexoes (Meta/Google/GA4).
6. Habilite plataformas (`meta_capi_enabled`, `google_ads_enabled`, `ga4_enabled`).
7. Ative `tracking_enabled=true` apenas quando validado.

## Webhook publico de atribuicao
- endpoint: `POST /functions/v1/attribution-webhook`
- auth: header `x-szap-org-key`
- aceita `application/json`, `multipart/form-data` e `application/x-www-form-urlencoded`
- anti-spam:
  - honeypot: `_szap_honeypot`
  - rate limit por org (`rate_limit_per_minute`, default 60/min)
  - blocklist de IP/telefone em `org_tracking_settings`
  - reCAPTCHA opcional (`recaptcha_enabled`)

## Snippet universal
Arquivo de referencia:
- `docs/landing/solarzap_attribution_snippet.html`

Comportamento:
- re-hidrata `sessionStorage` (`_szap_attr`)
- preserva e atualiza `utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `ttclid`, `msclkid`
- seta sempre `_szap_lp` e `_szap_ref`
- prioriza cookies `_fbc`/`_fbp`
- se `_fbc` ausente e houver `fbclid`, deriva `_szap_fbc = fb.1.<timestamp>.<fbclid>`
- injeta campos hidden em todos os forms no `DOMContentLoaded`

## Router e dispatcher
- trigger de etapa: `tr_lead_stage_change_v2`
- cria `conversion_events` idempotentes (chave SHA-256 deterministica)
- cria `conversion_deliveries` por plataforma habilitada
- claim concorrente: `FOR UPDATE SKIP LOCKED` (RPC `tracking_claim_delivery_batch`)
- stale guard: `processing` com `updated_at < now()-3min` volta para `pending`
- backoff de retry: `30s -> 1m -> 5m -> 30m -> 1h` (max 5)
- cron:
  - worker: `30 seconds` (fallback `1 minute`)
  - stale guard: `*/5 * * * *`

## Regras de plataforma
- Google click-id: prioridade `gclid > gbraid > wbraid`; sem click-id => `skipped(no_click_id)`
- Meta dedupe: `event_id = <conversion_event_id>:meta`
- GA4: envio via Measurement Protocol com `lead_id`, `crm_stage`, `value/currency` quando houver

## Debug mode
- Meta: preencher `meta_test_event_code`
- Google:
  - por org: `org_tracking_settings.google_validate_only=true`
  - por chamada: `POST /functions/v1/conversion-dispatcher?validate_only=1`
- GA4:
  - teste de credencial usa endpoint debug (`/debug/mp/collect`) na funcao `tracking-credentials`
  - envio real usa endpoint padrao (`/mp/collect`)

## Backfill manual (nao automatico)
Use:
- `docs/sql/tracking_v3_backfill.sql`

Esse script:
- cria `org_tracking_settings` ausentes com defaults seguros
- oferece update opcional de `leads.canal` apenas quando `channel_is_inferred=true`
