# Plano de acao - CRM interno - automacoes de agendamento, follow-up e nomes

Data: 2026-05-10
Status: plano para revisao, sem implementacao aplicada

## Objetivo

Corrigir o comportamento das automacoes do CRM interno para que agendamentos, lembretes, follow-ups e mensagens de reengajamento nao disparem em duplicidade, nao usem "link de agendamento" quando esse link nao existe, e usem o primeiro nome do lead ja tratado antes do envio.

O escopo deste plano e o CRM interno (`internal_crm`). O SolarZap original (`public`, funcoes e telas do produto principal) deve permanecer isolado, salvo se uma etapa futura for aprovada explicitamente para ele.

## Diagnostico tecnico

1. O bug de lembrete saindo junto com a confirmacao tem uma causa provavel direta.

   Em `supabase/functions/internal-crm-api/index.ts`, a funcao `resolveAutomationScheduledAt` calcula o horario da automacao e, se o resultado ficou no passado, retorna `nowIso()`:

   - `resolveAutomationScheduledAt`: linhas 544-561
   - comportamento critico: linha 560

   Isso quebra lembretes relativos ao inicio da reuniao. Exemplo: se uma call e criada para amanha, mas falta menos de 24h, a regra `call_reminder_24h` calcula `appointment_start - 1440 minutos`, percebe que ja passou, e agenda para agora. Resultado: a confirmacao imediata e o lembrete "amanha" podem sair juntos.

2. O agendamento cria evento `appointment_scheduled` e processa automacoes vencidas na hora.

   Trechos envolvidos:

   - criacao do evento de agendamento: `supabase/functions/internal-crm-api/index.ts`, linhas 4501-4532
   - processamento imediato de runs vencidas: linhas 2070-2077

   Como a regra de 24h e transformada em `now()`, ela entra como vencida e pode ser processada junto com a confirmacao.

3. A deduplicacao existe, mas a chave atual permite variacoes para o mesmo evento logico.

   `automation_runs` tem indice unico em `dedupe_key`:

   - `supabase/migrations/20260329181000_internal_crm_arkan_blueprint.sql`, linhas 156-188

   Porem a chave e montada a partir de `event_key`, que muitas vezes recebe `nowIso()`:

   - `buildAutomationEventKey` / `queueAutomationEvent`: `supabase/functions/internal-crm-api/index.ts`, linhas 1987-2024
   - em agendamentos, `event_key` usa `appointment_scheduled:${id}:${appointmentEventAt}` em alguns fluxos e `appointment_scheduled:${id}:${start_at}` em outros: linhas 4528-4532 e 6037-6045

   Isso reduz a protecao contra duplicidade quando o mesmo agendamento passa por fluxos diferentes ou atualizacoes proximas.

4. O "link de agendamento" esta sendo preenchido com fallback incorreto.

   `buildAutomationTemplatePayload` monta `link_agendamento` com:

   - payload explicito
   - `scheduling_link`
   - `commercial_context.scheduling_link`
   - `appointment.metadata.scheduling_link`
   - `landingPageUrl`
   - URL do CRM

   Trecho: `supabase/functions/internal-crm-api/index.ts`, linhas 1884-1890.

   Isso explica o comportamento relatado: quando nao existe link real de agendamento, o sistema cai para landing page ou CRM. Como a decisao de produto e remover esse link, esse fallback deve ser desativado para mensagens ao lead.

5. Existem templates atuais usando `{{link_agendamento}}`.

   Seeds/migrations do CRM interno tem mensagens com `{{link_agendamento}}`:

   - `lp_form_without_schedule_reengage_5m`: linha 444
   - `no_show_recovery_10m`: linha 519
   - `no_show_recovery_d1`: linha 534
   - `no_show_recovery_d3`: linha 549
   - `20260403170000_fix_internal_crm_lp_reengage_template.sql` ainda acrescenta o token de link.

6. O nome do lead e renderizado cru.

   O renderer de template apenas substitui `{{nome}}` pelo valor recebido:

   - `supabase/functions/internal-crm-api/templatePayload.ts`, linhas 1-19

   E o payload usa `primary_contact_name` ou `company_name` sem tratamento:

   - `supabase/functions/internal-crm-api/index.ts`, linhas 1875-1879

   Por isso `LEONARDO PEREIRA` vira `LEONARDO PEREIRA`, em vez de `Leonardo`.

7. Ha sobreposicao de eventos na entrada de lead com agendamento.

   No intake da landing page, quando ja existe call marcada, o fluxo pode enfileirar:

   - `lp_form_submitted`: linhas 6031-6035
   - `appointment_scheduled`: linhas 6037-6045

   Isso e correto se as regras forem bem separadas, mas perigoso quando ha regras com mensagem ao lead em ambos os lados ou quando a deduplicacao usa chaves instaveis.

## Principios da correcao

1. Uma intencao comercial deve gerar no maximo uma mensagem imediata ao lead.
2. Lembretes relativos ao horario da reuniao nunca devem ser "adiantados para agora" quando a janela ja passou.
3. `{{nome}}` deve ser primeiro nome, tratado e humanizado.
4. `{{link_agendamento}}` deve deixar de ser usado em mensagens ao lead.
5. Links so devem aparecer quando representam um recurso real e explicito. Landing page nao e link de agendamento.
6. Toda mudanca deve ficar no schema/funcoes do CRM interno, sem alterar o comportamento do SolarZap original.

## Plano de execucao

### Fase 0 - Auditoria segura antes de alterar

1. Levantar em producao, somente leitura:
   - regras ativas em `internal_crm.automation_rules`;
   - runs pendentes em `internal_crm.automation_runs` por `appointment_id`, `automation_key`, `scheduled_at`;
   - templates que contem `{{link_agendamento}}`, `link de agendamento`, landing page ou URLs;
   - runs recentes onde `call_reminder_24h`, `call_reminder_2h` ou `call_reminder_15m` foram criadas no mesmo minuto da confirmacao;
   - cron ativo `internal-crm-process-automation-runs`.

2. Gerar snapshot de diagnostico antes/depois:
   - quantidade de runs pendentes por regra;
   - duplicidades por `appointment_id + automation_key`;
   - mensagens enviadas ao mesmo cliente em janela de 2 minutos apos agendamento.

3. Confirmar se existem regras customizadas pelo usuario. Se existirem, atualizar com criterio e nao sobrescrever texto customizado sem condicao clara.

### Fase 1 - Corrigir calculo de horario dos lembretes

1. Alterar `resolveAutomationScheduledAt` para nao retornar `nowIso()` quando o horario calculado de um lembrete relativo ao `appointment_start` ja passou.

2. Retornar uma decisao estruturada:

   - `scheduled_at` quando a automacao deve ser enfileirada;
   - `skip_reason` quando a automacao deve ser ignorada;
   - `due_now` apenas para regras realmente imediatas, como confirmacao.

3. Para regras com `schedule_anchor = appointment_start` e `delay_minutes < 0`:
   - se `appointment_start + delay_minutes` for menor ou igual ao momento de criacao do evento, pular a run;
   - registrar `skipped_due_before_creation`;
   - nao transformar em envio imediato.

4. Manter confirmacao imediata separada:
   - `lp_form_with_schedule_confirmation` pode continuar com `delay_minutes = 0`;
   - lembretes de 24h, 2h e 15m so devem sair quando a janela real ainda existir.

### Fase 2 - Fortalecer idempotencia e cancelamento

1. Padronizar `event_key` de agendamento:

   - `appointment_scheduled:{appointment_id}:{appointment_start_at}`;
   - `appointment_rescheduled:{appointment_id}:{appointment_start_at}`;
   - `appointment_canceled:{appointment_id}`;
   - `appointment_done:{appointment_id}`;
   - `appointment_no_show:{appointment_id}`.

2. Garantir que `dedupe_key` use essa chave estavel.

3. Quando houver reagendamento:
   - cancelar runs pendentes do appointment anterior;
   - criar novas runs apenas para o novo horario;
   - impedir duas confirmacoes para o mesmo `appointment_id + start_at`.

4. Quando houver `appointment_scheduled`:
   - cancelar `lp_form_without_schedule_reengage_5m` pendente para o mesmo cliente/deal;
   - cancelar follow-ups de reengajamento que tentariam conduzir para agendamento ja existente.

5. Criar migration de limpeza:
   - cancelar runs pendentes de `call_reminder_24h`, `call_reminder_2h` e `call_reminder_15m` cuja `scheduled_at` esteja colada no `created_at` por causa do clamp para `now`;
   - cancelar duplicidades por `appointment_id + automation_key + scheduled_at`;
   - preservar historico ja processado.

### Fase 3 - Normalizar nome antes do disparo

1. Criar helper compartilhado no CRM interno, por exemplo:

   - `supabase/functions/internal-crm-api/nameFormatting.ts`, ou
   - funcoes dentro de `templatePayload.ts`, se ficar mais simples e isolado.

2. Regras do helper:
   - remover espacos duplicados;
   - ignorar valores que parecem telefone, e-mail, URL ou placeholder vazio;
   - pegar o primeiro nome para `{{nome}}`;
   - aplicar title case;
   - tratar nomes em caps lock: `LEONARDO PEREIRA` -> `Leonardo`;
   - tratar minusculas: `leonardo pereira` -> `Leonardo`;
   - respeitar acentos quando existirem;
   - fallback: usar `Cliente` ou omitir saudacao nominal quando o dado nao for confiavel.

3. Adicionar `{{nome_completo}}` opcional com nome completo tratado, caso algum template administrativo precise disso no futuro.

4. Atualizar `buildAutomationTemplatePayload` para:
   - `nome = primeiro_nome_tratado`;
   - `nome_completo = nome_completo_tratado`;
   - manter `empresa` separado.

5. Testes de regressao:
   - `LEONARDO PEREIRA` -> `Leonardo`;
   - `maria eduarda silva` -> `Maria`;
   - `JOAO DA SILVA` -> `Joao`;
   - telefone/e-mail vazio -> fallback seguro.

### Fase 4 - Reescrever templates atuais

1. Remover `{{link_agendamento}}` dos templates lead-facing.

2. Remover `{{link_agendamento}}` da lista de tokens comuns no painel:

   - `src/modules/internal-crm/components/automations/InternalCrmAutomationsView.tsx`, linha 56

3. Templates sugeridos para lead:

   - `lp_form_without_schedule_reengage_5m`:
     `Oi, {{nome}}. Vi seu cadastro por aqui. Para eu entender seu cenario e te orientar melhor, me diz um bom horario para uma chamada rapida hoje ou amanha?`

   - `lp_form_with_schedule_confirmation`:
     `Perfeito, {{nome}}. Sua chamada ficou marcada para {{data_hora}}. Perto do horario eu te chamo por aqui, combinado?`

   - `call_reminder_24h`:
     `Passando para confirmar nossa chamada de amanha as {{hora}}. Continua bom para voce?`

   - `call_reminder_2h`:
     `Oi, {{nome}}. Nossa chamada e hoje as {{hora}}. Tudo certo por ai?`

   - `call_reminder_15m`:
     `Estamos quase no horario da nossa chamada. Te chamo em alguns minutos por aqui.`

   - `no_show_recovery_10m`:
     `Oi, {{nome}}. Acho que aconteceu algum imprevisto na chamada. Se ainda fizer sentido, me diz um horario melhor para retomarmos.`

   - `no_show_recovery_d1`:
     `Oi, {{nome}}. Passando rapidinho para saber se voce ainda quer que eu te ajude com isso. Melhor retomar hoje ou deixar para outro dia?`

   - `no_show_recovery_d3`:
     `Vou te deixar tranquilo por aqui. Quando fizer sentido retomar, me responde e eu pego o contexto de novo.`

4. Templates administrativos podem continuar com `crm_url`, pois sao internos. A mudanca de link e focada em mensagens ao lead.

5. Aplicar migration de update com cuidado:
   - atualizar regras do sistema por `automation_key`;
   - preservar regras customizadas quando `is_system = false`;
   - registrar antes/depois em audit log ou comentario de migration.

### Fase 5 - Ajustar fallback de links

1. Remover fallback de `link_agendamento` para landing page e URL do CRM.

2. Se algum template ainda usar `{{link_agendamento}}`, renderizar vazio ou bloquear o envio com `missing_required_template_value`, dependendo do canal.

3. Para `link_reuniao`:
   - manter apenas se houver `meeting_link` real;
   - nao inserir texto falando "link da reuniao" em template padrao, porque nem sempre existe.

### Fase 6 - Testes e validacao

1. Testes unitarios de template:
   - nome tratado;
   - links ausentes;
   - tokens desconhecidos;
   - template sem `{{link_agendamento}}`.

2. Testes de agendamento:
   - call marcada para amanha com menos de 24h de antecedencia: confirmacao sai agora, 24h nao sai;
   - call marcada para daqui 3h: confirmacao sai agora, 24h nao sai, 2h agenda corretamente se ainda houver janela;
   - call marcada para daqui 10 min: confirmacao sai agora, 24h/2h/15m nao saem imediatamente;
   - reagendamento cancela lembretes antigos e cria novos;
   - cancelar/no-show/done cancela lembretes pendentes.

3. Testes de banco:
   - nao ha duas `automation_runs` pendentes com mesma `automation_key + appointment_id + appointment_start_at`;
   - runs puladas recebem `result_payload.skip_reason`;
   - migration de limpeza nao altera runs completadas.

4. Smoke em staging/producao controlada:
   - criar lead teste;
   - criar agendamento para amanha;
   - verificar `automation_runs`;
   - verificar mensagens enviadas;
   - verificar que nao existe mensagem com "link de agendamento".

### Fase 7 - Deploy apos aprovacao

1. Implementar branch com:
   - edge function `internal-crm-api`;
   - helper de nomes;
   - migrations do CRM interno;
   - ajuste da UI de automacoes para remover token de link de agendamento.

2. Rodar testes locais.

3. Fazer commit atomico.

4. Aplicar migrations no Supabase.

5. Fazer deploy da edge function `internal-crm-api`.

6. Subir frontend/API para VPS via Portainer.

7. Monitorar por pelo menos 15 minutos:
   - `automation_runs` novas;
   - runs `skipped_due_before_creation`;
   - falhas de envio;
   - duplicidades por appointment.

## Criterios de aceite

1. Agendar uma call para amanha nao dispara, no mesmo momento, a mensagem "nossa chamada e amanha".
2. Uma call gera apenas uma confirmacao imediata ao lead.
3. Lembretes de 24h, 2h e 15m so disparam quando a janela real ainda existe.
4. `{{nome}}` envia `Leonardo` quando o lead esta como `LEONARDO PEREIRA`.
5. Nenhuma mensagem ao lead usa "link de agendamento".
6. Landing page nunca e usada como fallback de `link_agendamento`.
7. Reagendar/cancelar/no-show nao deixa lembretes antigos pendentes.
8. O SolarZap original nao sofre alteracao funcional.

## Risco e rollback

Riscos principais:

1. Regras customizadas que ainda dependem de `{{link_agendamento}}` podem ficar com texto incompleto se nao forem migradas.
2. Ao pular lembretes vencidos, a equipe pode perceber menos mensagens automaticas em agendamentos de curtissimo prazo. Esse e o comportamento correto para evitar duplicidade e mensagens sem contexto.
3. A mudanca de nome pode impactar mensagens administrativas que esperavam nome completo. Por isso `{{nome_completo}}` deve ser criado como alternativa.

Rollback:

1. Reverter deploy de `internal-crm-api`.
2. Restaurar templates antigos apenas se necessario, sem reativar fallback para landing page.
3. Reprocessar apenas runs pendentes seguras. Runs canceladas pela migration devem permanecer canceladas para nao reenviar mensagens antigas.

