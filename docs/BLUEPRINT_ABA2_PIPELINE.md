# BLUEPRINT — Aba 2: Pipeline (Kanban CRM Interno)

> **Status**: Planejado — NÃO EXECUTAR sem aprovação  
> **Última revisão**: 2026-03-31  
> **Impacto no SolarZap público**: ZERO — tudo isolado em `src/modules/internal-crm/` e schema `internal_crm`

---

## 1. Diagnóstico Completo do Estado Atual

### 1.1 Problemas Identificados pelo Usuário

| # | Problema | Arquivo(s) |
|---|---------|-----------|
| P1 | Visual muito branco e pouco funcional | `InternalCrmPipelineView.tsx` — colunas `Card` sem cor de header, layout `space-y-6` com scroll da página inteira |
| P2 | Modal de editar deal é confuso, lotado de campos técnicos (ARKAN, mentoria, software_status, trial, etc.) | `modals/EditDealModal.tsx` — 500+ linhas, 3 seções técnicas |
| P3 | Botões "Fechou" e "Não Fechou" no card não servem pra nada visualmente | `DealCard.tsx` — buttons inline que abrem modals separados sem contexto |
| P4 | Botão "Notas" abre painel lateral onde não dá pra adicionar nada (read-only) | `modals/DealCommentsSheet.tsx` — só renderiza `props.notes`, sem input |
| P5 | Drag & drop não funciona entre etapas | `InternalCrmPipelineView.tsx` — usa `onDragStart`/`onDrop` nativos mas sem `e.preventDefault()` correto e sem visual de drop target |
| P6 | Não tem como arrastar pipeline pro lado (só scrollbar inferior) | Container usa `overflow-x-auto` mas sem drag-to-scroll como SolarZap |
| P7 | Scroll arrasta a tela toda ao invés de ficar contido nas colunas | Layout é `space-y-6` (page scroll), não `h-full overflow-hidden` + colunas com `overflow-y-auto` |
| P8 | Linguagem técnica (SLA, MRR, One-time, ARKAN) dificulta tudo | `DealCard.tsx` exibe SLA status, MRR, One-time; `EditDealModal.tsx` tem "esteira ARKAN", etc. |
| P9 | Botão "Novo Deal" abre tela confusa com campos irrelevantes | `EditDealModal.tsx` reutilizado para criar e editar — `max-w-5xl` com 20+ campos |
| P10 | Botão "Editar" no card deveria ser removido; clicar no card deveria abrir painel de funcionalidades | `DealCard.tsx` — botão `Editar` abre `EditDealModal`; não existe painel de detalhes |

### 1.2 Arquivos Existentes (escopo de impacto)

```
src/modules/internal-crm/components/pipeline/
├── InternalCrmPipelineView.tsx   ← REESCREVER (layout kanban completo)
├── DealCard.tsx                   ← REESCREVER (card simplificado + click handler)
├── PipelineFilters.tsx            ← AJUSTAR TEXTOS (remover jargão)
├── AssignOwnerSelect.tsx          ← MANTER sem mudanças
├── types.ts                       ← SIMPLIFICAR (DealDraft simplificado)
└── modals/
    ├── EditDealModal.tsx          ← REESCREVER → "NewDealSimpleModal" + "DealDetailPanel" novo
    ├── DealCommentsSheet.tsx      ← REESCREVER (adicionar input de notas)
    ├── MarkAsWonModal.tsx         ← SIMPLIFICAR textos
    ├── MarkAsLostModal.tsx        ← SIMPLIFICAR textos
    └── DealCheckoutModal.tsx      ← MANTER (usado internamente, sem mudança visual)
```

### 1.3 Etapas da Pipeline (banco de dados atual)

Após todas as migrations aplicadas:

| sort_order | stage_code | name (DB) | is_terminal |
|-----------|-----------|----------|------------|
| 10 | `novo_lead` | Novo Lead | ❌ |
| 20 | `respondeu` | Respondeu | ❌ |
| 25 | `agendou_reuniao` | Agendou Reunião | ❌ |
| 30 | `chamada_agendada` | Reunião Agendada | ❌ |
| 40 | `chamada_realizada` | Reunião Realizada | ❌ |
| 50 | `nao_compareceu` | Não Compareceu | ❌ |
| 60 | `negociacao` | Negociação | ❌ |
| 70 | `fechou` | Fechou Contrato | ✅ |
| 80 | `nao_fechou` | Não Fechou | ✅ |

### 1.4 Produtos Cadastrados (usados para precificação no painel)

| product_code | name | billing_type | price_cents |
|-------------|------|-------------|------------|
| `mentoria_aceleracao_1` | Mentoria Aceleração SolarZap 1 | one_time | R$ 1.997 |
| `mentoria_aceleracao_2` | Mentoria Aceleração SolarZap 2 | one_time | R$ 1.497 |
| `mentoria_aceleracao_3` | Mentoria Aceleração SolarZap 3 | one_time | R$ 997 |
| `solarzap_scale` | SolarZap Scale | recurring | R$ 369/mês |
| `solarzap_pro` | SolarZap Pro | recurring | R$ 299/mês |
| `solarzap_start` | SolarZap Start | recurring | R$ 199/mês |
| `landing_page_premium` | Landing Page Premium | one_time | R$ 997 |
| `landing_page_start` | Landing Page Start | one_time | R$ 497 |

---

## 2. Design de Referência — Como o SolarZap Público Faz

O **PipelineView do SolarZap** (`src/components/solarzap/PipelineView.tsx`) é a referência visual:

### 2.1 Layout
- **Container**: `flex-1 flex flex-col h-full w-full overflow-hidden bg-muted/30` — tela inteira, sem page scroll
- **Kanban container**: `flex-1` com `overflowX: scroll`, `overflowY: hidden` — scroll horizontal do board
- **Cada coluna**: `flex-shrink-0 flex flex-col bg-card rounded-lg shadow-md w-[280px]` — coluna fixa
- **Cards container dentro da coluna**: `flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar` — scroll vertical só nos cards
- **Drag-to-scroll**: mouse drag no container para arrastar horizontalmente (não precisa da scrollbar)

### 2.2 Header das colunas
- Cada etapa tem **cor de fundo sólida** (ex: `#2196F3`, `#FF9800`) no header
- Badge branco com contagem de leads
- Valor total da etapa

### 2.3 Cards dos leads
- `rounded-lg border border-border/80 bg-card/96 p-3` — compacto
- Hover: `-translate-y-0.5 shadow-md` — feedback visual
- Drag: `opacity-50 scale-95` — visual de arraste
- **Ações no card**: Dropdown menu com "⋮" (MoreVertical) ao invés de botões inline
- **Click no card**: abre modal de edição do lead
- **Grip handle**: `GripVertical` icon para indicar draggable

### 2.4 Drag & Drop
- `handleDragStart`: `e.dataTransfer.setData` com `text/plain` e `application/json`
- `handleDragOver`: `e.preventDefault()` + `e.stopPropagation()` + `dropEffect = 'move'`
- Drop target: `ring-2 ring-primary ring-offset-2` quando arrastando sobre
- Mobile: desabilitado, usa setas `<` `>` para mover

### 2.5 Ações rápidas (dropdown menu no card)
- Ver Conversa
- Ligar Agora
- Agendar Reunião
- Gerar Proposta
- Agendar Visita
- Ver Comentários
- Marcar como Perdido
- Excluir Lead

---

## 3. Plano de Ação Detalhado

### Etapa 1 — Simplificar `types.ts` (DealDraft)

**Arquivo**: `src/modules/internal-crm/components/pipeline/types.ts`

**O que muda**: O `DealDraft` atual tem 20+ campos técnicos (mentorship_variant, software_status, landing_page_status, traffic_status, trial_status, etc.). Simplificar para o que o usuário realmente precisa no formulário de criar/editar deal.

**Novo DealDraft**:
```ts
export type DealItemDraft = {
  product_code: string;
  billing_type: 'one_time' | 'recurring';
  payment_method: 'stripe' | 'manual' | 'hybrid';
  unit_price_cents: number;
  quantity: number;
};

export type DealDraft = {
  id?: string;
  client_id: string;
  title: string;
  stage_code: string;
  probability: number;
  notes: string;
  items: DealItemDraft[];
};

export const EMPTY_DEAL_ITEM: DealItemDraft = {
  product_code: '',
  billing_type: 'one_time',
  payment_method: 'manual',
  unit_price_cents: 0,
  quantity: 1,
};

export const EMPTY_DEAL_DRAFT: DealDraft = {
  id: undefined,
  client_id: '',
  title: '',
  stage_code: 'novo_lead',
  probability: 5,
  notes: '',
  items: [EMPTY_DEAL_ITEM],
};
```

> **NOTA**: Os campos técnicos (`primary_offer_code`, `closed_product_code`, `mentorship_variant`, `software_status`, `landing_page_status`, `traffic_status`, `trial_status`, `next_offer_code`, `next_offer_at`, `mentorship_sessions_completed`, `last_declined_offer_code`, `trial_ends_at`, `scheduling_link`, `meeting_link`) continuam existindo no tipo `InternalCrmDealSummary` e no banco de dados. Apenas **não são mais expostos no formulário do usuário**. Se houver necessidade de automação, eles continuam sendo acessíveis pela API.

---

### Etapa 2 — Cores e Labels das Etapas (constante local)

**Arquivo**: `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx`

Adicionar mapa de cores para os headers das colunas, igual ao SolarZap:

```ts
const STAGE_COLORS: Record<string, string> = {
  novo_lead: '#2196F3',       // Azul
  respondeu: '#FF9800',       // Laranja
  agendou_reuniao: '#9C27B0', // Roxo
  chamada_agendada: '#3F51B5',// Índigo
  chamada_realizada: '#4CAF50',// Verde
  nao_compareceu: '#F44336',  // Vermelho
  negociacao: '#FFC107',      // Amarelo
  fechou: '#8BC34A',          // Verde claro
  nao_fechou: '#607D8B',      // Cinza
};

const STAGE_LABELS: Record<string, string> = {
  novo_lead: 'Novo Lead',
  respondeu: 'Respondeu',
  agendou_reuniao: 'Agendou Reunião',
  chamada_agendada: 'Reunião Agendada',
  chamada_realizada: 'Reunião Realizada',
  nao_compareceu: 'Não Compareceu',
  negociacao: 'Negociação',
  fechou: 'Fechou Contrato',
  nao_fechou: 'Não Fechou',
};
```

---

### Etapa 3 — Reescrever `InternalCrmPipelineView.tsx` (layout kanban)

**O que muda radicalmente**:

1. **Layout fullscreen**: troca `space-y-6` por `flex flex-col h-full overflow-hidden`
2. **Drag-to-scroll**: implementar handlers `mouseDown/mouseMove/mouseUp/mouseLeave` igual SolarZap
3. **Kanban container**: `flex-1 overflow-x-scroll overflow-y-hidden` com `cursor: grab/grabbing`
4. **Colunas com header colorido**: cada coluna recebe cor de fundo no header via `STAGE_COLORS`
5. **Cards com scroll vertical**: `flex-1 overflow-y-auto space-y-3 custom-scrollbar` dentro de cada coluna
6. **Drag & drop correto**: `dataTransfer.setData` no `dragStart`, `preventDefault` + `stopPropagation` no `dragOver`, visual `ring-2 ring-primary ring-offset-2` no drop target
7. **Click no card**: abre `DealDetailPanel` (novo) ao invés de `EditDealModal`
8. **Botão "Novo Lead"**: abre `NewDealSimpleModal` (simplificado) ao invés de `EditDealModal`
9. **Remover**: referências a `EditDealModal` para edição (mantém apenas o `NewDealSimpleModal` para criação)

**Layout JSX principal (pseudocódigo)**:
```tsx
<div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-muted/30">
  <PageHeader
    title="Pipeline"
    subtitle="Arraste os leads entre as etapas para acompanhar"
    icon={KanbanSquare}
    actionContent={
      <div className="flex items-center gap-2">
        <PipelineFilters ... />
        <Button onClick={openNewDealDialog}>
          <Plus className="mr-2 h-4 w-4" /> Novo Lead
        </Button>
      </div>
    }
  />

  {/* Kanban container com drag-to-scroll */}
  <div
    ref={scrollContainerRef}
    className="flex-1 p-5 select-none"
    style={{ overflowX: 'scroll', overflowY: 'hidden', cursor: isDraggingScroll ? 'grabbing' : 'grab' }}
    onMouseDown={handleMouseDown}
    onMouseMove={handleMouseMove}
    onMouseUp={handleMouseUp}
    onMouseLeave={handleMouseLeave}
  >
    <div className="flex gap-4 pb-4" style={{ width: 'max-content', height: 'calc(100% - 16px)' }}>
      {pipeline.columns.map((column) => {
        const color = STAGE_COLORS[column.stage_code] || '#9E9E9E';
        const isDropTarget = dragOverStage === column.stage_code;

        return (
          <div
            key={column.stage_code}
            className={cn(
              'w-[300px] flex-shrink-0 flex flex-col bg-card rounded-lg shadow-md transition-all duration-200',
              isDropTarget && 'ring-2 ring-primary ring-offset-2'
            )}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDragOverStage(column.stage_code); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStage(null); }}
            onDrop={() => handleDrop(column.stage_code)}
          >
            {/* Header colorido */}
            <div className="p-4 rounded-t-lg" style={{ backgroundColor: color }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-white text-sm">
                  {STAGE_LABELS[column.stage_code] || column.name}
                </span>
                <Badge className="bg-white/20 text-white hover:bg-white/30 border-0">
                  {column.deals.length}
                </Badge>
              </div>
              <div className="text-white/90 text-sm font-medium">
                {formatCurrencyBr(column.totals.one_time_cents + column.totals.mrr_cents)}
              </div>
            </div>

            {/* Cards com scroll vertical */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar min-h-[400px]">
              {column.deals.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm border-2 border-dashed border-muted rounded-lg">
                  Nenhum lead
                </div>
              ) : (
                column.deals.map((deal) => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, deal)}
                    onDragEnd={handleDragEnd}
                  >
                    <DealCard
                      deal={deal}
                      onCardClick={() => openDetailPanel(deal)}
                      onScheduleMeeting={() => { /* abrir modal agendamento */ }}
                      onOpenComments={() => { setSelectedDeal(deal); setCommentsOpen(true); }}
                      onMarkLost={() => { setSelectedDeal(deal); setLostModalOpen(true); }}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>

  {/* Painéis e modals */}
  <DealDetailPanel ... />
  <NewDealSimpleModal ... />
  <DealCommentsSheet ... />
  <MarkAsWonModal ... />
  <MarkAsLostModal ... />
  <DealCheckoutModal ... />
</div>
```

**Drag-to-scroll handlers**:
```ts
const scrollContainerRef = useRef<HTMLDivElement>(null);
const [isDraggingScroll, setIsDraggingScroll] = useState(false);
const [startX, setStartX] = useState(0);
const [scrollLeftVal, setScrollLeftVal] = useState(0);

const handleMouseDown = useCallback((e: React.MouseEvent) => {
  const target = e.target as HTMLElement;
  if (target.closest('[draggable="true"]') || target.closest('button') || target.closest('input')) return;
  if (!scrollContainerRef.current) return;
  setIsDraggingScroll(true);
  setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
  setScrollLeftVal(scrollContainerRef.current.scrollLeft);
  scrollContainerRef.current.style.cursor = 'grabbing';
}, []);

const handleMouseMove = useCallback((e: React.MouseEvent) => {
  if (!isDraggingScroll || !scrollContainerRef.current) return;
  e.preventDefault();
  const x = e.pageX - scrollContainerRef.current.offsetLeft;
  const walk = (x - startX) * 1.5;
  scrollContainerRef.current.scrollLeft = scrollLeftVal - walk;
}, [isDraggingScroll, startX, scrollLeftVal]);

const handleMouseUp = useCallback(() => {
  setIsDraggingScroll(false);
  if (scrollContainerRef.current) scrollContainerRef.current.style.cursor = 'grab';
}, []);

const handleMouseLeave = useCallback(() => {
  if (isDraggingScroll) {
    setIsDraggingScroll(false);
    if (scrollContainerRef.current) scrollContainerRef.current.style.cursor = 'grab';
  }
}, [isDraggingScroll]);
```

**Drag & drop entre colunas**:
```ts
const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
const [dragOverStage, setDragOverStage] = useState<string | null>(null);

const handleDragStart = (e: React.DragEvent, deal: InternalCrmDealSummary) => {
  e.dataTransfer.setData('text/plain', deal.id);
  e.dataTransfer.effectAllowed = 'move';
  setDraggingDealId(deal.id);
  setTimeout(() => { (e.currentTarget as HTMLElement).style.opacity = '0.5'; }, 0);
};

const handleDragEnd = (e: React.DragEvent) => {
  (e.currentTarget as HTMLElement).style.opacity = '1';
  setDraggingDealId(null);
  setDragOverStage(null);
};

const handleDrop = async (targetStageCode: string) => {
  setDragOverStage(null);
  if (!draggingDealId) return;

  const deal = dealsById.get(draggingDealId);
  if (!deal || deal.stage_code === targetStageCode) { setDraggingDealId(null); return; }

  if (targetStageCode === 'fechou') {
    openMarkWonModal(deal);
    setDraggingDealId(null);
    return;
  }

  if (targetStageCode === 'nao_fechou') {
    setSelectedDeal(deal);
    setLostModalOpen(true);
    setDraggingDealId(null);
    return;
  }

  await moveDealMutation.mutateAsync({
    action: 'move_deal_stage',
    deal_id: draggingDealId,
    stage_code: targetStageCode,
  });
  setDraggingDealId(null);
  toast({ title: 'Lead movido!', description: `Movido para ${STAGE_LABELS[targetStageCode] || targetStageCode}` });
};
```

---

### Etapa 4 — Reescrever `DealCard.tsx` (card simplificado)

**Remover do card**:
- Botão "Editar"
- Botão "Fechou Contrato" 
- Botão "Não fechou"
- Botão "Checkout"
- Valores "One-time" e "MRR" (jargão técnico)
- Status SLA (jargão)
- Badges de `commercial_context` (software_status, landing_page_status, etc.)
- Seção "Próxima oferta"
- `TokenBadge` com tokens técnicos dos items

**Adicionar ao card**:
- **Click handler** no card inteiro → abre painel de detalhes
- **Dropdown menu "⋮"** (MoreVertical) no canto com ações rápidas
- **Valor total** do deal formatado em R$ (soma de items)
- **Nome do lead/empresa** em destaque
- **Dias na etapa** (calculado a partir de `updated_at`)
- **GripVertical** icon para indicar draggable
- Hover: `-translate-y-0.5 shadow-md`
- Drag: `opacity-50 scale-95`

**Ações no dropdown do card**:
- Agendar Reunião
- Adicionar Nota
- Mover para Etapa → sub-menu com todas as etapas
- Marcar como Fechou Contrato
- Marcar como Não Fechou
- Excluir

**Pseudocódigo do novo DealCard**:
```tsx
export function DealCard(props: {
  deal: InternalCrmDealSummary;
  isDragging?: boolean;
  onCardClick: () => void;
  onScheduleMeeting: () => void;
  onOpenComments: () => void;
  onMarkWon: () => void;
  onMarkLost: () => void;
  onMoveToStage: (stageCode: string) => void;
  stages: InternalCrmStage[];
}) {
  const { deal } = props;
  const totalCents = deal.one_time_total_cents + deal.mrr_cents;
  const daysInStage = Math.max(1, Math.ceil((Date.now() - new Date(deal.updated_at).getTime()) / 86400000));

  return (
    <div
      onClick={props.onCardClick}
      className={cn(
        'rounded-lg border border-border/80 bg-card/96 p-3 text-foreground shadow-sm cursor-pointer',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing',
        props.isDragging && 'opacity-50 scale-95'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{deal.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {deal.client_company_name || 'Sem empresa'}
          </p>
        </div>
        <div className="flex items-center gap-0 flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); props.onScheduleMeeting(); }} className="gap-2">
                <Calendar className="w-4 h-4 text-purple-500" /> Agendar Reunião
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); props.onOpenComments(); }} className="gap-2">
                <MessageSquareText className="w-4 h-4 text-amber-500" /> Notas
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <ArrowRightLeft className="w-4 h-4" /> Mover para
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {props.stages.map((stage) => (
                    <DropdownMenuItem
                      key={stage.stage_code}
                      disabled={stage.stage_code === deal.stage_code}
                      onClick={(e) => { e.stopPropagation(); props.onMoveToStage(stage.stage_code); }}
                    >
                      {STAGE_LABELS[stage.stage_code] || stage.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <div className="h-px bg-muted my-1" />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); props.onMarkWon(); }} className="gap-2 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" /> Fechou Contrato
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); props.onMarkLost(); }} className="gap-2 text-rose-600">
                <CircleX className="w-4 h-4" /> Não Fechou
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <GripVertical className="w-4 h-4 text-muted-foreground/30 cursor-grab active:cursor-grabbing" />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {formatCurrencyBr(totalCents)}
        </span>
        <span>
          {daysInStage === 1 ? '1 dia' : `${daysInStage} dias`} nesta etapa
        </span>
      </div>

      {deal.notes && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2 italic">
          {deal.notes}
        </p>
      )}
    </div>
  );
}
```

---

### Etapa 5 — Criar `DealDetailPanel.tsx` (painel lateral de detalhes)

**Novo arquivo**: `src/modules/internal-crm/components/pipeline/DealDetailPanel.tsx`

Ao clicar no card (fora dos botões), abre um **Sheet lateral** (como o sidebar do SolarZap) com funcionalidades de maneira SIMPLIFICADA:

**Seções do painel**:

1. **Cabeçalho**: Nome do lead, empresa, etapa atual (com badge colorido)
2. **Dados do Lead** (editáveis inline):
   - Nome / Empresa
   - Telefone / Email (vêm de `client_contacts`)
   - Notas (textarea editável)
3. **Plano / Produto** (simplificado):
   - Produto selecionado (Select com os 8 produtos cadastrados, labels amigáveis)
   - Valor (input R$, pré-preenchido com preço do produto)
4. **Agendar Reunião** (botão que abre modal de AppointmentModal adaptado)
5. **Histórico de Etapas** (timeline simples com `stage_history`)
6. **Ações Rápidas**:
   - Botão "Fechou Contrato" → abre MarkAsWonModal
   - Botão "Não Fechou" → abre MarkAsLostModal
   - Botão "Gerar Checkout" (se payment_method = stripe)

**Pseudocódigo**:
```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type DealDetailPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: InternalCrmDealSummary | null;
  products: InternalCrmProduct[];
  stages: InternalCrmStage[];
  onSaveDeal: (updates: Partial<DealDraft>) => Promise<void>;
  onScheduleMeeting: () => void;
  onMarkWon: () => void;
  onMarkLost: () => void;
  onMoveToStage: (stageCode: string) => void;
  isSaving: boolean;
};

export function DealDetailPanel(props: DealDetailPanelProps) {
  if (!props.deal) return null;

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{props.deal.title}</SheetTitle>
          <p className="text-sm text-muted-foreground">{props.deal.client_company_name}</p>
        </SheetHeader>

        {/* Seção: Etapa atual */}
        <div className="mt-6 space-y-4">
          <div>
            <Label>Etapa</Label>
            <Select value={props.deal.stage_code || ''} onValueChange={(v) => props.onMoveToStage(v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar etapa" /></SelectTrigger>
              <SelectContent>
                {props.stages.map((s) => (
                  <SelectItem key={s.stage_code} value={s.stage_code}>
                    {STAGE_LABELS[s.stage_code] || s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Seção: Produto e Valor */}
          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
            <p className="text-sm font-medium">Produto / Plano</p>
            {/* Select de produtos com labels amigáveis */}
            {/* Input de valor R$ */}
          </div>

          {/* Seção: Notas */}
          <div>
            <Label>Notas</Label>
            <Textarea ... />
          </div>

          {/* Seção: Agendar Reunião */}
          <Button variant="outline" className="w-full gap-2" onClick={props.onScheduleMeeting}>
            <Calendar className="w-4 h-4" /> Agendar Reunião
          </Button>

          {/* Seção: Ações */}
          <div className="flex gap-2">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={props.onMarkWon}>
              Fechou Contrato
            </Button>
            <Button variant="outline" className="flex-1 text-rose-600" onClick={props.onMarkLost}>
              Não Fechou
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

---

### Etapa 6 — Reescrever `DealCommentsSheet.tsx` (adicionar input de notas)

**Problema atual**: O sheet é **read-only** — exibe `props.notes` como texto estático. Não tem como adicionar notas.

**Solução**: Adicionar `Textarea` com botão "Salvar Nota", chamando `upsert_deal` com as notas atualizadas.

**Pseudocódigo**:
```tsx
export function DealCommentsSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  dealTitle: string;
  notes: string;
  onSaveNotes: (notes: string) => Promise<void>;
  isSaving: boolean;
}) {
  const [localNotes, setLocalNotes] = useState(props.notes || '');

  useEffect(() => { setLocalNotes(props.notes || ''); }, [props.notes]);

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Notas — {props.dealTitle}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <Textarea
            rows={8}
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            placeholder="Adicione notas sobre a negociação..."
          />
          <Button
            onClick={() => props.onSaveNotes(localNotes)}
            disabled={props.isSaving || localNotes === props.notes}
          >
            Salvar Nota
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

---

### Etapa 7 — Simplificar `NewDealSimpleModal.tsx` (substituir EditDealModal para criação)

**Renomear** `EditDealModal.tsx` → manter como backup, criar novo `NewDealSimpleModal.tsx`.

O modal de "Novo Lead" fica **extremamente simples**:

**Campos**:
1. **Cliente** (Select com lista de clientes existentes)
2. **Título** (input texto — ex: "João — SolarZap Pro")
3. **Produto** (Select com os 8 produtos, labels amigáveis como "SolarZap Start (R$ 199/mês)")
4. **Etapa inicial** (Select — padrão "Novo Lead")
5. **Notas** (Textarea opcional)

**Removido completamente**:
- Probabilidade (preenchida automaticamente pela etapa)
- "Estado comercial ARKAN" inteiro
- "Contexto de automação" inteiro
- Items do deal (adicionado automaticamente pelo produto selecionado)
- Owner user_id (preenchido automaticamente)

**Ao salvar**: chama `upsert_deal` como hoje, mas monta os items automaticamente a partir do produto selecionado.

---

### Etapa 8 — Ajustar textos em `PipelineFilters.tsx`

**Mudanças de texto**:
- Placeholder "Buscar por deal ou empresa..." → **"Buscar lead ou empresa..."**
- "Todas as etapas" → manter
- "Todos os status" → manter
- "Abertos" → manter
- "Fechou Contrato" → manter
- "Nao fechou" → **"Não Fechou"** (acento)

---

### Etapa 9 — Simplificar textos em `MarkAsWonModal.tsx`

**Mudanças de texto**:
- Descrição: "Defina o produto/servico ARKAN..." → **"Selecione o produto/plano e o valor do contrato."**
- Label "Produto ou servico ARKAN" → **"Produto / Plano"**
- Label "Valor do projeto (R$)" → **"Valor (R$)"**

---

### Etapa 10 — Simplificar textos em `MarkAsLostModal.tsx`

**Mudanças de texto**:
- Placeholder: "Ex: orcamento fora da faixa, concorrente mais barato, timing inadequado" → **"Ex: orçamento alto, concorrente, sem interesse no momento"**

---

### Etapa 11 — Remover textos técnicos do PageHeader

No `InternalCrmPipelineView.tsx`:
- Subtitle: "Kanban comercial interno para velocidade de fechamento e provisionamento." → **"Arraste os leads entre as etapas para acompanhar o progresso"**
- Botão: "Novo deal" → **"Novo Lead"**

---

### Etapa 12 — Backend: Adicionar rota `save_deal_notes`

**Arquivo**: `supabase/functions/internal-crm-api/index.ts`

Adicionar uma rota simplificada para salvar apenas as notas de um deal, sem precisar passar toda a payload de `upsert_deal`:

```ts
// Na seção de ACL:
save_deal_notes: { minCrmRole: 'sales', requireMfa: true },

// Nova função:
async function saveDealNotes(serviceClient, identity, payload, req) {
  const dealId = asString(payload.deal_id);
  const notes = asString(payload.notes);
  if (!dealId) throw { status: 400, code: 'invalid_payload' };

  const { error } = await crmSchema(serviceClient)
    .from('deals')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', dealId);
  if (error) throw { status: 500, code: 'save_notes_failed', error };

  await writeAuditLog(serviceClient, identity, 'save_deal_notes', req, { deal_id: dealId });
  return { ok: true };
}

// No switch do router:
case 'save_deal_notes':
  return saveDealNotes(serviceClient, identity, payload, req);
```

---

## 4. Resumo de Arquivos

| Ação | Arquivo | Motivo |
|------|--------|--------|
| **REESCREVER** | `InternalCrmPipelineView.tsx` | Layout fullscreen, drag-to-scroll, colunas coloridas, scroll vertical por coluna |
| **REESCREVER** | `DealCard.tsx` | Card simplificado, sem botões inline, com dropdown ⋮, click abre painel |
| **REESCREVER** | `types.ts` | DealDraft simplificado (6 campos ao invés de 20+) |
| **REESCREVER** | `modals/DealCommentsSheet.tsx` | Adicionar Textarea + botão salvar (não era read-only) |
| **CRIAR** | `DealDetailPanel.tsx` | Novo painel lateral com funcionalidades simplificadas |
| **CRIAR** | `modals/NewDealSimpleModal.tsx` | Modal simplificado para criar lead (5 campos) |
| **MODIFICAR** | `modals/EditDealModal.tsx` | Mantido para uso avançado interno, mas **não mais referenciado** na view |
| **MODIFICAR** | `PipelineFilters.tsx` | Ajustar textos (remover "deal", acentos) |
| **MODIFICAR** | `modals/MarkAsWonModal.tsx` | Remover "ARKAN" dos textos |
| **MODIFICAR** | `modals/MarkAsLostModal.tsx` | Melhorar placeholder |
| **MODIFICAR** | `supabase/functions/internal-crm-api/index.ts` | Adicionar rota `save_deal_notes` |

---

## 5. Checklist Anti-Regressão

- [ ] **Nenhum arquivo fora de `src/modules/internal-crm/`** é modificado (exceto edge function)
- [ ] **Schema público** (`public.*`) não é tocado — zero impacto no SolarZap
- [ ] **TypeScript**: rodar `npx tsc --noEmit` sem erros após cada etapa
- [ ] **Campos técnicos preservados** no tipo `InternalCrmDealSummary` e no DB — só removidos da UI
- [ ] **upsert_deal** continua funcionando com todos os campos opcionais — a simplificação é apenas no frontend
- [ ] **move_deal_stage** inalterado
- [ ] **Edge function**: apenas adição de nova rota, sem modificar existentes
- [ ] **DealCommentsSheet**: agora persiste notas via API, mas comportamento de leitura preservado
- [ ] **Drag & Drop**: implementação robusta com `dataTransfer`, `preventDefault`, `stopPropagation` — testável visualmente
- [ ] **Responsividade**: colunas `min-w-[300px]` com scroll horizontal funcional

---

## 6. Ordem de Execução Recomendada

1. Etapa 1 — `types.ts` (base para tudo)
2. Etapa 12 — Backend `save_deal_notes` (sem impacto frontend)
3. Etapa 4 — `DealCard.tsx` (card novo)
4. Etapa 5 — `DealDetailPanel.tsx` (painel novo)
5. Etapa 6 — `DealCommentsSheet.tsx` (notas editáveis)
6. Etapa 7 — `NewDealSimpleModal.tsx` (modal simplificado)
7. Etapa 3 — `InternalCrmPipelineView.tsx` (integra tudo)
8. Etapas 8-11 — Ajustes de texto (PipelineFilters, MarkAsWon, MarkAsLost, PageHeader)
9. Build check + validação visual
