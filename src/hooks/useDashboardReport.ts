import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { DashboardPayload } from "@/types/dashboard";

const FINANCE_PROJECT_PAID_FLAG = "finance_project_paid_v1";

const toSafeNumber = (value: unknown): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

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
            let financeCashMode = false;

            if (orgId) {
                try {
                    const { data: flags } = await supabase.rpc("get_org_feature_flags", {
                        p_org_id: orgId,
                    });
                    if (flags && typeof flags === "object" && !Array.isArray(flags)) {
                        financeCashMode = (flags as Record<string, unknown>)[FINANCE_PROJECT_PAID_FLAG] === true;
                    }
                } catch (error) {
                    console.warn("[useDashboardReport] failed to load org feature flags, using fallback", error);
                }
            }

            // --- 0. Date Calculations ---
            const periodDuration = end.getTime() - start.getTime();
            const prevEnd = new Date(start.getTime()); // Previous period ends where current starts
            const prevStart = new Date(start.getTime() - periodDuration);

            const startIso = start.toISOString();
            const endIso = end.toISOString();
            const prevStartIso = prevStart.toISOString();
            const prevEndIso = prevEnd.toISOString();

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

            let ownerLeadIds: number[] | null = null;
            if (ownerUserId) {
                let ownerLeadsQ = supabase
                    .from("leads")
                    .select("id")
                    .eq("assigned_to_user_id", ownerUserId);
                if (orgId) ownerLeadsQ = ownerLeadsQ.eq("org_id", orgId);

                const { data: ownerLeadsData, error: ownerLeadsError } = await ownerLeadsQ;
                if (ownerLeadsError) throw ownerLeadsError;

                ownerLeadIds = (ownerLeadsData || [])
                    .map((row: any) => Number(row.id))
                    .filter((id: number) => Number.isFinite(id));
            }

            const MAX_DEAL_SCOPE_LEADS = 500;
            const shouldFallbackToDealOwnerFilter =
                !!ownerUserId && !!ownerLeadIds && ownerLeadIds.length > MAX_DEAL_SCOPE_LEADS;
            const shouldForceDealsEmpty = !!ownerUserId && !!ownerLeadIds && ownerLeadIds.length === 0;

            let wonDealsQ = supabase
                .from("deals")
                .select("id, amount, closed_at, lead_id, created_at")
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
                .select("amount, lead_id")
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

            // Forecast scoped to dashboard date range
            let openDealsQ = supabase
                .from("deals")
                .select("amount, lead_id")
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

            const [
                { data: leadsData, error: leadsError },
                { count: prevLeadsCount },
                { data: wonDeals, error: dealsError },
                { data: prevWonDeals },
                { data: openDeals },
                { data: staleLeadsData },
                { data: paidInstallments, error: paidInstallmentsError },
                { data: prevPaidInstallments, error: prevPaidInstallmentsError }
            ] = await Promise.all([
                leadsQ,
                prevLeadsQ,
                wonDealsQ,
                prevWonDealsQ,
                openDealsQ,
                staleLeadsQ,
                financeCashMode ? paidInstallmentsQ : Promise.resolve({ data: [], error: null }),
                financeCashMode ? prevPaidInstallmentsQ : Promise.resolve({ data: [], error: null }),
            ]);

            if (leadsError) throw leadsError;
            if (dealsError) throw dealsError;
            if (paidInstallmentsError) throw paidInstallmentsError;
            if (prevPaidInstallmentsError) throw prevPaidInstallmentsError;

            const paidInstallmentsRows: any[] = Array.isArray(paidInstallments) ? paidInstallments : [];
            const prevPaidInstallmentsRows: any[] = Array.isArray(prevPaidInstallments) ? prevPaidInstallments : [];

            // Fetch Leads for Won Deals to map Source (depends on wonDeals result)
            // We need the `canal` of the leads associated with Won Deals
            const wonLeadsMap = new Map<string, any>();
            if (wonDeals && wonDeals.length > 0) {
                const leadIds = wonDeals.map(d => d.lead_id);
                const { data: wonLeads } = await supabase
                    .from("leads")
                    .select("id, canal")
                    .in("id", leadIds);

                if (wonLeads) {
                    wonLeads.forEach(l => wonLeadsMap.set(String(l.id), l)); // cast ID just in case
                }
            }

            const paidLeadsMap = new Map<string, any>();
            if (financeCashMode && paidInstallmentsRows.length > 0) {
                const paidLeadIds = Array.from(
                    new Set(
                        paidInstallmentsRows
                            .map((i: any) => Number(i.lead_id))
                            .filter((id: number) => Number.isFinite(id)),
                    ),
                );

                if (paidLeadIds.length > 0) {
                    const { data: paidLeads } = await supabase
                        .from("leads")
                        .select("id, canal")
                        .in("id", paidLeadIds);

                    if (paidLeads) {
                        paidLeads.forEach((lead) => paidLeadsMap.set(String(lead.id), lead));
                    }
                }
            }

            // --- 5. Fetch Calendar (parallel pair) ---
            let calStart: string, calEnd: string;
            const now = new Date();

            if (calendarFilter === 'last_7_days') {
                const startCal = new Date(now);
                startCal.setDate(now.getDate() - 7);
                startCal.setHours(0, 0, 0, 0);
                const endCal = new Date(now);
                endCal.setHours(23, 59, 59, 999);
                calStart = startCal.toISOString();
                calEnd = endCal.toISOString();
            } else {
                const startCal = new Date(now);
                startCal.setHours(0, 0, 0, 0);
                const endCal = new Date(now);
                endCal.setDate(now.getDate() + 7);
                endCal.setHours(23, 59, 59, 999);
                calStart = startCal.toISOString();
                calEnd = endCal.toISOString();
            }

            let apptsQuery = supabase
                .from("appointments")
                .select("id, title, start_at, type, status, leads(nome)")
                .gte("start_at", calStart)
                .lte("start_at", calEnd)
                .order("start_at", { ascending: true })
                .limit(10);
            if (ownerUserId) apptsQuery = apptsQuery.eq("user_id", ownerUserId);
            if (orgId) apptsQuery = apptsQuery.eq('org_id', orgId);

            let totalApptsQuery = supabase
                .from("appointments")
                .select("id", { count: 'exact', head: true })
                .gte("start_at", calStart)
                .lte("start_at", calEnd);
            if (ownerUserId) totalApptsQuery = totalApptsQuery.eq("user_id", ownerUserId);
            if (orgId) totalApptsQuery = totalApptsQuery.eq('org_id', orgId);

            const [{ data: appointments }, { count: totalAppts }] = await Promise.all([apptsQuery, totalApptsQuery]);

            // ================= AGGREGATION =================

            // KPI: Leads
            const leadsCount = leadsData?.length || 0;
            const leadsDelta = prevLeadsCount ? ((leadsCount - prevLeadsCount) / prevLeadsCount) * 100 : 0;

            const wonCount = wonDeals?.length || 0;
            const paidInstallmentsCount = paidInstallmentsRows.length;

            // KPI: Revenue / Profit (cash mode when feature is enabled)
            const dealsRevenue = wonDeals?.reduce((sum, d) => sum + toSafeNumber(d.amount), 0) || 0;
            const prevDealsRevenue = prevWonDeals?.reduce((sum, d) => sum + toSafeNumber(d.amount), 0) || 0;
            const installmentsRevenue = paidInstallmentsRows.reduce((sum: number, installment: any) => {
                const paidAmount = toSafeNumber(installment.paid_amount);
                const fallbackAmount = toSafeNumber((installment as any).amount);
                return sum + (paidAmount > 0 ? paidAmount : fallbackAmount);
            }, 0) || 0;
            const prevInstallmentsRevenue = prevPaidInstallmentsRows.reduce((sum: number, installment: any) => {
                const paidAmount = toSafeNumber(installment.paid_amount);
                const fallbackAmount = toSafeNumber((installment as any).amount);
                return sum + (paidAmount > 0 ? paidAmount : fallbackAmount);
            }, 0) || 0;

            const installmentsProfit = paidInstallmentsRows.reduce((sum: number, installment: any) => {
                return sum + toSafeNumber(installment.profit_amount);
            }, 0) || 0;
            const prevInstallmentsProfit = prevPaidInstallmentsRows.reduce((sum: number, installment: any) => {
                return sum + toSafeNumber(installment.profit_amount);
            }, 0) || 0;

            const revenue = financeCashMode ? installmentsRevenue : dealsRevenue;
            const prevRevenue = financeCashMode ? prevInstallmentsRevenue : prevDealsRevenue;
            const profit = financeCashMode ? installmentsProfit : 0;
            const prevProfit = financeCashMode ? prevInstallmentsProfit : 0;

            const revenueDelta = prevRevenue ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
            const profitDelta = prevProfit ? ((profit - prevProfit) / prevProfit) * 100 : 0;

            // KPI: Conversion
            const conversionRate = leadsCount ? (wonCount / leadsCount) * 100 : 0;

            // KPI: Ticket Avg
            const ticketDivisor = financeCashMode ? paidInstallmentsCount : wonCount;
            const ticketAverage = ticketDivisor > 0 ? (revenue / ticketDivisor) : 0;

            // KPI: Forecast
            const forecastValue = openDeals?.reduce((sum, d) => sum + (Number(d.amount) || 0), 0) || 0;
            const forecastCount = openDeals?.length || 0;

            // Chart: Leads by Source (Using CANAL)
            const sourceMap: Record<string, number> = {};
            leadsData?.forEach(l => {
                const s = l.canal || "unknown";
                sourceMap[s] = (sourceMap[s] || 0) + 1;
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
            const salesSourceTotal = financeCashMode ? paidInstallmentsCount : wonCount;

            if (financeCashMode) {
                paidInstallmentsRows.forEach((installment: any) => {
                    const lead = paidLeadsMap.get(String(installment.lead_id));
                    const source = lead?.canal || "unknown";
                    salesSourceMap[source] = (salesSourceMap[source] || 0) + 1;
                });
            } else {
                wonDeals?.forEach(d => {
                    const lead = wonLeadsMap.get(String(d.lead_id));
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

            // 4. Sales Analysis (Dynamic Granularity)
            // Use the filtered data directly to respect the dashboard date range.
            const startDate = new Date(startIso);
            const endDate = new Date(endIso);
            // Calculate duration in days
            const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            const useDays = diffDays <= 65; // Use Daily view if range <= 65 days
            const timeBuckets: Record<string, any> = {};

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
            leadsData?.forEach(l => {
                const k = useDays ? l.created_at.slice(0, 10) : l.created_at.slice(0, 7);
                if (timeBuckets[k]) timeBuckets[k].leads++;
            });

            if (financeCashMode) {
                paidInstallmentsRows.forEach((installment: any) => {
                    const paidAt = String(installment.paid_at || "");
                    if (!paidAt) return;
                    const key = useDays ? paidAt.slice(0, 10) : paidAt.slice(0, 7);
                    if (!timeBuckets[key]) return;

                    const paidAmount = toSafeNumber(installment.paid_amount);
                    const fallbackAmount = toSafeNumber((installment as any).amount);
                    const realizedRevenue = paidAmount > 0 ? paidAmount : fallbackAmount;

                    timeBuckets[key].sales++;
                    timeBuckets[key].revenue += realizedRevenue;
                    timeBuckets[key].profit += toSafeNumber(installment.profit_amount);
                });
            } else {
                wonDeals?.forEach(d => {
                    // uses closed_at for sales if available, else created_at
                    const dateRef = d.closed_at || d.created_at;
                    if (!dateRef) return;
                    const key = useDays ? dateRef.slice(0, 10) : dateRef.slice(0, 7);
                    if (timeBuckets[key]) {
                        timeBuckets[key].sales++;
                        timeBuckets[key].revenue += toSafeNumber(d.amount);
                    }
                });
            }

            const monthlyChart = Object.values(timeBuckets).map((m: any) => ({
                ...m,
                conversion_rate: m.leads > 0 ? ((m.sales / m.leads) * 100) : 0
            }));
            const ownerPerformanceLabel = ownerUserId
                ? (ownerUserId === user.id ? "Voce" : "Usuario selecionado")
                : "Geral (Organizacao)";


            // Format Objects for Component
            const payload: DashboardPayload = {
                kpis: {
                    leads: { value: leadsCount, delta_pct: leadsDelta },
                    conversion: { value_pct: conversionRate, won: wonCount, leads: leadsCount },
                    revenue: { value: revenue, delta_pct: revenueDelta },
                    profit: { value: profit, delta_pct: profitDelta },
                    avg_close_days: { value: 0 }, // Simplify for client-side (requires history calc)
                    ticket_avg: { value: ticketAverage },
                    forecast: { value: forecastValue, count: forecastCount }
                },
                charts: {
                    leads_by_source: leadsBySource,
                    sales_by_source: salesBySource,
                    monthly: monthlyChart
                },
                tables: {
                    stale_leads: staleLeadsData?.map(l => ({
                        id: l.id,
                        name: l.nome,
                        stage: l.status_pipeline,
                        days_stale: Math.floor((new Date().getTime() - new Date(l.stage_changed_at).getTime()) / (1000 * 3600 * 24)),
                        // last_interaction: l.last_message_at // Removed as column doesn't exist
                    })) || [],
                    owner_performance: [{
                        name: ownerPerformanceLabel,
                        leads: leadsCount,
                        won: wonCount,
                        revenue,
                        profit,
                        conversion: conversionRate,
                        ticket_avg: ticketAverage
                    }]
                },
                calendar: {
                    total: totalAppts || 0,
                    done: 0, // Simplify
                    canceled: 0, // Simplify
                    upcoming: appointments?.map(a => ({
                        ...a,
                        leads: Array.isArray(a.leads) ? a.leads[0] : a.leads // handle array return
                    })) || []
                }
            };

            return payload;
        },
        staleTime: 1000 * 60 * 5, // 5 minutes cache
        enabled: !!params.orgId,
    });
};

