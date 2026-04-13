# PLANO - Refactor do "Editar deal" e da lateral da Pipeline do CRM interno

Status: planejamento apenas. Nenhuma mudanca funcional foi executada neste arquivo.

## 1. Objetivo

Resolver 4 problemas centrais da aba Pipeline do CRM interno:

1. O fluxo de "Editar deal" esta complexo demais e mistura venda, automacao, produto, variante e tracking no mesmo formulario.
2. Clicar no card abre uma lateral que nao serve como workspace real de operacao, porque nao deixa editar o valor do lead nem concentra acoes rapidas.
3. O fluxo atual forca selecao de produto/itens quando, no uso diario, o vendedor so precisa definir valor e etapa.
4. Leads vindos de landing page estao contaminando o `primary_offer_code` com `landing_page`, o que embaralha origem do lead com produto/oferta.

---

## 2. Diagnostico confirmado no codigo

### 2.1 Modal de edicao esta supercarregado

Hoje o modal [`EditDealModal.tsx`](/c:/Users/rosen/Downloads/solarzap-conversa-main/src/modules/internal-crm/components/pipeline/modals/EditDealModal.tsx) concentra:

- dados basicos do deal;
- estado comercial ARKAN;
- oferta principal;
- produto fechado;
- variante da mentoria;
- proxima oferta;
- status de software / landing page / trafego / trial;
- contexto de automacao;
- links de reuniao/agendamento;
- lista dinamica de itens com produto, preco e quantidade.

Na pratica, ele virou um "painel tecnico de blueprint", nao um formulario operacional de vendas.

### 2.2 Card abre lateral fraca para operacao

Hoje o clique no card dentro de [`InternalCrmPipelineView.tsx`](/c:/Users/rosen/Downloads/solarzap-conversa-main/src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx) abre [`DealDetailPanel.tsx`](/c:/Users/rosen/Downloads/solarzap-conversa-main/src/modules/internal-crm/components/pipeline/DealDetailPanel.tsx), mas essa lateral:

- mostra etapa e tracking;
- permite salvar nota;
- permite marcar como ganhou/perdeu;
- permite checkout e exclusao;
- nao permite editar valor;
- nao expoe acoes rapidas em grid;
- nao tem edicao rapida de responsavel;
- nao tem edicao rapida de etapa com UX central.

Resultado: o usuario clica no lead e ainda precisa abrir menus ou modais paralelos para fazer o trabalho real.

### 2.3 O modelo visual da Pipeline ja sugere simplificacao

O card da pipeline ja esta operando com sinais simples:

- nome/empresa;
- valor total;
- dias na etapa;
- proxima acao;
- menu `...`.

Ou seja: a UI ja quer ser enxuta, mas o fluxo de edicao continua preso num modal tecnico.

### 2.4 O backend realmente mistura "origem" com "produto"

Na intake publica do CRM, em [`supabase/functions/internal-crm-api/index.ts`](/c:/Users/rosen/Downloads/solarzap-conversa-main/supabase/functions/internal-crm-api/index.ts), o fluxo de landing page faz:

- `source_channel = 'landing_page'`;
- `commercial_context.source = 'landing_page'`;
- `primary_offer_code = 'landing_page'` por padrao.

Isso explica a percepcao de que "todo lead cai com produto landing page".

O problema mais grave aqui nao e a origem do lead, e sim usar `primary_offer_code` como fallback generico de entrada.

### 2.5 Existe dependencia real de automacao

Os campos tecnicos nao sao inuteis. Eles alimentam automacoes como:

- `offer_ready`;
- `deal_closed`;
- `deal_not_closed`;
- derivacao de proximas ofertas por `software_status`, `landing_page_status`, `trial_status`, `mentorship_variant` etc.

Entao a solucao correta nao e "apagar tudo".
E separar:

- fluxo operacional do vendedor;
- configuracao avancada/comercial do blueprint.

---

## 3. Principios de UX/UI para a refatoracao

### 3.1 O clique no card precisa virar o fluxo principal

Ao clicar num lead, a lateral deve abrir pronta para operar.

Ela precisa permitir, sem abrir outro modal:

- ver contexto do lead;
- editar valor;
- mover etapa;
- trocar responsavel;
- abrir conversa;
- ligar;
- agendar reuniao;
- marcar como fechou / nao fechou;
- gerar checkout, quando fizer sentido.

### 3.2 "Produto" nao pode ser obrigatorio no fluxo diario

Para operacao comercial comum, o usuario quer dizer:

- esse lead vale `R$ X`;
- esta em tal etapa;
- pertence a tal responsavel.

Selecionar produto, variante, tipo de cobranca e catalogo completo deve ser excecao, nao obrigacao.

### 3.3 Campos tecnicos devem sair da rota principal

Tudo que for de blueprint, automacao, upsell, trial, proxima oferta e links tecnicos deve ir para uma area secundaria:

- "Campos avancados"
- ou "Automacao e blueprint"

Essa area continua existindo, mas nao trava mais o uso principal.

### 3.4 Origem do lead e oferta nao sao a mesma coisa

Precisamos separar claramente:

- origem/canal: `landing_page`, `whatsapp`, `manual`, etc.;
- intencao/contexto de entrada: funil, URL, tracking, campanha;
- produto/oferta comercial de fato.

---

## 4. Solucao proposta

## 4.1 Transformar a lateral em "Painel operacional do deal"

Refatorar [`DealDetailPanel.tsx`](/c:/Users/rosen/Downloads/solarzap-conversa-main/src/modules/internal-crm/components/pipeline/DealDetailPanel.tsx) para virar o centro da operacao.

### Estrutura recomendada da lateral

1. Cabecalho
- nome da empresa / lead;
- badge da etapa;
- valor atual em destaque;
- status de origem e tracking em badges discretos.

2. Acoes rapidas em grid 2x3 ou 3x2
- `Abrir conversa`
- `Ligar`
- `Agendar`
- `Gerar checkout`
- `Fechou`
- `Nao fechou`

3. Edicao rapida principal
- campo `Valor do lead`;
- seletor de `Etapa`;
- seletor de `Responsavel`;
- campo curto de `Titulo`, se necessario;
- nota resumida.

4. Contexto complementar
- proxima tarefa;
- proximo compromisso;
- tracking resumido.

5. Area recolhivel
- `Campos avancados / Automacao`

### Resultado esperado

O usuario clica no card e resolve 90% do dia a dia sem abrir `Editar deal`.

---

## 4.2 Tirar o modal gigante da rota principal

### Recomendacao

Descontinuar [`EditDealModal.tsx`](/c:/Users/rosen/Downloads/solarzap-conversa-main/src/modules/internal-crm/components/pipeline/modals/EditDealModal.tsx) como fluxo padrao.

Substituir por duas camadas:

1. Camada principal:
- lateral rapida do deal.

2. Camada secundaria:
- um novo `AdvancedDealConfigSheet` ou `DealAutomationSheet`.

### Essa camada secundaria deve concentrar somente

- `primary_offer_code`
- `closed_product_code`
- `mentorship_variant`
- `software_status`
- `landing_page_status`
- `traffic_status`
- `trial_status`
- `next_offer_code`
- `next_offer_at`
- `commercial_context`
- links tecnicos

### Importante

Esses campos nao devem sumir do sistema.
Eles so deixam de ser o caminho padrao.

---

## 4.3 Simplificar o modelo de edicao para "valor primeiro"

### Problema atual

O frontend usa `DealDraft` com muitos campos e o save depende de `items`.
Como `deal_items.product_code` referencia `internal_crm.products`, o sistema empurra o usuario para escolher catalogo mesmo quando ele so quer salvar um valor.

### Solucao recomendada

Criar um fluxo simplificado de valor com 1 item tecnico oculto da UI.

### Estrategia tecnica recomendada

Adicionar produtos internos ocultos, por migracao, por exemplo:

- `custom_deal_one_time`
- `custom_deal_recurring`

Comportamento:

- eles existem no banco para satisfazer `deal_items.product_code`;
- ficam ocultos da UI comum via `metadata.hidden_from_ui = true`;
- sao usados automaticamente quando o usuario informa apenas o valor.

### UX recomendada

Na lateral, o usuario edita:

- `valor`
- `tipo`: `unico` ou `mensal`

O sistema converte isso para um unico `deal_item` tecnico por baixo dos panos.

### Beneficios

- some a obrigacao de escolher "300 produtos";
- preserva totais, checkout e relatorios;
- reduz risco de quebrar `deal_items` e recalculadoras ja existentes.

### O que evitar

Nao recomendo tornar `product_code` nulo no schema agora.
Isso espalharia impacto em:

- relatorios;
- finance;
- checkout;
- integracao Stripe;
- agregacoes de item.

---

## 4.4 Reaproveitar o backend certo para cada tipo de edicao

### Fluxo principal

Para edicao rapida do painel lateral:

- usar `upsert_deal` apenas para campos estruturais do deal;
- ou criar um payload simplificado que o backend normalize.

### Fluxo avancado

Para campos do blueprint:

- passar a usar `update_deal_commercial_state`, que hoje ja existe no backend e esta subutilizada.

### Ganho

Isso desacopla:

- venda operacional;
- automacao avancada.

E evita que qualquer mudanca simples de valor regrave um bloco inteiro de campos tecnicos.

---

## 4.5 Corrigir a contaminacao de "produto landing page"

### Causa atual

Na intake publica, o backend grava `primary_offer_code = 'landing_page'` como fallback padrao.

### Correcao recomendada

Parar de usar `primary_offer_code` como fallback generico de entrada.

### Nova regra

1. `source_channel` continua representando a origem real.
- Ex.: `landing_page`, `whatsapp`, `manual`

2. `commercial_context` continua guardando contexto de entrada.
- `source`
- `funnel_slug`
- `landing_page_url`
- `attribution`

3. `primary_offer_code` so e preenchido quando houver intencao comercial explicita.
- vinda do payload;
- mapeamento de `funnel_slug`;
- decisao manual do vendedor.

### Estrategia recomendada para intencao comercial

Usar `landing_form_funnels.metadata` para mapear, quando existir, algo como:

- `default_offer_code`
- ou `entry_intent_code`

Se o funil nao tiver mapeamento explicito:

- deixar `primary_offer_code = null`
- e manter apenas o tracking/contexto.

### Backfill recomendado

Criar script/migracao segura para auditar e limpar deals abertos com:

- `primary_offer_code = 'landing_page'`
- `closed_product_code IS NULL`
- sem item real de LP fechado

Backfill deve ser conservador:

- nao tocar deals ja ganhos com produto real;
- nao tocar deals cuja venda efetiva foi de landing page;
- revisar por relatorio antes de aplicar update.

---

## 5. Arquitetura de arquivos proposta

### Frontend

Arquivos a alterar:

- [`InternalCrmPipelineView.tsx`](/c:/Users/rosen/Downloads/solarzap-conversa-main/src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx)
- [`DealDetailPanel.tsx`](/c:/Users/rosen/Downloads/solarzap-conversa-main/src/modules/internal-crm/components/pipeline/DealDetailPanel.tsx)
- [`types.ts`](/c:/Users/rosen/Downloads/solarzap-conversa-main/src/modules/internal-crm/components/pipeline/types.ts)
- [`EditDealModal.tsx`](/c:/Users/rosen/Downloads/solarzap-conversa-main/src/modules/internal-crm/components/pipeline/modals/EditDealModal.tsx)

Arquivos novos recomendados:

- `src/modules/internal-crm/components/pipeline/DealQuickActions.tsx`
- `src/modules/internal-crm/components/pipeline/DealValueEditor.tsx`
- `src/modules/internal-crm/components/pipeline/modals/DealAutomationSheet.tsx`
- opcional: `src/modules/internal-crm/components/pipeline/useDealValueDraft.ts`

### Backend

Arquivos a alterar:

- [`supabase/functions/internal-crm-api/index.ts`](/c:/Users/rosen/Downloads/solarzap-conversa-main/supabase/functions/internal-crm-api/index.ts)

Arquivos novos recomendados:

- migracao para produtos tecnicos ocultos;
- migracao/backfill para corrigir `primary_offer_code = 'landing_page'`;
- opcional: relatorio SQL de auditoria antes do backfill.

---

## 6. Plano de execucao em fases

## Fase 0 - Auditoria e protecao

1. Mapear quantos deals abertos hoje tem `primary_offer_code = 'landing_page'`.
2. Separar por `source_channel`, `funnel_slug`, `closed_product_code` e `deal_items`.
3. Levantar se ja existe algum funil com metadata suficiente para inferir intencao.

Saida esperada:

- relatorio antes da refatoracao;
- regra clara de backfill.

## Fase 1 - Lateral operacional nova

1. Refatorar `DealDetailPanel` para incluir grid de acoes rapidas.
2. Adicionar edicao inline de valor.
3. Adicionar edicao inline de etapa e responsavel.
4. Expor botao/link para "Campos avancados".

Saida esperada:

- clicar no card ja resolve operacao diaria.

## Fase 2 - Simplificacao do fluxo de valor

1. Reduzir `DealDraft` do fluxo principal.
2. Implementar item tecnico oculto para valor manual.
3. Adaptar save do painel lateral para persistir valor sem seletor de produto.

Saida esperada:

- definir valor sem catalogo.

## Fase 3 - Isolar automacao avancada

1. Rebaixar `EditDealModal` para area avancada ou substitui-lo por novo sheet tecnico.
2. Migrar os campos tecnicos para save dedicado via `update_deal_commercial_state`.
3. Manter compatibilidade com automacoes atuais.

Saida esperada:

- blueprint preservado;
- UX principal limpa.

## Fase 4 - Corrigir origem/intencao do lead

1. Remover fallback padrao `primary_offer_code = 'landing_page'` da intake.
2. Usar `funnel_slug`/metadata para mapear intencao quando houver.
3. Fazer backfill seguro dos deals contaminados.

Saida esperada:

- origem do lead continua correta;
- produto/oferta deixa de ficar poluido.

## Fase 5 - QA e regressao

1. Testar criacao e edicao de deal sem produto manual.
2. Testar clique no card e edicao inline de valor.
3. Testar mark won / mark lost / checkout.
4. Testar lead vindo de landing page.
5. Testar lead vindo de WhatsApp/manual.
6. Testar que automacoes de blueprint continuam disparando.

---

## 7. Criterios de aceite

- Clicar no card abre uma lateral com acoes rapidas visiveis.
- O usuario consegue alterar o valor do lead sem abrir modal tecnico.
- O usuario consegue alterar etapa e responsavel pela lateral.
- O fluxo principal nao exige escolher produto do catalogo.
- Campos tecnicos continuam existindo, mas ficam fora do caminho principal.
- Leads novos nao recebem `primary_offer_code = 'landing_page'` por padrao sem regra explicita.
- A UI do pipeline fica legivel, enxuta e orientada a operacao.

---

## 8. Riscos e mitigacao

### Risco 1

Quebrar automacoes que dependem de `primary_offer_code` e estados comerciais.

Mitigacao:

- manter campos no backend;
- mover para area avancada;
- usar `update_deal_commercial_state`;
- testar `offer_ready` e `deal_closed`.

### Risco 2

Perder compatibilidade com `deal_items`.

Mitigacao:

- usar produtos tecnicos ocultos em vez de relaxar FK agora.

### Risco 3

Backfill apagar informacao valida de LP real.

Mitigacao:

- auditar antes;
- limpar apenas deals abertos e sem evidencia de venda real de landing page;
- rodar relatorio antes/depois.

---

## 9. Recomendacao final

A melhor solucao nao e "melhorar o modal atual".

A melhor solucao e:

1. transformar a lateral do card no centro da operacao;
2. trocar o fluxo de produto por um fluxo de valor;
3. esconder o blueprint avancado atras de uma camada tecnica;
4. parar de usar `landing_page` como pseudo-produto padrao.

Esse caminho resolve o problema de UX sem destruir a estrutura de automacao que ja existe por tras.
