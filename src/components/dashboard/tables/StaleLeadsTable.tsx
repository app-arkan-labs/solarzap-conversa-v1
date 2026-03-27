import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";
import { DashboardPayload } from "@/types/dashboard";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PIPELINE_STAGES } from "@/types/solarzap";

interface StaleLeadsTableProps {
  data?: DashboardPayload["tables"]["stale_leads"];
  isLoading: boolean;
  onOpenLead?: (leadId: string | number) => void;
  maxHeightClassName?: string;
}

export function StaleLeadsTable({
  data,
  isLoading,
  onOpenLead,
  maxHeightClassName = "h-[420px]",
}: StaleLeadsTableProps) {
  if (isLoading) return <div>Carregando...</div>;
  if (!data || data.length === 0) {
    return <div className="p-4 text-center text-muted-foreground">Nenhum lead estagnado.</div>;
  }

  return (
    <div className="rounded-md border">
      <p className="px-3 py-1.5 text-[10px] text-muted-foreground md:hidden">Arraste para ver mais colunas -&gt;</p>
      <ScrollArea className={cn("overflow-x-auto", maxHeightClassName)}>
        <Table className="min-w-[760px]">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Etapa atual</TableHead>
              <TableHead className="text-right">Tempo parado</TableHead>
              <TableHead>Ultima interacao</TableHead>
              <TableHead className="text-right">Acao</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">{lead.name}</TableCell>
                <TableCell>
                  <span
                    className={`rounded-full px-2 py-1 text-xs text-white ${
                      PIPELINE_STAGES[lead.stage as keyof typeof PIPELINE_STAGES]?.color || "bg-gray-500"
                    }`}
                  >
                    {PIPELINE_STAGES[lead.stage as keyof typeof PIPELINE_STAGES]?.title || lead.stage}
                  </span>
                </TableCell>
                <TableCell className="text-right">{lead.days_stale} dias</TableCell>
                <TableCell>
                  {lead.last_interaction
                    ? formatDistanceToNow(new Date(lead.last_interaction), {
                        addSuffix: true,
                        locale: ptBR,
                      })
                    : "Sem interacao recente"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Abrir conversa"
                    onClick={() => onOpenLead?.(lead.id)}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
