import type {
    DashboardFunnelPayload,
    DashboardLossSummary,
    DashboardSourcePerformanceRow,
} from "@/lib/dashboardMetrics";

export interface DashboardPayload {
    kpis: {
        leads: { value: number; delta_pct: number };
        conversion: { value_pct: number; won: number; leads: number };
        revenue: { value: number; prev_value: number; delta_pct: number | null };
        profit: { value: number; prev_value: number; delta_pct: number | null };
        avg_close_days: { value: number };
        ticket_avg: { value: number };
        forecast: { value: number; count: number };
    };
    charts: {
        leads_by_source: Array<{ source: string; count: number; pct: number }>;
        sales_by_source: Array<{ source: string; count: number; pct: number }>;
        monthly: Array<{ month: string; leads: number; sales: number; revenue: number; profit: number; conversion_rate: number }>;
    };
    funnel: DashboardFunnelPayload;
    source_performance: DashboardSourcePerformanceRow[];
    loss_summary: DashboardLossSummary;
    tables: {
        stale_leads: Array<{
            id: number;
            name: string;
            stage: string;
            days_stale: number;
            last_interaction?: string;
        }>;
        owner_performance: Array<{
            owner_id?: string;
            name: string;
            leads: number;
            won: number;
            revenue: number;
            profit: number;
            conversion: number;
            ticket_avg: number;
        }>;
    };
    calendar: {
        total: number;
        done: number;
        canceled: number;
        no_show: number;
        scheduled: number;
        confirmed: number;
        upcoming: Array<{
            id: string;
            title: string;
            start_at: string;
            type: string;
            status: string;
            leads?: { nome: string };
        }>;
    };
}

