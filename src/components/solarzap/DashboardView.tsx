import { useMemo, useState } from "react";
import { endOfMonth, format, startOfMonth, startOfYear, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart3, CalendarIcon, ChevronDown, Download, TrendingDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { FunnelOverview } from "@/components/dashboard/FunnelOverview";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { LossSummaryCard } from "@/components/dashboard/LossSummaryCard";
import { SourcePerformanceCard } from "@/components/dashboard/SourcePerformanceCard";
import { CalendarSummaryPanel } from "@/components/dashboard/tables/CalendarSummaryPanel";
import { OwnerPerformanceTable } from "@/components/dashboard/tables/OwnerPerformanceTable";
import { StaleLeadsTable } from "@/components/dashboard/tables/StaleLeadsTable";
import { LossAnalyticsModal } from "@/components/solarzap/LossAnalyticsModal";
import { PageHeader } from "@/components/solarzap/PageHeader";
import { LeadScopeSelect, type LeadScopeValue } from "@/components/solarzap/LeadScopeSelect";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboardReport } from "@/hooks/useDashboardReport";
import { useMobileViewport } from "@/hooks/useMobileViewport";
import type { MemberDto } from "@/lib/orgAdminClient";
import { supabase } from "@/lib/supabase";

interface DashboardViewProps {
  onNavigate?: (tab: string) => void;
  canViewTeam?: boolean;
  leadScope?: LeadScopeValue;
  onLeadScopeChange?: (scope: LeadScopeValue) => void;
  leadScopeMembers?: MemberDto[];
  isLoadingLeadScopeMembers?: boolean;
}

export function DashboardView({
  onNavigate,
  canViewTeam = false,
  leadScope = "mine",
  onLeadScopeChange,
  leadScopeMembers = [],
  isLoadingLeadScopeMembers = false,
}: DashboardViewProps) {
  const { toast } = useToast();
  const { orgId, user } = useAuth();
  const isMobileViewport = useMobileViewport();

  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [periodLabel, setPeriodLabel] = useState("this_month");
  const [calendarFilter, setCalendarFilter] = useState<"next_7_days" | "last_7_days">("next_7_days");
  const [staleLeadsOpen, setStaleLeadsOpen] = useState(false);
  const [lossAnalyticsOpen, setLossAnalyticsOpen] = useState(false);

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

  if (error) {
    return <div className="p-8 text-red-500">Erro ao carregar dashboard: {(error as Error).message}</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30">
      <PageHeader
        title="Dashboard"
        subtitle="Visao geral do negocio e do funil comercial"
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

            <Button
              variant="outline"
              className="h-10 w-full border-border/50 shadow-sm glass sm:w-auto"
              onClick={() => setLossAnalyticsOpen(true)}
            >
              <TrendingDown className="mr-2 h-4 w-4 text-rose-500" />
              Analise de perdas
            </Button>

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

          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1 text-xs"
            onClick={() => setLossAnalyticsOpen(true)}
          >
            <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
            Perdas
          </Button>

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

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="w-full space-y-6 px-4 py-4 sm:px-6 sm:py-6">
          <KpiCards data={data?.kpis} isLoading={isLoading} />
          <DashboardCharts data={data?.charts} isLoading={isLoading} />

          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <FunnelOverview data={data?.funnel} isLoading={isLoading} />

            <div className="space-y-6">
              <SourcePerformanceCard data={data?.source_performance} isLoading={isLoading} />
              <LossSummaryCard
                data={data?.loss_summary}
                isLoading={isLoading}
                onOpenDetails={() => setLossAnalyticsOpen(true)}
              />
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-border/50 bg-background/50 shadow-sm">
              <CardHeader>
                <CardTitle>Performance por responsavel</CardTitle>
                <CardDescription>
                  Leitura direta de volume, conversao, faturamento e lucro por responsavel no periodo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OwnerPerformanceTable data={ownerPerformanceData} isLoading={isLoading} />
              </CardContent>
            </Card>

            <CalendarSummaryPanel
              data={data?.calendar}
              isLoading={isLoading}
              filter={calendarFilter}
              onFilterChange={setCalendarFilter}
              onViewAll={() => onNavigate?.("calendario")}
            />
          </div>

          <Collapsible
            open={staleLeadsOpen}
            onOpenChange={setStaleLeadsOpen}
            className="rounded-xl border border-border/50 bg-background/50 shadow-sm"
          >
            <div className="flex flex-col gap-2 p-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Leads estagnados</h3>
                <p className="text-sm text-muted-foreground">
                  Leads sem movimentacao de etapa ha mais de 7 dias para acao imediata.
                </p>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between md:w-[220px]">
                  {staleLeadsOpen ? "Ocultar detalhes" : "Ver detalhes"}
                  <ChevronDown className={`h-4 w-4 transition-transform ${staleLeadsOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div className="px-6 pb-6">
                <StaleLeadsTable data={data?.tables.stale_leads} isLoading={isLoading} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      <LossAnalyticsModal
        open={lossAnalyticsOpen}
        onOpenChange={setLossAnalyticsOpen}
        ownerUserId={resolvedOwnerUserId}
      />
    </div>
  );
}
