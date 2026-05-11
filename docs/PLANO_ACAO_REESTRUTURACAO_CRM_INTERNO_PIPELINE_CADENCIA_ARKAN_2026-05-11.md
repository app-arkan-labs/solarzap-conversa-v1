# Plano de acao - Reestruturacao do CRM interno ARKAN

Data: 2026-05-11  
Status: planejamento detalhado, sem implementacao aplicada  
Escopo: CRM interno SolarZap, pipeline comercial, agendamentos, cadencia de contato, automacoes, UX/UI e qualificacao MQL.

## 1. Objetivo

Reestruturar o CRM interno para operar o processo comercial da ARKAN com:

- Pipeline simples e funcional.
- Agendamento real de chamadas e reunioes.
- Cadencia de ligacoes feita pelo vendedor, com o CRM gerando os proximos agendamentos.
- Mensagens automaticas ao lead apenas quando a regra operacional pedir.
- Automacoes sem movimentar lead de etapa por conta propria.
- Qualificacao MQL simples, com nota 1, 2, 3 ou 4.
- UX/UI clara para o vendedor trabalhar rapido, sem preencher telas desnecessarias.

## 2. Regras definitivas de negocio

### 2.1 Pipeline final

As etapas oficiais da pipeline devem ser:

1. Novo Lead
2. Tentando Contato
3. MQL
4. Reuniao Marcada
5. Reuniao Realizada
6. Contrato Fechado
7. Venda Finalizada

Etapas antigas devem ser migradas, mapeadas ou desativadas. A pipeline nao deve ter colunas para cada tentativa de contato.

### 2.2 Tipos de agendamento

O CRM deve diferenciar apenas dois tipos comerciais:

1. Chamada
   - Ligacao do vendedor.
   - Primeira tentativa, retorno combinado, cadencia de contato ou follow-up por telefone.
   - Nao deve mover lead automaticamente.
   - Pode gerar notificacao para o vendedor.
   - Pode aparecer no calendario.

2. Reuniao
   - Consultoria, diagnostico, apresentacao comercial ou reuniao com especialista.
   - Ao ser criada pelo vendedor a partir do fluxo de qualificacao, move para Reuniao Marcada.
   - Ao ser marcada como realizada, move para Reuniao Realizada.
   - Ativa lembretes automaticos pre-reuniao para o lead.

### 2.3 Automacoes nao movem etapa

Regra obrigatoria:

```text
Automacao pode enviar mensagem, criar notificacao, criar tarefa/agendamento ou cancelar runs pendentes.
Automacao nao move lead de etapa.
```

Movimentacao de pipeline deve acontecer apenas por:

- Acao explicita do vendedor.
- Salvamento de fluxo guiado, por exemplo "qualificou como MQL" ou "agendou reuniao".
- Confirmacao manual do resultado da reuniao.
- Confirmacao manual de contrato fechado.
- Confirmacao de pagamento ou acao explicita de venda finalizada.

### 2.4 Nota MQL

A qualificacao nao usa score de 0 a 100.

Notas permitidas:

```text
1 - Baixo fit
2 - Fit moderado
3 - Bom fit
4 - Forte fit
```

BANT entra como checklist e contexto, nao como calculo complexo.

## 3. Estado atual observado

### 3.1 Frontend

Arquivos principais envolvidos:

- `src/modules/internal-crm/components/pipeline/stageCatalog.ts`
- `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx`
- `src/modules/internal-crm/components/pipeline/DealDetailPanel.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmPipelineBoard.ts`
- `src/modules/internal-crm/components/calendar/InternalCrmAppointmentModal.tsx`
- `src/modules/internal-crm/components/calendar/InternalCrmCalendarView.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmActionsPanel.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmActionsPanelFull.tsx`
- `src/modules/internal-crm/components/automations/InternalCrmAutomationsView.tsx`
- `src/components/solarzap/CallConfirmModal.tsx`

O SolarZap ja possui um modal de ligacao com:

- Escolha de metodo.
- QR Code.
- Confirmacao de ligacao.
- Feedback.

Esse padrao deve inspirar o novo modal do CRM interno, mas nao deve ser copiado sem adaptar a qualificacao ARKAN.

### 3.2 Backend

Arquivo principal:

- `supabase/functions/internal-crm-api/index.ts`

Pontos atuais relevantes:

- `upsertAppointment` movimenta deal conforme status do appointment.
- `appointment_type = call` hoje tambem pode acabar produzindo efeito de etapa.
- `move_deal_stage` usa catalogo antigo.
- `resolveBlueprintStageCode`, `BLUEPRINT_STAGE_DEFAULT_PROBABILITY`, `BLUEPRINT_STAGE_LABEL` e `BLUEPRINT_STAGE_COLOR` precisam ser atualizados.
- `queueAutomationEvent` ja permite automacoes por evento.
- `automation_rules` e `automation_runs` ja suportam mensagens e notificacoes.

### 3.3 Banco de dados

Tabelas relevantes:

- `internal_crm.pipeline_stages`
- `internal_crm.clients`
- `internal_crm.deals`
- `internal_crm.appointments`
- `internal_crm.tasks`
- `internal_crm.automation_rules`
- `internal_crm.automation_runs`
- `internal_crm.stage_history`
- `internal_crm.conversations`
- `internal_crm.messages`

Campos ja uteis:

- `deals.commercial_context`
- `appointments.metadata`
- `clients.next_action`
- `clients.next_action_at`
- `deals.last_automation_key`

## 4. Modelo final de dados

### 4.1 Pipeline stages

Criar ou atualizar os registros:

```text
novo_lead
tentando_contato
mql
reuniao_marcada
reuniao_realizada
contrato_fechado
venda_finalizada
```

Mapeamento sugerido de etapas antigas:

```text
lead_entrante -> novo_lead
novo_lead -> novo_lead
respondeu -> tentando_contato
contato_iniciado -> tentando_contato
qualificado -> mql
chamada_agendada -> tentando_contato ou reuniao_marcada, conforme contexto
demo_agendada -> reuniao_marcada
agendou_reuniao -> reuniao_marcada
reuniao_agendada -> reuniao_marcada
chamada_realizada -> reuniao_realizada, se appointment for meeting
reuniao_realizada -> reuniao_realizada
negociacao -> reuniao_realizada ou contrato_fechado, revisar antes da migration
proposta_enviada -> reuniao_realizada
aguardando_pagamento -> contrato_fechado
fechou -> venda_finalizada, se pago; caso contrario contrato_fechado
ganho -> venda_finalizada, se pago; caso contrario contrato_fechado
nao_fechou -> manter como perdido interno/status lost, fora do funil principal
perdido -> manter como perdido interno/status lost, fora do funil principal
```

Observacao importante:

Antes de migrar `chamada_agendada`, `chamada_realizada`, `fechou` e `ganho`, auditar dados reais. Esses nomes eram usados com semantica diferente e podem representar tanto chamada quanto reuniao.

### 4.2 Appointments

Manter `appointment_type`, mas restringir a UX comercial a:

```text
call = Chamada
meeting = Reuniao
```

Tipos `demo`, `visit` e `other` podem continuar no banco por compatibilidade, mas nao devem aparecer como opcoes principais no fluxo ARKAN.

Adicionar em `appointments.metadata`, quando aplicavel:

```json
{
  "commercial_kind": "call",
  "cadence_step": "initial_5m",
  "created_by_flow": "arkan_contact_cadence",
  "attempt_group": 1
}
```

Para reunioes:

```json
{
  "commercial_kind": "meeting",
  "created_by_flow": "arkan_mql_booking",
  "meeting_link": "...",
  "calendar_provider": "internal"
}
```

### 4.3 Commercial context do deal

Usar `deals.commercial_context` para dados comerciais sem criar muitas colunas novas no primeiro ciclo.

Estrutura sugerida:

```json
{
  "arkan": {
    "contact_cadence": {
      "status": "active",
      "current_step": "24h",
      "last_call_result": "no_answer",
      "call_attempt_count": 5,
      "last_message_key": "arkan_contact_24h",
      "next_call_at": "2026-05-11T17:00:00.000Z",
      "closed_door_at": null,
      "recovery_15d_at": null,
      "recovery_30d_at": null
    },
    "qualification": {
      "mql_grade": 3,
      "paid_traffic_status": "yes",
      "monthly_ad_spend_range": "1000_3000",
      "revenue_range": "50000_100000",
      "has_partner": true,
      "decision_makers": "Socio participa da reuniao",
      "main_challenge": "Gerar mais oportunidades qualificadas",
      "timing": "now",
      "notes": "Lead demonstrou urgencia e ja investe em anuncios."
    }
  }
}
```

Notas permitidas para `mql_grade`:

```text
1
2
3
4
```

### 4.4 Status de cadencia

Valores recomendados:

```text
not_started
active
paused
responded
qualified
meeting_booked
closed_door
recovery_15d
recovery_30d
lost_no_response
stopped
```

Esses valores vivem no `commercial_context`, nao como colunas de pipeline.

## 5. Fluxos finais

### 5.1 Entrada de novo lead

Quando o formulario cria o lead:

1. Criar ou atualizar `client`.
2. Criar ou atualizar `deal`.
3. Setar etapa `novo_lead`.
4. Criar agendamento tipo `call` para 5 minutos a frente.
5. Criar ou atualizar `commercial_context.arkan.contact_cadence`:

```json
{
  "status": "not_started",
  "current_step": "initial_5m",
  "call_attempt_count": 0
}
```

6. Notificar vendedor:
   - WhatsApp admin.
   - E-mail, se o canal de e-mail interno estiver disponivel ou for implementado.

7. Nao enviar mensagem automatica para o lead neste momento.

### 5.2 Primeira chamada nao atendida

Fluxo do vendedor:

1. Vendedor abre agendamento de Chamada ou clica em Ligar no card.
2. Escolhe Telefone ou WhatsApp.
3. Escaneia QR Code.
4. Ao finalizar, informa resultado:

```text
Nao atendeu
Atendeu
Pediu outro horario
Numero invalido
Sem interesse
```

Se resultado for `Nao atendeu` e for a primeira rodada:

1. Registrar tentativa.
2. Vendedor confirma mover para `tentando_contato`.
3. Enviar mensagem 1 automaticamente.
4. Criar proximo agendamento tipo `call` para +2h.
5. Atualizar cadencia:

```json
{
  "status": "active",
  "current_step": "2h",
  "last_call_result": "no_answer",
  "last_message_key": "arkan_contact_immediate"
}
```

### 5.3 Cadencia tentando contato

Cadencia operacional:

| Passo | Chamada | Mensagem | Efeito |
| --- | --- | --- | --- |
| 5 min | Vendedor liga ate 3x | Nenhuma antes da tentativa | Lead segue em Novo Lead |
| Apos nao atender | Registro manual | Mensagem 1 | Move para Tentando Contato por acao do vendedor |
| +2h | Vendedor liga 2x | Nenhuma | Continua Tentando Contato |
| +24h | Vendedor liga em janelas definidas | Mensagem 2 | Continua Tentando Contato |
| +48h | Opcional ou sem chamada | Mensagem 3 | Continua Tentando Contato |
| +72h | Vendedor liga 2x | Mensagem 4 | Marca fechada de porta no contexto |
| +15D | Vendedor liga 2x | Opcional | Recuperacao 15D no contexto |
| +30D | Vendedor liga 2x | Opcional | Se sem resposta, perdido sem resposta |

Mensagens:

Mensagem 1, apos primeira tentativa sem atendimento:

```text
Boa tarde {{nome}}. Falo em nome da ARKAN, Assessoria de Marketing e vendas que acelera empresas de energia solar em todo Brasil. Recebi o seu interesse para uma consultoria gratuita com nossos especialistas afim de escalar as vendas da sua integradora! Qual o melhor horario para falarmos?
```

Mensagem 2, 24h:

```text
Boa tarde {{nome}}! Entao, tentei contato contigo ontem pra conversarmos sobre como acelerar o seu negocio, mas nao tive sucesso. Me retorna aqui {{nome}} caso tenha interesse em implementar um processo de vendas forte atraves da internet.
```

Mensagem 3, 48h:

```text
{{nome}}, devo considerar a tua falta de resposta como desinteresse na nossa solucao?
```

Mensagem 4, 72h:

```text
Bom dia {{nome}}, temos 2 possibilidades: ou a correria nao esta deixando a gente conversar ou entao voce nao tem mais prioridade em aumentar as vendas no seu negocio com a ajuda da ARKAN. Se for a segunda opcao, pra nao ficar enviando varias mensagens, esse sera meu ultimo contato.
```

### 5.4 Lead atendeu

Se o vendedor marcar `Atendeu`:

1. Abrir bloco de qualificacao no modal.
2. Exibir checklist BANT.
3. Vendedor seleciona nota MQL: 1, 2, 3 ou 4.
4. Salvar dados em `commercial_context.arkan.qualification`.
5. Perguntar:

```text
Mover para MQL?
```

Se confirmado:

1. Mover para `mql`.
2. Pausar/cancelar cadencia de tentativa de contato.
3. Perguntar:

```text
Deseja agendar uma reuniao?
```

Se sim:

1. Abrir modal de agendamento tipo `meeting`.
2. Salvar reuniao.
3. Mover para `reuniao_marcada`.
4. Criar automacoes de lembrete pre-reuniao.

### 5.5 Reuniao marcada

Ao criar agendamento tipo `meeting`:

1. Criar appointment.
2. Atualizar stage para `reuniao_marcada`.
3. Criar/atualizar contexto:

```json
{
  "meeting_booked_at": "...",
  "meeting_start_at": "...",
  "meeting_source": "call_modal"
}
```

4. Enviar confirmacao imediata ao lead.
5. Criar lembretes:

```text
24h antes
2h antes
15min antes
```

6. Criar tarefa/agendamento interno para o vendedor criar grupo no WhatsApp, se essa acao for mantida como processo manual.

### 5.6 Reuniao realizada

Quando o vendedor marcar a reuniao como realizada:

1. Atualizar appointment status para `done`.
2. Se appointment type for `meeting`, mover para `reuniao_realizada`.
3. Abrir modal de resultado comercial:

```text
Apresentacao feita?
Proxima acao
Observacoes
Contrato sera enviado?
```

4. Nao marcar contrato fechado automaticamente.

### 5.7 Contrato fechado

Quando o lead assinar:

1. Vendedor clica em `Contrato Fechado`.
2. Mover para `contrato_fechado`.
3. Registrar:

```text
Produto/plano
Valor
Data de assinatura
Link/documento do contrato, se houver
```

4. Nao considerar venda finalizada ainda.

### 5.8 Venda finalizada

Quando o pagamento for confirmado:

1. Mover para `venda_finalizada`.
2. Atualizar `payment_status = paid`.
3. Atualizar `paid_at`.
4. Marcar status do deal como `won`.
5. Acionar rotinas de onboarding/provisionamento, se aplicavel.

## 6. Plano tecnico de execucao

### Fase 0 - Auditoria antes de alterar

Objetivo: entender dados reais e evitar migracao errada.

Passos:

1. Listar stages atuais em producao.
2. Contar deals por stage.
3. Contar appointments por `appointment_type` e `status`.
4. Identificar quantos appointments tipo `call` hoje moveram para `chamada_agendada` ou `chamada_realizada`.
5. Listar automation rules ativas.
6. Listar templates que disparam em `appointment_scheduled`, `appointment_done` e `appointment_no_show`.
7. Conferir se existem regras customizadas editadas manualmente.
8. Exportar snapshot antes da migration.

Entregavel:

- Relatorio curto com contagens antes da execucao.
- Lista de riscos de migracao.

### Fase 1 - Atualizar catalogo de etapas no banco

Criar migration para:

1. Inserir novas etapas:

```sql
novo_lead
tentando_contato
mql
reuniao_marcada
reuniao_realizada
contrato_fechado
venda_finalizada
```

2. Marcar etapas antigas como inativas depois da migracao.
3. Migrar `clients.current_stage_code`.
4. Migrar `deals.stage_code`.
5. Preservar `stage_history`.
6. Registrar notas de migracao em `stage_history` quando houver mudanca automatica.

Cuidados:

- Nao deletar etapas antigas inicialmente.
- Nao transformar `fechou` automaticamente em `venda_finalizada` sem verificar `payment_status`.
- Se `payment_status = paid`, migrar para `venda_finalizada`.
- Se `payment_status != paid`, migrar para `contrato_fechado`.

### Fase 2 - Atualizar catalogo de etapas no frontend

Arquivos:

- `src/modules/internal-crm/components/pipeline/stageCatalog.ts`
- `src/modules/internal-crm/components/InternalCrmUi.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmPipelineBoard.ts`
- `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx`

Passos:

1. Atualizar `InternalCrmCanonicalStageCode`.
2. Atualizar `INTERNAL_CRM_PIPELINE_STAGE_ORDER`.
3. Atualizar aliases antigos para os novos.
4. Atualizar labels, short labels, cores e next action labels.
5. Ajustar badges.
6. Ajustar next action de cada etapa:

```text
Novo Lead -> Ligar agora
Tentando Contato -> Registrar chamada
MQL -> Agendar reuniao
Reuniao Marcada -> Abrir reuniao
Reuniao Realizada -> Registrar contrato
Contrato Fechado -> Confirmar pagamento
Venda Finalizada -> Ver cliente
```

7. Ajustar menu de mover etapa.
8. Ajustar comportamento mobile de etapa anterior/proxima.

### Fase 3 - Corrigir backend para automacao nao mover lead

Arquivo:

- `supabase/functions/internal-crm-api/index.ts`

Passos:

1. Atualizar `LEGACY_STAGE_CODE_MAP`.
2. Atualizar `BLUEPRINT_STAGE_DEFAULT_PROBABILITY`.
3. Atualizar `BLUEPRINT_STAGE_LABEL`.
4. Atualizar `BLUEPRINT_STAGE_COLOR`.
5. Alterar `resolveDealStatusForStage`:
   - `venda_finalizada` retorna `won`.
   - `contrato_fechado` permanece `open`, salvo regra explicita futura.
   - etapas anteriores permanecem `open`.
6. Alterar `resolveLifecycleStatusForStage`:
   - `venda_finalizada` pode virar `customer_onboarding`.
   - `contrato_fechado` ainda pode continuar como `lead` ou `customer_onboarding` dependendo decisao final.
7. Alterar `upsertAppointment`:
   - Se `appointment_type = call`, nunca chamar `applyDealStageChange`.
   - Se `appointment_type = meeting` e status `scheduled/confirmed`, so mover para `reuniao_marcada` quando payload tiver flag explicita, exemplo `move_pipeline_on_save: true`.
   - Se `appointment_type = meeting` e status `done`, mover para `reuniao_realizada` apenas quando o vendedor salvar o resultado ou quando fluxo da UI enviar flag explicita.
8. Garantir que `appointment_scheduled` continue enfileirando mensagens/lembretes, mas sem mudar etapa sozinho.
9. Garantir que `appointment_no_show` nao mova pipeline automaticamente, salvo se houver uma decisao explicita futura.

### Fase 4 - Criar eventos/acoes para cadencia de contato

Objetivo: o CRM deve saber o que aconteceu na chamada e gerar o proximo agendamento/mensagem.

Opcoes tecnicas:

Opcao A, mais simples no primeiro ciclo:

- Usar `upsert_appointment` para salvar status/notes da Chamada.
- Usar `update_deal_commercial_state` para atualizar `commercial_context`.
- Usar `upsert_automation_rule` existente para mensagens.
- Criar proximo `appointment_type = call` via frontend chamando `upsert_appointment`.

Opcao B, mais robusta:

- Criar nova action no backend:

```text
record_call_outcome
```

Payload:

```json
{
  "client_id": "...",
  "deal_id": "...",
  "appointment_id": "...",
  "method": "tel",
  "outcome": "no_answer",
  "attempt_count": 3,
  "cadence_step": "initial_5m",
  "qualification": {},
  "next_call_at": "..."
}
```

Responsabilidades:

1. Atualizar appointment atual.
2. Atualizar `commercial_context`.
3. Criar proximo appointment tipo `call`.
4. Enfileirar mensagem da cadencia quando necessario.
5. Cancelar automacoes pendentes se lead respondeu, qualificou ou marcou reuniao.

Recomendacao:

Implementar a Opcao B para reduzir regra solta no frontend e evitar comportamento divergente.

### Fase 5 - Criar/ajustar regras de automacao da cadencia

Criar automation rules para:

```text
arkan_contact_message_1
arkan_contact_message_24h
arkan_contact_message_48h
arkan_contact_message_72h
arkan_meeting_confirmation
arkan_meeting_reminder_24h
arkan_meeting_reminder_2h
arkan_meeting_reminder_15m
arkan_admin_new_lead_call_5m
arkan_admin_next_call_due
```

Eventos sugeridos:

```text
lead_created
call_no_answer
contact_cadence_step_due
meeting_scheduled
meeting_done
payment_confirmed
```

Se preferir reaproveitar eventos existentes:

```text
lp_form_submitted
appointment_scheduled
appointment_done
```

Mas com condicoes obrigatorias:

```json
{ "appointment_type": "meeting" }
```

para lembretes de reuniao.

E:

```json
{ "cadence_message_key": "arkan_contact_24h" }
```

para mensagens da cadencia.

Regras de cancelamento:

- Ao qualificar MQL, cancelar mensagens de tentativa de contato pendentes.
- Ao agendar Reuniao, cancelar mensagens de tentativa de contato pendentes.
- Ao marcar sem interesse, cancelar todas pendentes.
- Ao numero invalido, cancelar todas pendentes.
- Ao venda finalizada, cancelar todas pendentes relacionadas ao lead.

### Fase 6 - Intake de formulario

Arquivo principal:

- `supabase/functions/internal-crm-api/index.ts`

Funcoes relacionadas:

- `intakeLandingLead`
- `handlePublicLpIntake`

Passos:

1. Ao criar lead sem reuniao marcada:
   - Stage `novo_lead`.
   - Criar appointment tipo `call` para `now + 5min`.
   - Nao enviar mensagem lead.
   - Notificar vendedor.
2. Ao criar lead com reuniao marcada, se esse fluxo existir:
   - Stage `reuniao_marcada`.
   - Appointment tipo `meeting`.
   - Ativar lembretes de reuniao.
3. Preencher `commercial_context.arkan.contact_cadence`.
4. Garantir dedupe para nao criar varias chamadas de 5 minutos para o mesmo lead se formulario duplicar.

### Fase 7 - Novo modal de chamada no CRM interno

Criar componente novo, por exemplo:

```text
src/modules/internal-crm/components/pipeline/modals/InternalCrmCallFlowModal.tsx
```

Ou local compartilhado:

```text
src/modules/internal-crm/components/calls/InternalCrmCallFlowModal.tsx
```

Etapas do modal:

1. Metodo
   - Telefone.
   - WhatsApp.

2. QR Code
   - Exibir QR Code para `tel:` ou `wa.me`.
   - Botao copiar telefone.
   - Botao "Ja abri no celular".

3. Resultado
   - Nao atendeu.
   - Atendeu.
   - Pediu outro horario.
   - Numero invalido.
   - Sem interesse.

4. Se nao atendeu
   - Campo quantidade de tentativas: 1, 2 ou 3.
   - Botao "Registrar e criar proxima chamada".
   - Mostrar qual sera o proximo passo da cadencia.

5. Se pediu outro horario
   - Abrir selecao rapida de data/hora.
   - Criar appointment tipo `call`.
   - Nao mover etapa.

6. Se atendeu
   - Abrir qualificacao BANT.
   - Mostrar nota MQL 1, 2, 3, 4.
   - Botao "Salvar qualificacao".
   - Opcao "Mover para MQL".
   - Opcao "Agendar reuniao".

7. Se numero invalido
   - Registrar no contexto.
   - Opcionalmente mover para perdido manualmente ou marcar status de contato invalido.

8. Se sem interesse
   - Registrar motivo.
   - Cancelar cadencia.
   - Abrir opcao de marcar como perdido.

UX obrigatoria:

- Modal deve ser rapido.
- Campos avancados so aparecem quando o resultado exige.
- Botao primario sempre deve indicar a proxima acao.
- Nao obrigar o vendedor a preencher BANT quando o lead nao atendeu.

### Fase 8 - Formulario de qualificacao BANT

Campos:

```text
Investe em trafego pago?
- Sim
- Nao
- Ja investiu antes
- Nao sabe informar

Valor medio mensal investido
- Nao investe
- Ate R$ 1.000
- R$ 1.000 a R$ 3.000
- R$ 3.000 a R$ 5.000
- Acima de R$ 5.000

Faturamento medio
- Ate R$ 30 mil
- R$ 30 mil a R$ 50 mil
- R$ 50 mil a R$ 100 mil
- R$ 100 mil a R$ 300 mil
- Acima de R$ 300 mil

Possui socio?
- Sim
- Nao

Quem precisa participar da reuniao?
- Somente o lead
- Socio
- Comercial
- Outro

Principal desafio
- Campo texto

Quando quer resolver?
- Agora
- Proximos 30 dias
- Depois
- Sem urgencia

Nota MQL
- 1
- 2
- 3
- 4
```

Regra:

- A nota MQL e selecionada pelo vendedor.
- O sistema pode sugerir uma nota no futuro, mas nao na primeira versao.

### Fase 9 - Modal de agendamento simplificado

Atualizar `InternalCrmAppointmentModal` para deixar clara a diferenca:

```text
Tipo
- Chamada
- Reuniao
```

Se tipo = Chamada:

- Label do titulo: "Chamada com..."
- Ajuda: "Usado para contato telefonico. Nao altera a etapa da pipeline."
- Sem lembretes para lead por padrao.

Se tipo = Reuniao:

- Label do titulo: "Reuniao com..."
- Ajuda: "Usado para consultoria/apresentacao. Pode mover para Reuniao Marcada."
- Mostrar link/local.
- Mostrar checkbox ou comportamento explicito: "Mover lead para Reuniao Marcada".

### Fase 10 - Ajustar pipeline board

Cards devem mostrar:

```text
Nome/empresa
Etapa
Responsavel
Proxima acao
Tipo da proxima agenda: Chamada ou Reuniao
Horario
Status de atraso
Ultima tentativa
Ultima mensagem
Nota MQL, se existir
```

Estados visuais:

- Atrasado: destaque discreto em vermelho/rose.
- Hoje: destaque em amber.
- Futuro: neutro.
- MQL 1: cinza.
- MQL 2: amarelo.
- MQL 3: azul/verde.
- MQL 4: verde.

Botao principal por etapa:

```text
Novo Lead -> Ligar
Tentando Contato -> Registrar chamada
MQL -> Agendar reuniao
Reuniao Marcada -> Ver agenda
Reuniao Realizada -> Registrar contrato
Contrato Fechado -> Confirmar pagamento
Venda Finalizada -> Ver cliente
```

### Fase 11 - Ajustar inbox/actions panel

Arquivos:

- `InternalCrmActionsPanel.tsx`
- `InternalCrmActionsPanelFull.tsx`
- `InternalCrmConversationActionsSheet.tsx`

Passos:

1. Trocar `window.open(tel:)` direto por abertura do novo modal de chamada.
2. Botao "Agendar Chamada" cria appointment tipo `call`.
3. Botao "Agendar Reuniao" cria appointment tipo `meeting`.
4. Exibir etapa atual com novo catalogo.
5. Mostrar proxima Chamada/Reuniao separadas.

### Fase 12 - Ajustar calendario

Arquivos:

- `InternalCrmCalendarView.tsx`
- `InternalCrmCalendarFilters.tsx`
- `InternalCrmAppointmentModal.tsx`
- `InternalCrmEventFeedbackModal.tsx`
- `InternalCrmEventArchiveModal.tsx`

Passos:

1. Filtro:

```text
Todos
Chamadas
Reunioes
```

2. Cores:

```text
Chamada = azul
Reuniao = verde ou indigo
```

3. Ao abrir um evento:
   - Chamada mostra "Registrar resultado da chamada".
   - Reuniao mostra "Registrar resultado da reuniao".

4. Feedback de Chamada:
   - Nao atendeu.
   - Atendeu.
   - Remarcar.
   - Numero invalido.
   - Sem interesse.

5. Feedback de Reuniao:
   - Realizada.
   - No-show.
   - Cancelada.
   - Reagendar.

### Fase 13 - Ajustar automacoes UI

Arquivo:

- `InternalCrmAutomationsView.tsx`

Objetivo:

Transformar a tela tecnica em configuracao operacional.

Secoes:

1. Status de envio
   - WhatsApp conectado.
   - Cron de automacoes rodando.
   - Runs pendentes.
   - Falhas recentes.

2. Cadencia de contato
   - Mensagem 1.
   - Mensagem 24h.
   - Mensagem 48h.
   - Mensagem 72h.
   - Recuperacao 15D.
   - Recuperacao 30D.

3. Lembretes de reuniao
   - Confirmacao imediata.
   - 24h antes.
   - 2h antes.
   - 15min antes.

4. Alertas para vendedor
   - Novo lead.
   - Chamada em 5min.
   - Chamada atrasada.
   - Reuniao marcada.
   - Reuniao em breve.

5. Avancado
   - Logs de runs.
   - Teste manual.
   - JSON somente em area colapsada.

### Fase 14 - Ajustar tracking/conversao

Pontos a revisar:

- Mapeamento de etapa para eventos Meta/Google.
- `internal_crm.stage_rank`.
- `tracking_normalize_crm_stage`, se usado.
- Migrations recentes que assumem `reuniao_agendada`, `fechou`, etc.

Novo mapa conceitual:

```text
novo_lead -> Lead
mql -> Lead qualificado ou CompleteRegistration, se essa for a estrategia
reuniao_marcada -> Schedule
reuniao_realizada -> Contact ou Lead qualificado avancado
venda_finalizada -> Purchase
```

Contrato Fechado nao deve virar Purchase se ainda nao houve pagamento.

### Fase 15 - Testes unitarios

Criar ou atualizar testes:

1. Stage catalog:
   - Normaliza aliases antigos.
   - Ordem correta da pipeline.
   - Labels corretos.

2. Appointment:
   - `call` nao move etapa.
   - `meeting scheduled` move apenas com flag explicita.
   - `meeting done` move apenas com fluxo explicito.

3. Deal status:
   - `contrato_fechado` nao vira `won`.
   - `venda_finalizada` vira `won`.
   - `payment_status = paid` apenas em venda finalizada ou pagamento confirmado.

4. Cadencia:
   - Nao atendeu gera proxima Chamada.
   - Mensagem correta e enfileirada no passo correto.
   - MQL cancela mensagens pendentes.
   - Reuniao marcada cancela cadencia de contato.

5. MQL:
   - Aceita apenas 1, 2, 3, 4.
   - Rejeita 0, 5, 100.

6. Automacoes:
   - Lembrete de Reuniao so dispara para `appointment_type = meeting`.
   - Chamada nao dispara lembrete de reuniao para lead.

### Fase 16 - Testes de interface

Usar Playwright para validar:

1. Pipeline carrega com novas etapas.
2. Lead em Novo Lead abre modal de chamada.
3. Modal de chamada:
   - Metodo Telefone.
   - Metodo WhatsApp.
   - QR Code renderiza.
   - Resultado "Nao atendeu" nao abre BANT.
   - Resultado "Atendeu" abre BANT.
   - Nota MQL aceita 1 a 4.
4. Agendamento:
   - Chamada nao move etapa.
   - Reuniao move para Reuniao Marcada quando confirmado.
5. Calendario:
   - Filtro Chamadas.
   - Filtro Reunioes.
6. Mobile:
   - Cards nao quebram.
   - Modal cabe na tela.
   - Texto nao estoura botoes.

### Fase 17 - Smoke em staging

Roteiro manual:

1. Criar lead via formulario.
2. Confirmar:
   - Lead em Novo Lead.
   - Chamada +5min criada.
   - Vendedor notificado.
   - Lead nao recebeu mensagem ainda.
3. Registrar chamada sem atendimento.
4. Confirmar:
   - Lead em Tentando Contato.
   - Mensagem 1 enviada.
   - Proxima Chamada +2h criada.
5. Registrar chamada atendida.
6. Preencher BANT.
7. Nota MQL = 3.
8. Mover para MQL.
9. Agendar Reuniao.
10. Confirmar:
    - Etapa Reuniao Marcada.
    - Lembretes de reuniao criados.
11. Marcar reuniao como realizada.
12. Confirmar etapa Reuniao Realizada.
13. Marcar Contrato Fechado.
14. Confirmar que nao esta pago ainda.
15. Confirmar pagamento.
16. Confirmar Venda Finalizada e status won.

## 7. Ordem recomendada de implementacao

Executar nesta ordem:

1. Auditoria de dados.
2. Migration de stages.
3. Atualizacao de catalogo frontend/backend.
4. Correcao de `upsertAppointment` para `call` nao mover etapa.
5. Implementacao de `record_call_outcome`.
6. Intake criando Chamada +5min.
7. Modal de chamada.
8. BANT com nota 1 a 4.
9. Modal de agendamento com Chamada/Reuniao.
10. Ajustes da pipeline board.
11. Ajustes do calendario.
12. Ajustes do inbox/actions panel.
13. Automacoes da cadencia.
14. Tela de automacoes operacional.
15. Testes unitarios.
16. Testes Playwright.
17. Smoke em staging.
18. Deploy controlado.

## 8. Criterios de aceite

O resultado final sera aceito quando:

1. Pipeline mostra exatamente:

```text
Novo Lead
Tentando Contato
MQL
Reuniao Marcada
Reuniao Realizada
Contrato Fechado
Venda Finalizada
```

2. Lead novo cria Chamada para +5min.
3. Chamada nao move etapa automaticamente.
4. Reuniao move etapa somente no fluxo explicito.
5. Automacoes nao movem etapa.
6. Modal de chamada possui Telefone/WhatsApp com QR Code.
7. Resultado "Nao atendeu" gera proximo agendamento da cadencia.
8. Resultado "Atendeu" abre qualificacao.
9. MQL aceita apenas 1, 2, 3, 4.
10. Reuniao Marcada dispara lembretes para o lead.
11. Contrato Fechado nao e Venda Finalizada.
12. Venda Finalizada exige pagamento confirmado ou acao explicita.
13. Calendario diferencia Chamadas e Reunioes.
14. Cards mostram proxima Chamada/Reuniao de forma clara.
15. Fluxo funciona no desktop e mobile.

## 9. Riscos e mitigacoes

### Risco 1 - Migrar etapa antiga para etapa errada

Mitigacao:

- Rodar auditoria antes.
- Migrar `fechou` conforme `payment_status`.
- Preservar stage history.
- Nao deletar stages antigas imediatamente.

### Risco 2 - Automacao continuar movendo lead

Mitigacao:

- Centralizar mudanca em `upsertAppointment`.
- Teste unitario obrigatorio para `appointment_type = call`.
- Revisar qualquer chamada a `applyDealStageChange`.

### Risco 3 - Mensagem sair duplicada

Mitigacao:

- Dedupe por `deal_id + automation_key + cadence_step`.
- Cancelar runs pendentes ao mudar status de cadencia.
- Testar runs pendentes antes de processar.

### Risco 4 - UX ficar pesada

Mitigacao:

- Modal progressivo.
- Nao mostrar BANT se lead nao atendeu.
- Nao obrigar campos desnecessarios.
- Botao primario sempre claro.

### Risco 5 - Confundir Chamada e Reuniao

Mitigacao:

- Labels claros.
- Cores distintas.
- Help text curto no modal.
- Filtros no calendario.

## 10. Rollback

Plano de rollback:

1. Manter stages antigas inativas, nao deletadas.
2. Migration de rollback para reativar etapas antigas.
3. Reverter aliases no frontend/backend.
4. Desativar novas automation rules de cadencia.
5. Restaurar snapshot de rules antigas, se necessario.
6. Nao apagar `commercial_context`; manter dados extras inofensivos.

## 11. Observacoes finais

Este plano simplifica a operacao:

- Pipeline representa estado comercial real.
- Chamada e Reuniao sao os dois tipos de agenda.
- Vendedor controla mudancas de etapa.
- Automacao ajuda, mas nao decide sozinha.
- MQL e uma nota simples de 1 a 4.
- O fluxo prioriza velocidade operacional e clareza visual.

