import { useMemo, useState } from "react";
import { format, subDays, startOfMonth, endOfMonth, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart3, CalendarIcon, ChevronDown, Download, TrendingDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/components/ui/use-toast";

import { useDashboardReport } from "@/hooks/useDashboardReport";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { StaleLeadsTable } from "@/components/dashboard/tables/StaleLeadsTable";
import { OwnerPerformanceTable } from "@/components/dashboard/tables/OwnerPerformanceTable";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PageHeader } from "@/components/solarzap/PageHeader";
import { LeadScopeSelect, type LeadScopeValue } from "@/components/solarzap/LeadScopeSelect";
import { LossAnalyticsModal } from "@/components/solarzap/LossAnalyticsModal";
import { useMobileViewport } from "@/hooks/useMobileViewport";
import type { MemberDto } from "@/lib/orgAdminClient";

interface DashboardViewProps {
  onNavigate?: (tab: string) => void;
  canViewTeam?: boolean;
  leadScope?: LeadScopeValue;
  onLeadScopeChange?: (scope: LeadScopeValue) => void;
  leadScopeMembers?: MemberDto[];
  isLoadingLeadScopeMembers?: boolean;
}

export function DashboardView({
  canViewTeam = false,
  leadScope = 'mine',
  onLeadScopeChange,
  leadScopeMembers = [],
  isLoadingLeadScopeMembers = false,
}: DashboardViewProps) {
  const { toast } = useToast();
  const { orgId, user } = useAuth();
  const isMobileViewport = useMobileViewport();


  // State for Filters
  const [dateRange, setDateRange] = useState<{ from: Date, to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [periodLabel, setPeriodLabel] = useState("this_month");

  const [staleLeadsOpen, setStaleLeadsOpen] = useState(false);
  const [lossAnalyticsOpen, setLossAnalyticsOpen] = useState(false);
  const resolvedOwnerUserId = useMemo(() => {
    if (!user) return null;
    if (!canViewTeam) return user.id;
    if (leadScope === 'org_all') return null;
    if (leadScope === 'mine') return user.id;
    const scopedUserId = leadScope.slice(5).trim();
    return scopedUserId || user.id;
  }, [canViewTeam, leadScope, user]);

  // Fetch Data
  const { data, isLoading, error } = useDashboardReport({
    start: dateRange.from,
    end: dateRange.to,
    compare: true,
    orgId,
    filters: {
      owner_user_id: resolvedOwnerUserId,
    }
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

  // Handlers
  const handlePeriodChange = (val: string) => {
    setPeriodLabel(val);
    const now = new Date();
    if (val === 'this_month') {
      setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
    } else if (val === 'last_7_days') {
      setDateRange({ from: subDays(now, 7), to: now });
    } else if (val === 'last_30_days') {
      setDateRange({ from: subDays(now, 30), to: now });
    } else if (val === 'this_year') {
      setDateRange({ from: startOfYear(now), to: now });
    }
  };

  const handleExport = async (type: 'leads' | 'deals' | 'appointments') => {
    try {
      toast({ title: "Gerando exportação...", description: "Aguarde um momento." });
      const { data: res, error } = await supabase.functions.invoke("reports-export", {
        body: { type, start: dateRange.from.toISOString(), end: dateRange.to.toISOString() }
      });

      if (error) throw error;
      if (res?.url) {
        window.open(res.url, '_blank');
        toast({ title: "Sucesso!", description: "Download iniciado." });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao exportar", description: e.message });
    }
  };

  if (error) {
    return <div className="p-8 text-red-500">Erro ao carregar dashboard: {(error as Error).message}</div>;
  }
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-muted/30 overflow-y-auto overscroll-contain">
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral do seu negócio"
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
              Analise de Perdas
            </Button>

            {/* Period Selector */}
            <Select value={periodLabel} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-full sm:w-[160px] bg-background border-border/50 shadow-sm glass">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">Este Mês</SelectItem>
                <SelectItem value="last_7_days">Últimos 7 dias</SelectItem>
                <SelectItem value="last_30_days">Últimos 30 dias</SelectItem>
                <SelectItem value="this_year">Este Ano</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full sm:w-[220px] justify-start text-left font-normal bg-background border-border/50 shadow-sm glass"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "dd/MM/y", { locale: ptBR })} -{" "}
                        {format(dateRange.to, "dd/MM/y", { locale: ptBR })}
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

            {/* Export Button */}
            <Select onValueChange={(v) => handleExport(v as any)}>
              <SelectTrigger className="w-full sm:w-[130px] bg-background border-border/50 shadow-sm glass">
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
              <SelectTrigger className="h-8 w-[120px] text-xs bg-background border-border/50">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">Este Mês</SelectItem>
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
              triggerClassName="h-8 text-xs shrink-0"
            />
          ) : null}
          <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1 text-xs" onClick={() => setLossAnalyticsOpen(true)}>
            <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
            Perdas
          </Button>
          <Select onValueChange={(v) => handleExport(v as any)}>
            <SelectTrigger className="h-8 w-[100px] text-xs shrink-0 bg-background border-border/50">
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

      <div className="w-full px-4 py-4 sm:px-6 sm:py-6 space-y-6">
        <KpiCards data={data?.kpis} isLoading={isLoading} />
        <DashboardCharts data={data?.charts} isLoading={isLoading} />

        <Card className="border-border/50 bg-background/50 shadow-sm">
          <CardHeader>
            <CardTitle>Performance por responsável</CardTitle>
            <CardDescription>Leitura direta de quem está contribuindo para faturamento e lucro no período.</CardDescription>
          </CardHeader>
          <CardContent>
            <OwnerPerformanceTable data={ownerPerformanceData} isLoading={isLoading} />
          </CardContent>
        </Card>

        <Collapsible open={staleLeadsOpen} onOpenChange={setStaleLeadsOpen} className="rounded-xl border border-border/50 bg-background/50 shadow-sm">
          <div className="flex flex-col gap-2 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Leads estagnados</h3>
              <p className="text-sm text-muted-foreground">Leads sem movimentação de etapa há mais de 7 dias.</p>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between md:w-[220px]">
                {staleLeadsOpen ? 'Ocultar detalhes' : 'Ver detalhes'}
                <ChevronDown className={`h-4 w-4 transition-transform ${staleLeadsOpen ? 'rotate-180' : ''}`} />
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

      <LossAnalyticsModal
        open={lossAnalyticsOpen}
        onOpenChange={setLossAnalyticsOpen}
        ownerUserId={resolvedOwnerUserId}
      />
    </div>
  );
}
