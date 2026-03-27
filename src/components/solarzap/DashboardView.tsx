import { useCallback, useMemo, useState } from "react";
import { endOfMonth, format, startOfMonth, startOfYear, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart3, CalendarIcon, Download } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { DashboardFinancialPage } from "@/components/dashboard/pages/DashboardFinancialPage";
import { DashboardLossesPage } from "@/components/dashboard/pages/DashboardLossesPage";
import { DashboardSalesPage } from "@/components/dashboard/pages/DashboardSalesPage";
import { DashboardTodayPage } from "@/components/dashboard/pages/DashboardTodayPage";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { LeadScopeSelect, type LeadScopeValue } from "@/components/solarzap/LeadScopeSelect";
import { PageHeader } from "@/components/solarzap/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboardReport } from "@/hooks/useDashboardReport";
import { useMobileViewport } from "@/hooks/useMobileViewport";
import {
  DASHBOARD_VIEW_QUERY_PARAM,
  getDashboardViewMeta,
  parseDashboardVisualization,
  type DashboardVisualization,
} from "@/lib/dashboardViews";
import type { MemberDto } from "@/lib/orgAdminClient";
import { supabase } from "@/lib/supabase";
import type { DashboardPayload } from "@/types/dashboard";
import type { Contact, LeadTask } from "@/types/solarzap";

interface DashboardViewProps {
  onNavigate?: (tab: string) => void;
  onReviewInstallment?: (installment: DashboardPayload["finance"]["upcoming_installments"][number]) => void;
  contacts?: Contact[];
  leadTasks?: LeadTask[];
  showLeadNextAction?: boolean;
  canViewTeam?: boolean;
  leadScope?: LeadScopeValue;
  onLeadScopeChange?: (scope: LeadScopeValue) => void;
  leadScopeMembers?: MemberDto[];
  isLoadingLeadScopeMembers?: boolean;
}

export function DashboardView({
  onNavigate,
  onReviewInstallment,
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
      calendarFilter: "next_7_days",
    },
  });

  const isTeamMode = canViewTeam && leadScope !== "mine";

  const handleDashboardViewChange = useCallback(
    (nextView: DashboardVisualization) => {
      const searchParams = new URLSearchParams(location.search);

      if (nextView === "today") {
        searchParams.delete(DASHBOARD_VIEW_QUERY_PARAM);
      } else {
        searchParams.set(DASHBOARD_VIEW_QUERY_PARAM, nextView);
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

  const handleOpenLeadFromQueue = useCallback(
    (contactId: string) => {
      onNavigate?.("conversas");
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("open-chat", { detail: { contactId } }));
      }, 120);
    },
    [onNavigate],
  );

  const handleOpenLeadById = useCallback(
    (leadId: string | number) => {
      const contactId = String(leadId || "").trim();
      if (!contactId) return;
      handleOpenLeadFromQueue(contactId);
    },
    [handleOpenLeadFromQueue],
  );

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

  const handleViewPipeline = useCallback(() => onNavigate?.("pipelines"), [onNavigate]);
  const handleViewCalendar = useCallback(() => onNavigate?.("calendario"), [onNavigate]);
  const handleViewConversations = useCallback(() => onNavigate?.("conversas"), [onNavigate]);
  const handleGoToSalesDashboard = useCallback(() => handleDashboardViewChange("sales"), [handleDashboardViewChange]);

  const renderViewContent = () => {
    switch (dashboardView) {
      case "sales":
        return (
          <DashboardSalesPage
            data={data}
            isLoading={isLoading}
            onViewPipeline={handleViewPipeline}
            onViewConversations={handleViewConversations}
            onOpenLead={handleOpenLeadById}
          />
        );

      case "financial":
        return (
          <DashboardFinancialPage
            data={data}
            isLoading={isLoading}
            onReviewInstallment={onReviewInstallment}
            onViewConversations={handleViewConversations}
          />
        );

      case "losses":
        return (
          <DashboardLossesPage
            startDate={dateRange.from}
            endDate={dateRange.to}
            ownerUserId={resolvedOwnerUserId}
            onViewPipeline={handleViewPipeline}
          />
        );

      case "today":
      default:
        return (
          <DashboardTodayPage
            data={data}
            isLoading={isLoading}
            contacts={contacts}
            leadTasks={leadTasks}
            showLeadNextAction={showLeadNextAction}
            teamMode={isTeamMode}
            onOpenLeadContact={handleOpenLeadFromQueue}
            onOpenLeadById={handleOpenLeadById}
            onReviewInstallment={onReviewInstallment}
            onViewConversations={handleViewConversations}
            onViewCalendar={handleViewCalendar}
            onViewSales={handleGoToSalesDashboard}
          />
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
        subtitle={dashboardViewMeta.question}
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

            <DashboardNav value={dashboardView} onChange={handleDashboardViewChange} />

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

      {isMobileViewport ? (
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

          <DashboardNav value={dashboardView} onChange={handleDashboardViewChange} compact className="shrink-0" />

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
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="w-full space-y-6 px-4 py-4 sm:px-6 sm:py-6">{renderViewContent()}</div>
      </div>
    </div>
  );
}
