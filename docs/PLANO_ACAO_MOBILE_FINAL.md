# Plano de Ação Final — Mobile Production-Ready

> **Objetivo:** Transformar a experiência mobile do SolarZap CRM em uma interface limpa, rápida e funcional, seguindo as melhores práticas de design mobile (Apple HIG, Material Design, padrões de mercado para CRM/Chat/Calendário) — sem causar regressões no desktop.

> **Status:** PLANO APROVADO — AGUARDANDO EXECUÇÃO

---

## Diagnóstico Real do Estado Atual (Março 2026)

### O que está errado (com evidências do código)

Após análise completa de **todos os componentes mobile**, os problemas são **sistêmicos** e não pontuais:

| Problema | Gravidade | Telas Afetadas |
|----------|-----------|----------------|
| **Headers gigantes ocupam 30-40% da tela mobile** | 🔴 CRÍTICO | TODAS as telas |
| **Filtros, seletor de membro e busca sempre visíveis** | 🔴 CRÍTICO | Pipeline, Dashboard, Contatos, Calendário |
| **Chat header lotado de botões (IA toggle, instância, telefone, vídeo, busca, seleção)** | 🔴 CRÍTICO | Chat |
| **Áudio gravado em `audio/webm` — incompatível com WhatsApp/iOS** | 🔴 CRÍTICO | Chat (gravador) |
| **Calendar grid usa `min-w-[540px]` forçando scroll horizontal** | 🟡 ALTO | Calendário |
| **Botões de ação (comentário, lixeira) sempre visíveis nos cards de contato** | 🟡 ALTO | Contatos |
| **KPI hero card ocupa tela inteira no mobile** | 🟡 ALTO | Dashboard |
| **Tracking view sem detecção mobile, tabs cortadas** | 🟡 ALTO | Tracking |
| **Mic button usa mouse events no mobile (onMouseDown/onMouseUp)** | 🟡 ALTO | Chat |

---

## Princípios de Design Mobile Adotados

Baseado nas Apple Human Interface Guidelines, Material Design e melhores práticas de CRM mobile:

1. **Foco na tarefa primária** — Limitar controles visíveis na tela; ações secundárias acessíveis com 1 tap
2. **Touch targets mínimos de 44x44px** — Nenhum botão menor que isso
3. **Headers compactos** — Máximo 48-56px de altura; sem ícone decorativo, sem subtítulo
4. **Filtros em collapse/drawer** — Nunca ocupando espaço fixo na tela
5. **Bottom sheet/Drawer para ações** — Em vez de dropdown menus (difíceis no mobile)
6. **Conteúdo primeiro** — O conteúdo principal deve começar no primeiro terço da tela
7. **Zone de polegar** — Ações principais na parte inferior da tela (zona confortável)
8. **Densidade adaptativa** — Menos informação por card, tipografia menor, espaçamento tighter

---

## Arquitetura da Solução

### Componente Central: `PageHeader` (afeta TODAS as telas)

**Arquivo:** `src/components/solarzap/PageHeader.tsx`

**Estado atual:**
```
px-6 py-5          → padding excessivo
w-12 h-12 icon     → ícone decorativo desnecessário no mobile  
text-2xl title      → título muito grande
subtitle            → subtítulo desnecessário no mobile
actionContent       → filtros/botões empurrados para baixo, wrapping
```

**Solução:** Criar variante mobile compacta.

```
Mobile (< 1024px):
- Remover ícone decorativo
- Remover subtítulo  
- Title: text-lg font-semibold (em vez de text-2xl font-bold)
- Padding: px-4 py-2.5
- ActionContent: hidden (movido para toolbar separada ou drawer)
- Altura total: ~44px

Desktop (≥ 1024px):
- Manter exatamente como está
```

---

## Plano por Tela — Detalhado

### 1. PageHeader Compacto (TODAS AS TELAS)

**Arquivo:** `src/components/solarzap/PageHeader.tsx`  
**Prioridade:** 🔴 P0  
**Impacto:** Afeta Pipeline, Contatos, Calendário, Dashboard, Tracking, Disparos, Propostas

**Mudanças:**
- [ ] Importar `useMobileViewport` hook
- [ ] No mobile: esconder ícone (`hidden lg:flex`)
- [ ] No mobile: esconder subtítulo (`hidden lg:block`)
- [ ] No mobile: título `text-lg` em vez de `text-2xl`
- [ ] No mobile: padding `px-4 py-2.5` em vez de `px-6 py-5`
- [ ] No mobile: `actionContent` recebe prop `mobileActionContent` separado (ou escondido)
- [ ] Manter desktop inalterado

**Economia estimada:** ~80-100px de altura por tela

---

### 2. Chat Header & Input — Limpeza Radical

**Arquivo:** `src/components/solarzap/ChatArea.tsx`  
**Prioridade:** 🔴 P0

**Problemas identificados (com linhas exatas):**

#### 2a. Chat Header (linha ~960-1095)
O header tem TODOS estes elementos visíveis ao mesmo tempo no mobile:
- Botão voltar
- Avatar + nome do contato (truncado)  
- Badge de etapa do pipeline
- Toggle de IA (ícone + switch + label)
- Seletor de instância WhatsApp
- Botão telefone
- Botão vídeo chamada
- Botão busca  
- Botão seleção de mensagens

**Solução mobile:**
- [ ] **Linha 1**: Voltar + Avatar + Nome (sem truncar) + badge etapa → Estes ficam
- [ ] **Esconder no mobile**: Toggle IA completo (`hidden lg:flex`), label da instância (`hidden lg:flex`), botão vídeo (`hidden lg:flex`), botão seleção (`hidden lg:flex`)
- [ ] **Manter no mobile**: Voltar, Avatar+Nome, Busca, **botão "⋮" (3 pontos)** que abre Drawer com todas as ações ocultas
- [ ] Criar `ChatHeaderActionsDrawer` — bottom sheet com: Toggle IA, Seletor de instância, Telefone, Vídeo, Buscar, Selecionar mensagens
- [ ] O badge de instância fica como uma bolinha colorida ao lado do nome (indicador visual sem texto)

**Resultado:** Header com 3-4 elementos em vez de 9+. Nome visível, ações a 1 tap.

#### 2b. Gravador de Áudio (linhas 520-600)
**Problema:** `audio/webm` não é reproduzível no WhatsApp/iOS. O MediaRecorder grava em WebM que não é universalmente compatível.

**Solução:**
- [ ] Tentar gravar em `audio/ogg; codecs=opus` primeiro (compatível com WhatsApp)
- [ ] Fallback para `audio/webm; codecs=opus`
- [ ] Na montagem do Blob, usar o mimeType real do MediaRecorder (`mediaRecorder.mimeType`)
- [ ] Verificar `MediaRecorder.isTypeSupported()` antes de definir o formato
- [ ] Upload com contentType correto (não hardcoded `audio/webm`)
- [ ] Extensão do arquivo deve corresponder ao formato real (`.ogg` ou `.webm`)

**Código atual problemático:**
```ts
// Linha 564 - ChatArea.tsx
const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

// Linha 1272 - useChat.ts  
.upload(fileName, audioBlob, { contentType: 'audio/webm' });

// Linha 1268 - useChat.ts
const fileName = `${orgId}/chat/${safeLeadId}/${Date.now()}_audio.webm`;
```

#### 2c. Mic Button Touch Events (linhas 1494-1503)
**Problema:** Usa `onMouseDown`/`onMouseUp` que são unreliable no mobile. Também tem `onTouchStart`/`onTouchEnd` mas ambos firing causa double-recording.

**Solução:**
- [ ] Usar padrão de PTT (Push-to-Talk) com PointerEvents: `onPointerDown` + `onPointerUp` 
- [ ] Remover listeners duplicados de mouse + touch
- [ ] Adicionar visual feedback de recording (animação pulsante maior)
- [ ] Prevenir `context menu` durante long press: `onContextMenu={(e) => e.preventDefault()}`

#### 2d. Emoji Picker (linhas 1416-1430)
- [ ] Adicionar `max-h-[50vh]` no container do emoji picker no mobile
- [ ] Posicionar como bottom sheet (não floating acima do input)

#### 2e. Attachment Menu (linhas 1434-1454)
- [ ] Substituir `DropdownMenu` por `Drawer` no mobile para selecionar tipo de arquivo

---

### 3. Pipeline — Toolbar Compacta

**Arquivo:** `src/components/solarzap/PipelineView.tsx`  
**Prioridade:** 🔴 P0

**Problemas (linhas 726-830):**
- LeadScopeSelect (seletor de membro) sempre visível
- Popover de filtro de origem
- Input de busca (100% largura no mobile)
- Botão "Análise de Perdas"
- Dropdown de Import/Export

**Solução mobile:**
- [ ] **PageHeader**: Título + apenas botão de filtro (ícone funil)
- [ ] Criar `PipelineMobileToolbar` — barra compacta abaixo do header:
  - Barra de busca (compacta, `h-9`)
  - Botão funil que abre `Drawer` com: LeadScopeSelect, Filtro de origem, Análise de Perdas, Import/Export
- [ ] Esconder "Análise de Perdas" e Import/Export do header mobile (ficam no drawer)
- [ ] Manter indicador de etapa atual (linha 852) — já está bom

---

### 4. Contatos — Card Compacto

**Arquivo:** `src/components/solarzap/ContactsView.tsx`  
**Prioridade:** 🟡 P1

**Problemas (linhas 586-770):**
- PageHeader com ícone grande + botões de import/export
- LeadScopeSelect sempre visível
- Botões de comentário e lixeira sempre visíveis nos cards mobile (`opacity-100`)
- Cards com muita informação (nome, telefone, follow-up indicator, 2 botões)

**Solução mobile:**
- [ ] **PageHeader**: Título "Contatos" compacto + busca inline no header (substituir ícone por campo de busca)
- [ ] Esconder import/export no mobile (acessível via "⋮" no header)
- [ ] LeadScopeSelect: mover para drawer de filtros (acessível via ícone de filtro)
- [ ] Cards de contato: 
  - Nome + indicador de etapa (bolinha colorida) + telefone na mesma linha
  - Esconder botões de ação por padrão (`opacity-0`)
  - Ações acessíveis via swipe-left ou long-press → Drawer com ações
- [ ] Remover `border-border/70` e shadow dos cards mobile — usar separador simples

---

### 5. Calendário — Header e Grid Compactos

**Arquivo:** `src/components/solarzap/CalendarView.tsx`  
**Prioridade:** 🟡 P1

**Problemas (linhas 420-540):**
- PageHeader excessivamente alto
- LeadScopeSelect + botão "Novo Agendamento" no header
- Grid com `min-w-[540px]` forçando scroll horizontal
- Navegação de mês com espaçamento largo

**Solução mobile:**
- [ ] **PageHeader**: Título "Calendário" compacto + botão "+" para novo agendamento
- [ ] Mover LeadScopeSelect para drawer de filtros
- [ ] **Remover `min-w-[540px]`** no mobile — usar `min-w-0` e deixar grid ser `grid-cols-7` nativo
- [ ] Cells do calendário: padding menor (`p-1` em vez de `p-2`)
- [ ] Dia da semana header: usar abreviação de 1 letra no mobile (`D S T Q Q S S`)
- [ ] Manter os pill buttons "Próximos" e "Passados" — já estão bons
- [ ] Botão de filtro abre drawer com: tipo de agendamento, filtro de contato, seletor de membro

---

### 6. Dashboard — Compactação de KPIs

**Arquivo:** `src/components/solarzap/DashboardView.tsx`  
**Prioridade:** 🟡 P1

**Problemas (linhas 136-260):**
- PageHeader com: LeadScopeSelect, "Análise de Perdas", período, date picker, export — TUDO no header
- Hero KPI card `p-8` com texto `text-4xl sm:text-5xl` ocupa 50%+ da tela mobile
- Tables de performance e leads estagnados sem adaptação mobile

**Solução mobile:**
- [ ] **PageHeader**: Título "Dashboard" compacto + ícone de filtro + ícone de período
- [ ] Mover para drawer: LeadScopeSelect, Análise de Perdas, Date picker, Export
- [ ] Hero KPI card mobile: `p-4` padding, `text-2xl` em vez de `text-4xl`, layout vertical compacto
- [ ] KPI grid: `grid-cols-2` no mobile (já usa `md:grid-cols-2 xl:grid-cols-4` — OK)
- [ ] Tables: já têm `overflow-auto` wrapper, mas adicionar scroll indicator visual

---

### 7. Tracking & Conversões — Tabs e Formulários

**Arquivo:** `src/components/solarzap/TrackingView.tsx`  
**Prioridade:** 🟡 P1

**Problemas (linhas 920-980):**
- Sem `useMobileViewport` — nenhuma adaptação mobile
- Tabs overflow sem indicador de scroll
- Toggle switches `grid md:grid-cols-2 xl:grid-cols-4` — OK para mobile (col-1)
- Formulários de plataformas muito densos

**Solução mobile:**
- [ ] Importar `useMobileViewport` 
- [ ] **PageHeader**: Compacto com badge de status
- [ ] Tabs: adicionar scroll indicator (fade/gradient nas bordas) para indicar mais tabs
- [ ] Toggles de configuração: OK no mobile (full-width card), manter
- [ ] Forms de credenciais: adicionar padding e espaçamento vertical adequados
- [ ] Tabela de gatilhos: card layout no mobile (já não é table nativa, é custom)

---

### 8. Disparos (Broadcast) — Ajustes Menores

**Arquivo:** `src/components/solarzap/BroadcastView.tsx`  
**Prioridade:** 🟢 P2

**Problemas:**
- PageHeader com botão "Comprar créditos" + "Nova Campanha" — 2 botões full-width no mobile wrap
- Campaign cards `lg:grid-cols-2` — OK no mobile (col-1)

**Solução mobile:**
- [ ] **PageHeader**: Compacto + apenas botão "+" para nova campanha
- [ ] "Comprar créditos" → mover para dentro do drawer de criação de campanha ou como banner

---

### 9. Propostas — Já Parcialmente OK

**Arquivo:** `src/components/solarzap/ProposalsView.tsx`  
**Prioridade:** 🟢 P2

**Já implementado:** Card layout alternativo no mobile (linha 807 `{isMobileViewport ? (`)

**Faltando:**
- [ ] **PageHeader**: Compactar
- [ ] Filtros da sidebar: mover para drawer no mobile

---

## Mudanças Transversais (Afetam todo o app)

### T1. PageHeader Responsivo (Componente compartilhado)

```
Prop nova: `compactOnMobile?: boolean` (default true)

Mobile render:
- Sem ícone
- Sem subtítulo  
- Título text-lg  
- px-4 py-2.5
- actionContent escondido (usa `mobileToolbar` prop ou nada)
```

### T2. Padrão de Drawer para Filtros

Criar componente `MobileFilterDrawer` reutilizável:
```
<MobileFilterDrawer trigger={<Button size="icon"><Filter /></Button>}>
  <div className="space-y-4 p-4">
    {children} {/* filtros */}
  </div>
</MobileFilterDrawer>
```

Usar `Drawer` do Vaul (já existe em `src/components/ui/drawer.tsx`).

### T3. Padrão de Chat Header Actions

Criar `ChatHeaderActionsDrawer`:
```
Trigger: botão "⋮" (vertical dots)
Conteúdo: Lista de ações com ícone + label + switch (para toggle IA)
```

### T4. Formato de Áudio Compatível

```ts
// Detectar melhor formato suportado
const mimeType = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')
  ? 'audio/ogg; codecs=opus'
  : MediaRecorder.isTypeSupported('audio/webm; codecs=opus')  
    ? 'audio/webm; codecs=opus'
    : 'audio/webm';

const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';

// Usar no MediaRecorder
new MediaRecorder(stream, { mimeType });

// Usar no upload
.upload(fileName, audioBlob, { contentType: mimeType });

// Filename com extensão correta
const fileName = `${orgId}/chat/${leadId}/${Date.now()}_audio.${extension}`;
```

### T5. PointerEvents para Mic Button

```tsx
// Substituir mouse/touch events por PointerEvents
onPointerDown={handleMicrophoneClick}
onPointerUp={stopRecording}
onPointerLeave={isRecording ? stopRecording : undefined}
onContextMenu={(e) => e.preventDefault()}

// Remover onMouseDown, onMouseUp, onMouseLeave, onTouchStart, onTouchEnd
```

---

## Ordem de Execução

### Sprint 1 — P0 Críticos (Desbloqueadores)

| # | Arquivo | Tarefa | Estimativa de Linhas |
|---|---------|--------|---------------------|
| 1 | `PageHeader.tsx` | Header compacto mobile | ~25 linhas |
| 2 | `ChatArea.tsx` | Limpar header mobile (esconder ações, add drawer) | ~80 linhas |
| 3 | `ChatArea.tsx` | Fix formato áudio (webm → ogg) | ~20 linhas |
| 4 | `ChatArea.tsx` | Fix mic PointerEvents | ~10 linhas |
| 5 | `ChatArea.tsx` | Emoji picker height + attachment drawer | ~30 linhas |
| 6 | `PipelineView.tsx` | Toolbar compacta mobile | ~40 linhas |
| 7 | `useChat.ts` | Fix contentType/extensão áudio | ~10 linhas |

### Sprint 2 — P1 Importante

| # | Arquivo | Tarefa | Estimativa de Linhas |
|---|---------|--------|---------------------|
| 8 | `ContactsView.tsx` | Compactar header + esconder ações nos cards | ~30 linhas |
| 9 | `CalendarView.tsx` | Remover min-w, compactar header, filtro drawer | ~40 linhas |
| 10 | `DashboardView.tsx` | Compactar header, hero card menor, filtro drawer | ~50 linhas |
| 11 | `TrackingView.tsx` | Add useMobileViewport, scroll indicator tabs | ~20 linhas |

### Sprint 3 — P2 Polish

| # | Arquivo | Tarefa | Estimativa de Linhas |
|---|---------|--------|---------------------|
| 12 | `BroadcastView.tsx` | Compactar header | ~15 linhas |
| 13 | `ProposalsView.tsx` | Compactar header | ~15 linhas |
| 14 | QA geral | Build + typecheck + visual mobile | — |

---

## Critérios de Aceitação

### Por tela

- [ ] **Header** ocupa no máximo 48px de altura no mobile
- [ ] **Conteúdo principal** começa no primeiro 25% da tela
- [ ] **Filtros** escondidos por padrão, acessíveis com 1 tap
- [ ] **Touch targets** mínimo 44x44px
- [ ] **Nenhum scroll horizontal** forçado (exceto Pipeline kanban que é intencional)
- [ ] **Nenhum texto truncado** em elementos primários (nome do contato, título)

### Chat específico

- [ ] Header com máximo 4 elementos visíveis (voltar, avatar+nome, busca, menu)
- [ ] Áudio gravado reproduzível no WhatsApp e iOS
- [ ] Mic button funciona corretamente com touch (sem double-fire)
- [ ] Emoji picker não cobre mais de 50% da tela

### Global

- [ ] `npm run build` sem erros
- [ ] `npm run typecheck` sem erros
- [ ] Zero regressões no desktop (layout, funcionalidade, visual)
- [ ] Testado em viewport 375x812 (iPhone 13) e 390x844 (iPhone 14)

---

## Arquivos a Modificar (Lista Completa)

| Arquivo | Tipo de Mudança |
|---------|----------------|
| `src/components/solarzap/PageHeader.tsx` | Variante mobile compacta |
| `src/components/solarzap/ChatArea.tsx` | Header cleanup, áudio fix, mic fix, emoji/attachment |
| `src/hooks/domain/useChat.ts` | Fix contentType e extensão de áudio |
| `src/components/solarzap/PipelineView.tsx` | Toolbar compacta + filtro drawer |
| `src/components/solarzap/ContactsView.tsx` | Header compacto + cards limpos |
| `src/components/solarzap/CalendarView.tsx` | Grid responsive + filtro drawer |
| `src/components/solarzap/DashboardView.tsx` | Header compacto + hero menor + filtro drawer |
| `src/components/solarzap/TrackingView.tsx` | Mobile viewport + tabs scroll |
| `src/components/solarzap/BroadcastView.tsx` | Header compacto |
| `src/components/solarzap/ProposalsView.tsx` | Header compacto |
| `src/components/solarzap/MessageContent.tsx` | (Nenhuma mudança — player está OK) |

**Componentes novos a criar:**
| Arquivo | Propósito |
|---------|-----------|
| `src/components/solarzap/ChatHeaderActionsDrawer.tsx` | Bottom sheet com ações do chat header |
| `src/components/solarzap/MobileFilterDrawer.tsx` | Drawer reutilizável para filtros mobile |

---

## O Que NÃO Mudar

- Desktop layout e visual — ZERO alterações
- Funcionalidade existente — apenas reorganizar onde os controles aparecem
- Backend/Supabase — nenhuma mudança
- Rotas/navegação — manter idênticas
- MobileBottomNav — já está bom
- MobileMoreModal — já está adequado
- Pipeline kanban horizontal — já funciona bem no mobile (scroll horizontal é intencional)
- ProposalsView card layout — já implementado

---

## Referências de Design

- **Apple HIG (iOS):** "Limitar controles na tela; ações secundárias descobríveis com mínima interação"
- **Material Design 3:** Touch targets 48dp, bottom sheets para ações, compact headers
- **WhatsApp Mobile:** Header com voltar + avatar + nome + 3 ícones (vídeo, telefone, menu)
- **HubSpot CRM Mobile:** Cards compactos, filtros em drawer, KPIs em grid 2-col
- **Pipedrive Mobile:** Pipeline como lista no mobile, ações em swipe
