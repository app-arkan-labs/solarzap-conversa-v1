import { useState } from "react";
import { format, subDays, startOfMonth, endOfMonth, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";

import { useDashboardReport } from "@/hooks/useDashboardReport";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { StaleLeadsTable } from "@/components/dashboard/tables/StaleLeadsTable";
import { OwnerPerformanceTable } from "@/components/dashboard/tables/OwnerPerformanceTable";
import { CalendarSummaryPanel } from "@/components/dashboard/tables/CalendarSummaryPanel";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface DashboardViewProps {
  onNavigate?: (tab: string) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const { toast } = useToast();


  // State for Filters
  const [dateRange, setDateRange] = useState<{ from: Date, to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [periodLabel, setPeriodLabel] = useState("this_month");

  const [calendarFilter, setCalendarFilter] = useState<'next_7_days' | 'last_7_days'>('next_7_days');

  // Fetch Data
  const { data, isLoading, error } = useDashboardReport({
    start: dateRange.from,
    end: dateRange.to,
    compare: true,
    filters: { calendarFilter }
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
      {/* Premium Header */}
      <div className="bg-gradient-to-r from-primary/10 via-background to-emerald-500/10 border-b">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                <CalendarIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
                <p className="text-sm text-muted-foreground">Visão geral do seu negócio</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Period Selector */}
              <Select value={periodLabel} onValueChange={handlePeriodChange}>
                <SelectTrigger className="w-[160px] bg-background border-border/50 shadow-sm">
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
                    className="w-[220px] justify-start text-left font-normal bg-background border-border/50 shadow-sm"
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
                <SelectTrigger className="w-[130px] bg-background border-border/50 shadow-sm">
                  <Download className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Exportar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leads">Leads (CSV)</SelectItem>
                  <SelectItem value="deals">Deals (CSV)</SelectItem>
                  <SelectItem value="appointments">Agenda (CSV)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6">
        <KpiCards data={data?.kpis} isLoading={isLoading} />
        <DashboardCharts data={data?.charts} isLoading={isLoading} />

        <Tabs defaultValue="operacional" className="space-y-4">
          <TabsList>
            <TabsTrigger value="operacional">Relatório Operacional</TabsTrigger>
            <TabsTrigger value="equipe">Performance Equipe</TabsTrigger>
            <TabsTrigger value="agenda">Agenda Recente</TabsTrigger>
          </TabsList>
          <TabsContent value="operacional">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              <div className="col-span-4 lg:col-span-5">
                <Card>
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
            <Card>
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
