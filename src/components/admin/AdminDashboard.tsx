import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminSystemMetrics } from '@/hooks/useAdminApi';

function MetricCard({ title, value }: { title: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const metricsQuery = useAdminSystemMetrics();

  if (metricsQuery.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  const metrics = metricsQuery.data?.metrics;
  if (!metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Falha ao carregar metricas</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard Admin</h1>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Organizacoes" value={metrics.total_orgs} />
        <MetricCard title="Usuarios" value={metrics.total_users} />
        <MetricCard title="Leads" value={metrics.total_leads} />
        <MetricCard title="Propostas" value={metrics.total_proposals} />
        <MetricCard title="Instancias Ativas" value={metrics.active_instances} />
      </div>
    </div>
  );
}
