# Plano Corretivo Definitivo - Variaveis de Automacao do CRM Interno

Data: 2026-04-03
Status: Planejado, sem execucao
Escopo: corrigir interpolacao de variaveis em templates de automacao do CRM Interno sem disparar mensagens reais durante a validacao

## Objetivo
Corrigir o envio de templates do CRM Interno para que variaveis como `{{link_agendamento}}`, `{{link_reuniao}}`, `{{crm_url}}`, `{{nome}}` e correlatas nao sejam enviadas vazias, e validar a correcao sem fazer spam em leads reais.

## Diagnostico Atual
Com base no codigo atual de [index.ts](C:\Users\rosen\Downloads\solarzap-conversa-main\supabase\functions\internal-crm-api\index.ts), o problema mais forte esta no contrato do payload do template, nao no WhatsApp.

### Evidencias encontradas
1. A funcao `buildAutomationTemplatePayload` calcula corretamente fallbacks para:
   - `link_agendamento`
   - `link_reuniao`
   - `crm_url`
2. Porem, no final do objeto retornado, ela faz:
   - `...commercialContext`
   - `...appointmentMetadata`
   - `...payload`
3. No fluxo `lp_form_submitted`, o `intakePayload` grava explicitamente:
   - `link_agendamento: null` quando o formulario nao trouxe link
   - `link_reuniao: null` quando o formulario nao trouxe link
4. Esse `null` do `payload` sobrescreve o fallback calculado acima.
5. A funcao `renderAutomationTemplate` converte `null` em string vazia.
6. Resultado: o template sai assim:
   - `... escolhe aqui o melhor horario da chamada:`
   sem link no final.
7. Como `queueAutomationEvent` salva `template_body` ja renderizado no `automation_run`, o erro fica congelado no run e continua em retries, mesmo que o backend volte depois.

## Causa Raiz Provavel
A causa raiz principal e sobrescrita indevida de campos normalizados por valores `null` ou vazios vindos do `payload`, `commercial_context` ou `appointment_metadata`.

Em resumo:
- o backend calcula o fallback certo
- depois pisa nesse fallback com valor nulo
- o render transforma nulo em vazio
- o run fica salvo com o texto quebrado

## Impacto
1. Templates de automacao saem sem links essenciais.
2. Retries nao corrigem o texto porque o `template_body` ja foi salvo quebrado.
3. Leads recebem mensagens incompletas.
4. O fluxo operacional perde conversao e gera ruído comercial.

## Plano de Correcao

### Fase 1 - Blindagem do payload do template
Objetivo: impedir que valores `null`, `undefined` ou vazios sobrescrevam fallbacks validos.

Acoes:
1. Refatorar `buildAutomationTemplatePayload` para nao usar spread cru de `payload`, `commercialContext` e `appointmentMetadata` sobre campos ja normalizados.
2. Introduzir merge seguro com regra do tipo:
   - somente sobrescrever se o valor novo for string nao vazia, numero valido ou booleano explicito
3. Prioridade desejada dos campos:
   - valor explicito valido do evento
   - valor valido do `commercial_context`
   - valor valido de `appointment_metadata`
   - fallback interno calculado
4. Garantir que `link_agendamento` nunca volte a `null` se ja houver fallback resolvido.
5. Garantir o mesmo para:
   - `link_reuniao`
   - `crm_url`
   - `nome`
   - `empresa`
   - `hora`
   - `data_hora`
   - `produto_fechado`

### Fase 2 - Blindagem do payload de origem do LP
Objetivo: nao persistir chaves nulas de forma que atrapalhem a renderizacao.

Acoes:
1. Ajustar o `intakePayload` do evento `lp_form_submitted` para omitir chaves inexistentes, em vez de salvar `null` nelas.
2. Ajustar `dealCommercialContext` para nao gravar `scheduling_link` e `meeting_link` como `null` quando nao existirem.
3. Ajustar `appointments.metadata` na mesma linha.
4. Se nao existir `link_agendamento` real, definir fallback operacional explicito.

### Fase 3 - Definicao clara do fallback de agendamento
Objetivo: o lead sempre receber um destino util, mesmo sem link externo.

Acoes:
1. Decidir a hierarquia definitiva do `link_agendamento`:
   - `payload.link_agendamento`
   - `payload.scheduling_link`
   - `deal.commercial_context.scheduling_link`
   - `appointment.metadata.scheduling_link`
   - URL publica do fluxo LP, se existir
   - URL interna de CRM apenas como ultimo fallback operacional
2. Revisar a tabela `internal_crm.landing_form_funnels` para incluir um campo proprio de link de reagendamento, se necessario.
3. Se o LP tiver pagina publica de reagendamento, usar esse link e nao a URL interna do admin.

### Fase 4 - Nao congelar template quebrado em runs futuros
Objetivo: impedir que um run nasca com `template_body` incorreto e perpetue o erro.

Acoes:
1. Revisar `queueAutomationEvent` para salvar `template_body` somente depois de sanitizar o payload.
2. Opcionalmente, salvar tambem um `render_context_snapshot` no `result_payload` ou `payload` para auditoria futura.
3. Avaliar se o envio deve renderizar novamente no momento do dispatch quando houver campos dinamicos criticos.

### Fase 5 - Ferramenta de preview sem envio real
Objetivo: validar templates sem tocar em leads reais.

Acoes:
1. Criar um modo de preview para automacao no `internal-crm-api`, por exemplo:
   - `preview_automation_rule`
2. Esse modo deve:
   - montar o payload
   - renderizar o template
   - retornar JSON com campos e texto final
   - nao enviar WhatsApp
   - nao inserir mensagem no inbox
3. Expor esse preview tambem na UI do CRM Interno, se necessario.

### Fase 6 - Correcao dos runs ja quebrados sem spam
Objetivo: reprocessar somente o necessario e com texto validado antes.

Acoes:
1. Identificar runs recentes do tipo `lp_form_without_schedule_reengage_5m` com `template_body` faltando link.
2. Antes de qualquer replay, validar o preview em modo seco.
3. Reprocessar apenas runs explicitamente selecionados.
4. Nunca usar lead real como teste de diagnostico.

## Validacao Planejada Sem Spam
A validacao deve ser feita nesta ordem:

1. Teste unitario local do renderer:
   - payload com `link_agendamento = null`
   - confirmar que o fallback continua presente
2. Teste unitario da montagem de payload:
   - `buildAutomationTemplatePayload` com `payload`, `commercialContext` e `appointmentMetadata` mistos
   - confirmar prioridade correta
3. Preview via edge function sem envio:
   - gerar texto final do template do LP
4. Conferencia do texto em resposta JSON
5. So depois disso, replay controlado em runs selecionados

## Arquivos Provaveis da Correcao
1. [index.ts](C:\Users\rosen\Downloads\solarzap-conversa-main\supabase\functions\internal-crm-api\index.ts)
2. [InternalCrmAutomationsView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\automations\InternalCrmAutomationsView.tsx) se o preview for exposto na UI
3. Testes novos em `tests/unit/` para payload e renderer

## Criterios de Aceite
1. `{{link_agendamento}}` nao pode sair vazio quando houver fallback disponivel.
2. `{{link_reuniao}}` nao pode ser apagado por `null` posterior.
3. O preview precisa mostrar exatamente o texto que seria enviado.
4. Nenhum teste de validacao deve disparar mensagem real.
5. Replays futuros devem funcionar pelo endpoint sem erro de `result_payload` nulo.

## Riscos e Cuidados
1. O fallback atual de `link_agendamento` para URL interna do CRM pode nao ser o destino ideal para lead externo.
2. Se houver templates antigos dependendo de sobrescrita por spread, a refatoracao precisa preservar compatibilidade controlada.
3. Reprocessamento de runs antigos deve ser selecionado manualmente para evitar duplicidade.

## O que NAO sera feito sem autorizacao
1. Nenhum envio de teste para lead real.
2. Nenhum replay em massa.
3. Nenhuma alteracao em producao fora do escopo das variaveis.

## Execucao prevista quando autorizada
1. Corrigir montagem de payload
2. Criar preview sem envio
3. Rodar testes locais
4. Publicar edge function
5. Validar preview em run real sem disparar
6. Reprocessar somente os runs autorizados
