# Plano de acao - CRM interno: mensagens criando conversas novas

Data: 2026-05-09

## Objetivo

Corrigir de forma definitiva o bug em que cada nova mensagem do WhatsApp cria um novo cliente e uma nova conversa no CRM interno, em vez de ser registrada na conversa ja existente do mesmo contato.

Escopo obrigatorio: atuar somente no CRM interno, em `internal_crm` e nas Edge Functions internas. Nao alterar tabelas, fluxos ou comportamento do SolarZap original.

## Diagnostico confirmado

O problema nao e apenas visual. O banco ja contem multiplos `internal_crm.clients` com o mesmo telefone e multiplas `internal_crm.conversations` para a mesma instancia de WhatsApp.

Evidencias verificadas em producao:

- Telefone `5514***2690`: 94 clientes duplicados, todos sem `owner_user_id` e sem `linked_public_org_id`.
- Telefone `5582***3195`: 46 clientes duplicados, todos sem `owner_user_id` e sem `linked_public_org_id`.
- Telefone `5516***6176`: 27 clientes duplicados, todos sem `owner_user_id` e sem `linked_public_org_id`.
- A tabela `internal_crm.whatsapp_instances` em producao nao possui `owner_user_id` nem `linked_public_org_id`.
- O webhook em `supabase/functions/internal-crm-api/index.ts` usa `instance.owner_user_id` para resolver o cliente, mas esse campo nao existe na tabela.

Trecho critico atual:

- `handleWebhookInbound` resolve `ownerUserId = asString(instance.owner_user_id)`.
- `resolveScopedClient` so procura clientes quando existe `ownerUserId` ou `linkedPublicOrgId`.
- Como ambos ficam vazios, `resolveScopedClient` sempre retorna `null`.
- O webhook entao cria um novo `internal_crm.clients` para cada mensagem.
- A conversa e procurada por `client_id + whatsapp_instance_id + channel`; como o `client_id` muda a cada mensagem, uma conversa nova tambem e criada.

Conclusao: a chave de agrupamento da conversa esta dependente de um cliente que esta sendo recriado a cada webhook. A conversa precisa ser ancorada em uma identidade canonica de chat: `whatsapp_instance_id + normalized_remote_jid`, com cliente canonico por telefone/escopo.

## Causa raiz

1. `internal_crm.whatsapp_instances` nao carrega escopo de dono/organizacao.
2. O webhook tenta usar um escopo inexistente (`instance.owner_user_id`).
3. O resolver de cliente rejeita clientes sem escopo por design.
4. A criacao do cliente nao usa upsert atomico por telefone.
5. A conversa nao tem uma chave propria de thread por WhatsApp; depende de `client_id`.
6. As travas atuais nao seguram o bug:
   - a unicidade de cliente por telefone exclui `owner_user_id IS NULL`;
   - a unicidade de conversa usa `client_id`, mas o cliente esta duplicando;
   - o fluxo Deno faz `select -> insert`, vulneravel a corrida quando mensagens chegam em rajada.

## Plano de correcao

### Etapa 1 - Parar a sangria no webhook

1. Criar migration somente em `internal_crm` adicionando escopo nas instancias:
   - `internal_crm.whatsapp_instances.owner_user_id uuid null`
   - `internal_crm.whatsapp_instances.linked_public_org_id uuid null`
   - indices para lookup por dono/organizacao.
2. Atualizar `upsertInstance` para persistir o escopo:
   - nova instancia recebe `owner_user_id = identity.user_id`;
   - instancia existente preserva o dono ja definido;
   - permitir `linked_public_org_id` apenas se vier de fluxo interno validado.
3. Atualizar `handleWebhookInbound`:
   - se a instancia nao tiver escopo, nao criar cliente/conversa;
   - registrar `instance_scope_missing` em `internal_crm.webhook_ignored_events`;
   - depois do backfill, esse caso deve ser zero.
4. Backfill das duas instancias atuais para o dono correto do CRM interno antes de liberar a nova funcao.

### Etapa 2 - Criar identidade canonica de conversa

1. Adicionar colunas em `internal_crm.conversations`:
   - `remote_jid text`
   - `contact_phone text`
2. Backfill:
   - `remote_jid` pelo `messages.remote_jid` mais recente;
   - fallback para `primary_phone || '@s.whatsapp.net'`;
   - `contact_phone` pelo telefone normalizado do cliente/mensagem.
3. Criar indice unico definitivo:
   - uma conversa por `whatsapp_instance_id + remote_jid + channel`;
   - nao depender de `status`, para nao recriar thread quando estiver resolvida/arquivada;
   - nova mensagem deve reabrir a mesma conversa.

### Etapa 3 - Resolver cliente e conversa de forma atomica

1. Criar RPC no schema `internal_crm`, por exemplo `get_or_create_whatsapp_thread`.
2. A RPC deve fazer tudo dentro de uma transacao:
   - normalizar telefone e `remote_jid`;
   - aplicar lock por `instance_id + remote_jid`;
   - encontrar ou criar cliente canonico no escopo da instancia;
   - encontrar ou criar contato principal;
   - encontrar ou criar conversa canonica por `instance_id + remote_jid`;
   - retornar `client_id`, `contact_id`, `conversation_id`.
3. Trocar o trecho manual do webhook por essa RPC.
4. Se chegarem 10 mensagens simultaneas do mesmo contato, o resultado esperado e:
   - 1 cliente;
   - 1 conversa;
   - 10 mensagens na mesma conversa.

### Etapa 4 - Corrigir dados ja quebrados

1. Criar script/migration de saneamento somente para `internal_crm`:
   - agrupar duplicados por `whatsapp_instance_id + normalized_phone`;
   - escolher cliente canonico por maior riqueza de dados e conversa mais recente;
   - mover mensagens de conversas duplicadas para a conversa canonica;
   - atualizar `deals`, `tasks`, `appointments`, `client_notes`, `automation_runs` e demais FKs internas para o cliente canonico;
   - consolidar stage pelo deal aberto principal;
   - arquivar conversas duplicadas vazias ou marcadas como mescladas.
2. Nao apagar nada no primeiro deploy:
   - registrar ids mesclados em metadata;
   - manter possibilidade de auditoria/rollback.
3. Depois da validacao visual, avaliar remocao fisica dos duplicados sem mensagens.

### Etapa 5 - Status e Pipeline

1. A etapa exibida na inbox deve vir do Pipeline:
   - primeiro deal aberto principal;
   - fallback `clients.current_stage_code`;
   - nunca misturar badges manuais como nome de instancia, fonte ou campanha.
2. Ao receber mensagem inbound:
   - se o deal aberto estiver em `novo_lead`, mover para `respondeu`;
   - se ja estiver em etapa posterior, manter etapa atual;
   - sincronizar `clients.current_stage_code` com o deal principal.
3. Rodar saneamento para remover divergencias do tipo `Novo Lead` e `Respondeu` simultaneos no mesmo lead.

### Etapa 6 - Guardrails para nao afetar o SolarZap original

1. Nenhuma migration em `public.leads`, `public.interacoes`, `public.whatsapp_instances` ou funcoes do SolarZap original.
2. Alterar apenas:
   - `internal_crm.*`
   - `supabase/functions/internal-crm-api`
   - testes do CRM interno.
3. Manter e ampliar o teste de fronteira `tests/unit/internalCrmBoundaryGuard.test.ts` para bloquear referencias indevidas ao schema publico.
4. Antes do deploy, revisar diff procurando:
   - `public.leads`
   - `public.interacoes`
   - `lead_id`
   - funcoes legacy do SolarZap original.

### Etapa 7 - Testes obrigatorios

1. Unitario: normalizacao de JID/telefone:
   - `558291883195@s.whatsapp.net`
   - `558291883195:12@s.whatsapp.net`
   - `status@broadcast`
   - `*@g.us`
2. Unitario: `resolveScopedClient` nao pode criar duplicado quando instancia tem owner.
3. Integracao local/fake:
   - duas mensagens sequenciais do mesmo telefone entram na mesma conversa.
   - duas mensagens simultaneas do mesmo telefone entram na mesma conversa.
   - mensagem duplicada por `wa_message_id` e ignorada.
4. Saneamento:
   - dataset com 3 clientes duplicados, 3 conversas e 6 mensagens vira 1 cliente, 1 conversa e 6 mensagens.
5. Regressao visual:
   - abrir `/admin/crm/inbox`;
   - selecionar Nizan/Rafael;
   - confirmar historico completo na mesma thread;
   - confirmar ausencia de novas linhas duplicadas apos nova mensagem.

## Ordem recomendada de implementacao

1. Migration de escopo das instancias + backfill.
2. Migration de `remote_jid/contact_phone` em conversas + indice unico.
3. RPC atomica `get_or_create_whatsapp_thread`.
4. Refatorar `handleWebhookInbound` para usar a RPC.
5. Script/migration de saneamento dos duplicados atuais.
6. Ajustar status/badges da inbox para Pipeline como fonte unica.
7. Rodar testes, build e teste de fronteira.
8. Deploy das Edge Functions internas e migrations.
9. Validacao em producao com mensagens reais.

## Risco principal

O maior risco e tentar corrigir apenas a UI. A UI esta mostrando o que o banco realmente contem: clientes e conversas duplicados. A correcao precisa ser estrutural no webhook e no modelo de dados do CRM interno.

## Resultado esperado

Apos a implementacao:

- cada contato do WhatsApp tera uma unica conversa por instancia;
- mensagens novas sempre serao anexadas na thread existente;
- rajadas simultaneas nao criarao conversas paralelas;
- clientes duplicados atuais serao consolidados sem perda de mensagens;
- status da inbox refletira a etapa real do Pipeline;
- SolarZap original permanecera isolado e sem alteracao.
