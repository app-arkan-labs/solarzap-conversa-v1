import { useCallback, useMemo, useState } from "react";
import { endOfMonth, format, startOfMonth, startOfYear, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowRightLeft,
  BarChart3,
  CalendarClock,
  CalendarIcon,
  Clock3,
  DollarSign,
  Download,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { ActionSnapshotCard } from "@/components/dashboard/ActionSnapshotCard";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { DashboardMetricGrid, type DashboardMetricItem } from "@/components/dashboard/DashboardMetricGrid";
import { FinanceSnapshotCard } from "@/components/dashboard/FinanceSnapshotCard";
import { FunnelOverview } from "@/components/dashboard/FunnelOverview";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { LossSummaryCard } from "@/components/dashboard/LossSummaryCard";
import { SourcePerformanceCard } from "@/components/dashboard/SourcePerformanceCard";
import { CalendarSummaryPanel } from "@/components/dashboard/tables/CalendarSummaryPanel";
import { LeadActionQueuePanel } from "@/components/dashboard/tables/LeadActionQueuePanel";
import { OwnerPerformanceTable } from "@/components/dashboard/tables/OwnerPerformanceTable";
import { StaleLeadsTable } from "@/components/dashboard/tables/StaleLeadsTable";
import { LossAnalyticsModal } from "@/components/solarzap/LossAnalyticsModal";
import { LeadScopeSelect, type LeadScopeValue } from "@/components/solarzap/LeadScopeSelect";
import { PageHeader } from "@/components/solarzap/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboardReport } from "@/hooks/useDashboardReport";
import { useMobileViewport } from "@/hooks/useMobileViewport";
import {
  DASHBOARD_VIEW_OPTIONS,
  DASHBOARD_VIEW_QUERY_PARAM,
  getDashboardViewMeta,
  parseDashboardVisualization,
  type DashboardVisualization,
} from "@/lib/dashboardViews";
import type { MemberDto } from "@/lib/orgAdminClient";
import { supabase } from "@/lib/supabase";
import type { Contact, LeadTask } from "@/types/solarzap";

interface DashboardViewProps {
  onNavigate?: (tab: string) => void;
  contacts?: Contact[];
  leadTasks?: LeadTask[];
  showLeadNextAction?: boolean;
  canViewTeam?: boolean;
  leadScope?: LeadScopeValue;
  onLeadScopeChange?: (scope: LeadScopeValue) => void;
  leadScopeMembers?: MemberDto[];
  isLoadingLeadScopeMembers?: boolean;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);

const formatPercent = (value: number | null) => {
  if (value === null) return "Sem base";
  if (value === 0) return "0,0%";
  const sign = value > 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(1).replace(".", ",")}%`;
};

export function DashboardView({
  onNavigate,
  contacts = [],
  leadTasks = [],
  showLeadNextAction = false,
  canViewTeam = false,
  leadScope = "mine",
  onLeadScopeChange,
  leadScopeMembers = [],
  isLoadingLeadScopeMembers = false,
}: DashboardViewProps) {
  const { toast } = useToast();
  const { orgId, user } = useAuth();
  const isMobileViewport = useMobileViewport();
  const navigate = useNavigate();
  const location = useLocation();

  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [periodLabel, setPeriodLabel] = useState("this_month");
  const [calendarFilter, setCalendarFilter] = useState<"next_7_days" | "last_7_days">("next_7_days");
  const [lossAnalyticsOpen, setLossAnalyticsOpen] = useState(false);

  const dashboardView = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return parseDashboardVisualization(searchParams.get(DASHBOARD_VIEW_QUERY_PARAM));
  }, [location.search]);
  const dashboardViewMeta = useMemo(() => getDashboardViewMeta(dashboardView), [dashboardView]);

  const resolvedOwnerUserId = useMemo(() => {
    if (!user) return null;
    if (!canViewTeam) return user.id;
    if (leadScope === "org_all") return null;
    if (leadScope === "mine") return user.id;
    const scopedUserId = leadScope.slice(5).trim();
    return scopedUserId || user.id;
  }, [canViewTeam, leadScope, user]);

  const { data, isLoading, error } = useDashboardReport({
    start: dateRange.from,
    end: dateRange.to,
    compare: true,
    orgId,
    filters: {
      owner_user_id: resolvedOwnerUserId,
      calendarFilter,
    },
  });

  const ownerPerformanceData = useMemo(() => {
    const rows = data?.tables.owner_performance ?? [];
    if (rows.length === 0) return rows;

    const memberNameById = new Map(
      leadScopeMembers.map((member) => [
        member.user_id,
        member.display_name?.trim() || member.email?.trim() || `Usuario ${member.user_id.slice(0, 8)}`,
      ]),
    );

    return rows.map((row) => {
      const ownerId = row.owner_id;
      if (!ownerId) return row;
      const mappedName = memberNameById.get(ownerId);
      return mappedName ? { ...row, name: mappedName } : row;
    });
  }, [data?.tables.owner_performance, leadScopeMembers]);

  const isTeamMode = canViewTeam && leadScope !== "mine";
  const hasLeadActionQueue = showLeadNextAction && contacts.length > 0 && leadTasks.length > 0;

  const handleDashboardViewChange = useCallback(
    (nextView: string) => {
      const parsedView = parseDashboardVisualization(nextView);
      const searchParams = new URLSearchParams(location.search);

      if (parsedView === "summary") {
        searchParams.delete(DASHBOARD_VIEW_QUERY_PARAM);
      } else {
        searchParams.set(DASHBOARD_VIEW_QUERY_PARAM, parsedView);
      }

      const nextSearch = searchParams.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
        },
        { replace: true },
      );
    },
    [location.pathname, location.search, navigate],
  );

  const handleOpenLeadFromQueue = (contactId: string) => {
    onNavigate?.("conversas");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("open-chat", { detail: { contactId } }));
    }, 120);
  };

  const handleOpenLeadByName = (leadName: string) => {
    navigate(`/app?tab=conversas&search=${encodeURIComponent(leadName)}`);
  };

  const handlePeriodChange = (value: string) => {
    setPeriodLabel(value);
    const now = new Date();

    if (value === "this_month") {
      setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
      return;
    }

    if (value === "last_7_days") {
      setDateRange({ from: subDays(now, 7), to: now });
      return;
    }

    if (value === "last_30_days") {
      setDateRange({ from: subDays(now, 30), to: now });
      return;
    }

    if (value === "this_year") {
      setDateRange({ from: startOfYear(now), to: now });
    }
  };

  const handleExport = async (type: "leads" | "deals" | "appointments") => {
    try {
      toast({ title: "Gerando exportacao...", description: "Aguarde um momento." });
      const { data: response, error: exportError } = await supabase.functions.invoke("reports-export", {
        body: {
          type,
          start: dateRange.from.toISOString(),
          end: dateRange.to.toISOString(),
        },
      });

      if (exportError) throw exportError;
      if (response?.url) {
        window.open(response.url, "_blank");
        toast({ title: "Sucesso", description: "Download iniciado." });
      }
    } catch (exportFailure: unknown) {
      const exportMessage = exportFailure instanceof Error ? exportFailure.message : "Nao foi possivel concluir a exportacao.";
      toast({
        variant: "destructive",
        title: "Erro ao exportar",
        description: exportMessage,
      });
    }
  };

  const actionPanel = hasLeadActionQueue ? (
    <LeadActionQueuePanel
      contacts={contacts}
      tasks={leadTasks}
      teamMode={isTeamMode}
      onOpenLead={handleOpenLeadFromQueue}
      onViewConversations={() => onNavigate?.("conversas")}
    />
  ) : (
    <ActionSnapshotCard
      funnel={data?.funnel}
      staleLeads={data?.tables.stale_leads}
      teamMode={isTeamMode}
      onOpenLead={handleOpenLeadByName}
      onViewConversations={() => onNavigate?.("conversas")}
    />
  );

  const commercialMetrics = useMemo<DashboardMetricItem[]>(() => {
    if (!data?.funnel) return [];

    return [
      {
        id: "carteira-ativa",
        label: "Carteira ativa",
        value: String(data.funnel.active),
        description: "Leads ainda em processo comercial.",
        icon: BarChart3,
        tone: "sky",
      },
      {
        id: "avancos-periodo",
        label: "Avancos",
        value: String(data.funnel.moved_in_period),
        description: "Movimentacoes de etapa no periodo.",
        icon: ArrowRightLeft,
        tone: "cyan",
      },
      {
        id: "vendas-periodo",
        label: "Vendas",
        value: String(data.funnel.won_in_period),
        description: "Fechamentos no intervalo selecionado.",
        icon: TrendingUp,
        tone: "emerald",
      },
      {
        id: "pedem-atencao",
        label: "Pedem atencao",
        value: String(data.funnel.stale_total),
        description: "Leads parados alem do tempo ideal.",
        icon: Clock3,
        tone: "amber",
      },
    ];
  }, [data?.funnel]);

  const agendaMetrics = useMemo<DashboardMetricItem[]>(() => {
    if (!data?.calendar) return [];

    const pendingCount = data.calendar.scheduled + data.calendar.confirmed;
    const riskCount = data.calendar.no_show + data.calendar.canceled;

    return [
      {
        id: "agenda-eventos",
        label: "Compromissos",
        value: String(data.calendar.total),
        description: "Eventos dentro do recorte atual da agenda.",
        icon: CalendarIcon,
        tone: "sky",
      },
      {
        id: "agenda-pendentes",
        label: "Pendentes",
        value: String(pendingCount),
        description: "Agendados e confirmados no curto prazo.",
        icon: CalendarClock,
        tone: "cyan",
      },
      {
        id: "agenda-realizados",
        label: "Realizados",
        value: String(data.calendar.done),
        description: "Compromissos concluidos no periodo.",
        icon: TrendingUp,
        tone: "emerald",
      },
      {
        id: "agenda-risco",
        label: "Em risco",
        value: String(riskCount),
        description: `${data.calendar.no_show} no-show e ${data.calendar.canceled} cancelados.`,
        icon: TrendingDown,
        tone: "amber",
      },
    ];
  }, [data?.calendar]);

  const financialMetrics = useMemo<DashboardMetricItem[]>(() => {
    if (!data?.kpis || !data?.finance) return [];

    const revenueLabel = data.kpis.revenue.basis === "project_paid" ? "Faturamento" : "Valor fechado";
    const revenueDescription =
      data.kpis.revenue.basis === "project_paid"
        ? "Projetos que entraram em Projeto Pago no periodo."
        : "Baseado em vendas fechadas dentro do recorte.";

    return [
      {
        id: "finance-revenue",
        label: revenueLabel,
        value: formatCurrency(data.kpis.revenue.value),
        description: revenueDescription,
        icon: DollarSign,
        tone: "emerald",
      },
      {
        id: "finance-received",
        label: "Recebido",
        value: formatCurrency(data.finance.received_in_period),
        description: "Parcelas confirmadas no periodo.",
        icon: Wallet,
        tone: "sky",
      },
      {
        id: "finance-profit",
        label: "Lucro realizado",
        value: formatCurrency(data.finance.realized_profit_in_period),
        description: "Reconhecido nas parcelas pagas.",
        icon: TrendingUp,
        tone: "emerald",
      },
      {
        id: "finance-scheduled",
        label: "Previsto",
        value: formatCurrency(data.finance.scheduled_in_period),
        description: "Parcelas previstas no intervalo filtrado.",
        icon: CalendarClock,
        tone: "cyan",
      },
      {
        id: "finance-overdue",
        label: "Vencido",
        value: formatCurrency(data.finance.overdue_amount),
        description: `${data.finance.overdue_count} parcelas abertas em atraso.`,
        icon: TrendingDown,
        tone: "rose",
      },
      {
        id: "finance-next-7",
        label: "Prox. 7 dias",
        value: formatCurrency(data.finance.due_next_7_days_amount),
        description: `${data.finance.due_next_7_days_count} parcelas a acompanhar agora.`,
        icon: CalendarIcon,
        tone: "amber",
      },
    ];
  }, [data?.finance, data?.kpis]);

  const lossMetrics = useMemo<DashboardMetricItem[]>(() => {
    if (!data?.loss_summary) return [];

    const topReasonLabel = data.loss_summary.top_reason?.label || "Sem perdas";
    const topReasonDescription = data.loss_summary.top_reason
      ? `${data.loss_summary.top_reason.share}% das perdas do periodo.`
      : "Nenhuma perda registrada no recorte atual.";

    return [
      {
        id: "loss-total",
        label: "Perdas",
        value: String(data.loss_summary.total),
        description: "Negocios perdidos no periodo.",
        icon: TrendingDown,
        tone: "rose",
      },
      {
        id: "loss-reason",
        label: "Principal motivo",
        value: topReasonLabel,
        description: topReasonDescription,
        icon: Target,
        tone: "amber",
      },
      {
        id: "loss-active-reasons",
        label: "Motivos ativos",
        value: String(data.loss_summary.active_reasons),
        description: "Quantidade de motivos diferentes registrados.",
        icon: BarChart3,
        tone: "sky",
      },
      {
        id: "loss-delta",
        label: "Vs periodo anterior",
        value: formatPercent(data.loss_summary.change_pct),
        description:
          data.loss_summary.change_pct === null
            ? "Ainda sem base comparavel."
            : data.loss_summary.change_pct > 0
              ? "As perdas aumentaram e merecem revisao imediata."
              : data.loss_summary.change_pct < 0
                ? "As perdas recuaram frente ao periodo anterior."
                : "Mesmo volume de perdas do periodo anterior.",
        icon: ArrowRightLeft,
        tone: data.loss_summary.change_pct !== null && data.loss_summary.change_pct > 0 ? "rose" : "emerald",
      },
    ];
  }, [data?.loss_summary]);

  const lossActionPoints = useMemo(() => {
    if (!data?.loss_summary) {
      return ["Sem perdas registradas no momento."];
    }

    const points: string[] = [];

    if (data.loss_summary.top_reason) {
      points.push(
        `${data.loss_summary.top_reason.label} responde por ${data.loss_summary.top_reason.share}% das perdas registradas.`,
      );
    } else {
      points.push("Sem perdas registradas no recorte atual.");
    }

    if (data.loss_summary.active_reasons > 1) {
      points.push(`Existem ${data.loss_summary.active_reasons} motivos ativos. Vale padronizar objeções e resposta comercial.`);
    }

    if ((data.source_performance?.length || 0) > 0) {
      const topLeadSource = [...data.source_performance].sort((left, right) => right.leads - left.leads)[0];
      const topConversionSource = [...data.source_performance].sort(
        (left, right) => right.conversion_pct - left.conversion_pct,
      )[0];

      if (topLeadSource && topConversionSource) {
        points.push(
          `Compare ${topLeadSource.label} em volume com ${topConversionSource.label} em conversao antes de mexer no investimento por canal.`,
        );
      }
    }

    return points.slice(0, 3);
  }, [data?.loss_summary, data?.source_performance]);

  const teamPerformanceCard = ownerPerformanceData.length > 0 ? (
    <Card className="border-border/50 bg-background/50 shadow-sm">
      <CardHeader>
        <CardTitle>Performance por responsavel</CardTitle>
        <CardDescription>Leitura direta de volume, conversao e resultado por responsavel no periodo.</CardDescription>
      </CardHeader>
      <CardContent>
        <OwnerPerformanceTable data={ownerPerformanceData} kpis={data?.kpis} isLoading={isLoading} />
      </CardContent>
    </Card>
  ) : null;

  const staleLeadsCard = (
    <Card className="border-border/50 bg-background/50 shadow-sm">
      <CardHeader>
        <CardTitle>Leads estagnados</CardTitle>
        <CardDescription>Leads sem movimentacao de etapa ha mais de 7 dias para acao imediata.</CardDescription>
      </CardHeader>
      <CardContent>
        <StaleLeadsTable data={data?.tables.stale_leads} isLoading={isLoading} />
      </CardContent>
    </Card>
  );

  const renderViewContent = (view: DashboardVisualization) => {
    switch (view) {
      case "commercial":
        return (
          <>
            <DashboardMetricGrid items={commercialMetrics} />
            <FunnelOverview data={data?.funnel} isLoading={isLoading} />
            {staleLeadsCard}
            <DashboardCharts data={data?.charts} kpis={data?.kpis} isLoading={isLoading} mode="commercial" />
            {teamPerformanceCard}
          </>
        );

      case "agenda":
        return (
          <>
            <DashboardMetricGrid items={agendaMetrics} />
            <div className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
              <div className="min-w-0">{actionPanel}</div>
              <div className="min-w-0">
                <CalendarSummaryPanel
                  data={data?.calendar}
                  isLoading={isLoading}
                  filter={calendarFilter}
                  onFilterChange={setCalendarFilter}
                  onViewAll={() => onNavigate?.("calendario")}
                />
              </div>
            </div>
            {staleLeadsCard}
          </>
        );

      case "financial":
        return (
          <>
            <DashboardMetricGrid items={financialMetrics} />
            <DashboardCharts data={data?.charts} kpis={data?.kpis} isLoading={isLoading} mode="financial" />
            <FinanceSnapshotCard data={data?.finance} isLoading={isLoading} maxInstallments={10} />
            {teamPerformanceCard}
          </>
        );

      case "losses":
        return (
          <>
            <DashboardMetricGrid items={lossMetrics} />
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <LossSummaryCard data={data?.loss_summary} isLoading={isLoading} onOpenDetails={() => setLossAnalyticsOpen(true)} />
              <SourcePerformanceCard
                data={data?.source_performance}
                revenueBasis={data?.kpis.revenue.basis}
                isLoading={isLoading}
                limit={6}
              />
            </div>
            <Card className="border-border/50 bg-background/50 shadow-sm">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Por onde atacar primeiro</CardTitle>
                  <CardDescription>Leitura pratica para transformar perda em acao comercial concreta.</CardDescription>
                </div>
                <Button variant="outline" className="sm:w-auto" onClick={() => setLossAnalyticsOpen(true)}>
                  Abrir analise detalhada
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {lossActionPoints.map((point) => (
                  <div key={point} className="rounded-lg border border-border/60 bg-background/70 px-4 py-3 text-sm text-foreground">
                    {point}
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        );

      case "summary":
      default:
        return (
          <>
            <KpiCards data={data?.kpis} isLoading={isLoading} />

            <div className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
              <div className="min-w-0">{actionPanel}</div>
              <div className="min-w-0">
                <CalendarSummaryPanel
                  data={data?.calendar}
                  isLoading={isLoading}
                  filter={calendarFilter}
                  onFilterChange={setCalendarFilter}
                  onViewAll={() => onNavigate?.("calendario")}
                />
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="min-w-0">
                <FunnelOverview data={data?.funnel} isLoading={isLoading} />
              </div>
              <div className="min-w-0 space-y-6">
                <FinanceSnapshotCard data={data?.finance} isLoading={isLoading} maxInstallments={4} />
                <LossSummaryCard data={data?.loss_summary} isLoading={isLoading} onOpenDetails={() => setLossAnalyticsOpen(true)} />
              </div>
            </div>
          </>
        );
    }
  };

  if (error) {
    return <div className="p-8 text-red-500">Erro ao carregar dashboard: {(error as Error).message}</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30">
      <PageHeader
        title="Dashboard"
        subtitle={dashboardViewMeta.subtitle}
        icon={BarChart3}
        actionContent={
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            {canViewTeam && onLeadScopeChange ? (
              <LeadScopeSelect
                value={leadScope}
                onChange={onLeadScopeChange}
                members={leadScopeMembers}
                loading={isLoadingLeadScopeMembers}
                currentUserId={user?.id ?? null}
                testId="dashboard-owner-scope-trigger"
              />
            ) : null}

            <Select value={dashboardView} onValueChange={handleDashboardViewChange}>
              <SelectTrigger className="w-full border-border/50 bg-background shadow-sm glass sm:w-[180px]">
                <SelectValue placeholder="Visualizacao" />
              </SelectTrigger>
              <SelectContent>
                {DASHBOARD_VIEW_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={periodLabel} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-full border-border/50 bg-background shadow-sm glass sm:w-[160px]">
                <SelectValue placeholder="Periodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">Este mes</SelectItem>
                <SelectItem value="last_7_days">Ultimos 7 dias</SelectItem>
                <SelectItem value="last_30_days">Ultimos 30 dias</SelectItem>
                <SelectItem value="this_year">Este ano</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start border-border/50 bg-background text-left font-normal shadow-sm glass sm:w-[220px]"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "dd/MM/y", { locale: ptBR })} - {format(dateRange.to, "dd/MM/y", { locale: ptBR })}
                      </>
                    ) : (
                      format(dateRange.from, "dd/MM/y", { locale: ptBR })
                    )
                  ) : (
                    <span>Selecione data</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={dateRange}
                  onSelect={(range) => {
                    if (range?.from) {
                      setDateRange({ from: range.from, to: range.to || range.from });
                      setPeriodLabel("custom");
                    }
                  }}
                  numberOfMonths={isMobileViewport ? 1 : 2}
                />
              </PopoverContent>
            </Popover>

            <Select onValueChange={(value) => handleExport(value as "leads" | "deals" | "appointments")}>
              <SelectTrigger className="w-full border-border/50 bg-background shadow-sm glass sm:w-[130px]">
                <Download className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Exportar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="leads">Leads (CSV)</SelectItem>
                <SelectItem value="deals">Recebimentos (CSV)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        mobileToolbar={
          <div className="flex items-center gap-2">
            <Select value={periodLabel} onValueChange={handlePeriodChange}>
              <SelectTrigger className="h-8 w-[120px] border-border/50 bg-background text-xs">
                <SelectValue placeholder="Periodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">Este mes</SelectItem>
                <SelectItem value="last_7_days">7 dias</SelectItem>
                <SelectItem value="last_30_days">30 dias</SelectItem>
                <SelectItem value="this_year">Ano</SelectItem>
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                  <CalendarIcon className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={dateRange}
                  onSelect={(range) => {
                    if (range?.from) {
                      setDateRange({ from: range.from, to: range.to || range.from });
                      setPeriodLabel("custom");
                    }
                  }}
                  numberOfMonths={1}
                />
              </PopoverContent>
            </Popover>
          </div>
        }
      />

      {isMobileViewport && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border/50 bg-background/80 px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {canViewTeam && onLeadScopeChange ? (
            <LeadScopeSelect
              value={leadScope}
              onChange={onLeadScopeChange}
              members={leadScopeMembers}
              loading={isLoadingLeadScopeMembers}
              currentUserId={user?.id ?? null}
              testId="dashboard-owner-scope-trigger"
              triggerClassName="h-8 shrink-0 text-xs"
            />
          ) : null}

          <Select value={dashboardView} onValueChange={handleDashboardViewChange}>
            <SelectTrigger className="h-8 w-[150px] shrink-0 border-border/50 bg-background text-xs">
              <SelectValue placeholder="Visualizacao" />
            </SelectTrigger>
            <SelectContent>
              {DASHBOARD_VIEW_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select onValueChange={(value) => handleExport(value as "leads" | "deals" | "appointments")}>
            <SelectTrigger className="h-8 w-[100px] shrink-0 border-border/50 bg-background text-xs">
              <Download className="mr-1 h-3.5 w-3.5" />
              <SelectValue placeholder="Exportar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="leads">Leads</SelectItem>
              <SelectItem value="deals">Recebimentos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="w-full space-y-6 px-4 py-4 sm:px-6 sm:py-6">
          {renderViewContent(dashboardView)}
        </div>
      </div>

      <LossAnalyticsModal open={lossAnalyticsOpen} onOpenChange={setLossAnalyticsOpen} ownerUserId={resolvedOwnerUserId} />
    </div>
  );
}
