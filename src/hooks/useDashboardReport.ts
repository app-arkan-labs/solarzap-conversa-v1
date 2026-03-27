import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { DashboardPayload } from "@/types/dashboard";
import {
    buildDashboardFunnel,
    buildLossSummary,
    buildSourcePerformance,
} from "@/lib/dashboardMetrics";
import { normalizeLeadStage } from "@/lib/leadStageNormalization";

const toSafeNumber = (value: unknown): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const asArray = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);

interface LeadRow {
    id: number | string;
    created_at: string;
    canal: string | null;
    status_pipeline: string | null;
    stage_changed_at: string | null;
    nome: string | null;
    user_id: string | null;
    assigned_to_user_id: string | null;
}

interface LeadIdRow {
    id: number | string;
}

interface FunnelLeadRow {
    id: number | string;
    status_pipeline: string | null;
    stage_changed_at: string | null;
}

interface StageHistoryRow {
    lead_id: number | string | null;
    to_stage: string | null;
    changed_at: string | null;
}

interface FinancePlanRow {
    lead_id: number | string | null;
    sale_value: number | string | null;
    project_cost: number | string | null;
}

interface DealRow {
    id?: number | string;
    amount: number | string | null;
    closed_at?: string | null;
    lead_id: number | string | null;
    created_at?: string | null;
    user_id: string | null;
}

interface InstallmentRow {
    lead_id: number | string | null;
    paid_amount: number | string | null;
    profit_amount: number | string | null;
    paid_at: string | null;
    amount?: number | string | null;
}

interface OpenInstallmentRow {
    id?: number | string;
    lead_id: number | string | null;
    installment_no?: number | string | null;
    due_on: string | null;
    amount: number | string | null;
    status: "scheduled" | "awaiting_confirmation" | "paid" | "canceled" | string | null;
    leads?: AppointmentUpcomingLeadRow | AppointmentUpcomingLeadRow[] | null;
}

interface LeadSourceRow {
    id: number | string;
    canal: string | null;
    created_at?: string | null;
    assigned_to_user_id?: string | null;
}

interface InteractionRow {
    lead_id: number | string | null;
    created_at: string | null;
}

interface LossReasonRow {
    motivos_perda?: {
        key?: string | null;
        label?: string | null;
    } | null;
}

interface AppointmentSummaryRow {
    id: number | string;
    status: string | null;
}

interface AppointmentUpcomingLeadRow {
    nome?: string | null;
}

interface AppointmentUpcomingRow {
    id: number | string;
    title: string | null;
    start_at: string | null;
    type: string | null;
    status: string | null;
    leads?: AppointmentUpcomingLeadRow | AppointmentUpcomingLeadRow[] | null;
}

interface ChartBucket {
    month: string;
    leads: number;
    sales: number;
    revenue: number;
    profit: number;
}

export interface DashboardFilters {
    start: Date;
    end: Date;
    compare: boolean;
    orgId?: string | null;
    filters: {
        owner_user_id?: string | null;
        source?: string | null;
        pipeline_id?: string | null;
        calendarFilter?: 'next_7_days' | 'last_7_days';
    };
}

export const useDashboardReport = (params: DashboardFilters) => {
    return useQuery({
        queryKey: ["dashboard-report-client", params],
        queryFn: async () => {
            const { start, end, filters, orgId } = params;
            const calendarFilter = filters?.calendarFilter || 'next_7_days';

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("User not authenticated");
            const hasOwnerFilter = !!filters && Object.prototype.hasOwnProperty.call(filters, 'owner_user_id');
            const ownerUserId = hasOwnerFilter ? (filters?.owner_user_id ?? null) : user.id;

            // --- 0. Date Calculations ---
            const periodDuration = end.getTime() - start.getTime();
            const prevEnd = new Date(start.getTime()); // Previous period ends where current starts
            const prevStart = new Date(start.getTime() - periodDuration);

            const startIso = start.toISOString();
            const endIso = end.toISOString();
            const prevStartIso = prevStart.toISOString();
            const prevEndIso = prevEnd.toISOString();
            const now = new Date();
            const todayStart = new Date(now);
            todayStart.setHours(0, 0, 0, 0);
            const next7Days = new Date(todayStart);
            next7Days.setDate(next7Days.getDate() + 7);
            const todayDateIso = todayStart.toISOString().slice(0, 10);
            const next7DateIso = next7Days.toISOString().slice(0, 10);

            const calendarStart = new Date(now);
            const calendarEnd = new Date(now);
            if (calendarFilter === 'last_7_days') {
                calendarStart.setDate(now.getDate() - 7);
                calendarStart.setHours(0, 0, 0, 0);
                calendarEnd.setHours(23, 59, 59, 999);
            } else {
                calendarStart.setHours(0, 0, 0, 0);
                calendarEnd.setDate(now.getDate() + 7);
                calendarEnd.setHours(23, 59, 59, 999);
            }

            // --- 1-4. Parallel fetch: LEADS, PREV LEADS, DEALS, PREV DEALS, OPEN DEALS, STALE LEADS ---
            let leadsQ = supabase
                .from("leads")
                .select("id, created_at, canal, status_pipeline, stage_changed_at, nome, user_id, assigned_to_user_id")
                .gte("created_at", startIso)
                .lte("created_at", endIso);
            if (ownerUserId) leadsQ = leadsQ.eq("assigned_to_user_id", ownerUserId);
            if (orgId) leadsQ = leadsQ.eq('org_id', orgId);

            let prevLeadsQ = supabase
                .from("leads")
                .select("id", { count: "exact", head: true })
                .gte("created_at", prevStartIso)
                .lte("created_at", prevEndIso);
            if (ownerUserId) prevLeadsQ = prevLeadsQ.eq("assigned_to_user_id", ownerUserId);
            if (orgId) prevLeadsQ = prevLeadsQ.eq('org_id', orgId);

            let funnelLeadsQ = supabase
                .from("leads")
                .select("id, status_pipeline, stage_changed_at")
                .lte("created_at", endIso);
            if (ownerUserId) funnelLeadsQ = funnelLeadsQ.eq("assigned_to_user_id", ownerUserId);
            if (orgId) funnelLeadsQ = funnelLeadsQ.eq("org_id", orgId);

            let stageHistoryQ = supabase
                .from("lead_stage_history")
                .select("lead_id, to_stage, changed_at, leads!inner(assigned_to_user_id)")
                .gte("changed_at", startIso)
                .lte("changed_at", endIso);
            if (ownerUserId) stageHistoryQ = stageHistoryQ.eq("leads.assigned_to_user_id", ownerUserId);
            if (orgId) stageHistoryQ = stageHistoryQ.eq("org_id", orgId);

            let prevProjectPaidHistoryQ = supabase
                .from("lead_stage_history")
                .select("lead_id, to_stage, changed_at, leads!inner(assigned_to_user_id)")
                .gte("changed_at", prevStartIso)
                .lte("changed_at", prevEndIso)
                .eq("to_stage", "projeto_pago");
            if (ownerUserId) prevProjectPaidHistoryQ = prevProjectPaidHistoryQ.eq("leads.assigned_to_user_id", ownerUserId);
            if (orgId) prevProjectPaidHistoryQ = prevProjectPaidHistoryQ.eq("org_id", orgId);

            let ownerLeadIds: number[] | null = null;
            if (ownerUserId) {
                let ownerLeadsQ = supabase
                    .from("leads")
                    .select("id")
                    .eq("assigned_to_user_id", ownerUserId);
                if (orgId) ownerLeadsQ = ownerLeadsQ.eq("org_id", orgId);

                const { data: ownerLeadsData, error: ownerLeadsError } = await ownerLeadsQ;
                if (ownerLeadsError) throw ownerLeadsError;

                const ownerLeadRows = asArray<LeadIdRow>(ownerLeadsData as LeadIdRow[] | null | undefined);
                ownerLeadIds = ownerLeadRows
                    .map((row) => Number(row.id))
                    .filter((id: number) => Number.isFinite(id));
            }

            const MAX_DEAL_SCOPE_LEADS = 500;
            const shouldFallbackToDealOwnerFilter =
                !!ownerUserId && !!ownerLeadIds && ownerLeadIds.length > MAX_DEAL_SCOPE_LEADS;
            const shouldForceDealsEmpty = !!ownerUserId && !!ownerLeadIds && ownerLeadIds.length === 0;

            let wonDealsQ = supabase
                .from("deals")
                .select("id, amount, closed_at, lead_id, created_at, user_id")
                .eq("status", "won")
                .gte("closed_at", startIso)
                .lte("closed_at", endIso);
            if (shouldForceDealsEmpty) wonDealsQ = wonDealsQ.in("lead_id", [-1]);
            if (ownerUserId && ownerLeadIds && ownerLeadIds.length > 0 && !shouldFallbackToDealOwnerFilter) {
                wonDealsQ = wonDealsQ.in("lead_id", ownerLeadIds);
            }
            if (ownerUserId && shouldFallbackToDealOwnerFilter) {
                wonDealsQ = wonDealsQ.eq("user_id", ownerUserId);
            }
            if (orgId) wonDealsQ = wonDealsQ.eq('org_id', orgId);

            let prevWonDealsQ = supabase
                .from("deals")
                .select("amount, lead_id, user_id")
                .eq("status", "won")
                .gte("closed_at", prevStartIso)
                .lte("closed_at", prevEndIso);
            if (shouldForceDealsEmpty) prevWonDealsQ = prevWonDealsQ.in("lead_id", [-1]);
            if (ownerUserId && ownerLeadIds && ownerLeadIds.length > 0 && !shouldFallbackToDealOwnerFilter) {
                prevWonDealsQ = prevWonDealsQ.in("lead_id", ownerLeadIds);
            }
            if (ownerUserId && shouldFallbackToDealOwnerFilter) {
                prevWonDealsQ = prevWonDealsQ.eq("user_id", ownerUserId);
            }
            if (orgId) prevWonDealsQ = prevWonDealsQ.eq('org_id', orgId);

            let paidInstallmentsQ = supabase
                .from("lead_sale_installments")
                .select("lead_id, paid_amount, profit_amount, paid_at")
                .eq("status", "paid")
                .not("paid_at", "is", null)
                .gte("paid_at", startIso)
                .lte("paid_at", endIso);

            let prevPaidInstallmentsQ = supabase
                .from("lead_sale_installments")
                .select("lead_id, paid_amount, profit_amount, paid_at")
                .eq("status", "paid")
                .not("paid_at", "is", null)
                .gte("paid_at", prevStartIso)
                .lte("paid_at", prevEndIso);

            if (shouldForceDealsEmpty) {
                paidInstallmentsQ = paidInstallmentsQ.in("lead_id", [-1]);
                prevPaidInstallmentsQ = prevPaidInstallmentsQ.in("lead_id", [-1]);
            }
            if (ownerUserId && ownerLeadIds && ownerLeadIds.length > 0) {
                paidInstallmentsQ = paidInstallmentsQ.in("lead_id", ownerLeadIds);
                prevPaidInstallmentsQ = prevPaidInstallmentsQ.in("lead_id", ownerLeadIds);
            }
            if (orgId) {
                paidInstallmentsQ = paidInstallmentsQ.eq("org_id", orgId);
                prevPaidInstallmentsQ = prevPaidInstallmentsQ.eq("org_id", orgId);
            }

            let scheduledInstallmentsPeriodQ = supabase
                .from("lead_sale_installments")
                .select("lead_id, due_on, amount, status")
                .in("status", ["scheduled", "awaiting_confirmation"])
                .gte("due_on", startIso.slice(0, 10))
                .lte("due_on", endIso.slice(0, 10));

            let financeAttentionQ = supabase
                .from("lead_sale_installments")
                .select("lead_id, due_on, amount, status")
                .in("status", ["scheduled", "awaiting_confirmation"])
                .lte("due_on", next7DateIso);

            let upcomingInstallmentsQ = supabase
                .from("lead_sale_installments")
                .select("id, lead_id, installment_no, due_on, amount, status, leads(nome)")
                .in("status", ["scheduled", "awaiting_confirmation"])
                .order("due_on", { ascending: true })
                .limit(5);

            if (shouldForceDealsEmpty) {
                scheduledInstallmentsPeriodQ = scheduledInstallmentsPeriodQ.in("lead_id", [-1]);
                financeAttentionQ = financeAttentionQ.in("lead_id", [-1]);
                upcomingInstallmentsQ = upcomingInstallmentsQ.in("lead_id", [-1]);
            }
            if (ownerUserId && ownerLeadIds && ownerLeadIds.length > 0) {
                scheduledInstallmentsPeriodQ = scheduledInstallmentsPeriodQ.in("lead_id", ownerLeadIds);
                financeAttentionQ = financeAttentionQ.in("lead_id", ownerLeadIds);
                upcomingInstallmentsQ = upcomingInstallmentsQ.in("lead_id", ownerLeadIds);
            }
            if (orgId) {
                scheduledInstallmentsPeriodQ = scheduledInstallmentsPeriodQ.eq("org_id", orgId);
                financeAttentionQ = financeAttentionQ.eq("org_id", orgId);
                upcomingInstallmentsQ = upcomingInstallmentsQ.eq("org_id", orgId);
            }

            // Forecast scoped to dashboard date range
            let openDealsQ = supabase
                .from("deals")
                .select("amount, lead_id, user_id")
                .neq("status", "won")
                .neq("status", "lost")
                .neq("status", "perdido")
                .gte("created_at", startIso)
                .lte("created_at", endIso);
            if (shouldForceDealsEmpty) openDealsQ = openDealsQ.in("lead_id", [-1]);
            if (ownerUserId && ownerLeadIds && ownerLeadIds.length > 0 && !shouldFallbackToDealOwnerFilter) {
                openDealsQ = openDealsQ.in("lead_id", ownerLeadIds);
            }
            if (ownerUserId && shouldFallbackToDealOwnerFilter) {
                openDealsQ = openDealsQ.eq("user_id", ownerUserId);
            }
            if (orgId) openDealsQ = openDealsQ.eq('org_id', orgId);

            // Stale leads â€” exclude terminal stages
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            let staleLeadsQ = supabase
                .from("leads")
                .select("id, nome, status_pipeline, stage_changed_at")
                .lt("stage_changed_at", sevenDaysAgo.toISOString())
                .not("status_pipeline", "in", "(perdido,projeto_instalado)")
                .order("stage_changed_at", { ascending: true })
                .limit(20);
            if (ownerUserId) staleLeadsQ = staleLeadsQ.eq("assigned_to_user_id", ownerUserId);
            if (orgId) staleLeadsQ = staleLeadsQ.eq('org_id', orgId);

            let appointmentsSummaryQ = supabase
                .from("appointments")
                .select("id, status")
                .gte("start_at", startIso)
                .lte("start_at", endIso);
            if (ownerUserId) appointmentsSummaryQ = appointmentsSummaryQ.eq("user_id", ownerUserId);
            if (orgId) appointmentsSummaryQ = appointmentsSummaryQ.eq("org_id", orgId);

            let upcomingAppointmentsQ = supabase
                .from("appointments")
                .select("id, title, start_at, type, status, leads(nome)")
                .gte("start_at", calendarStart.toISOString())
                .lte("start_at", calendarEnd.toISOString())
                .order("start_at", { ascending: calendarFilter === 'next_7_days' })
                .limit(10);
            if (ownerUserId) upcomingAppointmentsQ = upcomingAppointmentsQ.eq("user_id", ownerUserId);
            if (orgId) upcomingAppointmentsQ = upcomingAppointmentsQ.eq("org_id", orgId);

            let currentLossesQ = supabase
                .from("perdas_leads")
                .select("motivos_perda!inner(key, label), leads!inner(assigned_to_user_id)")
                .gte("created_at", startIso)
                .lte("created_at", endIso);
            if (ownerUserId) currentLossesQ = currentLossesQ.eq("leads.assigned_to_user_id", ownerUserId);
            if (orgId) currentLossesQ = currentLossesQ.eq("org_id", orgId);

            let previousLossesQ = supabase
                .from("perdas_leads")
                .select("motivos_perda!inner(key, label), leads!inner(assigned_to_user_id)")
                .gte("created_at", prevStartIso)
                .lte("created_at", prevEndIso);
            if (ownerUserId) previousLossesQ = previousLossesQ.eq("leads.assigned_to_user_id", ownerUserId);
            if (orgId) previousLossesQ = previousLossesQ.eq("org_id", orgId);

            const [
                { data: leadsData, error: leadsError },
                { count: prevLeadsCount },
                { data: funnelLeadsData, error: funnelLeadsError },
                { data: stageHistoryRows, error: stageHistoryError },
                { data: prevProjectPaidHistoryRows, error: prevProjectPaidHistoryError },
                { data: wonDeals, error: dealsError },
                { data: prevWonDeals },
                { data: openDeals },
                { data: staleLeadsData },
                { data: appointmentsSummaryRows, error: appointmentsSummaryError },
                { data: upcomingAppointmentsRows, error: upcomingAppointmentsError },
                { data: currentLossRows, error: currentLossError },
                { data: previousLossRows, error: previousLossError },
                { data: paidInstallments, error: paidInstallmentsError },
                { data: prevPaidInstallments, error: prevPaidInstallmentsError },
                { data: scheduledInstallmentsPeriodRows, error: scheduledInstallmentsPeriodError },
                { data: financeAttentionRows, error: financeAttentionError },
                { data: upcomingInstallmentsRows, error: upcomingInstallmentsError }
            ] = await Promise.all([
                leadsQ,
                prevLeadsQ,
                funnelLeadsQ,
                stageHistoryQ,
                prevProjectPaidHistoryQ,
                wonDealsQ,
                prevWonDealsQ,
                openDealsQ,
                staleLeadsQ,
                appointmentsSummaryQ,
                upcomingAppointmentsQ,
                currentLossesQ,
                previousLossesQ,
                paidInstallmentsQ,
                prevPaidInstallmentsQ,
                scheduledInstallmentsPeriodQ,
                financeAttentionQ,
                upcomingInstallmentsQ,
            ]);

            if (leadsError) throw leadsError;
            if (dealsError) throw dealsError;
            if (paidInstallmentsError) throw paidInstallmentsError;
            if (prevPaidInstallmentsError) throw prevPaidInstallmentsError;
            if (funnelLeadsError) console.warn("[useDashboardReport] failed to load funnel leads", funnelLeadsError);
            if (stageHistoryError) console.warn("[useDashboardReport] failed to load stage history", stageHistoryError);
            if (prevProjectPaidHistoryError) console.warn("[useDashboardReport] failed to load previous Projeto Pago transitions", prevProjectPaidHistoryError);
            if (appointmentsSummaryError) console.warn("[useDashboardReport] failed to load appointments summary", appointmentsSummaryError);
            if (upcomingAppointmentsError) console.warn("[useDashboardReport] failed to load upcoming appointments", upcomingAppointmentsError);
            if (currentLossError) console.warn("[useDashboardReport] failed to load losses for current period", currentLossError);
            if (previousLossError) console.warn("[useDashboardReport] failed to load losses for previous period", previousLossError);
            if (scheduledInstallmentsPeriodError) console.warn("[useDashboardReport] failed to load scheduled installments in period", scheduledInstallmentsPeriodError);
            if (financeAttentionError) console.warn("[useDashboardReport] failed to load finance attention rows", financeAttentionError);
            if (upcomingInstallmentsError) console.warn("[useDashboardReport] failed to load upcoming installments", upcomingInstallmentsError);

            const leadRows = asArray<LeadRow>(leadsData as LeadRow[] | null | undefined);
            const wonDealRows = asArray<DealRow>(wonDeals as DealRow[] | null | undefined);
            const prevWonDealRows = asArray<DealRow>(prevWonDeals as DealRow[] | null | undefined);
            const openDealRows = asArray<DealRow>(openDeals as DealRow[] | null | undefined);
            const staleLeadRows = asArray<FunnelLeadRow & Pick<LeadRow, "nome">>(staleLeadsData as (FunnelLeadRow & Pick<LeadRow, "nome">)[] | null | undefined);
            const paidInstallmentsRows = asArray<InstallmentRow>(paidInstallments as InstallmentRow[] | null | undefined);
            const prevPaidInstallmentsRows = asArray<InstallmentRow>(prevPaidInstallments as InstallmentRow[] | null | undefined);
            const funnelLeadRows = asArray<FunnelLeadRow>(funnelLeadsData as FunnelLeadRow[] | null | undefined);
            const stageHistoryData = asArray<StageHistoryRow>(stageHistoryRows as StageHistoryRow[] | null | undefined);
            const prevProjectPaidHistoryData = asArray<StageHistoryRow>(prevProjectPaidHistoryRows as StageHistoryRow[] | null | undefined);
            const currentLossData = asArray<LossReasonRow>(currentLossRows as LossReasonRow[] | null | undefined);
            const previousLossData = asArray<LossReasonRow>(previousLossRows as LossReasonRow[] | null | undefined);
            const appointmentsSummaryData = asArray<AppointmentSummaryRow>(appointmentsSummaryRows as AppointmentSummaryRow[] | null | undefined);
            const upcomingAppointmentsData = asArray<AppointmentUpcomingRow>(upcomingAppointmentsRows as AppointmentUpcomingRow[] | null | undefined);
            const scheduledInstallmentsPeriodData = asArray<OpenInstallmentRow>(scheduledInstallmentsPeriodRows as OpenInstallmentRow[] | null | undefined);
            const financeAttentionData = asArray<OpenInstallmentRow>(financeAttentionRows as OpenInstallmentRow[] | null | undefined);
            const upcomingInstallmentsData = asArray<OpenInstallmentRow>(upcomingInstallmentsRows as OpenInstallmentRow[] | null | undefined);

            // Fetch Leads for Won Deals to map Source (depends on wonDeals result)
            // We need the `canal` of the leads associated with Won Deals
            const wonLeadsMap = new Map<string, LeadSourceRow>();
            if (wonDealRows.length > 0) {
                const leadIds = wonDealRows.map((deal) => deal.lead_id);
                const { data: wonLeads } = await supabase
                    .from("leads")
                    .select("id, canal, created_at, assigned_to_user_id")
                    .in("id", leadIds);

                if (wonLeads) {
                    asArray<LeadSourceRow>(wonLeads as LeadSourceRow[] | null | undefined).forEach((lead) => {
                        wonLeadsMap.set(String(lead.id), lead);
                    });
                }
            }

            const buildProjectPaidEventMap = (rows: StageHistoryRow[]) => {
                const eventMap = new Map<string, string>();
                rows.forEach((row) => {
                    const leadId = Number(row.lead_id);
                    const changedAt = String(row.changed_at || "");
                    if (!Number.isFinite(leadId) || !changedAt) return;
                    if (normalizeLeadStage(row.to_stage) !== "projeto_pago") return;

                    const key = String(leadId);
                    const currentChangedAt = eventMap.get(key);
                    if (!currentChangedAt || changedAt < currentChangedAt) {
                        eventMap.set(key, changedAt);
                    }
                });
                return eventMap;
            };

            const currentProjectPaidEventMap = buildProjectPaidEventMap(stageHistoryData);
            const prevProjectPaidEventMap = buildProjectPaidEventMap(prevProjectPaidHistoryData);
            const allProjectPaidLeadIds = Array.from(
                new Set([
                    ...Array.from(currentProjectPaidEventMap.keys()),
                    ...Array.from(prevProjectPaidEventMap.keys()),
                ]),
            )
                .map((leadId) => Number(leadId))
                .filter((leadId) => Number.isFinite(leadId));

            const financePlanByLeadId = new Map<string, FinancePlanRow>();
            const projectPaidLeadsMap = new Map<string, LeadSourceRow>();
            if (allProjectPaidLeadIds.length > 0) {
                let financePlansQ = supabase
                    .from("lead_sale_finance_plans")
                    .select("lead_id, sale_value, project_cost")
                    .in("lead_id", allProjectPaidLeadIds);
                let projectPaidLeadsQ = supabase
                    .from("leads")
                    .select("id, canal, created_at, assigned_to_user_id")
                    .in("id", allProjectPaidLeadIds);

                if (orgId) {
                    financePlansQ = financePlansQ.eq("org_id", orgId);
                    projectPaidLeadsQ = projectPaidLeadsQ.eq("org_id", orgId);
                }

                const [{ data: financePlans }, { data: projectPaidLeads }] = await Promise.all([
                    financePlansQ,
                    projectPaidLeadsQ,
                ]);

                asArray<FinancePlanRow>(financePlans as FinancePlanRow[] | null | undefined).forEach((plan) => {
                    financePlanByLeadId.set(String(plan.lead_id), plan);
                });

                asArray<LeadSourceRow>(projectPaidLeads as LeadSourceRow[] | null | undefined).forEach((lead) => {
                    projectPaidLeadsMap.set(String(lead.id), lead);
                });
            }

            const paidLeadsMap = new Map<string, LeadSourceRow>();
            const paidLeadIds = Array.from(
                new Set(
                    paidInstallmentsRows
                        .map((installment) => Number(installment.lead_id))
                        .filter((id: number) => Number.isFinite(id)),
                ),
            );

            if (paidLeadIds.length > 0) {
                let paidLeadsQ = supabase
                    .from("leads")
                    .select("id, canal, assigned_to_user_id")
                    .in("id", paidLeadIds);
                if (orgId) paidLeadsQ = paidLeadsQ.eq("org_id", orgId);

                const { data: paidLeads } = await paidLeadsQ;

                if (paidLeads) {
                    asArray<LeadSourceRow>(paidLeads as LeadSourceRow[] | null | undefined).forEach((lead) => {
                        paidLeadsMap.set(String(lead.id), lead);
                    });
                }
            }

            const staleLeadIds = Array.from(
                new Set(
                    staleLeadRows
                        .map((lead) => Number(lead.id))
                        .filter((id: number) => Number.isFinite(id)),
                ),
            );
            const lastInteractionByLeadId = new Map<number, string>();
            if (staleLeadIds.length > 0) {
                let interactionsQ = supabase
                    .from("interacoes")
                    .select("lead_id, created_at")
                    .in("lead_id", staleLeadIds)
                    .order("created_at", { ascending: false });
                if (orgId) interactionsQ = interactionsQ.eq("org_id", orgId);

                const { data: interactionRows, error: interactionsError } = await interactionsQ;
                if (interactionsError) {
                    console.warn("[useDashboardReport] failed to load stale lead interactions", interactionsError);
                } else {
                    asArray<InteractionRow>(interactionRows as InteractionRow[] | null | undefined).forEach((row) => {
                        const leadId = Number(row.lead_id);
                        if (!Number.isFinite(leadId) || lastInteractionByLeadId.has(leadId)) return;
                        if (typeof row.created_at === "string" && row.created_at) {
                            lastInteractionByLeadId.set(leadId, row.created_at);
                        }
                    });
                }
            }

            // ================= AGGREGATION =================

            // KPI: Leads
            const leadsCount = leadRows.length;
            const leadsDelta = prevLeadsCount ? ((leadsCount - prevLeadsCount) / prevLeadsCount) * 100 : 0;

            const wonDealsCount = wonDealRows.length;
            const paidInstallmentsCount = paidInstallmentsRows.length;

            // KPI: Revenue / Profit
            const dealsRevenue = wonDealRows.reduce((sum, deal) => sum + toSafeNumber(deal.amount), 0);
            const prevDealsRevenue = prevWonDealRows.reduce((sum, deal) => sum + toSafeNumber(deal.amount), 0);
            const installmentsReceived = paidInstallmentsRows.reduce((sum: number, installment) => {
                const paidAmount = toSafeNumber(installment.paid_amount);
                const fallbackAmount = toSafeNumber(installment.amount);
                return sum + (paidAmount > 0 ? paidAmount : fallbackAmount);
            }, 0);
            const installmentsProfit = paidInstallmentsRows.reduce((sum: number, installment) => {
                return sum + toSafeNumber(installment.profit_amount);
            }, 0);
            const prevInstallmentsProfit = prevPaidInstallmentsRows.reduce((sum: number, installment) => {
                return sum + toSafeNumber(installment.profit_amount);
            }, 0);

            const sumFinancePlanValue = (leadIds: string[]) =>
                leadIds.reduce((sum, leadId) => sum + toSafeNumber(financePlanByLeadId.get(leadId)?.sale_value), 0);
            const sumFinancePlanMargin = (leadIds: string[]) =>
                leadIds.reduce((sum, leadId) => {
                    const plan = financePlanByLeadId.get(leadId);
                    return sum + (toSafeNumber(plan?.sale_value) - toSafeNumber(plan?.project_cost));
                }, 0);

            const currentProjectPaidLeadIds = Array.from(currentProjectPaidEventMap.keys()).filter((leadId) => financePlanByLeadId.has(leadId));
            const prevProjectPaidLeadIds = Array.from(prevProjectPaidEventMap.keys()).filter((leadId) => financePlanByLeadId.has(leadId));
            const hasProjectPaidFinance = currentProjectPaidLeadIds.length > 0 || prevProjectPaidLeadIds.length > 0 || paidInstallmentsRows.length > 0 || prevPaidInstallmentsRows.length > 0;
            const projectPaidRevenue = sumFinancePlanValue(currentProjectPaidLeadIds);
            const prevProjectPaidRevenue = sumFinancePlanValue(prevProjectPaidLeadIds);
            const projectPaidMarginValue = sumFinancePlanMargin(currentProjectPaidLeadIds);
            const projectPaidCount = currentProjectPaidLeadIds.length;

            const revenue = hasProjectPaidFinance ? projectPaidRevenue : dealsRevenue;
            const prevRevenue = hasProjectPaidFinance ? prevProjectPaidRevenue : prevDealsRevenue;
            const profit = hasProjectPaidFinance ? installmentsProfit : 0;
            const prevProfit = hasProjectPaidFinance ? prevInstallmentsProfit : 0;
            const profitAvailable = hasProjectPaidFinance;
            const revenueBasis: "project_paid" | "won_deals" = hasProjectPaidFinance ? "project_paid" : "won_deals";
            const marginValuePct = hasProjectPaidFinance && projectPaidRevenue > 0
                ? (projectPaidMarginValue / projectPaidRevenue) * 100
                : null;

            const revenueDelta = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;
            const profitDelta = prevProfit > 0 ? ((profit - prevProfit) / prevProfit) * 100 : null;

            // KPI: Conversion
            const conversionBaseCount = hasProjectPaidFinance ? projectPaidCount : wonDealsCount;
            const conversionRate = leadsCount ? (conversionBaseCount / leadsCount) * 100 : 0;

            // KPI: Ticket Avg
            const ticketDivisor = hasProjectPaidFinance ? projectPaidCount : wonDealsCount;
            const ticketAverage = ticketDivisor > 0 ? (revenue / ticketDivisor) : 0;

            // KPI: Average close cycle in days
            const closeCycleDays = wonDealRows
                .map((deal) => {
                    const dealClosedAt = deal.closed_at || deal.created_at;
                    const leadCreatedAt = wonLeadsMap.get(String(deal.lead_id))?.created_at;
                    if (!dealClosedAt || !leadCreatedAt) return null;

                    const closedAtMs = new Date(dealClosedAt).getTime();
                    const leadCreatedAtMs = new Date(leadCreatedAt).getTime();
                    if (!Number.isFinite(closedAtMs) || !Number.isFinite(leadCreatedAtMs) || closedAtMs < leadCreatedAtMs) {
                        return null;
                    }

                    return (closedAtMs - leadCreatedAtMs) / (1000 * 60 * 60 * 24);
                })
                .filter((value): value is number => value !== null);

            const avgCloseDays = closeCycleDays.length > 0
                ? closeCycleDays.reduce((sum, value) => sum + value, 0) / closeCycleDays.length
                : 0;

            // KPI: Forecast
            const forecastValue = openDealRows.reduce((sum, deal) => sum + toSafeNumber(deal.amount), 0);
            const forecastCount = openDealRows.length;

            // Chart: Leads by Source (Using CANAL)
            const sourceMap: Record<string, number> = {};
            leadRows.forEach((lead) => {
                const source = lead.canal || "unknown";
                sourceMap[source] = (sourceMap[source] || 0) + 1;
            });
            const leadsBySource = Object.entries(sourceMap)
                .map(([source, count]) => ({
                    source,
                    count,
                    pct: (count / leadsCount) * 100
                }))
                .sort((a, b) => b.count - a.count);

            // Chart: Sales by Source
            const salesSourceMap: Record<string, number> = {};
            const salesSourceTotal = hasProjectPaidFinance ? projectPaidCount : wonDealsCount;

            if (hasProjectPaidFinance) {
                currentProjectPaidLeadIds.forEach((leadId) => {
                    const lead = projectPaidLeadsMap.get(String(leadId));
                    const source = lead?.canal || "unknown";
                    salesSourceMap[source] = (salesSourceMap[source] || 0) + 1;
                });
            } else {
                wonDealRows.forEach((deal) => {
                    const lead = wonLeadsMap.get(String(deal.lead_id));
                    const source = lead?.canal || "unknown";
                    salesSourceMap[source] = (salesSourceMap[source] || 0) + 1;
                });
            }

            const salesBySource = Object.entries(salesSourceMap)
                .map(([source, count]) => ({
                    source,
                    count,
                    pct: salesSourceTotal > 0 ? (count / salesSourceTotal) * 100 : 0
                }))
                .sort((a, b) => b.count - a.count);

            const sourcePerformanceRows = buildSourcePerformance(
                leadRows,
                hasProjectPaidFinance
                    ? currentProjectPaidLeadIds.map((leadId) => {
                        const lead = projectPaidLeadsMap.get(String(leadId));
                        const plan = financePlanByLeadId.get(String(leadId));
                        return {
                            source: lead?.canal || "unknown",
                            revenue: toSafeNumber(plan?.sale_value),
                        };
                    })
                    : wonDealRows.map((deal) => {
                        const lead = wonLeadsMap.get(String(deal.lead_id));
                        return {
                            source: lead?.canal || "unknown",
                            revenue: toSafeNumber(deal.amount),
                        };
                    }),
            );

            // 4. Sales Analysis (Dynamic Granularity)
            // Use the filtered data directly to respect the dashboard date range.
            const startDate = new Date(startIso);
            const endDate = new Date(endIso);
            // Calculate duration in days
            const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            const useDays = diffDays <= 65; // Use Daily view if range <= 65 days
            const timeBuckets: Record<string, ChartBucket> = {};

            if (useDays) {
                // Generate Daily Buckets
                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
                    timeBuckets[key] = {
                        month: d.toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' }), // Label: dd/MM
                        leads: 0, sales: 0, revenue: 0, profit: 0
                    };
                }
            } else {
                // Generate Monthly Buckets
                const d = new Date(startDate);
                d.setDate(1); // Start at first of month
                while (d <= endDate) {
                    const key = d.toISOString().slice(0, 7); // YYYY-MM
                    timeBuckets[key] = {
                        month: d.toLocaleDateString("pt-BR", { month: 'short', year: '2-digit' }), // Label: MMM/YY
                        leads: 0, sales: 0, revenue: 0, profit: 0
                    };
                    d.setMonth(d.getMonth() + 1);
                }
            }

            // Fill Data from Filtered Source
            leadRows.forEach((lead) => {
                const bucketKey = useDays ? lead.created_at.slice(0, 10) : lead.created_at.slice(0, 7);
                if (timeBuckets[bucketKey]) timeBuckets[bucketKey].leads++;
            });

            if (hasProjectPaidFinance) {
                currentProjectPaidEventMap.forEach((changedAt, leadId) => {
                    const key = useDays ? changedAt.slice(0, 10) : changedAt.slice(0, 7);
                    const plan = financePlanByLeadId.get(String(leadId));
                    if (!timeBuckets[key] || !plan) return;

                    timeBuckets[key].sales++;
                    timeBuckets[key].revenue += toSafeNumber(plan.sale_value);
                });
            } else {
                wonDealRows.forEach((deal) => {
                    // uses closed_at for sales if available, else created_at
                    const dateRef = deal.closed_at || deal.created_at;
                    if (!dateRef) return;
                    const key = useDays ? dateRef.slice(0, 10) : dateRef.slice(0, 7);
                    if (timeBuckets[key]) {
                        timeBuckets[key].sales++;
                        timeBuckets[key].revenue += toSafeNumber(deal.amount);
                    }
                });
            }

            paidInstallmentsRows.forEach((installment) => {
                const paidAt = String(installment.paid_at || "");
                if (!paidAt) return;
                const key = useDays ? paidAt.slice(0, 10) : paidAt.slice(0, 7);
                if (!timeBuckets[key]) return;
                timeBuckets[key].profit += toSafeNumber(installment.profit_amount);
            });

            const monthlyChart = Object.values(timeBuckets).map((bucket) => ({
                ...bucket,
                conversion_rate: bucket.leads > 0 ? ((bucket.sales / bucket.leads) * 100) : 0
            }));

            const ownerStatsMap = new Map<string, { leads: number; won: number; revenue: number; profit: number }>();
            const ownerLabelFromId = (id: string) => (id === user.id ? "Voce" : `Usuario ${id.slice(0, 8)}`);
            const ensureOwner = (ownerId: string) => {
                if (!ownerStatsMap.has(ownerId)) {
                    ownerStatsMap.set(ownerId, { leads: 0, won: 0, revenue: 0, profit: 0 });
                }
                return ownerStatsMap.get(ownerId)!;
            };

            leadRows.forEach((lead) => {
                const ownerId = String(lead.assigned_to_user_id || lead.user_id || "").trim();
                if (!ownerId) return;
                ensureOwner(ownerId).leads += 1;
            });

            if (hasProjectPaidFinance) {
                currentProjectPaidLeadIds.forEach((leadId) => {
                    const lead = projectPaidLeadsMap.get(String(leadId));
                    const ownerId = String(lead?.assigned_to_user_id || "").trim();
                    if (!ownerId) return;

                    const ownerStats = ensureOwner(ownerId);
                    ownerStats.won += 1;
                    ownerStats.revenue += toSafeNumber(financePlanByLeadId.get(String(leadId))?.sale_value);
                });

                paidInstallmentsRows.forEach((installment) => {
                    const lead = paidLeadsMap.get(String(installment.lead_id));
                    const ownerId = String(lead?.assigned_to_user_id || "").trim();
                    if (!ownerId) return;

                    const ownerStats = ensureOwner(ownerId);
                    ownerStats.profit += toSafeNumber(installment.profit_amount);
                });
            } else {
                wonDealRows.forEach((deal) => {
                    const lead = wonLeadsMap.get(String(deal.lead_id));
                    const ownerId = String(lead?.assigned_to_user_id || deal.user_id || "").trim();
                    if (!ownerId) return;

                    const ownerStats = ensureOwner(ownerId);
                    ownerStats.won += 1;
                    ownerStats.revenue += toSafeNumber(deal.amount);
                });
            }

            const ownerPerformanceRows = ownerStatsMap.size > 0
                ? Array.from(ownerStatsMap.entries())
                    .map(([ownerId, stats]) => ({
                        owner_id: ownerId,
                        name: ownerLabelFromId(ownerId),
                        leads: stats.leads,
                        won: stats.won,
                        revenue: stats.revenue,
                        profit: stats.profit,
                        conversion: stats.leads > 0 ? (stats.won / stats.leads) * 100 : 0,
                        ticket_avg: stats.won > 0 ? (stats.revenue / stats.won) : 0,
                    }))
                    .sort((a, b) => b.revenue - a.revenue)
                : [{
                    owner_id: ownerUserId ?? undefined,
                    name: ownerUserId ? ownerLabelFromId(ownerUserId) : "Geral (Organizacao)",
                    leads: leadsCount,
                    won: conversionBaseCount,
                    revenue,
                    profit,
                    conversion: conversionRate,
                    ticket_avg: ticketAverage,
                }];

            const funnelPayload = buildDashboardFunnel(
                funnelLeadRows,
                stageHistoryData,
                now,
            );

            const lossSummary = buildLossSummary(
                currentLossData.map((row) => ({
                        reason_key: row.motivos_perda?.key,
                        reason_label: row.motivos_perda?.label,
                    })),
                previousLossData.map((row) => ({
                        reason_key: row.motivos_perda?.key,
                        reason_label: row.motivos_perda?.label,
                    })),
            );

            const calendarRows = appointmentsSummaryData;
            const doneAppointments = calendarRows.filter((row) => row.status === "done" || row.status === "completed").length;
            const canceledAppointments = calendarRows.filter((row) => row.status === "canceled").length;
            const noShowAppointments = calendarRows.filter((row) => row.status === "no_show").length;
            const scheduledAppointments = calendarRows.filter((row) => row.status === "scheduled").length;
            const confirmedAppointments = calendarRows.filter((row) => row.status === "confirmed").length;

            const scheduledInPeriodAmount = scheduledInstallmentsPeriodData.reduce(
                (sum, installment) => sum + toSafeNumber(installment.amount),
                0,
            );
            const overdueFinanceRows = financeAttentionData.filter((installment) => {
                const dueOn = String(installment.due_on || "").slice(0, 10);
                return !!dueOn && dueOn < todayDateIso;
            });
            const dueNext7Rows = financeAttentionData.filter((installment) => {
                const dueOn = String(installment.due_on || "").slice(0, 10);
                return !!dueOn && dueOn >= todayDateIso && dueOn <= next7DateIso;
            });
            const overdueAmount = overdueFinanceRows.reduce((sum, installment) => sum + toSafeNumber(installment.amount), 0);
            const dueNext7Amount = dueNext7Rows.reduce((sum, installment) => sum + toSafeNumber(installment.amount), 0);
            const upcomingInstallments = upcomingInstallmentsData.map((row) => {
                const leadRef = Array.isArray(row.leads) ? row.leads[0] : row.leads;
                return {
                    id: String(row.id || `${row.lead_id}-${row.installment_no}-${row.due_on}`),
                    lead_id: Number(row.lead_id),
                    lead_name: leadRef?.nome || "Lead",
                    installment_no: Math.max(1, Number(row.installment_no || 0)),
                    due_on: String(row.due_on || "").slice(0, 10),
                    amount: toSafeNumber(row.amount),
                    status: row.status === "awaiting_confirmation" ? "awaiting_confirmation" : "scheduled",
                } as DashboardPayload["finance"]["upcoming_installments"][number];
            });

            // Format Objects for Component
            const payload: DashboardPayload = {
                kpis: {
                    leads: { value: leadsCount, delta_pct: leadsDelta },
                    conversion: { value_pct: conversionRate, won: conversionBaseCount, leads: leadsCount },
                    revenue: { value: revenue, prev_value: prevRevenue, delta_pct: revenueDelta, basis: revenueBasis },
                    profit: {
                        value: profit,
                        prev_value: prevProfit,
                        delta_pct: profitDelta,
                        available: profitAvailable,
                        reason: profitAvailable
                            ? undefined
                            : "Lucro realizado aparece quando houver parcelas confirmadas do Projeto Pago.",
                    },
                    margin: {
                        value_pct: marginValuePct,
                        basis: marginValuePct === null ? null : "sales_margin",
                        note: marginValuePct === null ? undefined : "Margem calculada pelo valor da venda menos o custo informado no Projeto Pago.",
                    },
                    avg_close_days: { value: avgCloseDays },
                    ticket_avg: { value: ticketAverage },
                    forecast: { value: forecastValue, count: forecastCount }
                },
                charts: {
                    leads_by_source: leadsBySource,
                    sales_by_source: salesBySource,
                    monthly: monthlyChart
                },
                funnel: funnelPayload,
                source_performance: sourcePerformanceRows,
                loss_summary: lossSummary,
                finance: {
                    received_in_period: installmentsReceived,
                    realized_profit_in_period: installmentsProfit,
                    scheduled_in_period: scheduledInPeriodAmount,
                    overdue_amount: overdueAmount,
                    overdue_count: overdueFinanceRows.length,
                    due_next_7_days_amount: dueNext7Amount,
                    due_next_7_days_count: dueNext7Rows.length,
                    upcoming_installments: upcomingInstallments,
                },
                tables: {
                    stale_leads: staleLeadRows.map((lead) => ({
                        id: Number(lead.id),
                        name: lead.nome || "Sem nome",
                        stage: lead.status_pipeline || "novo_lead",
                        days_stale: lead.stage_changed_at
                            ? Math.floor((new Date().getTime() - new Date(lead.stage_changed_at).getTime()) / (1000 * 3600 * 24))
                            : 0,
                        last_interaction: lastInteractionByLeadId.get(Number(lead.id)),
                    })),
                    owner_performance: ownerPerformanceRows
                },
                calendar: {
                    total: calendarRows.length,
                    done: doneAppointments,
                    canceled: canceledAppointments,
                    no_show: noShowAppointments,
                    scheduled: scheduledAppointments,
                    confirmed: confirmedAppointments,
                    upcoming: upcomingAppointmentsData.map((row) => ({
                        id: String(row.id),
                        title: row.title || "",
                        start_at: row.start_at || "",
                        type: row.type || "",
                        status: row.status || "",
                        leads: (() => {
                            const leadRef = Array.isArray(row.leads) ? row.leads[0] : row.leads;
                            if (!leadRef?.nome) return undefined;
                            return { nome: leadRef.nome };
                        })(),
                    })),
                }
            };

            return payload;
        },
        staleTime: 1000 * 60 * 5, // 5 minutes cache
        enabled: !!params.orgId,
    });
};






