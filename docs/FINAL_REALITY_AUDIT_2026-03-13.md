# SolarZap - Auditoria Final Ancorada no Codigo (2026-03-13)

## Escopo
- Auditoria feita sobre o repositorio atual em `c:\Users\rosen\Downloads\solarzap-conversa-main`.
- Comparacao entre o estado real do codigo, os planos antigos e o lote de funcionalidades citado pelo time.
- Gates locais executados nesta revisao:
  - `npm run typecheck` -> OK
  - `npm run build` -> OK

## Conclusao executiva
O software esta muito mais avancado do que os planos antigos descreviam. O lote novo existe de verdade no codigo, mas nem tudo esta fechado a nivel de comportamento, cobertura e prontidao para producao.

Leitura objetiva:
- `staging`: coerente com o lote entregue
- `producao`: ainda nao
- `plan.md` antigo: obsoleto
- `PLAN.FINAL.md` antigo: obsoleto

## O que esta confirmado como certo

### 1. Reacoes em mensagens
Status: implementado e funcional no fluxo principal.

Evidencias:
- `src/hooks/domain/useChat.ts`
- `src/components/solarzap/ChatArea.tsx`
- `src/components/solarzap/SolarZapLayout.tsx`
- `supabase/functions/whatsapp-connect/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts`

Validacao:
- envio sai do frontend e passa pela edge function;
- `remoteJid` e normalizado antes do envio;
- a reacao local do proprio usuario substitui a anterior em vez de duplicar;
- reacoes inbound tambem sao persistidas no webhook.

Gap restante:
- nao existe regressao automatizada dedicada cobrindo envio, substituicao e edge cases de reacao.

### 2. Calendario com muitos eventos no mesmo dia
Status: implementado e coerente.

Evidencias:
- `src/components/solarzap/CalendarView.tsx`

Validacao:
- a celula do dia exibe ate 4 eventos;
- overflow vira `+N mais`;
- o grid deixa de explodir visualmente quando o dia fica denso.

Gap restante:
- nao existe teste automatizado especifico para dia superlotado.

### 3. Bloqueio por pagamento via popup nas funcoes governadas
Status: implementado, mas o comportamento real e mais especifico do que o discurso simplificado.

Evidencias:
- `src/components/ProtectedRoute.tsx`
- `src/contexts/BillingBlockerContext.tsx`
- `src/components/billing/BillingBlockerDialog.tsx`
- `src/lib/billingBlocker.ts`
- `tests/e2e/billing-gating-access-states.spec.ts`

Validacao:
- limites, soft walls e acoes governadas agora abrem dialogo com CTA direto para upgrade, pagamento ou compra de pack;
- `past_due` em janela de graca permanece em `read_only` e bloqueia por acao;
- tracking e outros recursos bloqueados por plano usam soft wall + popup.

Nuance obrigatoria:
- `pending_checkout` ainda redireciona para `BillingSetupWizard`;
- `blocked/unpaid` ainda usam tela dura de bloqueio (`SubscriptionRequiredScreen`).

Conclusao:
- o popup substituiu o bloqueio global apenas nas acoes governadas e nos estados de uso limitados;
- ele nao substituiu todos os bloqueios do produto.

### 4. Agente Assistente Geral / Agente de Apoio Global
Status: implementado.

Evidencias:
- `src/components/solarzap/AIAgentsView.tsx`
- `src/constants/aiPipelinePdfPrompts.ts`
- `supabase/functions/ai-pipeline-agent/index.ts`

Validacao:
- existe card dedicado na UI;
- existe toggle de ativacao;
- existe edicao de prompt;
- o runtime usa `assistente_geral` quando a etapa atual nao tem agente especifico;
- se nao houver prompt persistido, existe fallback hardcoded no backend.

Gap restante:
- nao encontrei E2E positiva dedicada para editar o prompt do agente global e validar o fallback em execucao.

### 5. Criacao de conta e onboarding
Status: expandido e funcional, mas nao preenche literalmente todos os campos opcionais do banco.

Evidencias:
- `src/pages/Login.tsx`
- `src/contexts/AuthContext.tsx`
- `supabase/functions/org-admin/index.ts`
- `src/pages/Onboarding.tsx`
- `src/components/billing/BillingSetupWizard.tsx`

Validacao:
- signup tem tratamento melhor de confirmacao, reenvio e plan hint;
- `bootstrap_self` garante org + membership + estado inicial comercial;
- onboarding preenche nome do usuario, `company_profile` essencial, branding, WhatsApp, IA, automacoes, notificacoes e `onboarding_progress`.

Nuance obrigatoria:
- isso nao equivale a "preencher todos os campos do banco";
- `company_profile` tem mais campos estruturados do que o onboarding captura hoje.

Leitura correta:
- o fluxo atual preenche os campos essenciais para primeira operacao;
- campos avancados continuam sendo completados depois em `Minha Empresa`.

### 6. Tour guiado basico
Status: implementado, mas ainda nao fechado.

Evidencias:
- `supabase/migrations/20260312151000_guided_tour_v2.sql`
- `src/hooks/useGuidedTour.ts`
- `src/hooks/useOnboardingProgress.ts`
- `src/components/onboarding/GuidedTour.tsx`
- `src/components/onboarding/tourSteps.ts`
- `src/components/solarzap/SolarZapLayout.tsx`
- `src/components/solarzap/SolarZapNav.tsx`

O que esta certo:
- existe persistencia dedicada no banco;
- existe CTA manual no logo lateral;
- existe overlay/spotlight real;
- o estado esta integrado ao app principal e ao onboarding progress.

O que esta errado ou incompleto:
- `high`: o auto-tour nao persiste corretamente `dismissed/completed` quando o usuario entra pelo welcome automatico, porque `SolarZapLayout` chama `guidedTour.startTour('manual')` tambem nesse caminho. Na pratica, o replay automatico pode reaparecer em sessoes futuras.
- `medium`: `fallbackSelector` e `waitForMs` existem no contrato dos passos, mas `GuidedTour.tsx` so usa `step.target`. O passo inicial nao honra fallback para empty state.
- `medium`: nao existe E2E positiva cobrindo primeiro autoplay, replay manual, persistencia de `skip/complete` e isolamento multi-org.

### 7. Barra lateral verde / navegacao
Status: implementado e coerente.

Evidencias:
- `src/components/solarzap/SolarZapNav.tsx`
- `src/index.css`

Validacao:
- barra lateral compacta com identidade visual consistente;
- logo virou atalho do tour;
- badge de plano aparece no rail;
- menu de configuracoes esta mais limpo e centralizado.

Gap restante:
- nao encontrei problema funcional material nessa area durante a auditoria.

## Fundacoes que os planos antigos ainda tratavam como pendentes, mas ja estao entregues
- `broadcast-worker` backend com claim/retry/backoff;
- persistencia de `automation_settings` por org;
- pipeline de status de KB (`pending/processing/ready/error`), ainda que o disparo continue direto da UI;
- remocao operacional de `openai_api_key` da tabela;
- health scan operacional estendido e runbooks de staging;
- backup/restore drill em staging;
- code-splitting real por rotas e views principais;
- E2E de billing/gating e smoke mobile critico.

## Bloqueios reais que ainda impedem producao

### 1. Auth de invocacao ausente em funcoes criticas
Status: aberto.

Evidencias:
- `supabase/functions/process-agent-jobs/index.ts`
- `supabase/functions/ai-pipeline-agent/index.ts`
- `supabase/functions/_shared/cors.ts`

Leitura:
- `process-agent-jobs` continua aceitando requisicao sem gate explicito de auth/secret antes de subir client com `service_role`;
- `ai-pipeline-agent` continua sem gate explicito de auth/secret de invocacao;
- `resolveRequestCors()` ainda considera request sem `Origin` como permitido.

Conclusao:
- para producao, isso segue sendo bloqueio P0.

### 2. Performance ainda nao esta formalmente fechada
Status: parcialmente resolvido.

Evidencias do build atual:
- code-splitting existe e varias views sairam do bundle principal;
- ainda restam chunks grandes:
  - `dist/assets/Index-C6ktJ4e5.js` -> `1,826.60 kB`
  - `dist/assets/index-CklYD0yE.js` -> `611.96 kB`

Conclusao:
- houve melhora real;
- o gate final de performance ainda nao pode ser tratado como encerrado.

### 3. KB continua com semantica de "background" incompleta
Status: aberto para producao.

Evidencias:
- `src/components/solarzap/KnowledgeBaseView.tsx`
- `supabase/functions/kb-ingest/index.ts`

Leitura:
- a UI ainda invoca `kb-ingest` diretamente apos upload;
- nao encontrei worker dedicado nem retry autonomo para itens `pending/error`.

Conclusao:
- para staging o happy path existe;
- para producao, a promessa de pipeline realmente autonomo ainda esta incompleta.

## Lacunas de teste do lote atual
- sem suite dedicada para reacoes;
- sem suite dedicada para dia superlotado no calendario;
- sem suite positiva dedicada para guided tour;
- sem suite positiva focada no Agente de Apoio Global;
- billing blocker esta melhor coberto do que as demais features novas.

## Veredito tecnico
- o lote novo nao foi "fantasia de documento"; ele esta majoritariamente implementado;
- os planos antigos estavam descrevendo um software anterior;
- o produto hoje deve ser descrito como `staging validado com pendencias objetivas para producao`.

## Arquivos que passam a ser a referencia de planejamento
- `c:\Users\rosen\AppData\Roaming\Code\User\workspaceStorage\1dc91694cc7beb8211a15cf338f54fd4\GitHub.copilot-chat\memory-tool\memories\OTlkNDk3YzAtMTcwZC00NDFlLTg5N2MtOWZiNTVkMDRmNjJm\plan.md`
- `c:\Users\rosen\Downloads\solarzap-conversa-main\PLAN.FINAL.md`

## Proxima referencia operacional
Este arquivo serve como ancora tecnica. O blueprint definitivo de fechamento esta no `plan.md` atualizado, e o plano executivo de entrega esta no `PLAN.FINAL.md` atualizado.
