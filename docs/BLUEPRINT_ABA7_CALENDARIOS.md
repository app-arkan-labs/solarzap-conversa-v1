# BLUEPRINT — Aba 7: Calendários (CRM Interno)

> **Objetivo**: Replicar a experiência visual e funcional da aba Calendário do SolarZap
> (`src/components/solarzap/CalendarView.tsx`) dentro do CRM interno, usando **apenas**
> o schema `internal_crm` e as APIs do módulo `internal-crm`. Zero impacto no SolarZap público.

---

## 1. Diagnóstico do Estado Atual

### 1.1 Arquivos envolvidos

| Arquivo | Linhas | Papel |
|---------|--------|-------|
| `src/modules/internal-crm/components/calendar/InternalCrmCalendarView.tsx` | ~620 | View principal — grid mensal + sidebar agenda |
| `src/modules/internal-crm/components/calendar/InternalCrmCalendarFilters.tsx` | ~65 | Filtros: status, cliente, botão "Novo agendamento" |
| `src/modules/internal-crm/components/calendar/InternalCrmAppointmentModal.tsx` | ~250 | Modal de criação/edição de compromisso |
| `src/modules/internal-crm/components/calendar/InternalCrmEventFeedbackModal.tsx` | ~100 | Modal de registrar feedback (done/no_show/canceled) |
| `src/modules/internal-crm/hooks/useInternalCrmCalendar.ts` | ~80 | Hook: queries + mutations para appointments |
| `src/modules/internal-crm/pages/InternalCrmCalendarPage.tsx` | ~5 | Wrapper que renderiza InternalCrmCalendarView |

### 1.2 Problemas Identificados (comparação SolarZap ↔ CRM)

| # | Problema | SolarZap | CRM Atual |
|---|----------|----------|-----------|
| P1 | **Layout fullscreen ausente** | Sidebar direita fixa w-96 com Próximos + Passados, grid ocupa resto | `space-y-6` empilhado, Card com grid e Card com agenda, scroll vertical infinito |
| P2 | **Sem sidebar lateral de eventos** | Split: grid esquerda + sidebar (Próximos + Passados + Arquivo) | Lista linear "Agenda e feedback" sem separação upcoming/past |
| P3 | **Navegação ruim** | Month centered, filtros à esquerda, botão à direita, collapse de filtros | Navegação em `div` separado, filtros em outro `div`, layout descosido |
| P4 | **Sem mobile Drawer** | Drawer com tabs Próximos/Passados, toque no dia abre eventos | Zero suporte mobile - mesma view |
| P5 | **Células do grid sem cor por tipo** | Chips coloridos (`bg-blue-500`, `bg-purple-500`, etc.) por tipo | Botões brancos com texto truncado |
| P6 | **Sem partição de eventos no dia** | `partitionDayEvents(events, 4)` — mostra até 4 + "+N mais" | Mostra até 3, sem a utility de partição |
| P7 | **TokenBadge técnico** | Badges humanos: "Agendado", "Confirmado", "Pendente" (amarelo para passado+scheduled) | `TokenBadge` genérico com tokens como `scheduled`, `not_synced` |
| P8 | **AppointmentModal com campos técnicos** | Tipos: Ligação, Visita Técnica, Reunião, Instalação, Outro. Campos: lead, título, responsável, duração, local, notas | Tipos: "Call", "Demo", "Meeting", "Visit", "Other". Campos: client, deal, owner_user_id (UUID raw), datetime-local, status |
| P9 | **Sem ErrorBoundary** | `CalendarAppointmentErrorBoundary` captura crash do modal | Nenhuma proteção — crash do modal mata a página |
| P10 | **Google Calendar desorganizado** | N/A para SolarZap público | Card solto no meio da página, sem integração visual no header |
| P11 | **Sem EventArchiveModal** | Modal dedicado para ver eventos arquivados (completed) com filtros | Não existe — eventos concluídos simplesmente somem |
| P12 | **Sem ExcluirAppointment** | SolarZap tem botão de excluir no AppointmentModal | CRM não tem delete_appointment |

---

## 2. Referência Visual — SolarZap CalendarView

### Layout (Desktop)
```
┌──────────────────────────────────────────────────────────┐
│ PageHeader: "Calendário" "Gestão de Agenda" [LeadScope▼] │ [+ Novo Agendamento]
├──────────────────────────────────────────────────────────┤
│ Filter▼ [Filtros inline CalendarFilters]  ◀ Junho 2026 ▶ │
├─────────────────────────────────┬────────────────────────┤
│  Dom  Seg  Ter  Qua  Qui  Sex  │  🟢 Próximos Eventos   │
│ ┌───┬───┬───┬───┬───┬───┬───┐  │  [Filter] ───────────  │
│ │   │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ │  ┌─ Reunião ────────┐  │
│ │   │   │   │🔵 │   │   │   │  │  │ Demo Sr. João    │  │
│ ├───┼───┼───┼───┼───┼───┼───┤  │  │ 🕐 04/06 14:00   │  │
│ │ 7 │ 8 │ 9 │10 │11 │12 │13 │  │  └──────────────────┘  │
│ │   │🟣 │   │   │🟠 │   │   │  │  ...                   │
│ ├───┼───┼───┼───┼───┼───┼───┤  ├────────────────────────┤
│ │14 │15 │16 │17 │18 │19 │20 │  │  🟠 Eventos Passados   │
│ │   │   │🔵 │   │   │   │   │  │  [Filter] [Arquivo]    │
│ ├───┼───┼───┼───┼───┼───┼───┤  │  ┌──────────────────┐  │
│ │21 │22 │23 │24 │25 │26 │27 │  │  │ Call Empresa X   │  │
│ │   │   │   │   │   │   │   │  │  │ 🕐 01/06 09:30   │  │
│ ├───┼───┼───┼───┼───┼───┼───┤  │  │ ⚠️ Pendente       │  │
│ │28 │29 │30 │   │   │   │   │  │  └──────────────────┘  │
│ └───┴───┴───┴───┴───┴───┴───┘  │                        │
└─────────────────────────────────┴────────────────────────┘
```

### Layout (Mobile)
```
┌────────────────────────┐
│ PageHeader compacto    │
│ [+ Novo]               │
├────────────────────────┤
│ [Próximos(3)] [Passados│
│  (2)] [Eventos]        │
├────────────────────────┤
│ ◀ Junho 2026 ▶         │
│ D  S  T  Q  Q  S  S   │
│     1  2  3  4  5  6   │
│        •     •         │
│ 7  8  9 10 11 12 13   │
│    •        •          │
│ ...                    │
│ Tap no dia → Drawer    │
└────────────────────────┘
Drawer: "05 de Junho"
  [+ Novo agendamento]
  <lista de eventos do dia>
```

### Cores e Labels por Tipo
| Tipo | Cor | Label CRM Atual | Label Desejado |
|------|-----|-----------------|----------------|
| `call` | `bg-blue-500` | "Call" | **Ligação** |
| `demo` | `bg-indigo-500` | "Demo" | **Demonstração** |
| `meeting` | `bg-purple-500` | "Meeting"/"Reuniao" | **Reunião** |
| `visit` | `bg-orange-500` | "Visit"/"Visita" | **Visita** |
| `other` | `bg-gray-500` | "Other"/"Outro" | **Outro** |

### Status Labels
| Status | CRM Atual | Desejado | Cor |
|--------|-----------|----------|-----|
| `scheduled` | "Agendado" (via TokenBadge) | **Agendado** | `bg-blue-100 text-blue-700` |
| `confirmed` | "Confirmado" | **Confirmado** | `bg-green-100 text-green-700` |
| `done` | "Realizado" | **Realizado** | `bg-muted text-foreground/80` |
| `canceled` | "Cancelado" | **Cancelado** | `bg-red-100 text-red-700` |
| `no_show` | "No-show" | **Não Compareceu** | `bg-orange-100 text-orange-700` |
| past+scheduled | (não existe) | **Pendente** (amarelo) | `bg-yellow-100 text-yellow-700` |

---

## 3. Plano de Ação — 9 Etapas

### Etapa 1 — Backend: adicionar `delete_appointment`

**Arquivo**: `supabase/functions/internal-crm-api/index.ts`

**1a. ACL** — Adicionar na lista de ações permitidas:
```ts
delete_appointment: { minCrmRole: 'sales', requireMfa: true },
```

**1b. Função** — Adicionar logo após `upsertAppointment()`:
```ts
async function deleteAppointment(
  serviceClient: ReturnType<typeof createClient>,
  identity: CrmIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const appointmentId = asString(payload.appointment_id);
  if (!appointmentId) throw { status: 400, code: 'missing_appointment_id' };

  const schema = crmSchema(serviceClient);
  const { data: existing } = await schema
    .from('appointments')
    .select('id, title, client_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (!existing) throw { status: 404, code: 'appointment_not_found' };

  const { error } = await schema.from('appointments').delete().eq('id', appointmentId);
  if (error) throw { status: 500, code: 'delete_appointment_failed', error };

  await writeAuditLog(serviceClient, identity, 'delete_appointment', req, {
    appointment_id: appointmentId,
    title: existing.title,
  });

  return { ok: true, deleted_appointment_id: appointmentId };
}
```

**1c. Router** — Adicionar case:
```ts
case 'delete_appointment':
  return await deleteAppointment(serviceClient, identity, payload, req);
```

### Etapa 2 — Types: adicionar `delete_appointment` ao union

**Arquivo**: `src/modules/internal-crm/types/index.ts`

Adicionar `'delete_appointment'` ao type union `InternalCrmApiAction`.

### Etapa 3 — Hook: adicionar `deleteAppointmentMutation`

**Arquivo**: `src/modules/internal-crm/hooks/useInternalCrmCalendar.ts`

```ts
const deleteAppointmentMutation = useInternalCrmMutation({
  invalidate: [
    internalCrmQueryKeys.appointments({}),
    internalCrmQueryKeys.dashboard({}),
  ],
});
```

Adicionar ao return do hook.

### Etapa 4 — Reescrever `InternalCrmCalendarFilters.tsx`

**Arquivo**: `src/modules/internal-crm/components/calendar/InternalCrmCalendarFilters.tsx`

Substituir o layout atual (grid básico com Select + botão) por filtros inline colapsáveis
inspirados no `CalendarFilters.tsx` do SolarZap:

- Botão Filter toggle (como no SolarZap)
- Select de Tipo (Ligação, Demonstração, Reunião, Visita, Outro)
- Select de Status (Agendado, Confirmado, Realizado, Cancelado, Não Compareceu)
- Combobox de busca de Cliente (como no SolarZap: Command + CommandInput)
- Date range pickers
- Botão "Limpar filtros"

**Props**: Manter compatibilidade com a CalendarView mas trocar interface para filterState:
```ts
type CrmCalendarFilterState = {
  type?: string;
  status?: string;
  clientId?: string;
  startDate?: Date;
  endDate?: Date;
};
```

### Etapa 5 — Reescrever `InternalCrmAppointmentModal.tsx`

**Arquivo**: `src/modules/internal-crm/components/calendar/InternalCrmAppointmentModal.tsx`

Mudanças:
1. **Tipo labels em português**: "Ligação", "Demonstração", "Reunião", "Visita", "Outro"
2. **Status labels humanizados**: "Agendado", "Confirmado", "Realizado", "Cancelado", "Não Compareceu" (substituir "No-show")
3. **Remover campo `deal_id`** — raramente usado e confuso para o usuário; manter apenas `client_id`
4. **Remover campo `owner_user_id`** raw — simplificar (preencher automaticamente com o user logado)
5. **Duração com presets** em vez de datetime-local para end_at: "30 min", "1h", "1h30", "2h", "Personalizar"
6. **Campos**: Cliente (Select com busca), Título, Tipo, Data (Calendar picker), Horário (Input time), Duração (presets), Local, Observações
7. **Botão de Excluir** (trash icon, vermelho) no modo edição, com AlertDialog de confirmação
8. **Layout visual**: 2 colunas em desktop (info principal | detalhes), 1 coluna em mobile

### Etapa 6 — Reescrever `InternalCrmEventFeedbackModal.tsx`

**Arquivo**: `src/modules/internal-crm/components/calendar/InternalCrmEventFeedbackModal.tsx`

Mudanças:
1. **Layout inspirado no EventFeedbackModal do SolarZap**: card de resumo do evento (título, data, hora, local) + textarea + resultado
2. **Status labels humanizados**: "Realizado" → "Realizado", "No-show" → "Não Compareceu", "Cancelado" → "Cancelado"  
3. **Placeholder útil**: "Descreva o resultado da reunião, pontos importantes ou próximos passos..."
4. **Card de resumo** no topo: fundo `bg-muted/50`, ícones Calendar, Clock, MapPin

### Etapa 7 — Criar `InternalCrmEventArchiveModal.tsx`

**Arquivo**: `src/modules/internal-crm/components/calendar/InternalCrmEventArchiveModal.tsx` (NOVO)

Inspirado em `EventArchiveModal.tsx` do SolarZap:
- Dialog com ScrollArea
- Filtros inline: tipo, status, cliente, date range
- Lista de eventos com status `done`, `canceled`, `no_show`
- Card para cada evento: título, tipo badge, data, feedback registrado
- Título: "Arquivo de Eventos"

### Etapa 8 — Reescrever `InternalCrmCalendarView.tsx` (view principal)

**Arquivo**: `src/modules/internal-crm/components/calendar/InternalCrmCalendarView.tsx`

**Esta é a mudança mais importante.** Replicar o layout completo do SolarZap `CalendarView.tsx`:

#### 8.1 Layout Fullscreen
```tsx
<div className="flex-1 flex flex-col min-h-0 bg-muted/30 h-full overflow-hidden">
```

#### 8.2 PageHeader
```tsx
<PageHeader
  title="Calendário"
  subtitle="Gestão de Agenda"
  icon={CalendarIcon}
  actionContent={
    <div className="flex items-center gap-2">
      {/* Google Calendar status badge */}
      <Button onClick={openCreateAppointment}>
        <Plus className="w-4 h-4" />
        Novo Agendamento
      </Button>
    </div>
  }
  mobileToolbar={
    <Button size="sm" onClick={openCreateAppointment}>
      <Plus className="w-4 h-4" /> Novo
    </Button>
  }
/>
```

#### 8.3 Barra de Navegação + Filtros
```tsx
<div className="relative px-4 py-4 sm:px-6 border-b border-border/50 flex min-h-[72px] flex-wrap items-center gap-3">
  {/* Esquerda: Filter toggle + filtros colapsáveis */}
  <div className="flex items-center gap-3">
    <Button variant="outline" onClick={toggleFilters}>
      <Filter className="w-4 h-4" />
    </Button>
    {showFilters && <InternalCrmCalendarFilters ... />}
  </div>

  {/* Centro/Direita: navegação ◀ Mês ▶ */}
  <div className={cn("flex items-center gap-2", showFilters ? "ml-auto" : "absolute left-1/2 -translate-x-1/2")}>
    <button onClick={prevMonth}><ChevronLeft /></button>
    <span className="font-bold capitalize">Junho 2026</span>
    <button onClick={nextMonth}><ChevronRight /></button>
  </div>

  {/* Google Calendar: badge no canto direito */}
  {isGoogleConnected && <Badge className="ml-auto">Google ✓</Badge>}
</div>
```

#### 8.4 Mobile Quick-Access Buttons
```tsx
{isMobileViewport && (
  <div className="flex items-center gap-2 overflow-x-auto border-b px-4 py-3">
    <Button onClick={() => openDrawer('upcoming')}>Próximos ({upcoming.length})</Button>
    <Button onClick={() => openDrawer('past')}>Passados ({past.length})</Button>
  </div>
)}
```

#### 8.5 Split Layout: Grid + Sidebar
```tsx
<div className="flex-1 flex overflow-hidden">
  {/* Grid Calendar */}
  <div className="flex-1 flex flex-col min-w-0 bg-card/92">
    {/* Dias da semana header */}
    <div className="grid grid-cols-7">
      {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
        <div className="text-center text-xs font-bold uppercase">{d}</div>
      ))}
    </div>

    {/* Grid de semanas */}
    <div className="flex-1 grid grid-rows-6 overflow-hidden rounded-xl border shadow-sm">
      {weeks.map(week => (
        <div className="grid grid-cols-7 border-b last:border-b-0">
          {week.map((day, i) => {
            const events = day ? getEventsForDate(day) : [];
            const partition = partitionDayEvents(events, 4);
            return (
              <div onClick={() => handleDayClick(day)} className="group cursor-pointer min-h-[88px] p-2 border-r last:border-r-0 hover:bg-accent/60">
                {/* Number + event chips coloridos */}
                <span className={cn("w-8 h-8 rounded-full", isToday(day) && "bg-primary text-white")}>
                  {day}
                </span>
                {partition.visible.map(evt => (
                  <div className={cn(EVENT_TYPE_COLORS[evt.appointment_type], "truncate rounded px-2 py-1 text-[10px] text-white")}>
                    {formatHour(evt.start_at)} {evt.client_company_name || evt.title}
                  </div>
                ))}
                {partition.hiddenCount > 0 && <div>+{partition.hiddenCount} mais</div>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  </div>

  {/* Sidebar (desktop only) */}
  {!isMobileViewport && (
    <div className="w-96 border-l bg-card/84 flex flex-col">
      {/* Próximos Eventos */}
      <div className="flex-1 flex flex-col min-h-0 border-b">
        <div className="px-5 py-4 border-b sticky top-0 z-10 flex items-center gap-4">
          <h2 className="text-sm font-bold">🟢 Próximos Eventos</h2>
          <FilterPopover />
        </div>
        <ScrollArea className="flex-1">
          {upcomingEvents.map(evt => <EventCard event={evt} />)}
        </ScrollArea>
      </div>

      {/* Eventos Passados */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-bold">🟠 Eventos Passados</h2>
          <Button variant="ghost" onClick={openArchive}>
            <Archive className="w-3.5 h-3.5" /> Arquivo
          </Button>
        </div>
        <div className="border-b bg-primary/10 px-5 py-2.5 text-center text-xs text-primary">
          Clique para registrar o feedback dos eventos
        </div>
        <ScrollArea className="flex-1">
          {pastEvents.map(evt => <EventCard event={evt} />)}
        </ScrollArea>
      </div>
    </div>
  )}
</div>
```

#### 8.6 Event Card (sidebar)
Replicar exatamente o `renderSidebarEvent` do SolarZap:
```tsx
<div className="group relative cursor-pointer rounded-xl border p-3 hover:border-primary/50 hover:shadow-md">
  <div className={cn("absolute left-0 top-3 bottom-3 w-1 rounded-full", EVENT_TYPE_COLORS[evt.appointment_type])} />
  <div className="pl-3 space-y-1">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-primary/80 uppercase">{TYPE_LABELS[evt.appointment_type]}</span>
      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", statusColor)}>
        {displayStatus}
      </span>
    </div>
    <div className="font-semibold text-sm">{evt.title}</div>
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <Clock className="w-3.5 h-3.5" /> {format(start, 'dd/MM HH:mm')}
      {evt.location && <><MapPin className="w-3.5 h-3.5" /> {evt.location}</>}
    </div>
  </div>
</div>
```

#### 8.7 Drawers Mobile
Drawer com tabs Próximos/Passados, tap no dia → eventos do dia:
```tsx
<Drawer open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
  <DrawerContent>
    <DrawerHeader>{drawerTitle}</DrawerHeader>
    {mode === 'day' && <Button>+ Novo agendamento neste dia</Button>}
    {drawerEvents.map(evt => renderSidebarEvent(evt))}
    {mode === 'past' && <Button variant="outline" onClick={openArchive}>Abrir arquivo</Button>}
  </DrawerContent>
</Drawer>
```

#### 8.8 ErrorBoundary
Wrap do AppointmentModal com ErrorBoundary (copiar pattern do SolarZap):
```tsx
<CalendarAppointmentErrorBoundary onError={handleModalError}>
  <InternalCrmAppointmentModal ... />
</CalendarAppointmentErrorBoundary>
```

#### 8.9 Google Calendar Integration
Mover o card Google Calendar do meio da página para:
- **Desktop**: Indicador no header (badge "Google ✓" ou botão "Conectar Google")  
- **Google connect/disconnect**: Popover ou dropdown no badge
- **Import button**: Dentro do dropdown

#### 8.10 Lógica de filtragem
Manter 3 filterStates independentes (como SolarZap):
- `mainFilters` → afeta grid
- `upcomingFilters` → afeta sidebar Próximos
- `pastFilters` → afeta sidebar Passados
- Todos excluem `status === 'done'` por padrão (eventos concluídos vão pro Arquivo)
- Passados com `scheduled` → exibe "Pendente" (amarelo)

### Etapa 9 — Build check + deploy

```sh
npx tsc --noEmit 2>&1 | Select-String "error TS"
npx supabase functions deploy internal-crm-api --project-ref ucwmcmdwbvrwotuzlmxh
```

---

## 4. Mapa de Constantes

### `EVENT_TYPE_COLORS`
```ts
const EVENT_TYPE_COLORS: Record<string, string> = {
  call: 'bg-blue-500',
  demo: 'bg-indigo-500',
  meeting: 'bg-purple-500',
  visit: 'bg-orange-500',
  other: 'bg-gray-500',
};
```

### `EVENT_TYPE_LABELS`
```ts
const EVENT_TYPE_LABELS: Record<string, string> = {
  call: 'Ligação',
  demo: 'Demonstração',
  meeting: 'Reunião',
  visit: 'Visita',
  other: 'Outro',
};
```

### `STATUS_LABELS`
```ts
const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  done: 'Realizado',
  canceled: 'Cancelado',
  no_show: 'Não Compareceu',
};
```

### `STATUS_COLORS`
```ts
const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  done: 'bg-muted text-foreground/80',
  canceled: 'bg-red-100 text-red-700',
  no_show: 'bg-orange-100 text-orange-700',
};
```

---

## 5. Inventário de Impacto

| Arquivo | Ação |
|---------|------|
| `supabase/functions/internal-crm-api/index.ts` | MOD — ACL + `deleteAppointment()` + router case |
| `src/modules/internal-crm/types/index.ts` | MOD — `'delete_appointment'` no union |
| `src/modules/internal-crm/hooks/useInternalCrmCalendar.ts` | MOD — adicionar `deleteAppointmentMutation` |
| `src/modules/internal-crm/components/calendar/InternalCrmCalendarFilters.tsx` | **REWRITE** — filtros colapsáveis com Combobox |
| `src/modules/internal-crm/components/calendar/InternalCrmAppointmentModal.tsx` | **REWRITE** — labels PT-BR, duração presets, excluir, remover deal_id/owner_user_id |
| `src/modules/internal-crm/components/calendar/InternalCrmEventFeedbackModal.tsx` | **REWRITE** — card resumo, labels humanizados |
| `src/modules/internal-crm/components/calendar/InternalCrmEventArchiveModal.tsx` | **NOVO** — modal de arquivo com filtros |
| `src/modules/internal-crm/components/calendar/InternalCrmCalendarView.tsx` | **REWRITE** — layout fullscreen split, sidebar, mobile drawer, ErrorBoundary, Google no header |
| `src/modules/internal-crm/pages/InternalCrmCalendarPage.tsx` | INTACTO |

**Total**: 4 reescritos + 1 criado + 3 modificados = 8 arquivos impactados.  
**Zero** arquivos do SolarZap público tocados.  
**Zero** migrations SQL necessárias (tabela `appointments` já tem todas as colunas).

---

## 6. Checklist Anti-Regressão

- [ ] Grid mensal renderiza corretamente 28-31 dias + padding
- [ ] Clicar no dia abre modal de criação com data pré-preenchida (desktop) ou Drawer (mobile)  
- [ ] Chips coloridos por tipo no grid
- [ ] Sidebar Próximos mostra apenas `start_at >= now - 24h` e exclui `done`
- [ ] Sidebar Passados mostra `start_at < now` e exclui `done`; status `scheduled` → "Pendente" (amarelo)
- [ ] Filtros independentes para grid, Próximos e Passados
- [ ] Modal de criação: tipos em português, duração com presets, Calendar picker para data
- [ ] Modal de edição: botão Excluir com AlertDialog de confirmação
- [ ] Feedback modal: card de resumo, textarea, Select com labels humanizados
- [ ] Arquivo modal: lista de eventos concluídos/cancelados/no-show com filtros
- [ ] Google Calendar badge no header (não card solto)
- [ ] Mobile: Drawer com tabs + tap no dia
- [ ] ErrorBoundary envolve o modal de appointments
- [ ] Nenhum `TokenBadge` — usar badges CSS inline  
- [ ] `tsc --noEmit` passa com zero erros
- [ ] Deploy edge function sem erros
