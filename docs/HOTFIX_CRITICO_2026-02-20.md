# Hotfix Critico - 2026-02-20

## Escopo tratado
- Regressao no envio WhatsApp (`Failed to send a request to the Edge Function` / `non-2xx`).
- Falha na listagem de propostas (`Nao foi possivel listar as propostas`).
- Regressao de texto corrompido (mojibake) em telas criticas.
- Falha potencial de webhook legado quando a rota canonica nao esta deployada.

## Arquivos alterados
1. `src/lib/evolutionApi.ts`
2. `src/hooks/useUserWhatsAppInstances.ts`
3. `src/components/solarzap/ProposalsView.tsx`
4. `src/components/solarzap/ContactsView.tsx`
5. `supabase/functions/evolution-proxy/index.ts`
6. `supabase/functions/whatsapp-connect/index.ts`
7. `supabase/functions/evolution-webhook/index.ts`
8. `scripts/smoke_regression_hotfix.mjs`
9. `scripts/smoke_proposals_rpc_live.mjs`
10. `scripts/smoke_whatsapp_webhook_live.mjs`
11. `supabase/migrations/20260220120000_proposals_rpc_contracts.sql`

## Publicado em producao
- Edge Functions deployadas no projeto `ucwmcmdwbvrwotuzlmxh`:
  - `evolution-webhook`
  - `whatsapp-webhook`
  - `evolution-proxy`
  - `whatsapp-connect`
  - `notification-worker`
  - `ai-digest-worker`
- Migration aplicada no banco:
  - `supabase/migrations/20260220120000_proposals_rpc_contracts.sql`
  - Cria/atualiza RPCs: `list_proposals` e `get_lead_proposals`

## Correcoes aplicadas

### 1) WhatsApp - fallback resiliente quando `evolution-proxy` falha
- `src/lib/evolutionApi.ts`:
  - `shouldTryFallback(...)` ampliado para capturar erro HTTP de Edge Function (ex.: `Edge Function returned a non-2xx status code`), alem de falha de rede.
  - fallback mantido para `evolution-api` e `whatsapp-connect`.
- Efeito: quando o proxy nao esta deployado/saudavel, o envio continua via endpoint legado.

### 2) Webhook legado resiliente
- `supabase/functions/evolution-webhook/index.ts`:
  - substituido para processar webhook diretamente (mesma logica do handler canonico), sem dependencia de forward para `whatsapp-webhook`.
- Efeito: rota legada continua operacional mesmo sem rota canonica.

### 3) Propostas - fallback quando RPC nao existe
- `src/components/solarzap/ProposalsView.tsx`:
  - fallback de leitura via `proposal_versions` + `leads` + `propostas` quando `list_proposals` falha.
- `src/components/solarzap/ContactsView.tsx`:
  - fallback de leitura para propostas do lead quando `get_lead_proposals` falha.
- Efeito: tela de propostas continua funcional sem depender apenas das RPCs novas.

### 4) Webhook URL com resolucao canonica/legada
- `src/hooks/useUserWhatsAppInstances.ts`, `supabase/functions/evolution-proxy/index.ts`, `supabase/functions/whatsapp-connect/index.ts`:
  - resolucao de webhook prioriza `whatsapp-webhook` e cai para `evolution-webhook` quando necessario.

### 5) Varredura de texto corrompido
- Arquivos criticos revisados (Automacoes, Banco de Dados, Chat/WhatsApp hooks).
- Scanner de regressao incluido no smoke (`mojibake scan critical UI`).

## Smoke tests executados

### Build
Comando:
```bash
npm run build
```
Resultado:
- PASS (build concluido com sucesso).

### Smoke de regressao (novo)
Comando:
```bash
SMOKE_USER_EMAIL=<email> SMOKE_USER_PASSWORD=<senha> node scripts/smoke_regression_hotfix.mjs
```
Resultado final:
- PASSED with 1 warning

Saida resumida:
- PASS `evolution-proxy` reachable (200).
- PASS `whatsapp-webhook` reachable (200).
- PASS `evolution-webhook` reachable (200).
- PASS `evolution-api` reachable (200).
- PASS `whatsapp-connect` reachable (200).
- PASS `evolution-webhook` POST handler ativo (401 = rota viva com protecao/secret).
- PASS `legacy evolution-api fetchInstances` (instances=2).
- PASS `proxy evolution-proxy instance-fetch`.
- PASS `proxy evolution-proxy instance-status` (usuario autenticado).
- PASS `list_proposals` rpc.
- WARN smoke `get_lead_proposals` sem lead de amostra no script generico.
- PASS varredura de mojibake em arquivos criticos.

### Smoke RPC de propostas (dados temporarios)
Comando:
```bash
node scripts/smoke_proposals_rpc_live.mjs
```
Resultado:
- PASS em `list_proposals`
- PASS em `get_lead_proposals`
- Cleanup automatico dos dados de teste

### Smoke webhook WhatsApp (replay real controlado)
Comando:
```bash
node scripts/smoke_whatsapp_webhook_live.mjs
```
Resultado:
- PASS em POST da rota canonica `whatsapp-webhook`
- PASS em persistencia de `whatsapp_webhook_events`
- PASS em persistencia de `interacoes`
- Cleanup automatico da interacao/lead de teste

## Diagnostico de ambiente
- Rotas novas e RPCs criticas foram publicadas.
- Compatibilidade retroativa continua ativa (fallback frontend) para reduzir risco de regressao.

## Acoes recomendadas apos hotfix
1. Reexecutar `node scripts/smoke_regression_hotfix.mjs` apos cada deploy de function.
2. Reexecutar `node scripts/smoke_proposals_rpc_live.mjs` apos alteracoes em propostas.
3. Remover credenciais expostas em mensagens e rotacionar chaves sensiveis.
