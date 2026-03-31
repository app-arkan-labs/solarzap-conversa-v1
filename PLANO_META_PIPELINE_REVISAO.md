# Plano de Acao Definitivo - LP, Meta Pixel e Separacao CRM Interno x SolarZap

## 1. Objetivo

Resolver de forma definitiva dois problemas de producao ligados ao fluxo da landing page:

1. O Meta Pixel nao esta funcionando corretamente na LP publicada.
2. O fluxo de captura/agendamento esta misturando escopo entre SolarZap publico e CRM interno, com risco de reaproveitar ou bloquear registros pelo telefone errado.

Este documento substitui o plano preliminar anterior e passa a servir como plano tecnico de correcao, rollout, validacao e rollback.

## 2. Resumo executivo

Os achados atuais apontam para tres causas principais:

1. A LP publica nao estava estavel no momento da verificacao e chegou a responder 502, o que invalida qualquer teste de Pixel no dominio publicado.
2. Mesmo no ambiente local, o script do Meta Pixel e carregado, mas o objeto `window.fbq` nao e inicializado. O frontend atual carrega `fbevents.js`, mas nao instala o bootstrap padrao do Pixel antes do carregamento.
3. O intake publico do CRM interno ainda faz lookup global por telefone e e-mail dentro de `internal_crm.clients` e `internal_crm.client_contacts`, sem respeitar tenant, org publica vinculada ou owner. Isso viola a separacao exigida entre SolarZap publico e CRM interno.

Conclusao: o problema nao e apenas de UI, nem apenas de tracking. Trata-se de um bug estrutural de resolucao de identidade mais um bug operacional/tecnico de inicializacao do Pixel.

## 3. Achados confirmados

### 3.1 LP publica e Meta Pixel

1. O dominio `https://lp.aceleracao.solarzap.com.br/` respondeu `502 Bad Gateway` durante a investigacao.
2. No ambiente local da LP, o script `https://connect.facebook.net/en_US/fbevents.js` e carregado.
3. Mesmo com o script carregado, `window.fbq` permaneceu `undefined`.
4. O frontend ja tenta disparar:
   - `PageView` no carregamento da pagina
   - `Lead` no passo de envio do formulario
   - `Schedule` no passo de agendamento
5. Como `fbq` nao existe, os eventos do browser nao executam de fato.

### 3.2 Separacao entre SolarZap publico e CRM interno

1. O resolvedor de lead canonico do SolarZap publico ja trabalha com escopo de org e nao e o principal culpado do conflito.
2. O `internal-crm-api` ainda resolve cliente interno por telefone/e-mail de forma global no intake publico.
3. O mesmo padrao de lookup global por telefone tambem aparece no fluxo de WhatsApp inbound.
4. O funil da LP esta hoje vinculado a uma org publica real e a um owner real:
   - `linked_public_org_id = 70d3af46-37f6-4ff4-a6f6-4cebd6341129`
   - `linked_public_user_id = d82bb771-1c20-4328-a17f-567ccd81c9c8`
   - `owner_user_id = d82bb771-1c20-4328-a17f-567ccd81c9c8`
5. Todos os clientes internos atuais consultados ja possuem `linked_public_org_id` e `owner_user_id`, o que permite corrigir o problema com lookup escopado sem depender de heuristica global.

### 3.3 Estado atual dos dados

1. Nao foi encontrada duplicidade atual de `primary_phone` dentro de `internal_crm.clients`.
2. Nao foi encontrado mismatch atual entre telefones de `tracking_bridge` e seus respectivos clientes internos.
3. Existem telefones em `public.leads` da org da LP que ainda nao existem em `internal_crm.clients`, o que confirma que os dois mundos coexistem e nao devem ser confundidos.

## 4. Causa raiz

### 4.1 Causa raiz do Meta Pixel

O frontend da LP implementou um loader do arquivo `fbevents.js`, mas nao implementou o bootstrap padrao do Pixel que cria a fila `fbq` antes do script carregar. O resultado e:

1. O arquivo remoto entra na pagina.
2. O helper da Meta nao detecta um Pixel ativo.
3. As chamadas `window.fbq('init', ...)` e `window.fbq('track', ...)` nao executam porque `window.fbq` nunca existe.

### 4.2 Causa raiz da mistura entre SolarZap e CRM interno

O intake publico foi ajustado para reaproveitar lead existente, mas o criterio de reaproveitamento ainda esta errado. Hoje ele pergunta, na pratica:

1. Existe alguem no CRM interno com esse telefone?
2. Existe alguem no CRM interno com esse e-mail?

Mas ele nao pergunta:

1. Esse registro pertence a mesma org publica vinculada a esta LP?
2. Esse registro pertence ao mesmo owner/tenant do funil atual?
3. Esse telefone esta associado a outro tenant e, portanto, deve gerar um novo cliente interno isolado?

Isso produz dois efeitos perigosos:

1. Reuso indevido de cliente interno de outro escopo.
2. Bloqueio do fluxo quando ha cruzamento entre lead publico ja existente e cliente interno de tenant diferente.

### 4.3 Causa raiz operacional adicional

O fato de a LP publicada responder `502` indica que, mesmo com o codigo corrigido, ainda existe um risco operacional na stack da landing page. Portanto, o plano precisa prever recuperacao da VPS e validacao real do dominio publicado.

## 5. Principios obrigatorios da solucao

Qualquer implementacao definitiva deve obedecer aos principios abaixo:

1. `public.leads` e `internal_crm.clients` sao entidades distintas. Compartilhar telefone nao significa compartilhar identidade.
2. O mesmo telefone pode existir em tenants diferentes sem causar reuso indevido.
3. Reentrada no mesmo tenant deve reaproveitar o mesmo cliente interno e permitir novo agendamento.
4. Reentrada em tenant diferente nao pode atualizar nem travar o tenant anterior.
5. O bridge entre CRM interno e SolarZap publico deve respeitar org/owner e nunca fazer adocao cross-org.
6. Pixel browser e CAPI devem usar o mesmo `event_id` por evento para deduplicacao correta.

## 6. Escopo tecnico da correcao

### 6.1 Frontend LP

Arquivos-alvo esperados:

1. `solarzap-lp-aceleracao-main/src/lib/metaPixel.js`
2. `solarzap-lp-aceleracao-main/src/App.jsx`
3. `solarzap-lp-aceleracao-main/src/components/LeadPopupModal.jsx`
4. `solarzap-lp-aceleracao-main/src/lib/lpPopupState.js`

### 6.2 Edge Functions e backend

Arquivos-alvo esperados:

1. `supabase/functions/internal-crm-api/index.ts`
2. `supabase/functions/lp-popup-intake/index.ts`
3. `supabase/functions/_shared/internalCrmTrackingBridge.ts`
4. `supabase/functions/_shared/leadCanonical.ts`
5. Novo helper compartilhado para resolucao escopada de cliente interno, se necessario

### 6.3 Banco de dados

Objetos-alvo esperados:

1. `internal_crm.clients`
2. `internal_crm.client_contacts`
3. `internal_crm.tracking_bridge`
4. Nova migration para normalizacao/indice por telefone em escopo
5. Possivel RPC/helper SQL para resolver cliente por escopo e telefone

## 7. Plano detalhado por fase

## Fase 0 - Contencao e observabilidade

Objetivo: reduzir risco de regressao e aumentar capacidade de diagnostico antes da mudanca.

### Entregas

1. Gerar consultas de auditoria para listar:
   - clientes internos por telefone e escopo
   - bridges por org e public lead
   - sessoes da LP com `internal_client_id` / `internal_deal_id`
   - telefones presentes so em `public.leads`
2. Instrumentar logs no `internal-crm-api` para registrar:
   - escopo efetivo resolvido
   - estrategia usada para resolver o cliente
   - quando houver tentativa de reaproveitamento cross-scope
3. Separar logs de conflito em codigo claro, por exemplo `cross_scope_phone_conflict`.

### Criterio de saida

1. Conseguimos identificar, em producao, exatamente quando um telefone foi resolvido no escopo errado.

## Fase 1 - Restaurar a LP publicada e corrigir o Meta Pixel

Objetivo: colocar a LP em estado testavel e fazer o Pixel funcionar de fato.

### Passos tecnicos

1. Verificar a saude da stack `solarzap-lp` na VPS e corrigir a causa do `502`.
2. Ajustar `src/lib/metaPixel.js` para usar o bootstrap padrao da Meta:
   - criar `window.fbq` como stub/fila antes de carregar o script
   - evitar inicializacao duplicada
   - manter os locks existentes de `PageView` e `eventID`
3. Confirmar que `trackMetaPageView()` roda apenas apos `fbq` existir.
4. Confirmar que `Lead` e `Schedule` sao disparados somente quando houver `eventID` valido.
5. Garantir que o Pixel ID continue configuravel por env e com fallback para `775125208827879`.

### Validacao obrigatoria

1. `window.fbq` deve existir no browser.
2. O Meta Pixel Helper deve detectar o Pixel no dominio publicado.
3. `PageView` deve aparecer em network e/ou Test Events.
4. `Lead` e `Schedule` devem disparar com `eventID` consistente.

### Risco principal

1. Corrigir o Pixel sem estabilizar a LP publicada gera falso positivo local e falso negativo em producao.

## Fase 2 - Introduzir resolucao escopada de cliente interno

Objetivo: impedir que telefone e e-mail sejam usados como chave global entre tenants.

### Regra funcional definitiva

O fluxo publico da LP deve resolver cliente interno nesta ordem:

1. `landing_form_session.internal_client_id`, quando ja existir e pertencer ao escopo correto.
2. `tracking_bridge`, se ja houver vinculo entre o lead publico da org e um cliente interno do mesmo escopo.
3. `internal_crm.clients` por telefone no mesmo `linked_public_org_id`.
4. `internal_crm.client_contacts` por telefone, mas somente se o contato pertencer a cliente do mesmo `linked_public_org_id`.
5. `internal_crm.clients` por e-mail, mas somente no mesmo escopo.
6. Fallback por `owner_user_id`, apenas se `linked_public_org_id` estiver ausente e isso for esperado pelo tenant.
7. Se nada for encontrado no escopo atual, criar novo cliente interno.

### Regras proibidas

1. Nao consultar `client_contacts.phone` globalmente.
2. Nao consultar `clients.primary_phone` globalmente.
3. Nao consultar `clients.primary_email` globalmente.
4. Nao atualizar cliente de outro tenant so porque o telefone bateu.

### Implementacao tecnica

1. Extrair a resolucao de cliente para helper unico, por exemplo `resolveScopedInternalClient(...)`.
2. O helper deve receber:
   - `linked_public_org_id`
   - `owner_user_id`
   - `primary_phone`
   - `primary_email`
   - `existing_internal_client_id`
   - opcionalmente `public_lead_id`
3. O helper deve retornar:
   - cliente encontrado
   - metodo de resolucao
   - indicador de conflito cross-scope

### Criterio de saida

1. Um telefone existente em outro tenant nao pode mais bloquear o fluxo da LP atual.
2. Um telefone existente no mesmo tenant deve permitir reentrada e novo agendamento.

## Fase 3 - Aplicar a mesma regra ao fluxo de WhatsApp inbound

Objetivo: eliminar a segunda superficie de mistura de dados.

### Problema atual

O fluxo de mensagem inbound tambem faz lookup global por telefone e pode conectar conversa nova ao cliente interno errado.

### Correcao obrigatoria

1. Refatorar o inbound para usar o mesmo resolver escopado da Fase 2.
2. Resolver o escopo a partir da instancia/owner do WhatsApp.
3. Se o telefone existir em outro tenant, criar ou reutilizar cliente apenas no tenant da instancia atual.
4. Impedir que a conversa de uma instancia assuma cliente de outra conta por telefone global.

### Criterio de saida

1. O comportamento do inbound e do intake publico passa a obedecer a mesma regra de identidade.

## Fase 4 - Guardrails de banco para impedir regressao

Objetivo: mover a regra de separacao para o nivel de dados, nao apenas para o codigo.

### Mudancas propostas

1. Criar normalizacao de telefone para `internal_crm.clients.primary_phone` via expressao indexada ou coluna derivada.
2. Criar indice unico por escopo, por exemplo:
   - `unique (linked_public_org_id, phone_norm)` quando `linked_public_org_id is not null`
   - fallback opcional `unique (owner_user_id, phone_norm)` quando `linked_public_org_id is null`
3. Criar indices de apoio em `client_contacts` para lookup por telefone dentro do escopo do cliente.
4. Se necessario, criar helper SQL `internal_crm.find_client_by_scope(...)` para centralizar a regra.

### Decisao importante

1. A unicidade deve existir por tenant, nao globalmente.
2. O objetivo nao e impedir que o mesmo telefone exista no sistema inteiro. O objetivo e impedir ambiguidade dentro do mesmo escopo.

### Criterio de saida

1. O banco rejeita duplicidade indevida dentro do tenant correto.
2. O banco permite o mesmo telefone em tenants diferentes.

## Fase 5 - Hardening do tracking bridge

Objetivo: garantir que o bridge entre cliente interno e lead publico so opere no escopo correto.

### Regras obrigatorias

1. O bridge so pode sincronizar se houver `linked_public_org_id` resolvido.
2. O lead publico resolvido deve pertencer a mesma org publica do funil.
3. Se um `public_lead_id` ja estiver bridged para outro cliente interno da mesma org, o sistema deve:
   - reutilizar o cliente correto, quando for de fato a mesma identidade do tenant
   - ou registrar conflito e interromper o auto-link, quando houver ambiguidade real
4. Nao pode haver adocao cross-org de lead publico.

### Implementacao tecnica

1. Revisar `syncInternalCrmTrackingBridge(...)` para tratar conflito de bridge explicitamente.
2. Criar log/auditoria para `bridge_scope_conflict`.
3. Preservar a unique key atual em `(org_id, public_lead_id)`.

### Criterio de saida

1. O bridge deixa de ser vetor silencioso de mistura entre SolarZap e CRM interno.

## Fase 6 - Remediacao e saneamento de dados

Objetivo: verificar se o bug passado deixou registros para corrigir.

### Checklist de auditoria

1. Telefones repetidos por `linked_public_org_id` em `internal_crm.clients`.
2. Clientes com `linked_public_org_id` errado para o funil usado.
3. Bridges apontando para cliente interno com telefone divergente do lead publico.
4. Sessoes da LP apontando para `internal_client_id` que nao corresponde ao escopo esperado.
5. Conversas WhatsApp ligadas a cliente de owner diferente da instancia.

### Acao de saneamento

1. Corrigir apenas casos confirmados por auditoria.
2. Evitar merge automatico global.
3. Toda remediacao deve gerar log e SQL reversivel.

### Criterio de saida

1. Nenhum registro critico permanece preso ao tenant errado.

## Fase 7 - Matriz de validacao funcional

Objetivo: garantir que a correcao cobre todos os cenarios relevantes.

### Cenario 1 - Numero novo

1. Numero nao existe nem em `public.leads` nem em `internal_crm.clients`.
2. Resultado esperado:
   - cria cliente interno novo
   - cria ou vincula lead publico corretamente
   - permite agendamento

### Cenario 2 - Numero ja existe so no SolarZap publico da mesma org

1. Numero existe em `public.leads`, mas nao existe no CRM interno.
2. Resultado esperado:
   - cria cliente interno novo no tenant atual
   - reaproveita o lead publico correto da mesma org
   - nao trava o fluxo

### Cenario 3 - Numero ja existe no CRM interno da mesma org

1. Numero ja existe em `internal_crm.clients` do mesmo tenant.
2. Resultado esperado:
   - reaproveita o cliente interno correto
   - atualiza dados necessarios
   - permite novo agendamento

### Cenario 4 - Numero ja existe no CRM interno de outro tenant

1. Numero existe em outra org/owner.
2. Resultado esperado:
   - nao reaproveita o cliente do outro tenant
   - cria ou reutiliza cliente apenas dentro do tenant atual
   - nao bloqueia o fluxo atual

### Cenario 5 - Numero ja existe no SolarZap publico de outra org

1. Numero existe em `public.leads` de outra org.
2. Resultado esperado:
   - nao adota o lead de outra org
   - resolve ou cria lead apenas no escopo correto

### Cenario 6 - Reentrada apos agendamento

1. Mesmo numero retorna para agendar novamente.
2. Resultado esperado:
   - mantem o cliente interno correto
   - cria novo agendamento ou atualiza o esperado pela regra comercial
   - nao cria colisao cross-scope

### Cenario 7 - WhatsApp inbound

1. Mensagem chega de telefone ja existente em outro tenant.
2. Resultado esperado:
   - conversa resolve somente no tenant da instancia atual
   - nao puxa cliente de outra conta

### Cenario 8 - Meta Pixel

1. PageView dispara na pagina.
2. Lead dispara ao completar o formulario.
3. Schedule dispara ao concluir agendamento.
4. Os eventos usam `eventID` consistente com o backend quando aplicavel.

## Fase 8 - Ordem de implementacao e deploy

Objetivo: executar a correcao sem misturar rollback de frontend e backend.

### Ordem obrigatoria

1. Implementar migration de guardrails e/ou helper SQL.
2. Deploy da `internal-crm-api` com resolver escopado.
3. Deploy de `lp-popup-intake` se houver ajuste adicional de payload/logica publica.
4. Corrigir frontend da LP para bootstrap real do Meta Pixel.
5. Build e deploy da stack `solarzap-lp` na VPS.
6. Validar dominio publicado em `https://lp.aceleracao.solarzap.com.br/`.
7. Executar smoke end-to-end.

### Observacao importante

1. Nao validar Pixel no Helper antes de a LP publicada responder 200.
2. Nao considerar a correcao concluida enquanto o fluxo com telefone existente em outro tenant nao for testado em producao controlada.

## Fase 9 - Plano de rollback

Objetivo: garantir recuperacao rapida se alguma fase introduzir regressao.

### Rollback backend

1. Reimplantar a versao anterior da `internal-crm-api`.
2. Reimplantar a versao anterior da `lp-popup-intake`, se ela tambem tiver sido alterada.
3. Desabilitar temporariamente o bridge automatico apenas se ele for confirmado como ponto de falha.

### Rollback frontend

1. Reverter a imagem/tag da stack `solarzap-lp` para a ultima versao estavel.
2. Confirmar retorno de 200 no dominio publicado.

### Rollback banco

1. Reverter apenas indices/helpers novos, se eles forem a causa do bloqueio.
2. Nao desfazer saneamento de dados sem snapshot/auditoria.

## 10. Entregaveis finais

Ao final da execucao, devem existir:

1. Uma migration nova com guardrails de escopo por telefone.
2. Um resolver escopado de cliente interno reutilizado pelos fluxos publico e inbound.
3. `internal-crm-api` corrigida para nao fazer lookup global por telefone/e-mail.
4. `lp-popup-intake` alinhada com a nova regra de identidade.
5. LP com Meta Pixel inicializado corretamente e validado em producao.
6. Evidencia de smoke test dos cenarios criticos.
7. Relatorio de auditoria e eventuais saneamentos aplicados.

## 11. Criterios de aceite finais

O trabalho so pode ser considerado concluido quando todos os itens abaixo forem verdadeiros:

1. O dominio da LP responde 200 de forma estavel.
2. O Meta Pixel Helper detecta o Pixel na LP publicada.
3. `PageView`, `Lead` e `Schedule` aparecem corretamente no browser/Test Events.
4. Um telefone que ja existe no mesmo tenant permite novo agendamento sem travar.
5. Um telefone que existe em outro tenant nao provoca bloqueio nem atualizacao cruzada.
6. O bridge nao conecta clientes internos ao lead publico errado.
7. O fluxo de WhatsApp inbound segue a mesma regra de separacao.

## 12. Recomendacao operacional

Recomendacao de execucao:

1. Corrigir backend de identidade e frontend do Pixel no mesmo ciclo tecnico.
2. Fazer deploy backend primeiro.
3. Fazer deploy da LP depois.
4. Validar imediatamente em producao com numero novo, numero existente no mesmo tenant e numero existente em tenant diferente.

Sem isso, o sistema pode parecer funcionar em cenarios simples e continuar quebrando exatamente nos casos que mais importam: reentrada, tenant diferente e reconciliacao entre SolarZap e CRM interno.
