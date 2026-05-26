# Análise do Sistema de Trackeamento SolarZap
Data: 2026-05-19  
Escopo: análise técnica e de usabilidade baseada no código atual do repositório.

## 1) Visão técnica (como funciona ponta a ponta)

### 1.1 Entrada de dados (ingestão de tracking)
- Entrada pública principal: `supabase/functions/attribution-webhook/index.ts`.
- Autenticação do webhook: header `x-szap-org-key` (chave pública por organização, salva em `org_tracking_settings.webhook_public_key`).
- Pipeline de proteção no webhook:
  - Rate limit por org (`tracking_consume_webhook_rate_limit`).
  - Honeypot (`_szap_honeypot`).
  - Blocklist de IP/telefone (`blocklist_ips`, `blocklist_phones`).
  - reCAPTCHA opcional (`recaptcha_enabled` + secret no Vault).
- Normalização de payload:
  - Aceita JSON, form-data e x-www-form-urlencoded.
  - Normaliza telefone para formato E.164 BR (`55...`).
  - Extrai UTMs/click IDs + metadados de sessão.

### 1.2 Resolução de lead e atribuição
- Se lead não existe, cria/resolve via `resolveLeadCanonicalId` (`supabase/functions/_shared/leadCanonical.ts`).
- Atribuição roda em `applyLeadAttribution` (`supabase/functions/_shared/trackingAttribution.ts`):
  - Salva/atualiza `lead_attribution` (UTM, click IDs, hashes, sessão, referrer, etc).
  - Salva histórico em `attribution_touchpoints` com fingerprint deduplicado.
  - Pode atualizar `leads.canal` conforme regras de inferência.
- Inferência de canal prioriza:
  1. CTWA (dados WhatsApp ads), 2) gatilho textual, 3) UTM/click IDs.

### 1.3 Tracking também pelo WhatsApp
- `supabase/functions/whatsapp-webhook/index.ts` também chama `applyLeadAttribution`.
- Isso permite atribuir origem mesmo quando lead entra por conversa WhatsApp.

### 1.4 Conversão por mudança de etapa CRM
- Trigger SQL central: `public.tr_lead_stage_change_v2()` (migration `20260406143000...`).
- Dispara em `UPDATE status_pipeline` da tabela `public.leads`.
- Fluxo:
  - Normaliza etapa.
  - Lê `org_tracking_settings` da org.
  - Só continua se `tracking_enabled = true`.
  - Cria `conversion_events` com idempotência (`idempotency_key` SHA-256).
  - Enfileira `conversion_deliveries` por plataforma habilitada (`meta`, `google_ads`, `ga4`).

### 1.5 Fila e dispatcher
- Worker: `supabase/functions/conversion-dispatcher/index.ts`.
- Claim concorrente de jobs: `tracking_claim_delivery_batch()` com `FOR UPDATE SKIP LOCKED`.
- Requeue de travados: `tracking_requeue_stale_deliveries()` (>3 min em `processing`).
- Retry/backoff: 30s, 60s, 300s, 1800s, 3600s (até `max_attempts`).
- Envio real:
  - Meta CAPI (`graph.facebook.com/{pixel}/events`).
  - Google Ads offline conversion (`uploadClickConversions`).
  - GA4 Measurement Protocol (`/mp/collect`).

### 1.6 Gestão de credenciais
- Função de controle: `supabase/functions/tracking-credentials/index.ts`.
- Segredos guardados no Supabase Vault.
- Google Ads com OAuth dedicado (`google-ads-oauth` + `google-ads-callback`), refresh token no Vault.
- Validação de permissão por membership de organização + token de usuário.

### 1.7 Modelo de dados principal
- Base tracking v3 (`20260304170000_tracking_v3_schema.sql`):
  - `org_tracking_settings`
  - `ad_platform_credentials`
  - `ad_trigger_messages`
  - `lead_attribution`
  - `attribution_touchpoints`
  - `conversion_events`
  - `conversion_deliveries`

## 2) Usabilidade (UX atual)

### 2.1 Pontos fortes
- Tela de Tracking organizada em 3 abas (`Configuração`, `Regras`, `Monitoramento`) em `TrackingView.tsx`.
- Onboarding de integração por passos claros (gerar chave, copiar endpoint, configurar header, opcional snippet).
- Mensagens de erro de Google Ads melhoradas (mapa de erros).
- Status visual por plataforma (conectado/incompleto/desativado).
- Monitoramento da fila com métricas rápidas (enviados/pendentes/falhos/ignorados).
- Layout mobile com fallback para cards e tabelas com scroll.

### 2.2 Fricções de UX
- Toggle `Auto-atribuição` comunica “controle global”, mas no backend ele só desliga gatilho textual; inferência por UTM/click ID continua.
- Coluna “Evento Google Ads” no mapeamento sugere evento por etapa, mas no envio Google Ads o que manda é 1 `conversion_action_id` escolhido na plataforma; nome mapeado vira só rótulo interno/orderId.
- Checklist de ativação é estado local de tela (não persiste entre sessões).
- Recursos de segurança do webhook (reCAPTCHA/blocklist) existem no backend, mas sem UI dedicada na tela de Tracking.
- Script de snippet injeta campos no `DOMContentLoaded`; formulários montados dinamicamente depois disso podem não receber hidden fields automaticamente.

## 3) Riscos técnicos e operacionais

### 3.1 Segurança
- Migration `20260304212000_tracking_v3_dispatcher_cron.sql` contém URL de projeto e token bearer hardcoded para cron HTTP.
  - Mesmo sendo histórico de migration, é superfície de risco e de governança de segredo.
- `verify_jwt = false` em funções de tracking é intencional, mas aumenta dependência de controles internos corretos (header key, membership, CORS, token service).
- Chave pública de webhook funciona como segredo de integração; se vazar, endpoint pode ser abusado até rate limit/bloqueios.

### 3.2 Consistência de regra
- Há múltiplas fontes de “default stage map” (frontend, SQL, shared fn), com histórico de mudanças de pipeline; risco de confusão operacional se não houver governança única.

### 3.3 Confiabilidade funcional
- Idempotência por `(org, lead, stage, event_key)` evita duplicidade, mas também impede múltiplas conversões legítimas na mesma etapa para o mesmo lead sem mudança de `event_key`.

## 4) Prioridades recomendadas

### P0 (imediato)
- Remover estratégia de token hardcoded em migration de cron e rotacionar segredos relacionados.
- Formalizar política de segredo para chamadas internas de Edge Functions (Vault/internal key com rotação).

### P1 (alto impacto de UX/verdade funcional)
- Ajustar semântica do toggle `Auto-atribuição`:
  - ou realmente desligar inferência UTM/click no backend,
  - ou mudar texto de UI para refletir comportamento real.
- Reetiquetar mapeamento Google Ads para não prometer “evento por etapa” quando envio usa `conversion_action` único.
- Expor no UI configurações de reCAPTCHA e blocklists (já suportadas no backend).

### P2 (melhoria contínua)
- Persistir progresso/checklist de ativação por org.
- Evoluir snippet para suportar formulários dinâmicos (observer/injeção sob demanda).
- Criar painel de “último teste ponta a ponta” por plataforma (não só teste de credencial).

## 5) Conclusão
- Sistema de tracking do SolarZap é tecnicamente robusto na base (ingestão, atribuição, dedupe, fila, retry, dispatch multi-plataforma, RLS e Vault).
- Maior gap hoje está em alinhamento fino entre o que a UI promete e o que o backend executa em alguns pontos críticos (auto-atribuição e evento Google Ads por etapa), além de governança de segredo em migration de cron.
