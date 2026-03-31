import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { InternalCrmClientSummary } from '@/modules/internal-crm/types';

const LIFECYCLE_LABELS: Record<string, string> = {
  lead: 'Lead',
  customer_onboarding: 'Em Integração',
  active_customer: 'Cliente Ativo',
  churn_risk: 'Risco de Cancelamento',
  churned: 'Cancelado',
};

const EXPORT_COLUMNS = [
  { key: 'company_name', label: 'Empresa', default: true },
  { key: 'primary_contact_name', label: 'Contato', default: true },
  { key: 'primary_phone', label: 'Telefone', default: true },
  { key: 'primary_email', label: 'E-mail', default: true },
  { key: 'source_channel', label: 'Origem', default: true },
  { key: 'current_stage_code', label: 'Etapa', default: true },
  { key: 'lifecycle_status', label: 'Status', default: true },
  { key: 'last_contact_at', label: 'Última Interação', default: false },
  { key: 'updated_at', label: 'Atualizado em', default: false },
];

type ExportFormat = 'xlsx' | 'csv';

type CrmExportClientsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  clients: InternalCrmClientSummary[];
};

export function CrmExportClientsModal({ isOpen, onClose, clients }: CrmExportClientsModalProps) {
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    EXPORT_COLUMNS.filter((c) => c.default).map((c) => c.key),
  );
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleColumnToggle = (key: string) => {
    setSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const formatValue = (client: InternalCrmClientSummary, key: string): string => {
    switch (key) {
      case 'company_name':
        return client.company_name || '';
      case 'primary_contact_name':
        return client.primary_contact_name || '';
      case 'primary_phone':
        return client.primary_phone || '';
      case 'primary_email':
        return client.primary_email || '';
      case 'source_channel':
        return client.source_channel || '';
      case 'current_stage_code':
        return client.current_stage_code || '';
      case 'lifecycle_status':
        return LIFECYCLE_LABELS[client.lifecycle_status] || client.lifecycle_status;
      case 'last_contact_at':
        return client.last_contact_at
          ? new Date(client.last_contact_at).toLocaleDateString('pt-BR')
          : '';
      case 'updated_at':
        return client.updated_at
          ? new Date(client.updated_at).toLocaleDateString('pt-BR')
          : '';
      default:
        return '';
    }
  };

  const handleExport = () => {
    if (selectedColumns.length === 0) {
      toast({ title: 'Selecione ao menos uma coluna', variant: 'destructive' });
      return;
    }

    setIsExporting(true);
    try {
      const headers = selectedColumns.map((key) => {
        const col = EXPORT_COLUMNS.find((c) => c.key === key);
        return col?.label || key;
      });

      const data = clients.map((client) =>
        selectedColumns.map((key) => formatValue(client, key)),
      );

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);

      const colWidths = headers.map((header, i) => {
        const maxLen = Math.max(header.length, ...data.map((row) => String(row[i]).length));
        return { wch: Math.min(maxLen + 2, 50) };
      });
      worksheet['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');

      const dateStr = new Date().toISOString().split('T')[0];
      if (format === 'xlsx') {
        XLSX.writeFile(workbook, `clientes_crm_${dateStr}.xlsx`);
      } else {
        XLSX.writeFile(workbook, `clientes_crm_${dateStr}.csv`, { bookType: 'csv' });
      }

      toast({
        title: 'Exportação concluída!',
        description: `${clients.length} cliente(s) exportado(s).`,
      });
      onClose();
    } catch {
      toast({ title: 'Erro na exportação', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Exportar Clientes
          </DialogTitle>
          <DialogDescription>
            Selecione as colunas e o formato para exportar {clients.length} cliente(s).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden space-y-6">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Formato</Label>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as ExportFormat)} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="xlsx" id="fmt-xlsx" />
                <Label htmlFor="fmt-xlsx" className="text-sm">Excel (.xlsx)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="csv" id="fmt-csv" />
                <Label htmlFor="fmt-csv" className="text-sm">CSV</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Colunas</Label>
            <ScrollArea className="max-h-48">
              <div className="space-y-2">
                {EXPORT_COLUMNS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedColumns.includes(col.key)}
                      onCheckedChange={() => handleColumnToggle(col.key)}
                    />
                    <span className="text-sm">{col.label}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleExport} disabled={isExporting || selectedColumns.length === 0}>
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 mr-2" />
            )}
            Exportar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
