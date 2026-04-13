# Plano Corretivo - Automacoes do CRM Interno Admin

## Status

Apenas planejamento.
Nenhuma correcao foi executada neste arquivo.

## Objetivo

Fazer as automacoes do CRM interno funcionarem de forma confiavel:

- sem alterar os templates atuais por enquanto;
- sem quebrar o funil da landing page;
- sem disparar mensagens para contatos reais durante a validacao;
- sem regressao no CRM interno, agendamentos, no-show e alertas admin.

## Escopo deste plano

Este plano cobre:

1. fila de automacoes;
2. calculo de agendamento por tempo;
3. disparo do worker;
4. criacao de `automation_runs`;
5. resolucao dos campos do payload usados nos templates;
6. entrega via WhatsApp/Evolution;
7. validacao segura sem uso de leads reais.

Este plano **nao** altera a copy/templates.

## Diagnostico confirmado

### 1. O motor de templates existe e funciona

Arquivos:

- `supabase/functions/internal-crm-api/templatePayload.ts`
- `supabase/functions/internal-crm-api/index.ts`

Conclusao:

- o render de placeholders `{{token}}` esta implementado;
- a resolucao de `{{nome}}`, `{{data_hora}}`, `{{hora}}`, `{{link_agendamento}}`, `{{link_reuniao}}` acontece via `buildAutomationTemplatePayload()`;
- o problema principal nao e o motor de template em si.

### 2. O cron do worker esta ativo

Evidencia de leitura no banco:

- job `internal-crm-process-automation-runs`
- agenda `* * * * *`

Arquivo relacionado:

- `supabase/migrations/20260331120200_internal_crm_automation_cron.sql`

Conclusao:

- o cron existe e roda a cada minuto;
- o problema nao e “cron ausente”.

### 3. As regras estao cadastradas, mas varias automacoes relevantes nao aparecem nos runs

Evidencia:

- existem regras para:
  - `lp_form_without_schedule_reengage_5m`
  - `lp_form_with_schedule_confirmation`
  - `call_reminder_24h`
  - `call_reminder_2h`
  - `call_reminder_15m`
  - `no_show_recovery_10m`
  - `no_show_recovery_d1`
  - `no_show_recovery_d3`
- mas no banco, os `automation_runs` encontrados em producao sao basicamente:
  - `admin_lp_new_lead`
  - `lp_form_without_schedule_reengage_5m`

Conclusao:

- o agendamento dos lembretes de call/no-show nao esta acontecendo na pratica;
- o problema principal esta antes do worker entregar, porque os runs nem estao sendo criados.

### 4. A confirmacao “com agendamento” esta modelada no evento errado

Regra:

- `automation_key = lp_form_with_schedule_confirmation`
- `trigger_event = lp_form_submitted`
- `condition = { has_scheduled_call: true }`

Problema:

- no fluxo atual da LP, o agendamento acontece depois, no `book_slot`;
- `lp_form_submitted` nasce antes ou separado do booking;
- portanto essa regra depende de um estado que nao coincide naturalmente com o evento que a dispara.

Conclusao:

- essa automacao tem alta chance de nunca casar com o fluxo real;
- e por isso a “confirmacao imediata de agendamento” tende a nao funcionar.

### 5. Os lembretes de call estao corretos em logica, mas ausentes em efeito real

Regras:

- `call_reminder_24h`
- `call_reminder_2h`
- `call_reminder_15m`

Configuracao:

- `trigger_event = appointment_scheduled`
- `condition = { appointment_type: "call" }`
- `metadata.schedule_anchor = "appointment_start"`
- `delay_minutes = -1440 / -120 / -15`

Arquivo:

- `supabase/functions/internal-crm-api/index.ts`
  - `resolveAutomationScheduledAt()`

Conclusao:

- a regra de tempo esta certa no codigo;
- mas como os runs de `appointment_scheduled` nao estao aparecendo, os lembretes nao rodam.

### 6. O no-show tambem nao esta completando o ciclo

Regras:

- `no_show_recovery_10m`
- `no_show_recovery_d1`
- `no_show_recovery_d3`

Configuracao:

- `trigger_event = appointment_no_show`
- `condition = { appointment_type: "call" }`

Conclusao:

- mesma situacao dos lembretes de call:
  - a regra existe;
  - mas os runs correspondentes nao estao aparecendo no banco lido.

### 7. Existe falha de entrega no canal WhatsApp/Evolution

Evidencia nos runs existentes:

- `last_error = evolution_request_timeout:12000`

Conclusao:

- mesmo quando a run existe, o disparo nao e 100% confiavel;
- ha pelo menos um problema de timeout, disponibilidade ou configuracao do Evolution/WhatsApp.

### 8. No fluxo da LP, vimos uma anomalia no booking

Booking de debug isolado criado com dado falso mostrou:

- `appointment_type = call`
- `status = scheduled`
- `deal_id = null`

Conclusao:

- o agendamento publico esta criando appointment sem vinculo completo ao deal em pelo menos um caminho;
- isso enfraquece o contexto das automacoes e pode impedir runs dependentes de `deal_id`.

## Hipoteses principais de falha

### Hipotese A - `appointment_scheduled` nao esta gerando `queueAutomationEvent`

O codigo de `upsertAppointment()` enfileira:

- `appointment_scheduled`
- `appointment_rescheduled`
- `appointment_canceled`
- `appointment_done`
- `appointment_no_show`

Mas os runs reais de `appointment_scheduled` nao aparecem.

Possibilidades:

1. o caminho real de agendamento que a LP usa nao esta passando por `upsertAppointment()` da forma esperada;
2. a appointment esta sendo criada, mas sem os dados que casam com as regras;
3. existe algum problema silencioso entre `queueAutomationEvent()` e insert em `automation_runs`;
4. `deal_id = null` ou payload incompleto esta enfraquecendo o contexto.

### Hipotese B - condicoes das regras e evento de origem nao batem com o fluxo real

Especialmente:

- `lp_form_with_schedule_confirmation` em `lp_form_submitted`

Conclusao:

- varias automacoes podem estar “tecnicamente certas”, mas amarradas ao evento errado para o fluxo atual.

### Hipotese C - delivery WhatsApp falha mesmo quando o run existe

Mesmo resolvendo fila e agendamento:

- ainda ha risco de falha por timeout no Evolution.

## Plano de acao recomendado

### Fase 1. Auditoria estrutural dos eventos sem disparar mensagens reais

Objetivo:

confirmar em codigo e banco onde os runs deixam de nascer.

Acoes:

1. revisar `upsertAppointment()` e `handlePublicLpBookSlot()` em conjunto;
2. confirmar que toda criacao/reagendamento/no-show passa por `queueAutomationEvent()`;
3. inspecionar payload efetivo que chega a `queueAutomationEvent()`;
4. confirmar por que `deal_id` esta nulo no booking publico observado;
5. comparar com os `automation_rules.condition`.

Resultado esperado:

provar em qual ponto:

- o evento nao nasce;
- o run nao e inserido;
- ou o run e inserido sem payload suficiente.

### Fase 2. Corrigir o nascimento dos `automation_runs`

Objetivo:

garantir que os eventos corretos gerem runs no banco.

Escopo:

1. `appointment_scheduled`
2. `appointment_no_show`
3. `lp_form_submitted` apenas onde fizer sentido

Diretriz:

- manter templates como estao;
- corrigir apenas o motor/evento/payload.

Possiveis ajustes:

1. garantir `deal_id` no booking publico;
2. garantir `appointment_id`, `appointment_type`, `appointment_start_at`, `client_id` no payload;
3. corrigir regras que hoje dependem do evento errado;
4. revisar `dedupe_key` para evitar skip indevido.

### Fase 3. Realinhar somente as regras que estao ligadas ao evento errado

Objetivo:

fazer cada automacao nascer do evento certo sem mexer no texto.

Alvo principal:

- `lp_form_with_schedule_confirmation`

Direcao recomendada:

- deixar essa confirmacao vinculada ao evento real de agendamento;
- nao depender de `lp_form_submitted` para uma mensagem que so faz sentido depois do booking.

Observacao:

- isso e ajuste de trigger/condicao, nao de template.

### Fase 4. Validar o tempo real dos lembretes

Objetivo:

provar que `24h`, `2h` e `15min` sao calculados a partir do horario do compromisso.

Checklist tecnico:

1. confirmar `metadata.schedule_anchor = appointment_start`;
2. confirmar `resolveAutomationScheduledAt()` usa `appointment_start_at`;
3. validar que runs sao gravados com `scheduled_at` coerente;
4. validar que o worker so processa quando `scheduled_at <= now()`.

### Fase 5. Blindar o canal de entrega sem atingir contatos reais

Objetivo:

verificar se a entrega falha por timeout ou por instancia/credencial.

Acoes seguras:

1. auditar configuracao do Evolution/instancia padrao;
2. auditar health do canal e timeout;
3. inspecionar falhas recentes em `automation_runs.last_error`;
4. se necessario, usar regra/canal de teste interno controlado, nunca leads reais.

Importante:

- nao usar contatos reais do usuario;
- nao rodar replay cego em producao.

### Fase 6. Validacao segura sem seus leads

Objetivo:

provar que tudo funciona sem disparar para seus contatos.

Estrategia:

1. criar contexto tecnico isolado de teste;
2. usar numero/controlador de teste dedicado;
3. validar somente:
   - criacao de `automation_runs`
   - preenchimento dos campos do payload
   - tempos de `scheduled_at`
   - worker consumindo no horario certo
4. se houver envio, que seja para um destino controlado e previamente isolado.

## Ordem recomendada de execucao

1. corrigir o nascimento dos runs de `appointment_scheduled` e `appointment_no_show`;
2. corrigir o trigger da confirmacao agendada;
3. garantir `deal_id` no booking publico;
4. validar `scheduled_at` dos lembretes;
5. auditar Evolution/timeout;
6. rodar validacao segura sem leads reais;
7. observar novos runs em producao;
8. somente depois considerar replay do que ficou pendente.

## Riscos a evitar

1. nao mexer nos templates agora;
2. nao usar `replay_failed_automation_runs` em massa antes de isolar o motivo das falhas;
3. nao testar com leads reais;
4. nao alterar o funil da LP de novo enquanto estabilizamos o motor de automacoes;
5. nao mexer em tracking/meta nesse pacote corretivo.

## O que precisa funcionar ao final

1. `lp_form_submitted` gera apenas o que faz sentido nessa etapa;
2. `appointment_scheduled` cria runs de lembrete corretos;
3. `appointment_no_show` cria runs de recuperacao corretos;
4. `scheduled_at` bate com 24h, 2h, 15min, D+1, D+3;
5. `{{nome}}`, `{{data_hora}}`, `{{hora}}` entram preenchidos quando aplicavel;
6. `{{link_agendamento}}` e `{{link_reuniao}` nao travam o sistema mesmo sem template novo;
7. o worker processa no tempo certo;
8. o canal WhatsApp deixa de falhar por timeout nos cenarios normais.

## Conclusao

Hoje o problema central nao e “template ruim”.

O problema central e:

- regras parcialmente ligadas ao evento errado;
- runs importantes nao nascendo;
- payload de agendamento incompleto em parte do fluxo;
- delivery via Evolution com sinais de timeout.

O plano seguro e corrigir o motor primeiro, sem mexer no texto e sem tocar nos seus leads reais.
