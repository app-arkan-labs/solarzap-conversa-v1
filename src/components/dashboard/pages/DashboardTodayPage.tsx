import { useMemo } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, Clock3, MessageSquare, Wallet } from "lucide-react";

import { ActionSnapshotCard } from "@/components/dashboard/ActionSnapshotCard";
import { FinanceSnapshotCard } from "@/components/dashboard/FinanceSnapshotCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarSummaryPanel } from "@/components/dashboard/tables/CalendarSummaryPanel";
import { LeadActionQueuePanel } from "@/components/dashboard/tables/LeadActionQueuePanel";
import { StaleLeadsTable } from "@/components/dashboard/tables/StaleLeadsTable";
import { buildLeadActionMaps, getLeadTaskDueState } from "@/lib/leadNextActions";
import type { DashboardPayload } from "@/types/dashboard";
import type { Contact, LeadTask } from "@/types/solarzap";

interface DashboardTodayPageProps {
  data?: DashboardPayload;
  isLoading: boolean;
  contacts: Contact[];
  leadTasks: LeadTask[];
  showLeadNextAction: boolean;
  teamMode: boolean;
  onOpenLeadContact: (contactId: string) => void;
  onOpenLeadById: (leadId: string | number) => void;
  onReviewInstallment?: (installment: DashboardPayload["finance"]["upcoming_installments"][number]) => void;
  onViewConversations?: () => void;
  onViewCalendar?: () => void;
  onViewSales?: () => void;
}

function TodayBottleneckCard({
  funnel,
  onViewSales,
}: {
  funnel?: DashboardPayload["funnel"];
  onViewSales?: () => void;
}) {
  if (!funnel) return null;

  const bottleneckRows = [...funnel.by_stage]
    .filter((row) => row.group !== "saida" && (row.stale_count > 0 || row.count > 0))
    .sort((left, right) => right.stale_count - left.stale_count || right.count - left.count)
    .slice(0, 3);

  const bottleneckLabel = funnel.top_bottleneck_stage
    ? funnel.by_stage.find((row) => row.stage === funnel.top_bottleneck_stage)?.label || "Sem gargalo"
    : "Sem gargalo";

  return (
    <Card className="h-full border-border/50 bg-background/50 shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Maior gargalo do momento
          </CardTitle>
          <CardDescription>Onde a venda mais trava agora.</CardDescription>
        </div>
        {onViewSales ? (
          <Button variant="outline" size="sm" className="rounded-full" onClick={onViewSales}>
            Ver vendas
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Onde agir primeiro</p>
          <p className="mt-2 text-xl font-semibold text-foreground">{bottleneckLabel}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {funnel.stale_total > 0
              ? `${funnel.stale_total} leads estao parados alem do tempo ideal.`
              : "Nenhum acumulo relevante no momento."}
          </p>
        </div>

        <div className="space-y-3">
          {bottleneckRows.length > 0 ? (
            bottleneckRows.slice(0, 2).map((row) => (
              <div key={row.stage} className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.entered_in_period} entradas no periodo</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{row.count} leads</p>
                    <p className="text-xs text-amber-700">{row.stale_count} parados</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
              Sem etapa travada para destacar agora.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardTodayPage({
  data,
  isLoading,
  contacts,
  leadTasks,
  showLeadNextAction,
  teamMode,
  onOpenLeadContact,
  onOpenLeadById,
  onReviewInstallment,
  onViewConversations,
  onViewCalendar,
  onViewSales,
}: DashboardTodayPageProps) {
  const hasLeadActionQueue = showLeadNextAction && contacts.length > 0 && leadTasks.length > 0;
  const { nextActionByLeadId } = useMemo(() => buildLeadActionMaps(leadTasks), [leadTasks]);

  const queueSummary = useMemo(
    () =>
      contacts.reduce(
        (acc, contact) => {
          const task = nextActionByLeadId.get(String(contact.id)) || null;
          const dueState = getLeadTaskDueState(task);
          if (dueState === "overdue") acc.overdue += 1;
          if (dueState === "today") acc.today += 1;
          return acc;
        },
        { overdue: 0, today: 0 },
      ),
    [contacts, nextActionByLeadId],
  );

  const nextThreeDaysEvents = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(23, 59, 59, 999);
    cutoff.setDate(cutoff.getDate() + 3);

    return (data?.calendar.upcoming || []).filter((event) => new Date(event.start_at) <= cutoff);
  }, [data?.calendar.upcoming]);

  const summaryItems = [
    {
      label: "Acoes vencidas",
      value: String(queueSummary.overdue),
      helper: "Comece por aqui.",
      icon: AlertTriangle,
      tone: "text-rose-700",
      bubble: "bg-rose-500/10",
    },
    {
      label: "Leads parados",
      value: String(data?.tables.stale_leads.length || 0),
      helper: "Precisam de retorno.",
      icon: Clock3,
      tone: "text-amber-700",
      bubble: "bg-amber-500/10",
    },
    {
      label: "Compromissos",
      value: String(nextThreeDaysEvents.length),
      helper: "Hoje e proximos 3 dias.",
      icon: CalendarClock,
      tone: "text-sky-700",
      bubble: "bg-sky-500/10",
    },
    {
      label: "Parcelas vencidas",
      value: String(data?.finance.overdue_count || 0),
      helper: "Cobrar ou confirmar.",
      icon: Wallet,
      tone: "text-rose-700",
      bubble: "bg-rose-500/10",
    },
  ] as const;

  const actionPanel = hasLeadActionQueue ? (
    <LeadActionQueuePanel
      contacts={contacts}
      tasks={leadTasks}
      teamMode={teamMode}
      onOpenLead={onOpenLeadContact}
      onViewConversations={onViewConversations}
      limit={5}
      listHeightClassName="h-[320px]"
    />
  ) : (
    <ActionSnapshotCard
      funnel={data?.funnel}
      staleLeads={data?.tables.stale_leads}
      teamMode={teamMode}
      onOpenLead={onOpenLeadById}
      onViewConversations={onViewConversations}
    />
  );

  return (
    <div className="space-y-6">
      <Card className="border-border/50 bg-background/70 shadow-sm">
        <CardContent className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between lg:p-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Hoje</p>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">O que fazer agora</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Priorize o que venceu, o que pode esfriar e o que nao pode passar de hoje.
            </p>
          </div>

          {onViewConversations ? (
            <Button className="rounded-full px-5" onClick={onViewConversations}>
              <MessageSquare className="h-4 w-4" />
              Abrir conversas
            </Button>
          ) : null}
        </CardContent>

        <CardContent className="grid gap-3 border-t border-border/60 p-5 md:grid-cols-2 xl:grid-cols-4">
          {summaryItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{item.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p>
                  </div>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full ${item.bubble}`}>
                    <Icon className={`h-4 w-4 ${item.tone}`} />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="min-w-0">{actionPanel}</div>
        <div className="min-w-0">
          <CalendarSummaryPanel
            data={data?.calendar}
            isLoading={isLoading}
            onViewAll={onViewCalendar}
            daysAhead={3}
            eventLimit={4}
            listHeightClassName="h-[320px]"
            title="Compromissos"
            description="Agenda de hoje e dos proximos dias para voce nao deixar visita, ligacao ou retorno escapar."
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="min-w-0">
          <FinanceSnapshotCard
            data={data?.finance}
            isLoading={isLoading}
            mode="today"
            maxInstallments={4}
            listHeightClassName="h-[300px]"
            onReviewInstallment={onReviewInstallment}
            onViewConversations={onViewConversations}
          />
        </div>
        <div className="min-w-0">
          <TodayBottleneckCard funnel={data?.funnel} onViewSales={onViewSales} />
        </div>
      </div>

      <Card className="border-border/50 bg-background/50 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Leads parados</CardTitle>
            <CardDescription>Leads que estao esfriando e precisam de retorno antes de perder tracao.</CardDescription>
          </div>
          {onViewConversations ? (
            <Button variant="outline" size="sm" className="rounded-full" onClick={onViewConversations}>
              Ver leads
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <StaleLeadsTable
            data={data?.tables.stale_leads}
            isLoading={isLoading}
            onOpenLead={onOpenLeadById}
            maxHeightClassName="h-[360px]"
          />
        </CardContent>
      </Card>
    </div>
  );
}
