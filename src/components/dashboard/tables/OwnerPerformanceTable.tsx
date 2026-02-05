import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardPayload } from "@/types/dashboard";

interface OwnerPerformanceProps {
    data?: DashboardPayload["tables"]["owner_performance"];
    isLoading: boolean;
}

export function OwnerPerformanceTable({ data, isLoading }: OwnerPerformanceProps) {
    if (isLoading) return <div>Carregando...</div>;
    if (!data || data.length === 0) return <div>Sem dados.</div>;

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Leads</TableHead>
                        <TableHead>Fechados (Won)</TableHead>
                        <TableHead>Conversão</TableHead>
                        <TableHead className="text-right">Faturamento</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row, idx) => (
                        <TableRow key={idx}>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell>{row.leads}</TableCell>
                            <TableCell>{row.won}</TableCell>
                            <TableCell>{row.conversion.toFixed(1)}%</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
