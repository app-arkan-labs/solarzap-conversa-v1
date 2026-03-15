import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { MessageSquare, ArrowRight } from "lucide-react";
import { DashboardPayload } from "@/types/dashboard";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PIPELINE_STAGES } from "@/types/solarzap";
import { useNavigate } from "react-router-dom";

interface StaleLeadsTableProps {
    data?: DashboardPayload["tables"]["stale_leads"];
    isLoading: boolean;
}

export function StaleLeadsTable({ data, isLoading }: StaleLeadsTableProps) {
    const navigate = useNavigate();

    if (isLoading) return <div>Carregando...</div>;
    if (!data || data.length === 0) return <div className="text-center p-4 text-muted-foreground">Nenhum lead estagnado.</div>;

    return (
        <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[720px]">
                <TableHeader>
                    <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Etapa Atual</TableHead>
                        <TableHead>Tempo Parado</TableHead>
                        <TableHead>Última Interação</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((lead) => (
                        <TableRow key={lead.id}>
                            <TableCell className="font-medium">{lead.name}</TableCell>
                            <TableCell>
                                <span className={`px-2 py-1 rounded-full text-xs text-white ${PIPELINE_STAGES[lead.stage as keyof typeof PIPELINE_STAGES]?.color || 'bg-gray-500'}`}>
                                    {PIPELINE_STAGES[lead.stage as keyof typeof PIPELINE_STAGES]?.title || lead.stage}
                                </span>
                            </TableCell>
                            <TableCell>{lead.days_stale} dias</TableCell>
                            <TableCell>
                                {lead.last_interaction
                                    ? formatDistanceToNow(new Date(lead.last_interaction), { addSuffix: true, locale: ptBR })
                                    : '-'
                                }
                            </TableCell>
                            <TableCell className="text-right space-x-2">
                                <Button variant="ghost" size="icon" title="Abrir Chat" onClick={() => navigate(`/app?tab=conversas&search=${lead.name}`)}> {/* Simple nav to chat */}
                                    <MessageSquare className="h-4 w-4" />
                                </Button>
                                {/* Future: Add Move Stage Dialog */}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
