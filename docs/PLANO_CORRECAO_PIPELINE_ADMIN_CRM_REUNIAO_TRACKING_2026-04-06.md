# Plano de Correcao da Pipeline Admin CRM: Reuniao, Drag-and-Drop e Tracking Meta

## Status

Apenas planejamento. Nenhuma correcao foi executada neste arquivo.

## Objetivo

Corrigir a pipeline do CRM interno do painel admin para que:

1. exista somente uma coluna canonica de agendamento de reuniao na pipeline;
2. o drag-and-drop mova o lead de forma confiavel;
3. ao arrastar para a coluna de agendamento, o sistema abra o modal de agendamento antes de consolidar a mudanca;
4. os tipos de compromisso fiquem padronizados em `Ligacao`, `Demonstracao`, `Reuniao`, `Visita` e `Outro`;
5. o tracking do lead vindo de formulario fique salvo e visivel no card/deal;
6. quando a `REUNIAO` comercial for realizada, o evento seja enviado corretamente para a Meta;
7. o fluxo legado nao continue criando divergencia entre coluna, appointment, stage da lead publica e dispatcher de conversao.

## Diagnostico confirmado no codigo

### 1. Existem duas etapas duplicadas de agendamento no CRM interno

Hoje o CRM interno possui duas etapas diferentes para o mesmo momento do funil:

- `agendou_reuniao`
- `chamada_agendada`

E isso aparece no frontend com labels diferentes:

- `Agendou Reuniao`
- `Reuniao Agendada`

Arquivos onde isso esta evidente:

- `src/modules/internal-crm/components/pipeline/stageCatalog.ts`
- `src/modules/internal-crm/components/pipeline/DealCard.tsx`
- `src/modules/internal-crm/components/pipeline/DealDetailPanel.tsx`
- `supabase/migrations/20260330173500_internal_crm_stage_reuniao_e_fechou_contrato.sql`

Observacao importante:

- o blueprint original do CRM interno nasceu com `chamada_agendada` e `chamada_realizada`;
- depois foi inserida a etapa extra `agendou_reuniao`, criando duplicidade funcional.

### 2. O frontend, o backend e o tracking nao concordam sobre qual etapa dispara `Schedule`

Hoje ha conflito real entre camadas:

- o teste de tracking espera `Schedule` em `chamada_realizada`;
- o frontend/shared constants atual mapeia `Schedule` em `agendou_reuniao`;
- `chamada_agendada` esta nula para Meta/Google/GA4 nas constants atuais;
- houve migration antiga movendo `Schedule` para `chamada_realizada`, mas migration posterior recolocou em `agendou_reuniao`.

Evidencias:

- `tests/unit/trackingScaffold.test.ts`
- `src/lib/tracking/constants.ts`
- `supabase/functions/_shared/tracking.ts`
- `supabase/migrations/20260304224500_tracking_stage_event_map_adjustments.sql`
- `supabase/migrations/20260330174500_tracking_meta_map_purchase_value_and_dedup.sql`

Resultado pratico:

- o repositorio hoje tem especificacoes conflitantes;
- por isso o disparo para Meta fica inconsistente;
- isso bate com o sintoma reportado: `quando a REUNIAO e realizada, o evento nao esta funcionando`.

### 3. O drag-and-drop da pipeline nao acopla o fluxo de agendamento

No componente da pipeline interna, o drop apenas chama `move_deal_stage`.

Nao existe regra especial para:

- interceptar drop na etapa de agendamento;
- abrir modal;
- exigir criacao/edicao do appointment;
- somente depois mover o deal.

Arquivo principal:

- `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx`

Consequencia:

- o usuario consegue mover deal para a coluna sem appointment valido;
- o sistema nao garante integridade entre stage e agenda;
- isso quebra exatamente a experiencia pedida: arrastar para a coluna e abrir o modal.

### 4. O save do appointment empurra o deal para uma etapa diferente da coluna esperada

Ao salvar `upsert_appointment`, o backend faz:

- `scheduled/confirmed -> agendou_reuniao`
- `done -> chamada_realizada`
- `no_show -> nao_compareceu`

Arquivo:

- `supabase/functions/internal-crm-api/index.ts`

Consequencia:

- mesmo que o usuario trabalhe visualmente com `chamada_agendada`, o save do appointment reposiciona o deal em `agendou_reuniao`;
- isso explica a percepcao de que o lead nao para na coluna esperada ou volta para outra coluna.

### 5. O tracking do lead do formulario ja nasce em parte do backend, mas nao esta exposto no card/deal

Hoje o intake ja salva atribuicao em locais tecnicos:

- `internal_crm.deals.commercial_context.attribution`
- `internal_crm.tracking_bridge.attribution_snapshot`
- `public.lead_attribution`
- `internal_crm.landing_form_sessions.tracking_payload`

Arquivos/migrations:

- `supabase/functions/internal-crm-api/index.ts`
- `supabase/functions/_shared/internalCrmTrackingBridge.ts`
- `supabase/migrations/20260329193000_internal_crm_lp_popup_public_intake.sql`

Mas hoje isso nao esta visivel na UI da pipeline interna:

- o `DealDetailPanel` nao mostra UTMs/click IDs/origem;
- o card nao sinaliza que ha tracking associado;
- o usuario nao consegue conferir facilmente se o lead esta pronto para conversao offline.

### 6. Existe prova automatizada de incoerencia hoje

Teste executado:

- `npm run test -- tests/unit/trackingScaffold.test.ts`

Resultado:

- falha em `expected map.chamada_realizada.meta to be 'Schedule'`
- received `null`

Teste executado:

- `npm run test -- tests/unit/trackingV3Regression.test.ts`

Resultado:

- suite passa

Leitura pratica:

- parte do tracking v3 esta boa;
- o problema esta na definicao do mapa canonico de stages/eventos.

## Decisao recomendada para execucao

### Recomendacao de canonico

Ao executar, recomendo adotar este modelo unico:

1. manter `chamada_agendada` como unica etapa canonica de agendamento visivel;
2. remover a coluna visivel `agendou_reuniao` da pipeline;
3. transformar `agendou_reuniao` em alias legado apenas para compatibilidade/migracao;
4. usar `chamada_realizada` como etapa canonica de reuniao efetivamente realizada;
5. disparar `Meta Schedule` em `chamada_realizada` para `REUNIAO` comercial;
6. nao disparar `Meta Schedule` em `Ligacao` telefonica por padrao.

### Motivo dessa recomendacao

- `chamada_agendada` e `chamada_realizada` ja eram o par canonico do blueprint;
- `agendou_reuniao` foi a duplicacao posterior;
- a regra `reuniao realizada => conversao de Meta` casa com o teste existente e com o seu requisito;
- fica mais claro para o time: agendou, realizou, nao compareceu, negociou.

### Padronizacao de tipos

Manter no agendamento interno:

- `call` => `Ligacao`
- `demo` => `Demonstracao`
- `meeting` => `Reuniao`
- `visit` => `Visita`
- `other` => `Outro`

Mas criar uma camada de classificacao comercial/tracking:

- `meeting` => `REUNIAO`
- `demo` => `REUNIAO`, quando for apresentacao comercial em video
- `call` => `LIGACAO`
- `visit` => `VISITA`
- `other` => `OUTRO`

Observacao operacional:

- se a sua operacao quiser tratar `demo` como diferente de `reuniao`, isso pode continuar na UI;
- para Meta, a conversao comercial deve cair no bucket `REUNIAO`.

## Escopo tecnico da execucao

### Fase 1. Unificar stage canonico da pipeline

Alteracoes:

1. Atualizar o catalogo do frontend para existir apenas uma etapa de agendamento visivel.
2. Remover `agendou_reuniao` da ordem da pipeline no frontend.
3. Manter alias de compatibilidade:
   - `agendou_reuniao -> chamada_agendada`
   - `reuniao_agendada -> chamada_agendada`
4. Criar migration para:
   - migrar `internal_crm.deals.stage_code = 'agendou_reuniao'` para `chamada_agendada`;
   - migrar `internal_crm.clients.current_stage_code = 'agendou_reuniao'` para `chamada_agendada`;
   - desativar `internal_crm.pipeline_stages.stage_code = 'agendou_reuniao'`.

Arquivos impactados:

- `src/modules/internal-crm/components/pipeline/stageCatalog.ts`
- `src/modules/internal-crm/components/pipeline/DealCard.tsx`
- `src/modules/internal-crm/components/pipeline/DealDetailPanel.tsx`
- `src/modules/internal-crm/components/pipeline/modals/NewDealSimpleModal.tsx`
- `src/modules/internal-crm/components/InternalCrmUi.tsx`
- `supabase/migrations/<nova_migration_unificacao_stage>.sql`

### Fase 2. Corrigir o fluxo do drag-and-drop

Objetivo:

Ao arrastar para a coluna canonica de agendamento:

1. nao mover imediatamente o deal;
2. abrir `InternalCrmAppointmentModal`;
3. preselecionar o cliente/deal;
4. predefinir o tipo correto;
5. somente apos salvar o appointment, mover para o stage canonico.

Regra recomendada:

- drop em `chamada_agendada` => abre modal, nao faz `move_deal_stage` direto;
- drop em `fechou` e `nao_fechou` continua abrindo modais terminais;
- demais colunas podem continuar com move direto.

Melhorias adicionais:

- se o usuario cancelar o modal, o card permanece na coluna original;
- se o save falhar, nao muda de coluna;
- se ja houver appointment futuro do deal, o modal abre em modo de edicao/reagendamento.

Arquivo principal:

- `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx`

### Fase 3. Alinhar save de appointment com o stage canonico

Objetivo:

O backend de `upsert_appointment` precisa parar de mandar `scheduled/confirmed` para `agendou_reuniao`.

Nova regra recomendada:

- `scheduled/confirmed` + tipo comercial valido => `chamada_agendada`
- `done` + appointment classificado como `REUNIAO` => `chamada_realizada`
- `no_show` => `nao_compareceu`

Complemento:

- adicionar helper de classificacao de tipo comercial;
- se o appointment for `call`, manter pipeline coerente sem disparar conversao Meta de reuniao;
- registrar na `metadata` do appointment ou no `commercial_context` o `tracking_conversion_kind`.

Arquivo principal:

- `supabase/functions/internal-crm-api/index.ts`

### Fase 4. Padronizar tracking para Meta, Google e GA4

Objetivo:

Eliminar a divergencia entre:

- `src/lib/tracking/constants.ts`
- `supabase/functions/_shared/tracking.ts`
- migrations SQL que definem `tracking_default_stage_event_map()`
- dados ja salvos em `public.org_tracking_settings.stage_event_map`

Regra recomendada para a execucao:

- `novo_lead` => `Lead`
- `chamada_agendada` => sem conversao Meta
- `chamada_realizada` => `Schedule` para `REUNIAO`
- `visit`/`visita_realizada` continua conforme regra comercial atual, se ainda fizer sentido
- `fechou` / `projeto_pago` mantem regra de compra conforme operacao vigente

Tarefas:

1. Corrigir constants do frontend.
2. Corrigir shared constants das edge functions.
3. Criar nova migration SQL para redefinir `tracking_default_stage_event_map()`.
4. Backfill em `org_tracking_settings.stage_event_map`.
5. Ajustar ou regravar o teste que hoje esta quebrado para refletir a regra final aprovada.

Arquivos:

- `src/lib/tracking/constants.ts`
- `supabase/functions/_shared/tracking.ts`
- `supabase/migrations/<nova_migration_tracking_stage_map>.sql`
- `tests/unit/trackingScaffold.test.ts`

### Fase 5. Garantir persistencia e exibicao do tracking no card/deal

Objetivo:

Quando o lead entrar so pelo formulario:

- tracking deve ficar persistido;
- o vendedor deve conseguir ver a origem dentro do CRM interno;
- os click IDs e UTMs devem seguir junto ate a conversao.

Implementacao recomendada:

1. Expor no `DealDetailPanel` um bloco `Tracking`.
2. Mostrar pelo menos:
   - `utm_source`
   - `utm_medium`
   - `utm_campaign`
   - `utm_content`
   - `utm_term`
   - `gclid`
   - `fbclid`
   - `fbc`
   - `fbp`
   - `landing_page_url`
   - `session_id`
3. Preferir esta ordem de leitura:
   - `deal.commercial_context.attribution`
   - fallback `internal_crm.tracking_bridge.attribution_snapshot`
4. Adicionar um badge no card quando houver tracking vinculado, sem poluir o layout.

Arquivos candidatos:

- `src/modules/internal-crm/components/pipeline/DealDetailPanel.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmPipelineBoard.ts`
- possivelmente `supabase/functions/internal-crm-api/index.ts` para incluir join/leitura do bridge

### Fase 6. Garantir que a reuniao realizada gere conversao de Meta

Fluxo esperado final:

1. lead entra por formulario;
2. tracking e attribution ficam salvos;
3. pipeline interna usa stage canonico;
4. appointment de `meeting/demo` e salvo;
5. quando o appointment vira `done`, o deal vai para `chamada_realizada`;
6. `syncTrackingBridgeFromDeal` atualiza a lead publica;
7. o trigger `tr_lead_stage_change_v2` cria `conversion_events`;
8. `conversion-dispatcher` cria/entrega `conversion_deliveries` para Meta;
9. a Meta recebe `Schedule` com os dados de atribuicao do lead.

Checagens obrigatorias nessa fase:

- `tracking_bridge` existe para o cliente/deal;
- `lead_attribution` foi preenchido;
- `org_tracking_settings` tem `tracking_enabled=true`;
- `meta_capi_enabled=true`;
- `stage_event_map.chamada_realizada.meta = 'Schedule'`;
- a appointment classificada como `LIGACAO` nao dispara conversao de `REUNIAO`.

### Fase 7. Backfill e reparo dos dados afetados

So corrigir codigo nao basta. Precisamos reparar o que ja ficou inconsistente.

Backfill recomendado:

1. Migrar deals/clientes em `agendou_reuniao` para `chamada_agendada`.
2. Recriar/atualizar `tracking_bridge` ausente para leads de `landing_page`.
3. Reaplicar atribuicao em `lead_attribution` quando houver snapshot no `commercial_context`/bridge e a tabela publica estiver vazia.
4. Identificar leads que:
   - vieram de formulario,
   - chegaram em `chamada_realizada`,
   - nao possuem `conversion_events` de `Schedule`,
   - e inserir backfill idempotente.
5. Reenfileirar `conversion_deliveries` pendentes/skipped quando o problema for apenas mapeamento anterior.

Entrega recomendada:

- uma migration SQL para reparo estrutural;
- um script operacional separado para backfill controlado e auditavel.

## Ordem de execucao recomendada

1. Criar migration de unificacao da pipeline interna.
2. Ajustar frontend do board e modal.
3. Ajustar `upsert_appointment`.
4. Ajustar mapa de tracking em frontend/shared/SQL.
5. Expor tracking no `DealDetailPanel`.
6. Escrever testes unitarios e de regressao.
7. Rodar backfill em staging.
8. Validar com lead real de teste.
9. Aplicar em producao.
10. Rodar script de recuperacao dos eventos perdidos.

## Testes obrigatorios antes de subir

### Unitarios

1. `stageCatalog` nao expoe mais duas colunas de agendamento.
2. `normalizeInternalCrmStageCode('agendou_reuniao')` resolve para o stage canonico.
3. `handleDrop` na coluna de agendamento abre modal em vez de mover direto.
4. salvar appointment `meeting` leva o deal para `chamada_agendada`.
5. marcar appointment `meeting` como `done` leva para `chamada_realizada`.
6. `getDefaultStageEventMap()` retorna `Schedule` em `chamada_realizada`.
7. `call` nao e tratado como `REUNIAO` para Meta.
8. `DealDetailPanel` renderiza bloco de tracking quando houver snapshot.

### Integracao / regressao

1. Lead de LP entra com UTMs e `fbclid`.
2. Tracking aparece no detalhe do deal.
3. Drag de `Respondeu -> Chamada Agendada` abre modal.
4. Cancelar modal nao move o deal.
5. Salvar modal move o deal para a coluna canonica.
6. Appointment `meeting` marcada como `done` cria `conversion_events`.
7. `conversion_deliveries` para Meta sao criadas.
8. `appointment_type = call` nao gera conversao de `REUNIAO`.

### Smoke em staging

1. Criar lead de formulario com UTM fake + `fbclid`.
2. Validar tracking no CRM interno.
3. Arrastar para coluna de agendamento.
4. Agendar pelo modal.
5. Marcar como realizada.
6. Confirmar:
   - `public.leads.status_pipeline = chamada_realizada`
   - `lead_attribution` preenchida
   - `conversion_events.crm_stage = chamada_realizada`
   - `conversion_deliveries.platform = meta`

## Riscos e cuidados

1. Nao deletar `agendou_reuniao` direto sem migrar os registros antes, porque ha FKs e historico dependente.
2. Nao confiar so nas constants do frontend; o comportamento real depende do SQL e de `org_tracking_settings`.
3. Nao disparar `Schedule` em duas etapas ao mesmo tempo, ou a Meta vai contar duplicado.
4. Nao misturar `Ligacao` telefonica com `Reuniao` comercial em video no dispatcher.
5. Validar se `demo` cai em `REUNIAO` ou fica fora do tracking antes do merge final.

## Decisoes que ja deixo propostas para execucao

Se voce me autorizar a executar, vou seguir esta linha:

1. coluna canonica visivel: `Reuniao Agendada` (`chamada_agendada`);
2. coluna removida da UI: `Agendou Reuniao` (`agendou_reuniao`);
3. `agendou_reuniao` vira alias legado para migracao/compatibilidade;
4. drag para a coluna de agendamento abre modal obrigatoriamente;
5. `REUNIAO` realizada dispara `Meta Schedule`;
6. `LIGACAO` telefonica agendada nao entra como `REUNIAO` na Meta;
7. tracking do formulario passa a ficar visivel no detalhe do deal.

## Evidencias usadas neste plano

Arquivos analisados:

- `src/modules/internal-crm/components/pipeline/stageCatalog.ts`
- `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx`
- `src/modules/internal-crm/components/pipeline/DealCard.tsx`
- `src/modules/internal-crm/components/pipeline/DealDetailPanel.tsx`
- `src/modules/internal-crm/components/calendar/InternalCrmAppointmentModal.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmPipelineBoard.ts`
- `src/lib/tracking/constants.ts`
- `supabase/functions/_shared/tracking.ts`
- `supabase/functions/_shared/internalCrmTrackingBridge.ts`
- `supabase/functions/internal-crm-api/index.ts`
- `supabase/functions/conversion-dispatcher/index.ts`
- `supabase/migrations/20260304224500_tracking_stage_event_map_adjustments.sql`
- `supabase/migrations/20260330173500_internal_crm_stage_reuniao_e_fechou_contrato.sql`
- `supabase/migrations/20260330174500_tracking_meta_map_purchase_value_and_dedup.sql`
- `supabase/migrations/20260329193000_internal_crm_lp_popup_public_intake.sql`
- `tests/unit/trackingScaffold.test.ts`
- `tests/unit/trackingV3Regression.test.ts`

Comandos executados:

- `npm run test -- tests/unit/trackingScaffold.test.ts` -> falhou por divergencia de `Schedule`
- `npm run test -- tests/unit/trackingV3Regression.test.ts` -> passou
