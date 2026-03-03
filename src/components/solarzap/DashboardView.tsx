import { useMemo, useState } from "react";
import { format, subDays, startOfMonth, endOfMonth, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Download, FileText, Share2, Eye, DownloadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";

import { useDashboardReport } from "@/hooks/useDashboardReport";
import { useProposalMetrics } from "@/hooks/useProposalMetrics";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { StaleLeadsTable } from "@/components/dashboard/tables/StaleLeadsTable";
import { OwnerPerformanceTable } from "@/components/dashboard/tables/OwnerPerformanceTable";
import { CalendarSummaryPanel } from "@/components/dashboard/tables/CalendarSummaryPanel";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/solarzap/PageHeader";
import { LeadScopeSelect, type LeadScopeValue } from "@/components/solarzap/LeadScopeSelect";
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
  onNavigate,
  canViewTeam = false,
  leadScope = 'mine',
  onLeadScopeChange,
  leadScopeMembers = [],
  isLoadingLeadScopeMembers = false,
}: DashboardViewProps) {
  const { toast } = useToast();
  const { orgId, user } = useAuth();


  // State for Filters
  const [dateRange, setDateRange] = useState<{ from: Date, to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [periodLabel, setPeriodLabel] = useState("this_month");

  const [calendarFilter, setCalendarFilter] = useState<'next_7_days' | 'last_7_days'>('next_7_days');
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
      calendarFilter,
      owner_user_id: resolvedOwnerUserId,
    }
  });

  // Proposal Metrics
  const { data: proposalMetrics, isLoading: proposalMetricsLoading } = useProposalMetrics({
    start: dateRange.from,
    end: dateRange.to,
  });

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
    <div className="flex-1 flex flex-col bg-muted/30 overflow-y-auto">
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral do seu negócio"
        icon={CalendarIcon}
        actionContent={
          <>
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

            {/* Period Selector */}
            <Select value={periodLabel} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-[160px] bg-background border-border/50 shadow-sm glass">
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
                  className="w-[220px] justify-start text-left font-normal bg-background border-border/50 shadow-sm glass"
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
              <PopoverContent className="w-auto p-0" align="end">
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
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>

            {/* Export Button */}
            <Select onValueChange={(v) => handleExport(v as any)}>
              <SelectTrigger className="w-[130px] bg-background border-border/50 shadow-sm glass">
                <Download className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Exportar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="leads">Leads (CSV)</SelectItem>
                <SelectItem value="deals">Deals (CSV)</SelectItem>
                <SelectItem value="appointments">Agenda (CSV)</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="w-full px-6 py-6 space-y-6">
        <KpiCards data={data?.kpis} isLoading={isLoading} />
        <DashboardCharts data={data?.charts} isLoading={isLoading} />

        {/* ── Proposal Metrics Card ── */}
        <Card data-testid="proposal-metrics-card" className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Propostas
            </CardTitle>
            <CardDescription>
              Métricas de geração, compartilhamento e abertura de propostas no período
            </CardDescription>
          </CardHeader>
          <CardContent>
            {proposalMetricsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            ) : proposalMetrics ? (
              <div className="space-y-4">
                {/* KPI mini-cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="rounded-lg border bg-background p-4 text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                      <FileText className="w-3.5 h-3.5" /> Geradas
                    </div>
                    <p className="text-2xl font-bold">{proposalMetrics.generated}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-4 text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                      <Share2 className="w-3.5 h-3.5" /> Compartilhadas
                    </div>
                    <p className="text-2xl font-bold">{proposalMetrics.shared}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-4 text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                      <Eye className="w-3.5 h-3.5" /> Abertas
                    </div>
                    <p className="text-2xl font-bold">{proposalMetrics.opened}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-4 text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                      <DownloadCloud className="w-3.5 h-3.5" /> DL Cliente
                    </div>
                    <p className="text-2xl font-bold">{proposalMetrics.downloadedClient}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-4 text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                      <DownloadCloud className="w-3.5 h-3.5" /> DL Roteiro
                    </div>
                    <p className="text-2xl font-bold">{proposalMetrics.downloadedSeller}</p>
                  </div>
                </div>

                {/* Bottom row: conversion rate + segment distribution */}
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="rounded-lg border bg-background p-4 flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Taxa de Abertura</p>
                    <p className="text-xl font-bold">
                      {proposalMetrics.generated > 0
                        ? Math.round((proposalMetrics.opened / proposalMetrics.generated) * 100)
                        : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {proposalMetrics.opened} abertas / {proposalMetrics.generated} geradas
                    </p>
                  </div>
                  {Object.keys(proposalMetrics.bySegment).length > 0 && (
                    <div className="rounded-lg border bg-background p-4 flex-1">
                      <p className="text-xs text-muted-foreground mb-2">Distribuição por Segmento</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(proposalMetrics.bySegment)
                          .sort((a, b) => b[1] - a[1])
                          .map(([seg, count]) => (
                            <Badge key={seg} variant="secondary" className="text-xs">
                              {{ residencial: 'Residencial', empresarial: 'Empresarial', agro: 'Agro / Rural', usina: 'Usina', unknown: 'Outro' }[seg] || seg}: {count}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum dado de proposta no período.</p>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="operacional" className="space-y-4">
          <TabsList>
            <TabsTrigger value="operacional">Relatório Operacional</TabsTrigger>
            <TabsTrigger value="equipe">Performance Equipe</TabsTrigger>
            <TabsTrigger value="agenda">Agenda Recente</TabsTrigger>
          </TabsList>
          <TabsContent value="operacional">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              <div className="col-span-4 lg:col-span-5">
                <Card className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle>Leads Estagnados</CardTitle>
                    <CardDescription>Leads sem movimentação de etapa há mais de 7 dias</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <StaleLeadsTable data={data?.tables.stale_leads} isLoading={isLoading} />
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="equipe">
            <Card className="border-border/50 bg-background/50 glass shadow-sm hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle>Performance por Responsável</CardTitle>
              </CardHeader>
              <CardContent>
                <OwnerPerformanceTable data={data?.tables.owner_performance} isLoading={isLoading} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="agenda">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              <div className="col-span-7">
                <CalendarSummaryPanel
                  data={data?.calendar}
                  isLoading={isLoading}
                  filter={calendarFilter}
                  onFilterChange={setCalendarFilter}
                  onViewAll={() => onNavigate?.('calendario')}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
