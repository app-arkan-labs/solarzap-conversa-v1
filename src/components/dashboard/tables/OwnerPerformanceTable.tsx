import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardPayload } from "@/types/dashboard";

interface OwnerPerformanceProps {
    data?: DashboardPayload["tables"]["owner_performance"];
    isLoading: boolean;
}

const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatMargin = (revenue: number, profit: number) =>
    revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : "--";

export function OwnerPerformanceTable({ data, isLoading }: OwnerPerformanceProps) {
    if (isLoading) return <div>Carregando...</div>;
    if (!data || data.length === 0) return <div>Sem dados.</div>;

    return (
        <div className="overflow-x-auto rounded-md border">
            <p className="px-3 py-1.5 text-[10px] text-muted-foreground md:hidden">Arraste para ver mais colunas -&gt;</p>
            <Table className="min-w-[980px]">
                <TableHeader>
                    <TableRow>
                        <TableHead>Responsavel</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">Fechados</TableHead>
                        <TableHead className="text-right">Conversao</TableHead>
                        <TableHead className="text-right">Faturamento</TableHead>
                        <TableHead className="text-right">Lucro realizado</TableHead>
                        <TableHead className="text-right">Margem</TableHead>
                        <TableHead className="text-right">Ticket medio</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row) => (
                        <TableRow key={row.owner_id || row.name}>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell className="text-right">{row.leads}</TableCell>
                            <TableCell className="text-right">{row.won}</TableCell>
                            <TableCell className="text-right">{row.conversion.toFixed(1)}%</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.profit)}</TableCell>
                            <TableCell className="text-right">{formatMargin(row.revenue, row.profit)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.ticket_avg)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
