# Plano Corretivo Mobile V2 — Análise e Correções Detalhadas

> **Data:** 15/03/2026  
> **Scope:** 12 issues reportados + bugs adicionais identificados na análise  
> **Filosofia:** Zero regressões desktop / Zero regressões de funcionalidade / Mobile-first fixes  
> **Estimativa:** ~15 arquivos, ~800-1000 LOC net

---

## Índice

1. [ISSUE-01] Fixar topo/rodapé, scroll apenas no meio (Chat)
2. [ISSUE-02] Conversa abre com 2 cliques ao invés de 1
3. [ISSUE-03] Pipeline: botão "mover etapa" abre editar lead — trocar por setas laterais
4. [ISSUE-04] Calendário: botão de modal de eventos futuros/passados no mobile
5. [ISSUE-05] Contatos: scroll do contato e informações
6. [ISSUE-06] Disparos: scroll das campanhas
7. [ISSUE-07] Propostas: filtros em dropdown e scroll
8. [ISSUE-08] Notificações: transformar modal em aba full-screen
9. [ISSUE-09] IA: toggles carregados, textos mal formatados
10. [ISSUE-10] Dashboard: scroll preso no final
11. [ISSUE-11] Tracking/Conversões: completamente quebrado
12. [ISSUE-12] Barra de abas de "Minha Empresa"
13. [EXTRA] Bugs adicionais identificados na análise

---

## ISSUE-01 — Fixar topo e rodapé no Chat, scroll apenas no meio

### Diagnóstico

**Arquivo:** `src/components/solarzap/ChatArea.tsx` (linhas ~950-1070)

O ChatArea usa `flex-1 flex flex-col` como container principal. O header (h-14) e o input area fluem normalmente no flex layout. O container de mensagens usa `flex-1 overflow-y-auto`. Isso funciona **quando o parent garante altura fixa**, mas depende da chain completa de flex heights até o root.

**Problema real:** Em combinações de teclado iOS (safari input focus), o `flex-1` pode colapsar porque `100vh` no iOS inclui a barra de URL. Quando o teclado virtual abre, o input pode ficar escondido atrás do teclado, ou o header pode subir.

O `SolarZapLayout.tsx` (linha 1465) define:
```
pb-[calc(4rem+env(safe-area-inset-bottom))]
```
Quando uma conversa está ativa, `showMobileBottomBar = false`, removendo o padding — OK.

### Causa Raiz

A chain de flex é: `SolarZapLayout (h-screen flex flex-col)` → `content div (flex-1 flex flex-col)` → `ChatArea (flex-1 flex flex-col)`. A princípio o layout é correto, MAS:

1. O Safari em iOS tem bug com `100vh` e `env(safe-area-inset-*)` quando o teclado aparece
2. O header do chat NÃO é `sticky` — se algo der errado no flex chain ele pode scrollar

### Correção

**Arquivo:** `src/components/solarzap/ChatArea.tsx`

```diff
- <div className="flex-1 flex flex-col min-w-0 relative">
+ <div className="flex-1 flex flex-col min-w-0 min-h-0 relative overflow-hidden">

  {/* Chat Header */}
- <div className="h-14 px-3 flex items-center ...">
+ <div className="h-14 px-3 flex items-center ... shrink-0">

  {/* Messages */}
- <div ref={scrollRef} ... className="flex-1 overflow-y-auto ...">
+ <div ref={scrollRef} ... className="flex-1 min-h-0 overflow-y-auto ...">

  {/* Input area */}
- <div className="border-t ...">
+ <div className="border-t ... shrink-0">
```

Mudanças chave:
- `overflow-hidden` no container principal impede que ele gere scroll próprio
- `min-h-0` no container principal e no scrollRef garante que flex-1 respeite o espaço
- `shrink-0` no header e input impede que eles sejam espremidos pelo flex
- O header e input ficam fixos visualmente (nunca saem do viewport)

**LOC:** ~10 linhas alteradas

---

## ISSUE-02 — Conversa precisa de 2 cliques ao invés de 1

### Diagnóstico

**Arquivo:** `src/components/solarzap/ConversationList.tsx` (linhas ~936-942)

**Causa raiz IDENTIFICADA:** O `AssignMemberSelect` dentro de cada card de conversa tem:
```tsx
<div onClick={(e) => e.stopPropagation()}>
  <AssignMemberSelect
    triggerClassName="w-full sm:w-[130px]"
  />
</div>
```

No mobile, `w-full` faz o select ocupar **toda a largura**, cobrindo QUASE TODO o card. O `e.stopPropagation()` impede que o click passe ao card. Resultado:
- **1º clique** → cai no AssignMemberSelect (bloqueia propagação) → nada acontece
- **2º clique** → usuário acerta na área do nome/avatar → conversa abre

### Correção

**Arquivo:** `src/components/solarzap/ConversationList.tsx`

Trocar o `w-full` por tamanho fixo no mobile:

```diff
  <AssignMemberSelect
    contactId={conversation.contact.id}
    currentAssigneeId={conversation.contact.assignedToUserId}
-   triggerClassName="w-full sm:w-[130px]"
+   triggerClassName="w-[130px]"
  />
```

Alternativa melhor — mover o AssignMemberSelect para DENTRO do menu de ações (3 pontos) no mobile e esconder do card:

```tsx
{!isSelectionMode && !isMobileViewport && (
  <div onClick={(e) => e.stopPropagation()}>
    <AssignMemberSelect ... />
  </div>
)}
```

No mobile, o AssignMemberSelect some do card. Para atribuir membros no mobile, o usuário usa o painel de detalhes da conversa.

**Recomendação:** Segunda abordagem (esconder no mobile), pois mesmo com `w-[130px]` ainda bloqueia parte do click target. O membro atribuído pode ser mostrado apenas como um badge/ícone de avatar inline.

**LOC:** ~15 linhas

---

## ISSUE-03 — Pipeline: "mover etapa" abre editar lead → trocar por setas laterais

### Diagnóstico

**Arquivo:** `src/components/solarzap/PipelineView.tsx` (linhas ~1128-1155)

O comportamento reportado é: "botão mover etapa abre editar lead". Analisando o código:
- Clicar no **card** abre `setIsEditModalOpen(true)` (correto, é pra editar)
- O **"Mover etapa"** está dentro do menu dropdown (MoreVertical) e funciona corretamente

O problema pode ser que o usuário não encontra ou confunde os controles. O pedido é claro: **remover "Mover etapa" do dropdown e adicionar setas laterais visíveis**.

### Correção

**Arquivo:** `src/components/solarzap/PipelineView.tsx`

#### A. Remover "Mover etapa" do dropdown mobile (linhas 1128-1155)

```diff
- {isMobileViewport ? (
-   <>
-     <div className="h-px bg-muted my-1" />
-     <DropdownMenuSub>
-       <DropdownMenuSubTrigger className="gap-2 cursor-pointer">
-         <ArrowUpDown className="w-4 h-4 text-primary" />
-         <span>Mover etapa</span>
-       </DropdownMenuSubTrigger>
-       ... (submenu com todas as etapas)
-     </DropdownMenuSub>
-   </>
- ) : null}
```

#### B. Adicionar setas laterais no card mobile

Adicionar helper para prev/next stage:
```tsx
const STAGES_ARRAY = Object.keys(PIPELINE_STAGES) as PipelineStage[];

function getAdjacentStages(current: PipelineStage) {
  const idx = STAGES_ARRAY.indexOf(current);
  return {
    prev: idx > 0 ? STAGES_ARRAY[idx - 1] : null,
    next: idx < STAGES_ARRAY.length - 1 ? STAGES_ARRAY[idx + 1] : null,
  };
}
```

No card mobile, adicionar barra de setas no footer:
```tsx
{isMobileViewport && (
  <div className="flex items-center justify-between border-t border-border/50 px-3 py-2 mt-auto">
    <button
      disabled={!adjacentStages.prev}
      onClick={(e) => {
        e.stopPropagation();
        if (adjacentStages.prev) void handleMoveToStageFromMenu(contact, adjacentStages.prev);
      }}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
    >
      <ChevronLeft className="w-4 h-4" />
      <span className="truncate max-w-[100px]">{adjacentStages.prev ? PIPELINE_STAGES[adjacentStages.prev].title : ''}</span>
    </button>
    <span className="text-[10px] text-muted-foreground">{PIPELINE_STAGES[contact.pipelineStage].icon}</span>
    <button
      disabled={!adjacentStages.next}
      onClick={(e) => {
        e.stopPropagation();
        if (adjacentStages.next) void handleMoveToStageFromMenu(contact, adjacentStages.next);
      }}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
    >
      <span className="truncate max-w-[100px]">{adjacentStages.next ? PIPELINE_STAGES[adjacentStages.next].title : ''}</span>
      <ChevronRight className="w-4 h-4" />
    </button>
  </div>
)}
```

O `e.stopPropagation()` impede que clicar nas setas abra o modal de editar lead.

**LOC:** ~50 linhas (remover ~30, adicionar ~50)

---

## ISSUE-04 — Calendário: botão de modal de eventos na barra mobile

### Diagnóstico

**Arquivo:** `src/components/solarzap/CalendarView.tsx` (linhas ~500-525)

Já existem botões "Próximos" e "Passados" na barra horizontal abaixo do header (linha 503-525). Eles abrem um `Drawer` com conteúdo baseado em `mobileDrawerMode`. O Drawer tem funcionalidade de arquivo, filtros etc.

**Problema reportado:** Os botões existem mas podem estar escondidos ou o Drawer não tem a mesma funcionalidade completa do desktop (sidebar com dois painéis paralelos). O desktop tem:
- Próximos Eventos com scroll independente
- Eventos Passados com botão "Arquivo" e scroll independente

O Drawer mobile alterna entre modos ('upcoming', 'past', 'day') um de cada vez.

Já existe um `EventArchiveModal` (linha 766) que é funcional.

### Correção

A funcionalidade já existe parcialmente. Ajustes necessários:

**Arquivo:** `src/components/solarzap/CalendarView.tsx`

1. **Adicionar botão de Arquivo explícito ao lado de "Passados":**
```tsx
<Button
  variant="outline"
  size="sm"
  className="h-9 shrink-0 rounded-full gap-1"
  onClick={() => setArchiveModalOpen(true)}
>
  <Archive className="w-3.5 h-3.5" />
  Arquivo
</Button>
```

2. **Garantir que o Drawer mobile tenha os mesmos action buttons do desktop:**
- No modo 'upcoming': botão "Novo agendamento para data" (já existe)
- No modo 'past': botão "Arquivo" (conferir se tem no Drawer; se não, adicionar)
- Em ambos: filtros do sidebar (já encapsulados no Drawer)

3. **Verificar scrolling do Drawer:** O Drawer tem `max-h-[85vh]` e `overflow-y-auto`. Se houver muitos eventos, precisa de `pb-safe` para safe area:
```diff
- <div className="overflow-y-auto px-4 pb-6">
+ <div className="overflow-y-auto px-4 pb-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
```

**LOC:** ~15-20 linhas

---

## ISSUE-05 — Contatos: scroll do contato e informações

### Diagnóstico

**Arquivo:** `src/components/solarzap/ContactsView.tsx` (linhas ~584-830)

O layout mobile é toggle-based:
- `showMobileDetail = false` → mostra lista de contatos
- `showMobileDetail = true` → mostra detalhe do contato

Container da lista: `flex-1 overflow-auto p-3 space-y-3` — ✅ OK  
Container do detalhe: `flex-1 overflow-auto p-4 sm:p-6` — ⚠️ PROBLEMA

**Problema identificado:** O detalhe pode ser muito longo (header + grid de campos editáveis + notas + propostas + timeline). O parent container precisa de `min-h-0` para que `flex-1 overflow-auto` funcione corretamente em flex column layout.

### Correção

**Arquivo:** `src/components/solarzap/ContactsView.tsx`

```diff
  {/* Mobile Detail View */}
  {showMobileDetail && (
-   <div className="flex flex-1 flex-col">
+   <div className="flex flex-1 flex-col min-h-0">
      {/* Back button */}
      ...
      {/* Detail content */}
-     <div className="flex-1 overflow-auto p-4 sm:p-6">
+     <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
```

Adicional: verificar se o header mobile (back button + nome) tem `shrink-0`:
```diff
- <div className="flex items-center gap-2 border-b px-4 py-3">
+ <div className="flex items-center gap-2 border-b px-4 py-3 shrink-0">
```

**LOC:** ~5 linhas

---

## ISSUE-06 — Disparos: scroll das campanhas

### Diagnóstico

**Arquivo:** `src/components/solarzap/BroadcastView.tsx` (linhas ~128-440)

O main scroll container é `flex-1 overflow-y-auto`. O grid é `grid grid-cols-1 lg:grid-cols-2 gap-4`. Isto é fundamentalmente correto.

**Problema possível:** Se o parent do BroadcastView não garante `min-h-0` no flex chain, o overflow-y-auto não tem efeito. O container wrapper pode estar omitindo `min-h-0`.

### Correção

**Arquivo:** `src/components/solarzap/BroadcastView.tsx`

```diff
- <div className="flex-1 flex flex-col w-full overflow-hidden bg-muted/30">
+ <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden bg-muted/30">
```

E no scroll container:
```diff
- <div className="flex-1 overflow-y-auto">
+ <div className="flex-1 min-h-0 overflow-y-auto">
```

**LOC:** ~3 linhas

---

## ISSUE-07 — Propostas: filtros em dropdown e scroll

### Diagnóstico

**Arquivo:** `src/components/solarzap/ProposalsView.tsx` (linhas ~658-810)

Layout atual:
- PageHeader → z-10
- ScrollArea (flex-1) → contém tudo (filtros Card + resultados Card)
- Filtros: Card com `grid grid-cols-1 md:grid-cols-3 gap-3` — 6 filtros sempre visíveis
- Resultados: `max-h-[560px] overflow-auto`

**Problemas:**
1. No mobile, 6 filtros empilhados em 1 coluna ocupam ~400px+ de altura, empurrando os resultados pra baixo
2. `max-h-[560px]` no container de resultados pode ser problemático em telas muito pequenas
3. O PageHeader não tem `mobileToolbar` (sem botões de ação no mobile — embora não haja ação de criação)

### Correção

**Arquivo:** `src/components/solarzap/ProposalsView.tsx`

1. **Transformar filtros em collapsible no mobile:**

Adicionar `useMobileViewport` e estado `filtersOpen`:
```tsx
const isMobileViewport = useMobileViewport();
const [filtersOpen, setFiltersOpen] = useState(!isMobileViewport);
```

Envolver o Card de filtros em um collapsible:
```tsx
<Card>
  <CardHeader
    className="cursor-pointer"
    onClick={() => setFiltersOpen(!filtersOpen)}
  >
    <div className="flex items-center justify-between">
      <div>
        <CardTitle className="text-base">Filtros</CardTitle>
        <CardDescription className="text-xs">Lead, período, vendedor, etapa e status</CardDescription>
      </div>
      <ChevronDown className={cn("w-4 h-4 transition-transform", filtersOpen && "rotate-180")} />
    </div>
  </CardHeader>
  {filtersOpen && (
    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
      ... filtros ...
    </CardContent>
  )}
</Card>
```

2. **Remover max-h fixo no mobile:**
```diff
- <CardContent className="max-h-[560px] overflow-auto ...">
+ <CardContent className="max-h-[50vh] sm:max-h-[560px] overflow-auto ...">
```

3. **Adicionar mobileToolbar com badge de filtros ativos e botão toggle:**
```tsx
mobileToolbar={
  <div className="flex items-center gap-2">
    {activeFilterCount > 0 && (
      <Badge variant="secondary" className="text-[10px]">{activeFilterCount} filtros</Badge>
    )}
    <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setFiltersOpen(!filtersOpen)}>
      <SlidersHorizontal className="w-3.5 h-3.5" />
    </Button>
  </div>
}
```

**LOC:** ~30-40 linhas

---

## ISSUE-08 — Notificações: transformar modal em aba full-screen

### Diagnóstico

**Arquivo:** `src/components/solarzap/NotificationsPanel.tsx`  
**Arquivo:** `src/components/solarzap/SolarZapLayout.tsx` (linhas ~1441-1444)

O NotificationsPanel atual é um painel fixo `left-[60px] top-0 h-full z-50 w-80` — funciona no desktop mas no mobile:
- `left-[60px]` refere-se ao sidebar desktop que NÃO existe no mobile
- `w-80` (320px) + offset = pode estar fora do viewport ou cortado
- Quando aberto no mobile, sobrepõe parcialmente o conteúdo
- O backdrop (bg-black/20 inset-0 z-40) bloqueia o resto

### Correção

**Arquivos:** `src/components/solarzap/NotificationsPanel.tsx` + `src/components/solarzap/SolarZapLayout.tsx`

#### Abordagem: No mobile, renderizar como aba full-screen dentro do layout principal

**SolarZapLayout.tsx:**

Quando `isNotificationsPanelOpen && isMobileViewport`:
- Não renderizar o NotificationsPanel como overlay
- Ao invés, tratar como se fosse uma "aba" temporária

```tsx
{/* Em vez do Suspense+NotificationsPanel overlay no mobile... */}
{isMobileViewport && isNotificationsPanelOpen ? (
  <div className="flex-1 flex flex-col min-h-0">
    <NotificationsFullScreenMobile
      notifications={notifications}
      onBack={() => setIsNotificationsPanelOpen(false)}
      onMarkAsRead={markNotificationAsRead}
      onMarkAllAsRead={markAllNotificationsAsRead}
      onDelete={deleteNotification}
      onClearAll={clearAllNotifications}
      onGoToContact={...}
      onOpenSettings={() => { /* navegar para aba de configurações de notificações */ }}
    />
  </div>
) : activeTab === 'conversas' ? (
  ... {/* render normal */}
)}
```

**NotificationsPanel.tsx — criar variante mobile:**

Criar novo componente `NotificationsFullScreenMobile` (ou condicional dentro do Panel):

```tsx
// Se isMobileViewport, renderizar layout full-screen:
<div className="flex flex-1 flex-col min-h-0 bg-background">
  {/* Header com PageHeader-like header */}
  <div className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
    <button onClick={onBack}><ArrowLeft className="w-5 h-5" /></button>
    <Bell className="w-5 h-5 text-primary" />
    <h2 className="font-semibold">Notificações</h2>
    {unreadCount > 0 && <Badge>{unreadCount}</Badge>}
    <div className="ml-auto flex gap-2">
      <Button size="sm" variant="ghost" onClick={handleMarkAllRead}>
        <CheckCheck className="w-4 h-4" />
      </Button>
      <Button size="sm" variant="ghost" onClick={onOpenSettings}>
        <Settings2 className="w-4 h-4" />
      </Button>
    </div>
  </div>

  {/* Scrollable notification list */}
  <div className="flex-1 min-h-0 overflow-y-auto">
    {notifications.map(n => renderNotification(n))}
  </div>
</div>
```

Quando clicar "Configurações" (⚙️), navegar diretamente para a aba de configurações de notificações (usar o mesmo NotificationSettingsCard dentro da aba de automações/geral). Alternativa: abrir as configurações como sub-view dentro da tela de notificações, substituindo a lista.

**Desktop:** Nenhuma mudança — continua com panel overlay.

**LOC:** ~80-100 linhas

---

## ISSUE-09 — IA: toggles carregados, textos mal formatados

### Diagnóstico

**Arquivo:** `src/components/solarzap/AIAgentsView.tsx` (~900+ linhas de conteúdo)

**Problemas identificados:**
1. **Informação excessiva visível de uma vez:** 7+ sections (Settings Row, Auto Schedule, Appointment Window, Follow-Up Cadence, Follow-Up Window, Pipeline Agents...) todos abertos por default
2. **Textos tiny:** `text-[11px]` no WhatsApp instances card, `scale-75` no Switch (pequeno demais pra toque)
3. **Botão "Religar todos"** em `text-[11px]` — ilegível
4. **Instance names truncados agressivamente** pelo `min-w-0`
5. **pb-24 no bottom** — padding excessivo desperdiçando viewport

### Correção

**Arquivo:** `src/components/solarzap/AIAgentsView.tsx`

#### A. Colapsar sections por default no mobile usando Accordion/Collapsible

Envolver cada Card principal em `Collapsible` (shadcn):

```tsx
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// Cada section:
<Collapsible defaultOpen={!isMobileViewport}>
  <Card>
    <CollapsibleTrigger asChild>
      <CardHeader className="cursor-pointer">
        <div className="flex items-center justify-between">
          <CardTitle>Política de Agendamento Automático</CardTitle>
          <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform [[data-state=open]>svg]:rotate-180" />
        </div>
      </CardHeader>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <CardContent>...</CardContent>
    </CollapsibleContent>
  </Card>
</Collapsible>
```

No mobile (`!isMobileViewport = false`): sections começam colapsados. User clica para expandir.
No desktop: sections começam abertos (comportamento atual).

#### B. Corrigir textos e tamanhos tiny

```diff
  // WhatsApp instances
- <span className="text-[11px] text-muted-foreground">Habilitar agente IA por instância</span>
+ <span className="text-xs text-muted-foreground">Habilitar agente IA por instância</span>

- <Switch ... className="scale-75" />
+ <Switch ... />

- <Button size="sm" className="text-[11px] ...">Religar todos</Button>
+ <Button size="sm" className="text-xs ...">Religar todos</Button>
```

#### C. Reduzir padding bottom no mobile

```diff
- <div className="flex-1 overflow-y-auto w-full px-4 py-4 pb-24 sm:px-6 sm:py-6">
+ <div className="flex-1 overflow-y-auto w-full px-4 py-4 pb-8 sm:px-6 sm:py-6 sm:pb-24">
```

**LOC:** ~60-80 linhas

---

## ISSUE-10 — Dashboard: scroll preso no final

### Diagnóstico

**Arquivo:** `src/components/solarzap/DashboardView.tsx` (linhas ~128+)

O container principal é `flex-1 flex flex-col bg-muted/30 overflow-y-auto`. O PageHeader está DENTRO do scroll container.

**Possível causa:** Múltiplas sections com heights que podem crescer (tabelas, charts com tooltips). Se houver algum componente como `StaleLeadsTable` ou `OwnerPerformanceTable` que cria um scroll interno, pode haver **nested scroll trap**. Além disso, se o container não tem `min-h-0`, o flex-1 pode calcular altura errada.

Verificar também se `DashboardCharts` usa `overflow-x-auto` para charts horizontais — combinação de scroll horizontal dentro de vertical causa trap em iOS.

### Correção

**Arquivo:** `src/components/solarzap/DashboardView.tsx`

```diff
- <div className="flex-1 flex flex-col bg-muted/30 overflow-y-auto">
+ <div className="flex-1 flex flex-col min-h-0 bg-muted/30 overflow-y-auto">
```

**Prevenir nested scroll trap — verificar tabelas internas:**

Se `OwnerPerformanceTable` ou `StaleLeadsTable` usam `overflow-x-auto` com tabelas largas:
```diff
- <div className="overflow-x-auto">
-   <table className="min-w-[600px]">
+ <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
+   <table className="min-w-[600px]">
```

O `-mx-4 px-4` no mobile permite que o scroll horizontal tenha "inércia" visual, e isola o scroll do container principal.

**Arquivo adicional:** Verificar `DashboardCharts.tsx`, `OwnerPerformanceTable.tsx`, `StaleLeadsTable.tsx` para nested overflow patterns.

Aplicar `overscroll-behavior-y: contain` no scroll container para prevenir scroll chain:
```diff
+ <div className="... overflow-y-auto overscroll-contain">
```

Isso impede que o scroll "escape" do container e afete o body, prevenindo o bug de ficar preso.

**LOC:** ~10-15 linhas

---

## ISSUE-11 — Tracking/Conversões completamente mal ajustado

### Diagnóstico

**Arquivo:** `src/components/solarzap/TrackingView.tsx` (~1600 linhas)

**Problemas graves:**
1. **6 tabs horizontais** em `flex-nowrap` na TabsList — no mobile (375px) precisa scroll horizontal para achar todas as tabs. Confuso para o usuário
2. **Tabelas com `min-w-[980px]`** (Entregas tab) — 2.6× do viewport, cria scroll horizontal DENTRO de scroll vertical = scroll trap
3. **Mapeamento de Etapas** — tabela com múltiplas colunas que provavelmente também transborda
4. **Cards de platform (Meta, Google Ads, GA4)** — layout possivelmente quebrado
5. **Webhook/Snippet cards** — código longo tipo URL/chave pode transbordar
6. **ScrollArea como container principal** em vez de div com overflow-auto — pode ter incompatibilidade com nested overflow

### Correção Completa

**Arquivo:** `src/components/solarzap/TrackingView.tsx`

#### A. Tab Bar — condensar no mobile

```tsx
// No mobile, encurtar nomes das tabs:
<TabsTrigger value="geral" className="shrink-0">
  {isMobileViewport ? 'Geral' : 'Geral'}
</TabsTrigger>
<TabsTrigger value="webhook" className="shrink-0">
  {isMobileViewport ? 'Webhook' : 'Webhook & Snippet'}
</TabsTrigger>
<TabsTrigger value="plataformas" className="shrink-0">
  {isMobileViewport ? 'Plat.' : 'Plataformas'}
</TabsTrigger>
<TabsTrigger value="mapeamento" className="shrink-0">
  {isMobileViewport ? 'Mapear' : 'Mapeamento de Etapas'}
</TabsTrigger>
<TabsTrigger value="gatilhos" className="shrink-0">
  {isMobileViewport ? 'Gatilhos' : 'Mensagens Gatilho'}
</TabsTrigger>
<TabsTrigger value="entregas" className="shrink-0">
  {isMobileViewport ? 'Entregas' : 'Entregas'}
</TabsTrigger>
```

#### B. Tabela de Entregas — mobile card layout

No mobile, substituir a tabela por cards empilhados:
```tsx
{isMobileViewport ? (
  <div className="space-y-3">
    {deliveries.map(d => (
      <div key={d.id} className="rounded-xl border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Badge>{d.platform}</Badge>
          <Badge variant={statusVariant(d.status)}>{d.status}</Badge>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Evento:</span> {d.event_name}
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Etapa:</span> {d.pipeline_stage}
        </div>
        <div className="text-xs text-muted-foreground">
          Tentativas: {d.attempts} | Próxima: {d.next_retry}
        </div>
        {d.last_error && (
          <div className="text-xs text-destructive truncate">{d.last_error}</div>
        )}
      </div>
    ))}
  </div>
) : (
  <div className="overflow-x-auto rounded-xl border bg-background">
    <table className="min-w-[980px]">...</table>
  </div>
)}
```

#### C. Mapeamento de Etapas — similar tratamento card mobile

#### D. Webhook & Snippet — code blocks com word-break

```diff
- <pre className="text-xs ...">
+ <pre className="text-xs break-all whitespace-pre-wrap ...">
```

#### E. Container principal — trocar ScrollArea por div simples

```diff
- <ScrollArea className="h-full flex-1">
-   <div className="min-h-full bg-muted/30">
+ <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
+   <div className="min-h-full bg-muted/30">
```

**LOC:** ~120-150 linhas

---

## ISSUE-12 — Barra de abas de "Minha Empresa"

### Diagnóstico

**Arquivo:** `src/components/solarzap/KnowledgeBaseView.tsx` (linhas ~307-330)

Tab bar:
```tsx
<div className="overflow-x-auto pb-1">
  <TabsList className="flex h-auto min-w-full flex-nowrap justify-start gap-1 ... sm:flex-wrap">
    <TabsTrigger>Sobre a Empresa</TabsTrigger>
    <TabsTrigger>Depoimentos</TabsTrigger>
    <TabsTrigger>Objeções & FAQ</TabsTrigger>
  </TabsList>
</div>
```

**Problema:** 3 tabs com ícones + texto em `flex-nowrap` pode não caber em 375px. O `overflow-x-auto` permite scroll horizontal mas a experiência é ruim — user pode nem perceber que tem mais tabs.

### Correção

**Arquivo:** `src/components/solarzap/KnowledgeBaseView.tsx`

Opção 1 (recomendada) — **No mobile mostrar apenas ícone + texto abreviado:**

```tsx
<TabsTrigger value="empresa" className="shrink-0 gap-1.5 rounded-lg px-3 py-2 ...">
  <Building2 className="w-4 h-4" />
  {isMobileViewport ? 'Empresa' : 'Sobre a Empresa'}
</TabsTrigger>
<TabsTrigger value="depoimentos" className="shrink-0 gap-1.5 rounded-lg px-3 py-2 ...">
  <MessageSquareQuote className="w-4 h-4" />
  {isMobileViewport ? 'Deptos.' : 'Depoimentos'}
</TabsTrigger>
<TabsTrigger value="objecoes" className="shrink-0 gap-1.5 rounded-lg px-3 py-2 ...">
  <ShieldQuestion className="w-4 h-4" />
  {isMobileViewport ? 'FAQ' : 'Objeções & FAQ'}
</TabsTrigger>
```

Opção 2 — Permitir wrap no mobile removendo `flex-nowrap`:

```diff
- <TabsList className="flex h-auto min-w-full flex-nowrap justify-start gap-1 ... sm:flex-wrap">
+ <TabsList className="flex h-auto min-w-full flex-wrap justify-start gap-1 ...">
```

**Recomendação:** Opção 1, pois mantém horizontal e cabe em 1 linha. Adicionar `useMobileViewport` import.

**LOC:** ~10-15 linhas

---

## EXTRA — Bugs Adicionais Identificados na Análise

### EXTRA-01: NotificationsPanel `left-[60px]` no mobile

**Arquivo:** `src/components/solarzap/NotificationsPanel.tsx`

O panel tem `left-[60px]` que assume sidebar do desktop. No mobile não existe sidebar. Mesmo com os fixes da ISSUE-08, se por algum motivo o panel overlay for renderizado no mobile, ficará deslocado.

**Fix:** Coberto pela ISSUE-08 (full-screen no mobile).

### EXTRA-02: ChatArea input não tem safe-area-inset-bottom

**Arquivo:** `src/components/solarzap/ChatArea.tsx`

Quando a conversa está ativa, o bottom nav some (`showMobileBottomBar = false`). O input fica na borda inferior. Em iPhones com barra home, precisa de `pb-[env(safe-area-inset-bottom)]`.

**Fix:**
```diff
- <div className="border-t ...">
+ <div className="border-t ... pb-[env(safe-area-inset-bottom)]">
```

### EXTRA-03: ConversationList — FollowUpIndicator pode causar layout shift

**Arquivo:** `src/components/solarzap/ConversationList.tsx` (linha ~955)

O `FollowUpIndicator` está em `<div className="w-full overflow-hidden">`. Se ele renderizar condicionalmente ou com animação, pode causar layout shift.

**Fix:** Manter overflow-hidden e adicionar `min-h-[20px]` para reservar espaço.

### EXTRA-04: ProposalsView sem mobileToolbar no PageHeader

**Arquivo:** `src/components/solarzap/ProposalsView.tsx`

O PageHeader não tem `mobileToolbar`. No mobile, o título e subtítulo ficam sem ação.

**Fix:** Coberto parcialmente na ISSUE-07 (adicionar toggle de filtros no mobileToolbar).

### EXTRA-05: MobileBottomNav — notificação badge pode sobrepor

**Observação:** A bell icon no MobileBottomNav tem um badge de contagem que pode sobrepor o ícone adjacente em telas muito pequenas.

**Fix:** Limitar badge a `99+` com max-width.

---

## Plano de Execução

### Sprint 1 — Crítico (P0): Issues que bloqueiam uso

| # | Issue | Arquivo(s) | LOC |
|---|-------|-----------|-----|
| 1 | ISSUE-02: 2 cliques para abrir conversa | ConversationList.tsx | ~15 |
| 2 | ISSUE-01: Fixar header/input no chat | ChatArea.tsx | ~10 |
| 3 | ISSUE-10: Dashboard scroll preso | DashboardView.tsx + tabelas | ~15 |
| 4 | EXTRA-02: Safe area no input | ChatArea.tsx | ~3 |

### Sprint 2 — Alto (P1): UX severamente degradada

| # | Issue | Arquivo(s) | LOC |
|---|-------|-----------|-----|
| 5 | ISSUE-03: Pipeline setas laterais | PipelineView.tsx | ~50 |
| 6 | ISSUE-08: Notificações full-screen | NotificationsPanel.tsx + SolarZapLayout.tsx | ~100 |
| 7 | ISSUE-11: Tracking reorganização | TrackingView.tsx | ~150 |
| 8 | ISSUE-09: IA toggles/textos | AIAgentsView.tsx | ~80 |

### Sprint 3 — Médio (P2): Polimento

| # | Issue | Arquivo(s) | LOC |
|---|-------|-----------|-----|
| 9 | ISSUE-07: Propostas filtros dropdown | ProposalsView.tsx | ~40 |
| 10 | ISSUE-04: Calendário botão arquivo | CalendarView.tsx | ~20 |
| 11 | ISSUE-05: Contatos scroll | ContactsView.tsx | ~5 |
| 12 | ISSUE-06: Disparos scroll | BroadcastView.tsx | ~3 |
| 13 | ISSUE-12: Tabs Minha Empresa | KnowledgeBaseView.tsx | ~15 |
| 14 | EXTRA-03/05: Minor fixes | ConversationList.tsx + MobileBottomNav | ~5 |

### Total estimado: ~510 LOC net  
### Arquivos tocados: ~12  
### Risco de regressão desktop: BAIXO (todas as mudanças usam `isMobileViewport` conditionals ou classes responsivas `sm:` / `lg:`)
