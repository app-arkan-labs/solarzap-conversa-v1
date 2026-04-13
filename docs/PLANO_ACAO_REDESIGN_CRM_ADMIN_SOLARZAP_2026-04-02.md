# Plano de Acao - Redesign do CRM Interno no Painel ADMIN

Data: 2026-04-02
Status: planejamento apenas, sem execucao
Escopo: UX/UI e layout do CRM interno dentro do painel ADMIN

## 1. Objetivo

Ajustar o CRM interno do painel ADMIN para ficar visualmente e estruturalmente mais proximo do SolarZap principal, com foco em:

- sidebar esquerda compacta, somente com icones no desktop
- hierarquia visual mais limpa e previsivel entre abas
- shell de navegacao mais coerente entre CRM e sistema
- padronizacao de headers, filtros, secoes e estados vazios
- melhoria da experiencia desktop e mobile sem alterar a regra de negocio

Este plano nao executa alteracoes. Ele define a estrategia completa para a implementacao posterior.

## 2. Skill Utilizada

Skill verificada e recomendada para esta demanda:

- `design-taste-frontend`

Motivo:

- ajuda a evitar um redesenho superficial
- orienta a navegacao, densidade visual, estados de interface, responsividade e consistencia sistemica
- reforca regras importantes para software UI, como uso controlado de cards, hierarquia tipografica, feedback de estado e padroes de layout mais premium

## 3. Base Real Auditada

Arquivos auditados para montar este plano:

- `src/components/admin/AdminLayout.tsx`
- `src/pages/Admin.tsx`
- `src/components/solarzap/SolarZapNav.tsx`
- `src/components/solarzap/PageHeader.tsx`
- `src/index.css`
- `src/modules/internal-crm/components/dashboard/InternalCrmDashboardView.tsx`
- `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx`
- `src/modules/internal-crm/pages/InternalCrmInboxPage.tsx`
- `src/modules/internal-crm/components/clients/InternalCrmClientsView.tsx`
- `src/modules/internal-crm/components/campaigns/InternalCrmCampaignsView.tsx`
- `src/modules/internal-crm/components/automations/InternalCrmAutomationsView.tsx`
- `src/modules/internal-crm/components/calendar/InternalCrmCalendarView.tsx`
- `src/modules/internal-crm/components/integrations/InternalCrmIntegrationsView.tsx`
- `src/modules/internal-crm/components/ai/InternalCrmAiView.tsx`
- `src/modules/internal-crm/components/finance/InternalCrmFinanceView.tsx`
- `docs/PLANO_PARIDADE_ABAS_SOLARZAP_PARA_CRM_INTERNO_2026-03-29.md`

## 4. Diagnostico Atual

### 4.1 Shell do ADMIN hoje

O estado atual do `AdminLayout.tsx` mostra:

- sidebar larga em desktop, com texto e icone
- CRM interno e paginas do sistema dividindo o mesmo trilho lateral
- header superior genérico, sem leitura forte da area ativa
- espaco interno unico para todas as rotas, mesmo quando as telas do CRM pedem shells diferentes
- mobile com comportamento reduzido, mas sem uma estrategia visual tao clara quanto a do SolarZap

Impacto:

- o CRM interno parece um modulo encaixado dentro do ADMIN, e nao uma area operacional com identidade propria
- a navegacao ocupa largura excessiva no desktop
- o contraste entre "area de sistema" e "area operacional" nao fica claro
- cada aba resolve layout de forma quase autonoma, reduzindo previsibilidade

### 4.2 Referencia do SolarZap

O `SolarZapNav.tsx` ja entrega varios sinais do padrao desejado:

- rail lateral estreita
- navegacao primaria por icones
- estado ativo muito claro
- densidade visual controlada
- agrupamento funcional simples
- uso de tooltip, popover e estados compactos

Isso indica que o caminho mais coerente nao e "encolher a sidebar atual", e sim aproximar o shell do ADMIN CRM do modelo de rail lateral do SolarZap.

### 4.3 Situacao das abas do CRM interno

O CRM interno ja possui varios componentes e pages separados, mas a experiencia ainda esta desigual:

- `Dashboard`: usa `PageHeader`, mas filtros e blocos ainda estao simples e pouco integrados ao shell
- `Pipeline`: e a tela mais avancada funcionalmente, mas ainda precisa de refinamento de densidade, alinhamento e consistencia do chrome
- `Inbox`: tem layout proprio forte, porem usa header isolado e calculos de altura locais, o que dificulta consistencia global
- `Clientes`: carece de um shell de pagina mais rico; hoje parece mais tabela utilitaria do que modulo premium
- `Campanhas`: usa uma linguagem visual mais forte, mas parcialmente independente do resto
- `Automacoes`: muito baseada em cards e blocos, com risco de excesso de peso visual
- `Calendario`: bom volume de funcionalidade, mas com estrutura visual diferente das demais abas
- `Integracoes`: ja tem boa identidade, porem mais "hero screen" do que "operational dashboard"
- `IA`: correta funcionalmente, mas ainda muito centrada em formularios em cards
- `Financeiro`: bem organizada, mas depende de melhor alinhamento com o shell e com tabelas/secoes padrao

### 4.4 Problemas de UX/UI identificados

- navegacao principal do CRM nao tem o mesmo peso visual da referencia SolarZap
- excesso de variacao entre headers de pagina
- filtros e acoes mudam muito de posicao entre abas
- uso inconsistente de `Card`, bordas, vidros, gradientes e espacos
- algumas telas parecem produto premium, outras parecem console administrativo
- falta um conjunto compartilhado de primitivas de layout para o CRM interno
- alguns calculos de altura estao acoplados ao header atual, o que pode quebrar quando o shell mudar

## 5. Principios de Design para a Implementacao

### 5.1 Navegacao

- a navegacao principal do CRM interno deve usar rail lateral compacta, no estilo SolarZap
- o rail deve ficar com icones apenas no desktop, com tooltip para label
- o estado ativo deve ter contraste alto e leitura imediata
- CRM e Sistema devem continuar acessiveis, mas com agrupamento visual claro

### 5.2 Hierarquia visual

- cada aba deve comecar com um header padrao e reconhecivel
- a area superior deve sempre responder a tres perguntas: onde estou, o que estou vendo, o que posso fazer agora
- filtros devem ficar previsiveis: sempre em barra secundaria ou bloco padrao logo abaixo do header

### 5.3 Densidade e ritmo

- reduzir a sensacao de "cartoes aleatorios"
- usar card apenas quando elevacao realmente indicar grupo ou importancia
- usar mais separacao por grade, borda suave, subsecao e espaco negativo

### 5.4 Operacionalidade

- o CRM interno deve parecer uma ferramenta de uso continuo, nao uma landing de modulos
- acoes primarias devem ficar sempre proximas do contexto
- estados vazios, loading e erro precisam ser padronizados

### 5.5 Responsividade

- desktop com rail lateral iconica
- tablet com compressao do espacamento e toolbar mais enxuta
- mobile com navegacao secundaria clara, sem depender da sidebar desktop

## 6. Resultado-Alvo

Ao final da implementacao, o usuario deve perceber:

- um ADMIN com area CRM visualmente coesa com o SolarZap
- uma barra lateral mais elegante, compacta e profissional
- abas com linguagem unificada
- menos ruido visual
- navegacao mais rapida
- maior sensacao de produto maduro

## 7. Proposta de Arquitetura de Layout

### 7.1 Separar shell de Sistema e shell de CRM

Hoje o `AdminLayout.tsx` tenta servir dois contextos:

- administracao de sistema
- operacao do CRM interno

Plano:

1. manter o shell atual apenas como base de sistema, ou dividi-lo em dois shells
2. criar um shell proprio para rotas `/admin/crm/*`
3. fazer esse shell do CRM herdar a linguagem do SolarZap, sem misturar os fluxos do SaaS principal

Arquitetura sugerida:

- `AdminSystemLayout`
- `AdminCrmLayout`
- `AdminCrmSidebarRail`
- `AdminCrmTopbar`
- `AdminCrmPageShell`

Beneficio:

- reduz condicionais visuais no layout geral
- facilita consistencia do CRM interno
- protege as paginas administrativas de sistema de efeitos colaterais visuais

### 7.2 Nova sidebar lateral do CRM

Proposta funcional:

- largura fixa estreita, semelhante ao SolarZap
- icones apenas
- tooltip com nome da rota
- agrupamento em dois blocos:
  - bloco CRM
  - bloco sistema/acoes auxiliares
- logo no topo
- area de perfil e sair no rodape

Comportamento desejado:

- item ativo com fundo gradiente da marca ou superficie forte equivalente
- hover com ampliacao sutil e feedback claro
- suporte a focus visivel para teclado
- tooltips curtas e consistentes

Itens esperados no rail:

- dashboard
- pipeline
- inbox
- clientes
- campanhas
- automacoes
- calendario
- integracoes
- IA
- financeiro
- separador
- dashboard sistema
- organizacoes
- financeiro SaaS
- flags
- audit
- sair

Observacao:

- se a densidade ficar alta demais, a melhor pratica e mover parte das rotas de sistema para um popover "Sistema" no rodape, em vez de deixar tudo empilhado no rail
- essa decisao deve ser tomada na fase de ajuste fino, apos validar a altura disponivel em notebook 1366x768

### 7.3 Topbar do CRM interno

O CRM interno precisa de uma topbar mais inteligente do que a atual:

- titulo dinâmico da area atual
- subtitulo curto contextual
- badges de papel do usuario
- acao global opcional por aba
- apoio a breadcrumbs apenas se realmente necessario

A topbar nao deve competir com o header de pagina. Ela deve atuar como chrome do produto, enquanto o `PageHeader` atua como cabecalho da tela.

### 7.4 Container de pagina padrao

Criar um shell compartilhado para as telas do CRM com:

- largura maxima consistente
- padding horizontal e vertical padronizados
- min-height adequada para paginas operacionais
- slots para:
  - header
  - filter bar
  - content
  - aside opcional

Isso elimina a necessidade de cada aba improvisar suas proprias margens e alturas.

## 8. Sistema Visual Compartilhado a Criar

Antes de ajustar as abas uma a uma, o plano recomenda criar primitivas reutilizaveis:

### 8.1 Componentes de layout

- `AdminCrmSidebarRail`
- `AdminCrmTopbar`
- `AdminCrmPageShell`
- `AdminCrmFilterBar`
- `AdminCrmSection`
- `AdminCrmSectionHeader`
- `AdminCrmEmptyState`
- `AdminCrmLoadingState`
- `AdminCrmSplitPane`

### 8.2 Tokens e classes utilitarias

- largura do rail
- espacamentos de shell
- alturas de header/topbar
- raios padrao
- sombras leves padrao
- superfícies para blocos secundarios
- estilo de item ativo/inativo
- estilo de toolbar de filtros

### 8.3 Regras de uso

- `PageHeader` deve continuar sendo o cabecalho principal da view
- filtros sempre abaixo do header, nunca espalhados em varios pontos do topo
- acoes primarias devem aparecer no header da pagina ou no topo da secao principal
- `Card` so quando houver necessidade de elevacao ou separacao semantica real

## 9. Plano de Acao por Fases

### Fase 0 - Preparacao e congelamento de referencia

Objetivo:

- alinhar a referencia visual e tecnica antes de tocar no codigo

Acoes:

1. confirmar que a referencia primaria e o `SolarZapNav.tsx`
2. capturar screenshots do estado atual do ADMIN CRM e do SolarZap
3. definir lista final de rotas do rail
4. decidir se as rotas de sistema ficam no mesmo rail ou em menu secundario
5. confirmar se o CRM interno deve manter o header superior global em todas as rotas

Entrega:

- baseline visual aprovada
- mapa de navegacao fechado

### Fase 1 - Refatoracao do shell do ADMIN para suportar CRM premium

Objetivo:

- separar o chrome do CRM do chrome do sistema

Acoes:

1. reorganizar `src/pages/Admin.tsx` para apontar rotas `/admin/crm/*` para um layout dedicado
2. extrair ou adaptar `src/components/admin/AdminLayout.tsx`
3. criar `AdminCrmLayout` com rail lateral iconica
4. adicionar tooltips, estados ativos e perfil/saida no rodape
5. revisar overflow, sticky topbar e areas rolaveis
6. validar compatibilidade com `InternalCrmGuard`

Criticos:

- nenhuma rota existente pode quebrar
- nenhuma autorizacao pode ser afetada
- o layout do sistema nao deve sofrer regressao visual sem intencao

Entrega:

- CRM interno ja navega em shell proprio e mais proximo do SolarZap

### Fase 2 - Padronizacao de primitives de pagina

Objetivo:

- fazer todas as abas do CRM usarem a mesma linguagem estrutural

Acoes:

1. criar `AdminCrmPageShell` com espacamento e largura consistentes
2. definir barra de filtros padrao
3. definir secoes com cabecalho, acao secundaria e corpo
4. criar estados vazios e loadings compartilhados
5. revisar uso de `PageHeader` para evitar headers desalinhados

Entrega:

- as paginas deixam de resolver layout de forma artesanal

### Fase 3 - Ajustes por aba

Objetivo:

- fazer cada modulo parecer parte do mesmo produto

#### 3.1 Dashboard

Problemas atuais:

- estrutura funcional correta, mas filtros ainda "soltos"
- mistura de cards e secoes sem um grid mestre forte

Plano:

1. encaixar filtros de data em uma `FilterBar` padrao
2. revisar o grid dos KPIs para ter ritmo mais consistente com as demais abas
3. dar mais destaque a blocos de "proximas acoes" e "onboarding"
4. reduzir a sensacao de formulario no topo

Aceite:

- o dashboard precisa abrir com leitura imediata das metricas
- filtros devem parecer controle operacional, nao formulario isolado

#### 3.2 Pipeline

Problemas atuais:

- modulo rico, mas sujeito a ruído visual por quantidade de controles
- potencial de densidade excessiva em desktop menor

Plano:

1. integrar `PipelineFilters` ao shell padrao
2. revisar alinhamento de colunas, gaps e headers de etapa
3. harmonizar modais, detalhe lateral e toolbar do board
4. garantir que o board horizontal respeite melhor o novo shell
5. revisar variacoes mobile e drawer de detalhes

Aceite:

- a tela precisa continuar poderosa sem parecer apertada
- filtros, drag and drop e detalhe devem parecer parte do mesmo sistema

#### 3.3 Inbox

Problemas atuais:

- usa header proprio e calculos locais de altura
- comportamento bom, mas pouco integrado ao shell global

Plano:

1. substituir o header local por `PageHeader` mais barra de status/filtros padrao
2. recalcular altura do layout com base no shell novo, sem depender de `calc(100vh-11rem)` acoplado
3. alinhar lista, chat e painel lateral a uma primitive de split pane
4. melhorar estados vazios quando nao houver conversa selecionada
5. revisar comportamento de painel lateral em `xl` e mobile

Aceite:

- o Inbox deve continuar com cara de ferramenta conversacional
- a pagina deve respeitar o shell do CRM sem perder velocidade operacional

#### 3.4 Clientes

Problemas atuais:

- hoje parece mais tabela administrativa do que area premium do CRM
- falta header visual mais forte e organizacao mestre lista/detalhe

Plano:

1. adicionar `PageHeader` proprio da aba
2. transformar busca e filtros em barra padrao
3. definir uma estrutura lista + detalhe ou lista expandida com painel lateral
4. melhorar hierarquia de colunas e destaque de saude/lifecycle
5. incluir empty state, loading e selecionado mais refinados

Aceite:

- a aba precisa parecer uma central comercial, nao apenas uma grid de dados

#### 3.5 Campanhas

Problemas atuais:

- visual forte, mas diferente do restante
- risco de virar uma ilha visual dentro do CRM

Plano:

1. alinhar `PageHeader` e blocos ao shell comum
2. revisar cards para reduzir peso excessivo
3. padronizar espacamentos, barras de progresso e toolbar
4. harmonizar painel de status com o restante do CRM

Aceite:

- continuar expressiva, mas mais integrada ao sistema

#### 3.6 Automacoes

Problemas atuais:

- muito card, muita informacao, densidade visual irregular

Plano:

1. reorganizar a tela por grupos funcionais claros
2. reduzir empilhamento de containers quando possivel
3. mover configuracoes mais globais para secoes com melhor respiro
4. revisar tabs, listas e formularios com foco em leitura escaneavel

Aceite:

- o usuario precisa entender rapidamente "regras", "status" e "configuracoes"

#### 3.7 Calendario

Problemas atuais:

- boa funcionalidade, mas layout com identidade muito propria

Plano:

1. encaixar filtros em shell comum
2. ajustar topo da agenda e navegacao mensal para o novo ritmo visual
3. uniformizar drawers, estados e secoes laterais
4. reduzir fragmentacao visual entre calendario, proximos eventos e modais

Aceite:

- o calendario deve parecer nativo do CRM, nao um modulo colado

#### 3.8 Integracoes

Problemas atuais:

- hero muito forte comparado ao resto
- boa execucao, mas fora do mesmo compasso estrutural

Plano:

1. manter a identidade WhatsApp, mas dentro do shell comum
2. reduzir a sensacao de "pagina promocional"
3. harmonizar cards de instancia, criacao e QR com o restante do CRM
4. padronizar feedback de loading e estados vazios

Aceite:

- continuar visualmente distinta sem quebrar o sistema visual do CRM

#### 3.9 IA

Problemas atuais:

- muito baseada em formulario e cards
- pouca priorizacao visual entre configuracao global, prompts e fila

Plano:

1. separar claramente configuracao global, configuracoes por etapa e fila operacional
2. melhorar ordem de leitura e peso visual dos blocos
3. destacar acoes primarias de salvar e processar
4. reduzir sensacao de "settings page genérica"

Aceite:

- o usuario deve entender em segundos onde configura, onde monitora e onde executa

#### 3.10 Financeiro

Problemas atuais:

- boa base, mas ainda precisa de uniformidade com o shell geral

Plano:

1. harmonizar o header e a toolbar de acao
2. revisar o empilhamento entre KPI, charts e tabelas
3. padronizar cabecalhos de secao e respiros
4. manter boa legibilidade analitica sem excesso de caixas

Aceite:

- leitura economica e profissional, com prioridade clara entre metricas e tabelas

### Fase 4 - Refinamento de microinteracoes e acessibilidade

Objetivo:

- deixar o shell polido e pronto para uso real

Acoes:

1. revisar hover, active e focus states do rail lateral
2. validar tooltips e navegacao por teclado
3. revisar contraste do item ativo
4. revisar comportamento sticky e scroll
5. revisar truncamentos, labels e `aria-label` nos icones

Entrega:

- acabamento de produto maduro

### Fase 5 - Validacao visual, funcional e responsiva

Objetivo:

- garantir que o redesign nao quebre o uso diario

Acoes:

1. smoke visual de todas as rotas `/admin/crm/*`
2. verificacao em desktop 1366x768, 1440p e mobile
3. revisar overflow horizontal e vertical
4. revisar tooltips, drawers, modais e paines laterais
5. revisar se o shell nao impactou rotas de sistema

Entrega:

- checklist final aprovado antes de merge

## 10. Estrategia Tecnica Recomendada

### 10.1 Mudancas estruturais prioritarias

Arquivos com maior probabilidade de mudanca:

- `src/pages/Admin.tsx`
- `src/components/admin/AdminLayout.tsx`
- novos componentes em `src/components/admin/*`
- wrappers das pages internas do CRM
- possivel adaptacao de `PageHeader.tsx` para melhor compatibilidade com o novo shell

### 10.2 Mudancas de baixo risco

- ajustes em classes utilitarias e wrappers
- extracao de componentes de shell
- substituicao de estruturas repetidas por primitives compartilhadas

### 10.3 Mudancas de risco medio

- recalculo de altura no Inbox
- alinhamento de board do Pipeline com novo chrome
- reorganizacao visual de tabs em Automacoes e IA

### 10.4 O que nao deve mudar neste ciclo

- contratos de dados
- query keys
- integracoes backend
- RLS
- regras de negocio das telas
- workers, cron e funcoes Supabase

Ou seja:

este e um redesign de experiencia e estrutura visual, nao uma mudanca de dominio.

## 11. Riscos e Mitigacoes

### Risco 1 - Regressao em rotas de sistema do ADMIN

Mitigacao:

- separar shell do CRM do shell do sistema
- validar `/admin`, `/admin/orgs`, `/admin/financeiro`, `/admin/flags`, `/admin/audit`

### Risco 2 - Rail iconica ficar poluida demais

Mitigacao:

- testar notebook com altura menor
- migrar rotas menos frequentes para popover "Sistema" se necessario

### Risco 3 - Inbox quebrar com novo calculo de altura

Mitigacao:

- criar primitive de split pane com altura herdada do shell
- evitar `calc` fixos acoplados ao header antigo

### Risco 4 - Cada aba continuar com linguagem propria

Mitigacao:

- implementar primitives compartilhadas antes dos ajustes finos
- nao tratar aba por aba sem estabilizar o shell

### Risco 5 - Excesso de ornamentacao visual

Mitigacao:

- seguir linguagem SolarZap, mas sem exagerar gradiente, blur ou cards
- priorizar clareza operacional

## 12. Criticos de UX/UI que Precisam Ser Honrados

- sidebar com icones apenas no desktop
- tooltips claras e rapidas
- item ativo muito legivel
- topbar e page header sem redundancia
- filtros em lugar previsivel
- menos improviso de espacos
- menos variacao aleatoria entre abas
- mobile funcional, sem herdar problemas do desktop
- acessibilidade por teclado e labels

## 13. Checklist de Aceite

### Aceite do shell

- a sidebar esquerda do CRM ficou compacta e somente com icones
- a navegacao ativa e entendida sem depender de texto permanente
- o CRM interno ficou visualmente mais perto do SolarZap
- as rotas de sistema continuam acessiveis sem confusao

### Aceite visual

- todas as abas compartilham o mesmo ritmo de espaco e header
- filtros e acoes seguem posicionamento consistente
- o uso de cards, bordas e superfícies ficou mais equilibrado

### Aceite operacional

- inbox, pipeline e calendario continuam produtivos
- nenhum fluxo principal perdeu velocidade
- nenhuma tela passa a depender de rolagens ruins ou areas apertadas

### Aceite responsivo

- desktop notebook
- desktop amplo
- mobile

### Aceite tecnico

- sem regressao de rotas existentes
- sem alteracao de regras de permissao
- sem alteracao de camada de dados por necessidade visual

## 14. Ordem Recomendada de Execucao Quando Voce Autorizar

1. refatorar rotas para suportar `AdminCrmLayout`
2. criar rail lateral iconica e topbar do CRM
3. criar `AdminCrmPageShell` e primitives de layout
4. migrar Inbox e Dashboard para o novo shell
5. migrar Pipeline
6. migrar Clientes
7. migrar Campanhas, Automacoes, Calendario, Integracoes, IA e Financeiro
8. fazer refinamento visual, responsivo e de acessibilidade
9. executar smoke visual final

## 15. Recomendacao Final

A melhor abordagem nao e "editar a sidebar atual ate ela parecer menor".

A melhor abordagem e:

- separar o shell do CRM do shell do sistema
- usar o SolarZap como referencia formal de navegacao compacta
- padronizar o esqueleto das paginas
- so depois fazer o polimento aba por aba

Essa ordem reduz retrabalho, melhora a consistencia e evita que cada tela receba um ajuste visual isolado e temporario.

## 16. Proximo Passo

Quando houver autorizacao para executar, a implementacao deve comecar pela infraestrutura visual:

- layout
- rail lateral
- topbar
- primitives compartilhadas

So depois disso vale mexer nas abas individualmente.
