# Plano Corretivo Definitivo: headers duplicados e UX do CRM Interno

Data: 2026-04-02
Status: planejamento somente. Nao executar ate nova autorizacao.

## Objetivo

Remover os headers gigantes e duplicados em todas as abas do CRM Interno, corrigir a UX/UI do rail lateral e reposicionar os botoes/acoes para lugares corretos, sem perder nenhuma funcionalidade.

Escopo:

- Inbox
- Dashboard
- Pipeline
- Clientes
- Disparos/Campanhas
- Automacoes
- Calendario
- Integracoes
- IA
- Financeiro
- cabeçalho interno de detalhe do cliente
- rail lateral do `AdminCrmLayout`

## Diagnostico consolidado

## 1. A duplicacao vem de duas camadas diferentes de navegacao

Hoje o CRM Interno tem:

- um header estrutural global em [AdminCrmLayout.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\components\admin\AdminCrmLayout.tsx)
- e, dentro de cada aba, um `PageHeader` adicional

Isso gera:

- titulo no shell superior
- titulo grande repetido dentro da pagina
- subtitulo repetido
- badges e botoes espalhados em dois niveis visuais

Arquivos que renderizam `PageHeader` hoje:

- [InternalCrmInboxPage.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\pages\InternalCrmInboxPage.tsx)
- [InternalCrmDashboardView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\dashboard\InternalCrmDashboardView.tsx)
- [InternalCrmPipelineView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\pipeline\InternalCrmPipelineView.tsx)
- [InternalCrmClientsPage.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\pages\InternalCrmClientsPage.tsx)
- [InternalCrmCampaignsView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\campaigns\InternalCrmCampaignsView.tsx)
- [InternalCrmAutomationsView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\automations\InternalCrmAutomationsView.tsx)
- [InternalCrmCalendarView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\calendar\InternalCrmCalendarView.tsx)
- [InternalCrmIntegrationsView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\integrations\InternalCrmIntegrationsView.tsx)
- [InternalCrmAiView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\ai\InternalCrmAiView.tsx)
- [InternalCrmFinanceView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\finance\InternalCrmFinanceView.tsx)

Conclusao:

- o `PageHeader` virou redundante no CRM Interno
- a shell do `AdminCrmLayout` ja e suficiente para titulo/subtitulo/contexto de rota

## 2. Os botoes nao podem simplesmente ser removidos

Os `PageHeader` hoje acumulam acoes reais em `actionContent` e `mobileToolbar`.

Exemplos:

- Pipeline:
  - importar clientes
  - exportar clientes
  - novo deal
- Clientes:
  - importar
  - exportar
  - novo cliente
- Campanhas:
  - nova campanha
- Calendario:
  - conectar Google
  - importar eventos
  - desconectar Google
  - novo agendamento
- Financeiro:
  - atualizar snapshot
- Automacoes:
  - chips de status e atencao operacional
- Integracoes:
  - indicador de instancias conectadas

Conclusao:

- precisamos mover essas acoes para a shell superior ou para toolbars compactas locais
- nao basta apagar o componente

## 3. O rail lateral esta com contraste insuficiente

No rail do CRM Interno em [AdminCrmLayout.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\components\admin\AdminCrmLayout.tsx), os botoes inativos usam:

- `text-sidebar-foreground/58`
- fundo transparente
- hover muito sutil sobre um gradiente muito claro

Com o tema atual em [index.css](C:\Users\rosen\Downloads\solarzap-conversa-main\src\index.css):

- `--sidebar-background: 34 41% 98%`
- `--sidebar-accent: 216 40% 94%`
- `--sidebar-foreground: 222 34% 18%`

O resultado visual e:

- icones quase brancos
- contorno muito apagado
- rail parece “desligado” e sem hierarquia

Conclusao:

- o problema nao e o SVG ou o icon set
- e contraste + opacidade + falta de superficie/tap target perceptivel para o estado inativo

## 4. O detalhe do cliente tambem herdou um header redundante

Pelo screenshot do detalhe:

- existe um bloco gigante de “Detalhes do Cliente”
- acima do conteudo real

Esse tipo de bloco quebra a densidade visual do CRM e compete com:

- o header do shell
- o header da propria area de detalhes

Conclusao:

- o detalhe do cliente precisa virar uma secao compacta
- nao uma “pagina dentro da pagina”

## Direcao de UX correta

## Principio central

O CRM Interno deve ter:

1. um unico header estrutural global
2. toolbars compactas por aba
3. conteudo principal com maior densidade util
4. rails e paines claramente legiveis

Em outras palavras:

- o `AdminCrmLayout` vira a fonte unica de contexto da rota
- as abas deixam de renderizar “hero headers”
- as acoes passam a ocupar toolbars compactas onde realmente fazem sentido

## Solucao arquitetural recomendada

## Fase 1 - Transformar o `AdminCrmLayout` na shell unica de cabecalho

Arquivo central:

- [AdminCrmLayout.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\components\admin\AdminCrmLayout.tsx)

Acao:

- manter o header superior atual como contexto unico da rota
- ampliar esse header para aceitar acoes dinâmicas da aba atual
- evitar que cada pagina precise desenhar outro header grande

Implementacao recomendada:

- criar um contexto/hook de shell do CRM, por exemplo:
  - `useAdminCrmPageChrome`
- o layout oferece slots:
  - `title`
  - `subtitle`
  - `primaryActions`
  - `secondaryActions`
  - `statusChips`
- cada aba injeta suas acoes nesse contexto

Conclusao:

- o header superior passa a ser inteligente
- os `PageHeader` podem ser removidos com seguranca

## Fase 2 - Remover os `PageHeader` das abas do CRM Interno

Substituir o padrão:

- `PageHeader + actionContent + mobileToolbar`

por:

- shell superior do `AdminCrmLayout`
- toolbar local compacta, somente quando a aba exigir filtros/comandos contextuais

### Abas que devem perder o header grande

- Inbox
- Dashboard
- Pipeline
- Clientes
- Campanhas
- Automacoes
- Calendario
- Integracoes
- IA
- Financeiro

### Regra

- remover o header grande de todas as abas
- manter subtitulo apenas no shell superior
- mover botoes para lugar apropriado

## Fase 3 - Reposicionar as acoes por aba

## 3.1 Inbox

Hoje:

- mostra um header grande com:
  - total de conversas
  - badge de status

Correcao:

- remover header gigante
- mover:
  - `12 conversas`
  - `Abertas`

para a area superior direita do shell do `AdminCrmLayout`

Local ideal:

- como chips compactos no topo
- alinhados ao titulo da rota

## 3.2 Pipeline

Hoje:

- importar
- exportar
- novo deal

Correcao:

- remover header gigante
- mover:
  - `Importar`
  - `Exportar`
  - `Novo Deal`

para o canto superior direito do shell

Manter abaixo apenas:

- filter bar da pipeline
- board

## 3.3 Clientes

Hoje:

- importar
- exportar
- novo cliente

Correcao:

- mover essas acoes para o shell superior
- a coluna da lista fica com:
  - busca
  - filtros
  - barra de selecao

### Detalhe do cliente

- remover o bloco gigante “Detalhes do Cliente”
- trocar por uma linha compacta de secao no topo do painel direito
- exemplo:
  - nome do cliente
  - status
  - 1 linha de metadados

## 3.4 Campanhas

Hoje:

- `Nova Campanha` no header grande

Correcao:

- mover para shell superior
- manter os summary cards e grid de campanhas sem hero header

## 3.5 Automacoes

Hoje:

- chips de:
  - ativas
  - operacao exige atencao
  - alteracoes pendentes

Correcao:

- mover esses chips para o shell superior ou para uma faixa compacta logo abaixo dele
- remover o header gigante

Observacao:

- como Automacoes tem estado operacional importante, pode manter uma “status strip” fina no topo do conteudo
- mas nao um hero header

## 3.6 Calendario

Hoje:

- conectar Google
- menu Google conectado
- novo agendamento

Correcao:

- mover CTA principal para shell superior
- quando conectado:
  - exibir chip/controle compacto de Google no topo
- manter navegacao de mes e filtros dentro da propria area de calendario

## 3.7 Integracoes

Hoje:

- card informativo de contagem conectada no header grande

Correcao:

- mover o indicador `1/1 instancia ativa` para shell superior
- a card principal da tela continua, mas sem header gigante repetido

## 3.8 IA

Hoje:

- header grande sem acoes relevantes

Correcao:

- remover completamente
- usar apenas shell superior

## 3.9 Financeiro

Hoje:

- `Atualizar snapshot`

Correcao:

- mover para shell superior
- resto da tela entra direto nos KPIs e tabelas

## 3.10 Dashboard

Hoje:

- apenas hero header redundante

Correcao:

- remover completamente
- shell superior basta

## Fase 4 - Corrigir o rail lateral

Arquivo:

- [AdminCrmLayout.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\components\admin\AdminCrmLayout.tsx)

### Problema atual

- icones inativos com opacidade baixa demais
- superficie invisivel
- hover pouco perceptivel

### Ajuste visual recomendado

#### Estado inativo

- trocar `text-sidebar-foreground/58` por algo como:
  - `text-sidebar-foreground/78`
- adicionar superficie muito leve:
  - `bg-sidebar-foreground/[0.03]`
  - ou `bg-white/30` dependendo do tema
- manter borda suave para dar contorno visivel

#### Hover

- fundo mais claro e perceptivel
- borda mais evidente
- icone com cor completa

#### Estado ativo

- manter o gradiente, mas revisar tamanho/padding para ficar menos “pesado” perto dos inativos

#### Largura do rail

Avaliar:

- de `84px` para `88px` ou `92px`

Motivo:

- melhorar respiracao visual dos icones
- evitar sensação de comprimido/branco em fundo claro

### Ajuste de linguagem visual

Objetivo:

- rail mais “instrumental”
- menos fantasma
- mais contraste
- mais legibilidade imediata

## Fase 5 - Criar um padrao de toolbar compacta

Criar um componente reutilizavel, por exemplo:

- `AdminCrmPageToolbar`

Funcoes:

- abrigar acoes da aba
- chips de status
- CTAs principais
- layout consistente entre desktop e mobile

Beneficios:

- evita cada aba recriar um mini header
- reduz variacoes soltas
- melhora consistencia de UX

## Fase 6 - Mobile

Hoje algumas acoes usam `mobileToolbar`.

Ao remover os `PageHeader`, o plano precisa preservar mobile:

- shell superior mostra:
  - titulo
  - no maximo 1 ou 2 acoes principais
- acoes secundarias vao para:
  - overflow menu
  - sheet
  - toolbar compacta abaixo do shell, apenas quando necessario

Regra:

- nao recriar o mesmo header gigante no mobile

## Fase 7 - Testes visuais e funcionais

## Validacoes obrigatorias

1. Nenhuma aba do CRM Interno deve exibir hero header duplicado
2. O shell superior deve continuar mostrando:
   - titulo da rota
   - subtitulo da rota
3. Todas as acoes antes presentes no `PageHeader` devem continuar acessiveis
4. O rail lateral deve ter contraste legivel no estado inativo
5. O estado ativo do rail deve continuar destacado
6. O detalhe do cliente nao deve ter cabecalho gigante interno
7. Desktop e mobile devem preservar funcionalidade

## Testes recomendados

- abrir cada aba e conferir:
  - Inbox
  - Dashboard
  - Pipeline
  - Clientes
  - Campanhas
  - Automacoes
  - Calendario
  - Integracoes
  - IA
  - Financeiro

Checklist visual:

- sem header duplicado
- sem espaços vazios gigantes
- botoes visiveis
- acoes posicionadas com coerencia
- rail lateral legivel

## Arquivos mais prováveis de alteração futura

- [AdminCrmLayout.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\components\admin\AdminCrmLayout.tsx)
- [adminCrmNavigation.ts](C:\Users\rosen\Downloads\solarzap-conversa-main\src\components\admin\adminCrmNavigation.ts)
- [InternalCrmInboxPage.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\pages\InternalCrmInboxPage.tsx)
- [InternalCrmDashboardView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\dashboard\InternalCrmDashboardView.tsx)
- [InternalCrmPipelineView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\pipeline\InternalCrmPipelineView.tsx)
- [InternalCrmClientsPage.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\pages\InternalCrmClientsPage.tsx)
- [InternalCrmCampaignsView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\campaigns\InternalCrmCampaignsView.tsx)
- [InternalCrmAutomationsView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\automations\InternalCrmAutomationsView.tsx)
- [InternalCrmCalendarView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\calendar\InternalCrmCalendarView.tsx)
- [InternalCrmIntegrationsView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\integrations\InternalCrmIntegrationsView.tsx)
- [InternalCrmAiView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\ai\InternalCrmAiView.tsx)
- [InternalCrmFinanceView.tsx](C:\Users\rosen\Downloads\solarzap-conversa-main\src\modules\internal-crm\components\finance\InternalCrmFinanceView.tsx)
- possivel novo componente:
  - `src/components/admin/AdminCrmPageToolbar.tsx`

## Ordem recomendada de execução

1. Criar infraestrutura de shell/toolbar no `AdminCrmLayout`
2. Corrigir contraste do rail lateral
3. Migrar acoes de cada aba para a shell/toolbar
4. Remover `PageHeader` das abas
5. Compactar header interno do detalhe do cliente
6. Validar visual e funcionalmente aba por aba
7. Commitar e deployar

## Resumo executivo

O problema nao e “um header feio” isolado.

Hoje o CRM Interno tem dois sistemas de cabecalho competindo:

- a shell do `AdminCrmLayout`
- os `PageHeader` dentro das paginas

Isso cria:

- duplicacao
- espaço morto
- botoes fora de lugar
- inconsistência visual

O corretivo definitivo e:

- eleger o `AdminCrmLayout` como header unico
- criar uma toolbar compacta de acoes
- remover os `PageHeader` das abas
- restaurar contraste e presença do rail lateral

## Regra deste plano

Nao executar nada ainda.

Proximo passo somente quando o usuario mandar:

- executar este plano corretivo de UX/UI dos headers e do rail lateral
