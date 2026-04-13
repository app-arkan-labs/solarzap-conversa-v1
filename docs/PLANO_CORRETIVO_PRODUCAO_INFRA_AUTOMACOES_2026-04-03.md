# Plano Corretivo Completo: indisponibilidade publica e automacoes do CRM Interno

Data: 2026-04-03
Status: analise concluida. Planejamento somente. Nao executar ate nova autorizacao.

## Escopo

Este plano cobre dois incidentes criticos:

1. indisponibilidade publica do:
   - `admin.solarzap.com.br`
   - `solarzap.arkanlabs.com.br`
   - `crm.solarzap.com.br`
   - `app.solarzap.com.br`
   - `portainer.arkanlabs.com.br`

2. automacoes do CRM Interno do painel admin que nao estao enviando mensagens apos criacao de leads

## Achados confirmados

## 1. Problema da indisponibilidade publica

### Evidencia tecnica confirmada

- `admin.solarzap.com.br`, `solarzap.arkanlabs.com.br` e `portainer.arkanlabs.com.br` resolvem para o mesmo IP:
  - `129.121.33.53`
- teste de conectividade TCP na porta `443` falha para todos:
  - `TcpTestSucceeded = False`
- o timeout nao e apenas do app:
  - o Portainer tambem fica inacessivel no mesmo IP

### Conclusao

O problema nao esta restrito ao frontend React nem a uma tela especifica.

A causa raiz mais provavel esta na camada de infraestrutura publica da VPS:

- proxy/ingress
- firewall
- roteamento de rede
- disponibilidade do host
- servico Traefik/Caddy na borda

Como o Portainer tambem cai no mesmo IP, isso aponta para incidente de infraestrutura da VPS ou da borda, nao para um bug de tela.

## 2. Problema das automacoes do CRM Interno

### Evidencia tecnica confirmada no banco

No `internal_crm`:

- existe cron ativo:
  - `internal-crm-process-automation-runs`
  - `schedule = * * * * *`
  - `active = true`

- existem varios jobs vencidos em `internal_crm.automation_runs`:
  - status `pending`
  - `scheduled_at <= now()`
  - `attempt_count = 0`
  - alguns desde `2026-03-29`

Isso mostra que:

- os jobs estao sendo criados
- mas nao estao sendo consumidos pelo processador

### Evidencia tecnica na edge function

Chamada direta para:

- `internal-crm-api`
- action `process_automation_runs`

retorna:

- `automation_runs_claim_failed`

### Evidencia tecnica no banco para a RPC

A funcao existe e funciona:

- `internal_crm.claim_due_automation_runs(p_limit integer default 20)`

Teste SQL direto:

- `select * from internal_crm.claim_due_automation_runs(1);`

retorna linhas normalmente.

### Conclusao sobre a automacao

O bug principal do processador e de codigo na edge function:

- o `internal-crm-api` chama:
  - `serviceClient.rpc('claim_due_automation_runs', { p_limit: limit })`

Mas a rotina esta no schema:

- `internal_crm`

Logo, a chamada RPC esta apontando para o schema errado.

Resultado:

- a rotina nunca e executada pelo processador
- os runs ficam eternamente `pending`
- os disparos de `5 min depois` e similares nao saem

## 3. Problema adicional no transporte de mensagens

### Evidencia tecnica em runs com falha

Runs antigos com `status = failed` trazem `last_error` com:

- `evolution_request_failed:500`
- mensagem do Evolution:
  - `Can't reach database server at postgres:5432`

### Conclusao

Mesmo depois de corrigir o bug do claim dos jobs, ainda existe um segundo risco de producao:

- o Evolution/API de WhatsApp teve ou tem falha de conexao com o proprio banco interno dele

Ou seja:

1. hoje os jobs nao andam porque o processador quebra antes
2. mas quando o processador rodar, o envio pode voltar a falhar se o Evolution ainda estiver sem acesso ao banco

## 4. Estado da instancia WhatsApp do CRM Interno

No banco:

- `default_whatsapp_instance_id = effee2ac-f01b-49f4-9ab3-f24c6e618c0f`
- instancia:
  - `instance_name = sz_internal_rodrigo_mentoria_121570`
  - `display_name = Rodrigo Mentoria`
  - `status = connected`
  - `phone_number = null`

### Conclusao

Existe uma inconsistencia adicional:

- a instancia aparece como `connected`
- mas `phone_number` esta `null`

Isso nao explica sozinho os jobs `pending`, mas e um sinal de integracao fragil e deve entrar no corretivo.

## Causas raiz consolidadas

## Incidente A - indisponibilidade publica

Causa raiz mais provavel:

- indisponibilidade da borda/VPS no IP `129.121.33.53`

Camadas suspeitas:

- Traefik
- firewall
- networking do host
- queda do node/VM
- bloqueio externo de `443`

## Incidente B - automacoes do CRM Interno nao disparam

Causa raiz confirmada:

- `internal-crm-api` chama a RPC `claim_due_automation_runs` sem schema correto
- a RPC real esta em `internal_crm.claim_due_automation_runs`

Consequencia:

- runs vencidos permanecem `pending`
- mensagens de follow-up e reengajamento nao sao processadas

## Incidente C - risco no Evolution

Causa raiz adicional confirmada historicamente:

- Evolution retornou `500` por falha de acesso ao banco `postgres:5432`

Consequencia:

- mesmo com o processador corrigido, o envio ainda pode falhar enquanto essa camada nao estiver saudavel

## Plano corretivo definitivo

## Fase 1 - Restaurar a disponibilidade publica

Objetivo:

- recuperar o acesso ao `admin`, `solarzap`, `crm`, `app` e `portainer`

### Acoes

1. Verificar o estado real do host/VPS:
   - node up/down
   - uso de CPU/memoria/disco
   - status do docker swarm manager

2. Verificar a borda:
   - servico `traefik_traefik`
   - listeners em `80/443`
   - health do container
   - logs recentes

3. Verificar rede/firewall:
   - firewall da VPS
   - regra cloud/hosting
   - bloqueio de `443`
   - rota externa para `129.121.33.53`

4. Verificar se houve alteracao de IP ou drift de DNS

5. Restaurar primeiro o Portainer e a borda, depois validar os dominios do app

### Aceite

- `Test-NetConnection <dominio> -Port 443` volta a responder
- os 5 dominios respondem HTTP/HTTPS

## Fase 2 - Corrigir o claim dos jobs de automacao

Objetivo:

- fazer o processador consumir os `pending` vencidos

### Acoes

1. Corrigir `supabase/functions/internal-crm-api/index.ts`

Trocar a chamada:

- `serviceClient.rpc('claim_due_automation_runs', { p_limit: limit })`

por uma chamada garantidamente correta para o schema `internal_crm`.

Opcoes validas:

- usar SQL/RPC schema-aware
- ou substituir por query explicita equivalente ao claim

Recomendacao:

- evitar dependencia ambigua de `rpc()` para schema nao publico
- implementar claim explicitamente com query segura e transacional

2. Validar `processAutomationRunsWithOptions` com teste real

3. Criar teste unitario/regressao para esse fluxo

### Aceite

- `process_automation_runs` deixa de retornar `automation_runs_claim_failed`
- jobs vencidos saem de `pending`

## Fase 3 - Drenar backlog de runs pendentes

Objetivo:

- recuperar os leads e follow-ups que ficaram travados

### Acoes

1. listar todos os `pending` vencidos
2. reprocessar em lotes controlados
3. monitorar:
   - `processed_count`
   - `failed_count`
   - `last_error`

4. gerar relatorio:
   - quantos foram enviados
   - quantos falharam
   - quais ainda precisam de acao manual

### Aceite

- backlog reduzido a zero ou a fila residual justificavel

## Fase 4 - Validar transporte do WhatsApp/Evolution

Objetivo:

- garantir que, apos destravar o processador, o envio realmente aconteca

### Acoes

1. revisar saude do stack `evolution`
2. validar conectividade do Evolution ao banco dele
3. confirmar:
   - `postgres:5432` acessivel dentro do ambiente do Evolution
   - variaveis de ambiente corretas
   - database do Evolution online

4. enviar mensagem de teste real via:
   - `whatsapp_lead`
   - `whatsapp_admin`

5. revisar `last_error` e resposta do Evolution

### Aceite

- nenhuma falha `Can't reach database server at postgres:5432`
- mensagem real enviada com sucesso

## Fase 5 - Corrigir consistencia da instancia interna

Objetivo:

- garantir que a instancia padrao do CRM Interno esteja realmente operacional

### Acoes

1. verificar por que `status = connected` mas `phone_number = null`
2. sincronizar status/phone com origem real
3. validar webhook e status refresh

### Aceite

- instancia default conectada com telefone preenchido

## Fase 6 - Observabilidade e blindagem

Objetivo:

- evitar reincidencia silenciosa

### Acoes

1. adicionar alertas para:
   - crescimento anormal de `automation_runs.pending`
   - falha de `process_automation_runs`
   - falha do Evolution 500
   - borda/443 indisponivel

2. criar smoke operacional:
   - criar lead
   - verificar job 5 min
   - disparar processamento
   - confirmar envio

3. criar runbook rapido de resposta

## Arquivos e areas provaveis de correcao

### Codigo

- `supabase/functions/internal-crm-api/index.ts`

### Infra

- stack `solarzap`
- stack `traefik`
- stack `evolution`
- firewall/VPS

### Dados

- `internal_crm.automation_runs`
- `internal_crm.automation_rules`
- `internal_crm.automation_settings`
- `internal_crm.whatsapp_instances`

## Ordem recomendada de execucao

1. restaurar `443` / borda / Portainer
2. corrigir o processador de automacoes
3. validar envio no Evolution
4. drenar backlog de runs pendentes
5. validar lead novo + disparo de 5 min
6. monitorar por 1 ciclo completo

## Resumo executivo

Os problemas atuais nao sao um unico bug.

Existem pelo menos dois incidentes graves e independentes:

1. a infraestrutura publica da VPS/borda esta indisponivel
2. o processador das automacoes do CRM Interno esta quebrado por chamada errada da RPC de claim

E existe ainda um terceiro risco operacional:

3. o Evolution/WhatsApp ja apresentou falha de banco interno, o que pode continuar impedindo envios mesmo apos corrigir o claim

## Regra deste plano

Nao executar ainda.

Proximo passo somente quando o usuario mandar:

- executar este plano corretivo de producao e automacoes
