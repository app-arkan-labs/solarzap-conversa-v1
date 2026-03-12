# Plano De Acao: IA, Agendamento, Qualificacao E Follow-up

Data: 2026-03-12
Escopo desta etapa: somente analise e plano. Nenhuma alteracao funcional deve ser feita antes da sua revisao.

## Ajustes Apos Revisao Tecnica

- mantido o plano original e aplicadas correcoes incrementais de aderencia ao codigo;
- removida a proposta de duplicar timezone em `company_profile` (reaproveitar `ai_settings.timezone`);
- adicionado diagnostico de pausa automatica por takeover humano (`ai_enabled = false`);
- reforcado gate de qualificacao para call e visit, incluindo contexto de `agente_disparos`;
- refinada estrategia de `no_outbound_action` para priorizar fallback inbound antes de mexer em classificacao global;
- adicionados checkpoints de observabilidade para agendamento (`v9_appointment_written`, `stage_gate_block_reason`) e riscos de execucao E2E em ambiente errado.

## 1. Objetivo

Corrigir de forma cirurgica e incremental os seguintes problemas sem apagar prompts nem redesenhar o sistema:

1. A IA inventa fatos da empresa quando faltam dados estruturados.
2. A IA agenda ligacoes e visitas antes de concluir a qualificacao completa.
3. A IA convida para ligacao fora de horario adequado.
4. A IA para de responder no meio do fluxo mesmo quando o lead continua engajado.
5. Follow-ups e agendamentos automaticos aparentam estar inconsistentes ou inoperantes.
6. A aba de IA nao possui os controles operacionais solicitados para escolher entre ligacao e visita.

Principio de implementacao futura:

- manter a arquitetura atual;
- preservar prompts existentes;
- adicionar guardrails deterministicas em volta do que ja existe;
- preferir novos campos pequenos e reutilizacao do `lead_stage_data` atual;
- validar comportamento com testes e smoke operacional antes de considerar concluido.

## 2. Diagnostico Atual

### 2.1 Dados estruturados da empresa ainda sao insuficientes

Evidencias:

- `company_profile` nasceu com poucos campos textuais em `supabase/migrations/20260204_knowledge_base_v2.sql:9-19`.
- o frontend da aba "Sobre sua Empresa" so grava `company_name`, `elevator_pitch`, `differentials`, `installation_process`, `warranty_info` e `payment_options` em `src/components/solarzap/knowledge-base/SobreEmpresaTab.tsx:9-16` e `src/components/solarzap/knowledge-base/SobreEmpresaTab.tsx:58-66`.
- o agente principal so busca `company_name` de forma estruturada em `supabase/functions/ai-pipeline-agent/index.ts:3365-3373`.

Consequencia:

- quando o lead pergunta "a empresa e localizada onde?", a IA nao tem um campo factual dedicado para responder;
- ela acaba preenchendo a lacuna com inferencia generica ("Brasil"), porque o contexto estruturado e insuficiente.

### 2.2 O protocolo comercial existe no prompt, mas nao esta protegido por travas de runtime

Evidencias:

- o prompt de `respondeu` ja exige BANT minimo antes de visita em `src/constants/aiPipelinePdfPrompts.ts:186-228`;
- o prompt de `agente_disparos` repete a mesma exigencia em `src/constants/aiPipelinePdfPrompts.ts:1451-1547`;
- o fallback deterministico atual, porem, considera quase suficiente ter `tipo_cliente`, `consumo/conta` e `cidade`, e depois ja pergunta se prefere simulacao ou chamada em `supabase/functions/ai-pipeline-agent/index.ts:793-807`;
- o stage gate atual para `chamada_agendada` e `visita_agendada` so verifica se houve `appointment` valido/escrito, nao se a qualificacao foi concluida, em `supabase/functions/ai-pipeline-agent/index.ts:4770-4777`.

Consequencia:

- hoje o sistema depende demais de obediencia do LLM;
- se a resposta escapar do protocolo, nao existe uma trava deterministica suficiente para impedir agendamento precoce.

### 2.3 O controle comercial atual nao cobre o comportamento pedido

Evidencias:

- `AISettings` possui `appointment_window_config` e `follow_up_sequence_config`, mas nao possui toggles de autoagendamento por tipo nem dias minimos por tipo em `src/types/ai.ts:40-61`;
- a aba de IA hoje permite ajustar janela por tipo e cadencia de follow-up em `src/components/solarzap/AIAgentsView.tsx:678-756` e `src/components/solarzap/AIAgentsView.tsx:952-970`;
- existe um `respondeu_flow_mode` no tipo (`with_call` / `direct_visit`), mas a busca por uso em `src/` e `supabase/functions/` nao mostra enforcement real do campo; ele aparece apenas em `src/types/ai.ts:57`.

Consequencia:

- o sistema nao consegue aplicar a regra desejada:
  - ambos ligados: IA escolhe entre ligacao e visita;
  - so ligacao ligada: forcar ligacao;
  - so visita ligada: forcar visita;
  - nenhum ligado: nao agendar automaticamente, prometer retorno.

Correcao de escopo apos validacao do codigo:

- o campo `ai_settings.timezone` ja existe no banco (migracao `20260205_ai_system_refinement.sql`), mas nao esta tipado/exposto adequadamente no frontend;
- portanto, o plano deve priorizar reaproveitar esse campo existente em vez de criar outro timezone paralelo em `company_profile`.

### 2.4 Existe validacao de agenda, mas nao existe politica deterministica de "nao convidar para ligacao apos 18h"

Evidencias:

- os slots respeitam timezone e `appointment_window_config` em `supabase/functions/ai-pipeline-agent/index.ts:3231-3289`;
- o precheck de appointment bloqueia horario passado, fora da janela e conflito em `supabase/functions/ai-pipeline-agent/index.ts:4102-4175`;
- porem o convite conversacional para ligacao ainda e governado pelo prompt/LLM, nao por regra deterministica de horario atual.

Consequencia:

- a IA pode deixar de criar appointment fora da janela, mas ainda assim sugerir ligacao ou puxar CTA inadequado a noite;
- isso bate com o sintoma reportado de convite para ligacao em horario indevido.

### 2.5 O motor de continuidade da conversa pode encerrar sem outbound

Evidencias:

- ha diversos caminhos de `respondNoSend` ligados a debounce, burst e anti-race em `supabase/functions/ai-pipeline-agent/index.ts:2400-2605`, `supabase/functions/ai-pipeline-agent/index.ts:2833-2852` e `supabase/functions/ai-pipeline-agent/index.ts:4500-4574`;
- o motivo final quando nada e enviado pode virar `no_outbound_action` em `supabase/functions/ai-pipeline-agent/index.ts:4908-4910`;
- `no_outbound_action` hoje e tratado como `terminal_skip` em `supabase/functions/_shared/aiPipelineOutcome.ts:28-41`, ou seja: nao gera retry;
- o fallback deterministico atual so entra no caso de pergunta repetida pelo LLM em `supabase/functions/ai-pipeline-agent/index.ts:4012-4017`, nao no caso de resposta vazia/sem CTA.

Consequencia:

- a IA pode "parar do nada" mesmo com lead ativo;
- o sintoma do print 3 e coerente com esse desenho: houve continuidade do lead, mas nao houve mensagem de saida garantida.

### 2.6 Follow-up automatico existe no codigo, mas depende de fila/worker/cron e de varios guardrails

Evidencias:

- o webhook agenda o passo 1 do follow-up apos outbound em `supabase/functions/whatsapp-webhook/index.ts:313-380` e `supabase/functions/whatsapp-webhook/index.ts:1209-1224`;
- o worker processa `scheduled_agent_jobs` e cancela por varios motivos em `supabase/functions/process-agent-jobs/index.ts:647-819`;
- a migracao da fila remove cron hardcoded e exige reconfiguracao operacional em `supabase/migrations/20260310100000_pipeline_agents_jobs.sql:203-220` e `scripts/ops/reconfigure_process_agent_jobs_cron.sql:1-62`;
- ja existe auditoria operacional pronta em `scripts/ops/audit_pipeline_agents.sql:3-38` e smoke checks focados em worker/fila em `scripts/smoke_test_final.ps1:245-330`.

Consequencia:

- o problema de follow-up pode ser de codigo, mas pode tambem ser simplesmente worker/cron/fila/guard cancelando execucao;
- hoje nao existe evidencia suficiente para assumir que o bug e so de prompt.

### 2.7 Pausa automatica da IA pode mascarar como "parou de conversar"

Evidencias:

- o webhook carrega `support_ai_auto_disable_on_seller_message` em `supabase/functions/whatsapp-webhook/index.ts:620-630`;
- quando o vendedor envia mensagem, o lead pode ser pausado (`ai_enabled = false`) em `supabase/functions/whatsapp-webhook/index.ts:1183-1197`;
- o proprio agente bloqueia resposta se `lead.ai_enabled === false` em `supabase/functions/ai-pipeline-agent/index.ts:2395-2397`.

Consequencia:

- parte dos casos de "IA parou" pode ser pausa automatica por takeover humano, nao apenas bug de prompt;
- isso precisa entrar no checklist de diagnostico operacional antes de concluir causa raiz.

## 3. O Que Precisa Passar A Ser Coletado No Banco

### 3.1 Dados estruturados da empresa (P0)

Adicionar em `company_profile`:

- `headquarters_city`
- `headquarters_state`
- `headquarters_address`
- `headquarters_zip`
- `service_area_summary`
- `service_cities` (array/jsonb)
- `service_states` (array/jsonb)
- `business_hours_text`
- `public_phone`
- `public_whatsapp`

Motivo:

- esses dados respondem perguntas factuais frequentes sem depender de texto livre ou RAG;
- resolvem diretamente casos como localizacao, area de atendimento e horario de funcionamento.

Observacao de desenho:

- usar `ai_settings.timezone` como fonte canonica para regras horarias da IA;
- evitar duplicar timezone em `company_profile`, salvo necessidade de produto claramente diferente.

### 3.2 Fatos comerciais de alta frequencia (P1)

Adicionar de forma estruturada, evitando depender so de texto corrido:

- `technical_visit_is_free` (boolean)
- `technical_visit_fee_notes`
- `supports_financing` (boolean)
- `supports_card_installments` (boolean)
- `payment_policy_summary`
- `call_channel_options` (ex.: whatsapp, telefone)

Motivo:

- varios erros relatados envolvem perguntas objetivas de politica comercial;
- esses campos reduzem alucinacao em temas que nao deveriam depender de interpretacao do modelo.

### 3.3 Configuracoes operacionais da IA (P0)

Adicionar em `ai_settings`:

- `auto_schedule_call_enabled` boolean
- `auto_schedule_visit_enabled` boolean
- `auto_schedule_call_min_days` integer
- `auto_schedule_visit_min_days` integer

Ajuste adicional necessario no schema/tipos:

- tipar e expor `timezone` em `AISettings` e no painel da IA (campo ja existente no banco).

Opcional, apenas se quisermos tornar configuravel em vez de hardcoded:

- `call_invite_cutoff_hhmm` text default `18:00`

Motivo:

- isso atende exatamente o comportamento solicitado na aba Inteligencia Artificial;
- e mais aderente ao pedido do que tentar reaproveitar `respondeu_flow_mode`.

### 3.4 Persistencia de qualificacao do lead (reaproveitar estrutura existente)

Nao criar nova tabela por enquanto. Reaproveitar `lead_stage_data.respondeu` e fortalecer o uso de:

- `segment`
- `timing`
- `budget_fit`
- `need_reason`
- `decision_makers`
- `decision_makers_present`
- `bant_complete`
- `address`
- `reference_point`
- `collected`
- `answered_keys`
- `last_question_key`

Complementos minimos que podem ser necessarios:

- `preferred_contact_period`
- `call_refused`
- `scheduling_path_decided` (`call`, `visit`, `manual_return`)

Motivo:

- a estrutura base ja existe em `supabase/functions/ai-pipeline-agent/index.ts:1314-1365`;
- o problema nao e falta de tabela, e falta de enforcement sobre quando esses dados sao considerados suficientes.

## 4. Ajustes Cirurgicos Recomendados

### 4.1 Blindagem factual da empresa

Implementacao futura:

1. Buscar os novos campos estruturados da `company_profile` junto com `company_name`.
2. Antes de recorrer a RAG, criar uma camada de resposta factual para perguntas de localizacao, area atendida, horario e politicas comerciais.
3. Se o dado estruturado nao existir, responder com fallback seguro:
   - nao inventar;
   - dizer que vai confirmar o dado exato;
   - ou usar apenas o que estiver explicitamente cadastrado.

Resultado esperado:

- zero resposta do tipo "a empresa fica no Brasil" quando o dado real nao esta cadastrado.

### 4.2 Novo resolvedor deterministico do caminho comercial

Implementacao futura:

Criar uma funcao pequena, centralizada, antes do LLM efetivar agendamento:

- se `auto_schedule_call_enabled = true` e `auto_schedule_visit_enabled = true`, escolher entre ligacao ou visita com base em:
  - horario atual;
  - preferencia explicita do lead;
  - se o lead recusou ligacao;
  - estado da qualificacao;
- se so ligacao estiver ativa, forcar caminho de ligacao;
- se so visita estiver ativa, forcar caminho de visita;
- se nenhuma estiver ativa, impedir target stage de agenda e responder que vai verificar o melhor horario e retornar.

Importante:

- manter `respondeu_flow_mode` apenas como fallback legado;
- nao remover prompts existentes.
- considerar que `agente_disparos` roda sobre o contexto de `respondeu`; a regra precisa olhar `effectiveAgentType` e nao apenas `currentStage`.

### 4.3 Minimo de dias por tipo de agendamento

Implementacao futura:

- estender `generateAvailableSlotsForType` para receber `minLeadDays`;
- aplicar `auto_schedule_call_min_days` aos slots de call;
- aplicar `auto_schedule_visit_min_days` aos slots de visit;
- refletir esse filtro tambem no catalogo `SLOTS_DISPONIVEIS_REAIS`.

Resultado esperado:

- se a operacao definir 1 dia para visita, a IA nao podera marcar visita para hoje;
- o mesmo vale para ligacao.

### 4.4 Regra dura: apos 18h nao convidar para ligacao

Implementacao futura:

1. Calcular horario local com timezone da operacao.
2. Se hora local > 18:00:
   - bloquear CTA de ligacao;
   - bloquear target `chamada_agendada` naquele momento;
   - continuar a conversa por WhatsApp;
   - se visita estiver habilitada e fizer sentido, permitir visita;
   - se nenhum agendamento estiver habilitado, usar resposta padrao de retorno posterior.

Observacao:

- isso deve ser deterministico e nao apenas instrucao de prompt.

### 4.5 Gate deterministico de qualificacao completa antes de agendar

Implementacao futura:

Adicionar um checklist central no runtime para `respondeu` (incluindo quando roteado para `agente_disparos`):

Obrigatorios antes de qualquer agendamento (call ou visit):

- segmento do projeto
- cidade da instalacao
- conta media ou consumo
- concessionaria, quando aplicavel
- `timing`
- `need_reason`
- `budget_fit`
- decisor(es) identificados
- validacao minima de BANT completo (B/A/N/T), sem pular etapas

Obrigatorios adicionais para visita antes de mover etapa:

- data/hora confirmada
- endereco minimo
- ponto de referencia, se necessario
- confirmacao de decisores presentes ou justificativa operacional

Se checklist incompleto:

- remover `target_stage` de agenda;
- impedir `appointment`;
- gerar a proxima pergunta faltante de forma deterministica;
- marcar em log qual item bloqueou o agendamento.

Resultado esperado:

- a IA nao pula para chamada/visita antes do BANT e dos dados basicos.

### 4.6 Fallback obrigatorio para nao deixar conversa morrer

Implementacao futura:

1. Priorizar fallback deterministico dentro da propria execucao inbound, antes de chegar em `no_outbound_action`.
2. Executar continuidade baseada no checklist faltante quando o LLM nao produzir CTA valido.
3. So permitir `no_outbound_action` em casos realmente intencionais e explicitos.
4. Criar logging claro para:
   - `qualification_gate_blocked`
   - `after_hours_call_blocked`
   - `manual_return_mode`
   - `no_outbound_fallback_used`

Observacao critica:

- `no_outbound_action` como `terminal_skip` em `supabase/functions/_shared/aiPipelineOutcome.ts:28-41` e um candidato forte ao bug "parou de conversar".
- para evitar efeitos colaterais, nao mudar de imediato a classificacao global de outcome; primeiro reduzir geracao de `no_outbound_action` no fluxo inbound.

### 4.7 Follow-up e agendamento automatico: verificacao de codigo + operacao

Implementacao futura:

Codigo:

- revisar cancelamentos por `recent_outbound`, `instance_unavailable`, `lead_responded_before_execution`, `org_agent_disabled` e `lead_fu_disabled`;
- revisar se existem casos em que um outbound automatico nao agenda o passo 1 por cair em `likely_ai_echo`.
- revisar logs de takeover (`seller_message_takeover`) para separar "pausa intencional" de "falha de continuidade".

Operacao:

- auditar `scheduled_agent_jobs`;
- auditar `claim_due_agent_jobs`;
- validar cron `process-agent-jobs-worker`;
- validar execucoes nas ultimas 6h;
- validar backlog pendente e processamento travado;
- validar logs recentes de `follow_up_agent_executed`, `post_call_agent_executed`, `agent_invoke_failed`.
- validar distribuicao de `reason_code` em `agent_run_outcome` para medir `no_outbound_action`, `yield_to_newer`, `already_replied_final` e `tight_loop_guard`.

Agendamento call/visit (valida rapidamente a percepcao de "nao agenda automatico"):

- medir `v9_appointment_written`, `v9_appointment_skipped_reason` e `stage_gate_block_reason` nos logs;
- cruzar com `appointments` criados e mudancas de etapa em `lead_stage_history`;
- confirmar se bloqueios estao ocorrendo por regra (janela/conflito/min_days) ou por falha de gravacao.

## 5. Ajustes De UI Na Aba Inteligencia Artificial

Adicionar na mesma area de configuracao da IA, sem refatoracao grande:

- toggle `Ligar agendamento automatico de ligacoes`
- campo `Dias minimos para agendar ligacao`
- toggle `Ligar agendamento automatico de visitas`
- campo `Dias minimos para agendar visita`
- texto explicativo curto do comportamento combinado:
  - ambos ligados: IA escolhe;
  - um ligado: IA segue esse caminho;
  - nenhum ligado: IA nao agenda automaticamente e promete retorno.

Motivo para manter na aba atual:

- ja existe ali configuracao de janela de agendamento e follow-up;
- o ajuste fica incremental e coerente com o desenho atual de `AIAgentsView`.

## 6. Ordem Recomendada De Implementacao

### Fase 1 - Dados e configuracao

1. Migracao de `company_profile`.
2. Migracao de `ai_settings`.
3. Update de `src/types/ai.ts`.
4. Update de `useAISettings`.
5. Update incremental de `SobreEmpresaTab`.
6. Update incremental de `AIAgentsView`.
7. Backfill e constraints dos novos campos em `ai_settings` (`enabled` e `min_days` com defaults seguros).

### Fase 2 - Guardrails de runtime

1. Resolver factual da empresa.
2. Resolver deterministico do caminho comercial.
3. Filtro de dias minimos no gerador de slots.
4. Bloqueio apos 18h para CTA de ligacao.
5. Gate deterministico de qualificacao.
6. Fallback obrigatorio contra `no_outbound_action`.
7. Ajuste de roteamento para cobrir `respondeu` e `agente_disparos` sem duplicacao de regra.

### Fase 3 - Follow-up e worker

1. Auditar fila e cron.
2. Corrigir, se necessario, cancelamentos excessivos.
3. Confirmar que outbound automatico agenda follow-up 1.
4. Confirmar que o worker encadeia os proximos passos.

### Fase 4 - Testes e smoke

1. Unitarios de regra de negocio.
2. Regressao por transcript.
3. Smoke operacional do worker/fila.
4. Typecheck, build e vitest.

## 7. Casos De Teste Que Precisam Existir Apos A Implementacao

### 7.1 Regressao de conversa

- lead pergunta "A empresa e localizada onde?" sem dado cadastrado -> a IA nao inventa endereco;
- mesmo caso com cidade/endereco cadastrado -> a IA responde com dado exato;
- lead responde dados basicos mas BANT incompleto -> a IA continua qualificando;
- lead com BANT incompleto tenta agendar ligacao -> IA bloqueia e pergunta o item faltante;
- horario local > 18h e caminho seria ligacao -> a IA nao convida para call;
- ambos toggles ligados -> IA escolhe caminho valido;
- so visita ligada -> nunca tenta call;
- so ligacao ligada -> nunca tenta visita;
- ambos desligados -> responde que vai verificar horario e retornar;
- lead responde "Casa" depois de pergunta de segmentacao -> a IA necessariamente continua a conversa.
- lead pausado por takeover humano -> nao deve ser contado como "parada inesperada da IA" no diagnostico.

### 7.2 Regressao de agendamento

- `target_stage = chamada_agendada` sem `appointment` valido -> bloqueado;
- `appointment` valido mas checklist incompleto -> bloqueado;
- `appointment` valido e checklist completo -> grava `appointments` e move etapa;
- `minLeadDays` = 1 -> nenhum slot de hoje e oferecido;
- slot fora da janela -> recusado com nova sugestao.

### 7.3 Regressao de follow-up

- outbound automatico agenda `follow_up` passo 1;
- inbound do lead cancela follow-up pendente e reseta `follow_up_step`;
- worker executa follow-up e agenda o proximo passo;
- cron ausente ou mal configurado e detectado em auditoria.
- caso de `seller_message_takeover` com auto-disable ligado deve ficar explicitamente rastreavel em log.

## 8. Riscos E Como Mitigar

- Risco: quebrar o fluxo atual por endurecer demais o gate.
  Mitigacao: gate baseado em checklist minimo e logs de bloqueio antes de ampliar exigencias.

- Risco: prompt e regra deterministica entrarem em conflito.
  Mitigacao: manter prompt, mas dar precedencia ao runtime nas decisoes de agendamento e continuidade.

- Risco: follow-up parecer bug de codigo quando o problema e cron.
  Mitigacao: validar `scripts/ops/audit_pipeline_agents.sql` e smoke T14-T20 antes de concluir.

- Risco: adicionar campos demais e atrasar entrega.
  Mitigacao: separar em P0 estruturado (factual e operacional) e P1 comercial complementar.

- Risco: mudar classificacao global de `no_outbound_action` e gerar retries indesejados.
  Mitigacao: primeiro atacar a causa no inbound (fallback deterministico) e so depois avaliar alteracao de outcome global.

- Risco: Playwright/smokes E2E alterarem dados de ambiente errado (usa `SUPABASE_SERVICE_ROLE_KEY`).
  Mitigacao: executar regressao E2E apenas em ambiente isolado/staging com dados efemeros.

## 9. Conclusao Executiva

O sistema ja possui boa parte da infraestrutura necessaria:

- prompts detalhados;
- janela de agendamento;
- fila de follow-up;
- worker dedicado;
- logs e scripts de auditoria.

Os bugs relatados decorrem principalmente de 5 lacunas:

1. falta de dados estruturados da empresa;
2. falta de guardrails deterministicas para BANT e agendamento;
3. falta de politica dura de horario para ligacoes;
4. `no_outbound_action` podendo encerrar conversa sem fallback;
5. dependencia operacional de cron/worker para follow-up e automacoes.

Recomendacao:

- implementar em cima do fluxo atual, sem reescrever prompts;
- priorizar schema minimo + gates de runtime + auditoria operacional;
- usar os prints enviados como testes de regressao obrigatorios.
