import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { DashboardPayload } from "@/types/dashboard";

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

            // --- 0. Date Calculations ---
            const periodDuration = end.getTime() - start.getTime();
            const prevEnd = new Date(start.getTime()); // Previous period ends where current starts
            const prevStart = new Date(start.getTime() - periodDuration);

            const startIso = start.toISOString();
            const endIso = end.toISOString();
            const prevStartIso = prevStart.toISOString();
            const prevEndIso = prevEnd.toISOString();

            // --- 1. Fetch LEADS (Current & Previous) ---
            // Fetch ALL leads in range to aggregate in memory (for charts)
            let leadsQuery = supabase
                .from("leads")
                .select("id, created_at, canal, status_pipeline, stage_changed_at, nome, user_id")
                .gte("created_at", startIso)
                .lte("created_at", endIso)
                .eq("user_id", user.id);
            if (orgId) leadsQuery = leadsQuery.eq('org_id', orgId);
            const { data: leadsData, error: leadsError } = await leadsQuery;

            if (leadsError) throw leadsError;

            let prevLeadsQuery = supabase
                .from("leads")
                .select("id", { count: "exact", head: true })
                .gte("created_at", prevStartIso)
                .lte("created_at", prevEndIso)
                .eq("user_id", user.id);
            if (orgId) prevLeadsQuery = prevLeadsQuery.eq('org_id', orgId);
            const { count: prevLeadsCount } = await prevLeadsQuery;

            // --- 2. Fetch DEALS (Won Deals for Revenue) ---
            let wonDealsQuery = supabase
                .from("deals")
                .select("id, amount, closed_at, lead_id, created_at")
                .eq("status", "won")
                .gte("closed_at", startIso)
                .lte("closed_at", endIso)
                .eq("user_id", user.id);
            if (orgId) wonDealsQuery = wonDealsQuery.eq('org_id', orgId);
            const { data: wonDeals, error: dealsError } = await wonDealsQuery;

            if (dealsError) throw dealsError;

            // Previous Revenue
            let prevWonDealsQuery = supabase
                .from("deals")
                .select("amount")
                .eq("status", "won")
                .gte("closed_at", prevStartIso)
                .lte("closed_at", prevEndIso)
                .eq("user_id", user.id);
            if (orgId) prevWonDealsQuery = prevWonDealsQuery.eq('org_id', orgId);
            const { data: prevWonDeals } = await prevWonDealsQuery;

            // Fetch Leads for Won Deals to map Source (if needed for Sales by Source)
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

            // --- 3. Fetch Forecast (Open Deals) ---
            let openDealsQuery = supabase
                .from("deals")
                .select("amount")
                .neq("status", "won")
                .neq("status", "lost")
                .neq("status", "perdido")
                .eq("user_id", user.id);
            if (orgId) openDealsQuery = openDealsQuery.eq('org_id', orgId);
            const { data: openDeals } = await openDealsQuery;

            // --- 4. Fetch Stale Leads (Client-Side Logic) ---
            // We query leads changed > 7 days ago
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            let staleLeadsQuery = supabase
                .from("leads")
                .select("id, nome, status_pipeline, stage_changed_at")
                .lt("stage_changed_at", sevenDaysAgo.toISOString())
                .eq("user_id", user.id)
                .order("stage_changed_at", { ascending: true })
                .limit(20);
            if (orgId) staleLeadsQuery = staleLeadsQuery.eq('org_id', orgId);
            const { data: staleLeadsData } = await staleLeadsQuery;

            // --- 5. Fetch Calendar ---
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
                .eq("user_id", user.id)
                .order("start_at", { ascending: true })
                .limit(10);
            if (orgId) apptsQuery = apptsQuery.eq('org_id', orgId);
            const { data: appointments } = await apptsQuery;

            let totalApptsQuery = supabase
                .from("appointments")
                .select("id", { count: 'exact', head: true })
                .gte("start_at", calStart)
                .lte("start_at", calEnd)
                .eq("user_id", user.id);
            if (orgId) totalApptsQuery = totalApptsQuery.eq('org_id', orgId);
            const { count: totalAppts } = await totalApptsQuery;

            // ================= AGGREGATION =================

            // KPI: Leads
            const leadsCount = leadsData?.length || 0;
            const leadsDelta = prevLeadsCount ? ((leadsCount - prevLeadsCount) / prevLeadsCount) * 100 : 0;

            // KPI: Revenue
            const revenue = wonDeals?.reduce((sum, d) => sum + (Number(d.amount) || 0), 0) || 0;
            const prevRevenue = prevWonDeals?.reduce((sum, d) => sum + (Number(d.amount) || 0), 0) || 0;
            const revenueDelta = prevRevenue ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;

            // KPI: Conversion
            const wonCount = wonDeals?.length || 0;
            const conversionRate = leadsCount ? (wonCount / leadsCount) * 100 : 0;

            // KPI: Ticket Avg
            const ticketAverage = wonCount > 0 ? (revenue / wonCount) : 0;

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
            wonDeals?.forEach(d => {
                const lead = wonLeadsMap.get(String(d.lead_id));
                const s = lead?.canal || "unknown";
                salesSourceMap[s] = (salesSourceMap[s] || 0) + 1;
            });
            const salesBySource = Object.entries(salesSourceMap)
                .map(([source, count]) => ({
                    source,
                    count,
                    pct: (count / wonCount) * 100
                }))
                .sort((a, b) => b.count - a.count);

            // Chart: Funnel
            const funnelMap: Record<string, number> = {};
            leadsData?.forEach(l => {
                const s = l.status_pipeline || "unknown";
                funnelMap[s] = (funnelMap[s] || 0) + 1;
            });
            const funnelCounts = Object.entries(funnelMap).map(([stage, count]) => ({ stage, count }));

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
                        leads: 0, sales: 0, revenue: 0
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
                        leads: 0, sales: 0, revenue: 0
                    };
                    d.setMonth(d.getMonth() + 1);
                }
            }

            // Fill Data from Filtered Source
            leadsData?.forEach(l => {
                const k = useDays ? l.created_at.slice(0, 10) : l.created_at.slice(0, 7);
                if (timeBuckets[k]) timeBuckets[k].leads++;
            });

            wonDeals?.forEach(d => {
                // uses closed_at for sales if available, else created_at
                const dateRef = d.closed_at || d.created_at;
                if (!dateRef) return;
                const k = useDays ? dateRef.slice(0, 10) : dateRef.slice(0, 7);
                if (timeBuckets[k]) {
                    timeBuckets[k].sales++;
                    timeBuckets[k].revenue += (Number(d.amount) || 0);
                }
            });

            const monthlyChart = Object.values(timeBuckets).map((m: any) => ({
                ...m,
                conversion_rate: m.leads > 0 ? ((m.sales / m.leads) * 100) : 0
            }));


            // Format Objects for Component
            const payload: DashboardPayload = {
                kpis: {
                    leads: { value: leadsCount, delta_pct: leadsDelta },
                    conversion: { value_pct: conversionRate, won: wonCount, leads: leadsCount },
                    revenue: { value: revenue, delta_pct: revenueDelta },
                    avg_close_days: { value: 0 }, // Simplify for client-side (requires history calc)
                    ticket_avg: { value: ticketAverage },
                    forecast: { value: forecastValue, count: forecastCount }
                },
                charts: {
                    leads_by_source: leadsBySource,
                    sales_by_source: salesBySource,
                    funnel_counts: funnelCounts,
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
                        name: "Você",
                        leads: leadsCount,
                        won: wonCount,
                        revenue,
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
    });
};
