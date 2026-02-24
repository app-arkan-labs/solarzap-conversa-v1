import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN");
if (!ALLOWED_ORIGIN) {
    throw new Error("Missing ALLOWED_ORIGIN env");
}

const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    // Handle CORS preflight request
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('Missing Authorization header')
        }

        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: authHeader } } }
        );

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)

        if (userError || !user) {
            console.error("Unauthorized: No user found", userError);
            throw new Error("Unauthorized");
        }

        const { start, end, filters } = await req.json();

        // VALIDATION
        if (!start || !end) {
            console.error("Missing required params: start, end");
            return new Response(JSON.stringify({ error: "Missing required params: start, end" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // Validate calendarFilter
        const allowedFilters = ['next_7_days', 'last_7_days'];
        const calendarFilter = filters?.calendarFilter || 'next_7_days';

        if (!allowedFilters.includes(calendarFilter)) {
            return new Response(JSON.stringify({ error: "Invalid calendarFilter. Allowed: 'next_7_days', 'last_7_days'" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // SINGLE TRUTH FOR 'NOW'
        const now = new Date();

        const startDate = new Date(start);
        const endDate = new Date(end);

        // Calculate previous period for comparison
        const periodDuration = endDate.getTime() - startDate.getTime();
        const prevEndDate = new Date(startDate.getTime());
        const prevStartDate = new Date(startDate.getTime() - periodDuration);

        console.log(`Generating report for User: ${user.id} | Range: ${start} to ${end} | CalFilter: ${calendarFilter}`);

        // --- 1. KPI QUERIES ---
        // Leads Count
        const { count: leadsCount, error: leadsError } = await supabaseClient
            .from("leads")
            .select("*", { count: "exact", head: true })
            .gte("created_at", start)
            .lte("created_at", end)
            .eq("user_id", user.id);

        if (leadsError) throw new Error(`Error fetching leads: ${leadsError.message}`);

        // Previous Leads Count (for delta)
        const { count: prevLeadsCount } = await supabaseClient
            .from("leads")
            .select("*", { count: "exact", head: true })
            .gte("created_at", prevStartDate.toISOString())
            .lte("created_at", prevEndDate.toISOString())
            .eq("user_id", user.id);

        // Won Deals & Revenue
        const { data: wonDeals, error: wonError } = await supabaseClient
            .from("deals")
            .select("amount, closed_at, lead_id, created_at")
            .eq("status", "won")
            .gte("closed_at", start)
            .lte("closed_at", end)
            .eq("user_id", user.id);

        if (wonError) throw new Error(`Error fetching deals: ${wonError.message}`);

        // Previous Won Deals (for delta)
        const { data: prevWonDeals } = await supabaseClient
            .from("deals")
            .select("amount")
            .eq("status", "won")
            .gte("closed_at", prevStartDate.toISOString())
            .lte("closed_at", prevEndDate.toISOString())
            .eq("user_id", user.id);

        const revenue = wonDeals?.reduce((sum, d) => sum + (Number(d.amount) || 0), 0) || 0;
        const prevRevenue = prevWonDeals?.reduce((sum, d) => sum + (Number(d.amount) || 0), 0) || 0;
        const wonCount = wonDeals?.length || 0;
        const ticketAverage = wonCount > 0 ? revenue / wonCount : 0;

        // Conversion Rate
        const conversionRate = leadsCount ? (wonCount / leadsCount) * 100 : 0;

        // Avg Close Time (Days)
        let totalDays = 0;
        let dealsWithLeadTime = 0;

        if (wonDeals && wonDeals.length > 0) {
            const leadIds = wonDeals.map(d => d.lead_id);
            if (leadIds.length > 0) {
                const { data: leadsData } = await supabaseClient
                    .from("leads")
                    .select("id, created_at")
                    .in("id", leadIds);

                const leadMap = new Map(leadsData?.map(l => [l.id, new Date(l.created_at).getTime()]) || []);

                for (const deal of wonDeals) {
                    const closedTime = new Date(deal.closed_at).getTime();
                    const leadTime = leadMap.get(deal.lead_id);
                    if (leadTime && closedTime > leadTime) {
                        totalDays += (closedTime - leadTime) / (1000 * 60 * 60 * 24);
                        dealsWithLeadTime++;
                    }
                }
            }
        }
        const avgCloseDays = dealsWithLeadTime > 0 ? totalDays / dealsWithLeadTime : 0;

        // Forecast (Open Deals)
        const { data: openDeals, error: openDealsError } = await supabaseClient
            .from("deals")
            .select("amount")
            .neq("status", "won")
            .neq("status", "lost")
            .neq("status", "perdido") // Safety check for localized status
            .eq("user_id", user.id);

        const forecastValue = openDeals?.reduce((sum, d) => sum + (Number(d.amount) || 0), 0) || 0;
        const forecastCount = openDeals?.length || 0;


        // --- 2. CHARTS QUERIES ---
        // Leads by Source -> LEADS.CANAL
        const { data: leadsBySource } = await supabaseClient
            .from("leads")
            .select("canal")
            .gte("created_at", start)
            .lte("created_at", end)
            .eq("user_id", user.id);

        const sourceMap: Record<string, number> = {};
        leadsBySource?.forEach(l => {
            const s = l.canal || "unknown";
            sourceMap[s] = (sourceMap[s] || 0) + 1;
        });

        const sourceChart = Object.entries(sourceMap).map(([source, count]) => ({
            source,
            count,
            pct: leadsCount ? (count / leadsCount) * 100 : 0
        })).sort((a, b) => b.count - a.count);

        // Sales by Source (Won Deals) -> DEALS -> LEADS.CANAL
        // Note: 'deals' usually relates to 'leads'. We need to fetch deals, then get their lead's source.
        const salesSourceMap: Record<string, number> = {};
        if (wonDeals && wonDeals.length > 0) {
            const wonLeadIds = wonDeals.map(d => d.lead_id);
            const { data: wonLeadsData } = await supabaseClient
                .from("leads")
                .select("id, canal")
                .in("id", wonLeadIds);

            const leadSourceLookup = new Map(wonLeadsData?.map(l => [l.id, l.canal || 'unknown']) || []);

            wonDeals.forEach(d => {
                const src = leadSourceLookup.get(d.lead_id) || 'unknown';
                salesSourceMap[src] = (salesSourceMap[src] || 0) + 1;
            });
        }

        const salesBySourceChart = Object.entries(salesSourceMap).map(([source, count]) => ({
            source,
            count,
            pct: wonCount ? (count / wonCount) * 100 : 0
        })).sort((a, b) => b.count - a.count);


        // Funnel
        const { data: leadsByStage } = await supabaseClient
            .from("leads")
            .select("status_pipeline")
            .gte("created_at", start)
            .lte("created_at", end)
            .eq("user_id", user.id);

        const stageMap: Record<string, number> = {};
        leadsByStage?.forEach(l => {
            const s = l.status_pipeline || "unknown";
            stageMap[s] = (stageMap[s] || 0) + 1;
        });

        const funnelChart = Object.entries(stageMap).map(([stage, count]) => ({
            stage,
            count
        }));


        // Monthly Performance (last 6 months)
        // Re-using 'now' is fine, but we need a mutable date for calculation
        const sixMonthsAgo = new Date(now);
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);

        const { data: monthlyLeads } = await supabaseClient
            .from("leads")
            .select("created_at")
            .gte("created_at", sixMonthsAgo.toISOString())
            .eq("user_id", user.id);

        const { data: monthlySales } = await supabaseClient
            .from("deals")
            .select("closed_at, amount")
            .eq("status", "won")
            .gte("closed_at", sixMonthsAgo.toISOString())
            .eq("user_id", user.id);

        const monthsMap: Record<string, { leads: number, sales: number, revenue: number }> = {};

        // Loop from sixMonthsAgo to now
        const d = new Date(sixMonthsAgo);
        while (d <= now) {
            const key = d.toISOString().slice(0, 7); // YYYY-MM
            monthsMap[key] = { leads: 0, sales: 0, revenue: 0 };
            d.setMonth(d.getMonth() + 1);
        }

        monthlyLeads?.forEach(l => {
            const key = l.created_at.slice(0, 7);
            if (monthsMap[key]) monthsMap[key].leads++;
        });

        monthlySales?.forEach(s => {
            const key = s.closed_at.slice(0, 7);
            if (monthsMap[key]) {
                monthsMap[key].sales++;
                monthsMap[key].revenue += Number(s.amount) || 0;
            }
        });

        const monthlyChart = Object.entries(monthsMap).map(([month, data]) => ({
            month,
            ...data,
            conversion_rate: data.leads > 0 ? (data.sales / data.leads) * 100 : 0
        })).sort((a, b) => a.month.localeCompare(b.month));


        // --- 3. TABLES / REPORTS ---
        // Stale Leads
        const sevenDaysAgoStale = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: staleLeadsData, error: staleError } = await supabaseClient
            .from("leads")
            .select("id, nome, status_pipeline, stage_changed_at, last_message_at, user_id")
            .lt("stage_changed_at", sevenDaysAgoStale)
            .eq("user_id", user.id)
            .order("stage_changed_at", { ascending: true })
            .limit(20);

        if (staleError) console.warn("Error fetching stale leads:", staleError);

        const staleLeads = staleLeadsData?.map(l => ({
            id: l.id,
            name: l.nome,
            stage: l.status_pipeline,
            days_stale: l.stage_changed_at ? Math.floor((now.getTime() - new Date(l.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24)) : 0,
            last_interaction: l.last_message_at
        }));

        // Owner Performance (single user for now)
        const ownerPerformance = [{
            name: "Você",
            leads: leadsCount,
            won: wonCount,
            revenue: revenue,
            conversion: conversionRate,
            ticket_avg: ticketAverage
        }];

        // --- 4. CALENDAR SUMMARY ---
        const { data: appointments, error: apptError } = await supabaseClient
            .from("appointments")
            .select("id, status")
            .gte("start_at", start)
            .lte("start_at", end)
            .eq("user_id", user.id);

        if (apptError) console.warn("Error fetching appointments:", apptError);

        const totalAppointments = appointments?.length || 0;
        const doneAppointments = appointments?.filter(a => a.status === 'done' || a.status === 'completed').length || 0;
        const canceledAppointments = appointments?.filter(a => a.status === 'canceled' || a.status === 'no_show').length || 0;

        // Calendar Logic with SINGLE 'now'
        let calStart: string, calEnd: string;

        if (calendarFilter === 'last_7_days') {
            const sevenDaysAgoCal = new Date(now);
            sevenDaysAgoCal.setDate(now.getDate() - 7);
            sevenDaysAgoCal.setHours(0, 0, 0, 0);

            const endToday = new Date(now);
            endToday.setHours(23, 59, 59, 999);

            calStart = sevenDaysAgoCal.toISOString();
            calEnd = endToday.toISOString();
        } else {
            // Default: Next 7 Days (INCLUDING Today)
            const startToday = new Date(now);
            startToday.setHours(0, 0, 0, 0);

            const sevenDaysFuture = new Date(now);
            sevenDaysFuture.setDate(now.getDate() + 7);
            sevenDaysFuture.setHours(23, 59, 59, 999);

            calStart = startToday.toISOString();
            calEnd = sevenDaysFuture.toISOString();
        }

        const { data: upcomingAppointments } = await supabaseClient
            .from("appointments")
            .select("id, title, start_at, type, status, leads(nome)")
            .gte("start_at", calStart)
            .lte("start_at", calEnd)
            // .eq("user_id", user.id) // Removed to broaden visibility (Admins/Shared) as per UX request
            .order("start_at", { ascending: calendarFilter === 'next_7_days' })
            .limit(10);

        return new Response(
            JSON.stringify({
                kpis: {
                    leads: { value: leadsCount, delta_pct: prevLeadsCount ? ((leadsCount - prevLeadsCount) / prevLeadsCount) * 100 : 0 },
                    conversion: { value_pct: conversionRate, won: wonCount, leads: leadsCount },
                    revenue: { value: revenue, delta_pct: prevRevenue ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0 },
                    avg_close_days: { value: avgCloseDays },
                    ticket_avg: { value: ticketAverage },
                    forecast: { value: forecastValue, count: forecastCount }
                },
                charts: {
                    leads_by_source: sourceChart,
                    sales_by_source: salesBySourceChart,
                    funnel_counts: funnelChart,
                    monthly: monthlyChart
                },
                tables: {
                    stale_leads: staleLeads || [],
                    owner_performance: ownerPerformance
                },
                calendar: {
                    total: totalAppointments,
                    done: doneAppointments,
                    canceled: canceledAppointments,
                    upcoming: upcomingAppointments || []
                }
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );

    } catch (error) {
        // SAFETY NET: CATCH ALL ERRORS
        console.error("Fatal Error in reports-dashboard:", error);
        return new Response(JSON.stringify({
            error: "Internal Server Error"
        }), {
            status: 500, // Return 500 so frontend knows it failed but receives JSON
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
