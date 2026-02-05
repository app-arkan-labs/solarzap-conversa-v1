import React, { useState } from 'react';
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
import { Contact, PIPELINE_STAGES, CHANNEL_INFO } from '@/types/solarzap';
import { useToast } from '@/hooks/use-toast';

interface ExportContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
}

const EXPORT_COLUMNS = [
  { key: 'name', label: 'Nome', default: true },
  { key: 'phone', label: 'Telefone', default: true },
  { key: 'email', label: 'E-mail', default: true },
  { key: 'company', label: 'Empresa', default: true },
  { key: 'clientType', label: 'Tipo de Cliente', default: true },
  { key: 'pipelineStage', label: 'Etapa do Pipeline', default: true },
  { key: 'channel', label: 'Canal', default: false },
  { key: 'address', label: 'Endereço', default: false },
  { key: 'city', label: 'Cidade', default: true },
  { key: 'state', label: 'Estado', default: false },
  { key: 'cpfCnpj', label: 'CPF/CNPJ', default: false },
  { key: 'consumption', label: 'Consumo (kWh)', default: true },
  { key: 'projectValue', label: 'Valor do Projeto', default: true },
  { key: 'createdAt', label: 'Data de Cadastro', default: false },
  { key: 'lastContact', label: 'Último Contato', default: false },
  { key: 'notes', label: 'Observações', default: false },
];

type ExportFormat = 'xlsx' | 'csv';

export function ExportContactsModal({ isOpen, onClose, contacts }: ExportContactsModalProps) {
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    EXPORT_COLUMNS.filter(c => c.default).map(c => c.key)
  );
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleColumnToggle = (columnKey: string) => {
    setSelectedColumns(prev => {
      if (prev.includes(columnKey)) {
        return prev.filter(k => k !== columnKey);
      } else {
        return [...prev, columnKey];
      }
    });
  };

  const selectAll = () => {
    setSelectedColumns(EXPORT_COLUMNS.map(c => c.key));
  };

  const selectNone = () => {
    setSelectedColumns(['name', 'phone']); // Keep minimum required
  };

  const formatValue = (contact: Contact, key: string): string | number => {
    switch (key) {
      case 'name':
        return contact.name;
      case 'phone':
        return contact.phone;
      case 'email':
        return contact.email || '';
      case 'company':
        return contact.company || '';
      case 'clientType':
        const types: Record<string, string> = {
          residencial: 'Residencial',
          comercial: 'Comercial',
          industrial: 'Industrial',
          rural: 'Rural',
        };
        return types[contact.clientType] || contact.clientType;
      case 'pipelineStage':
        return PIPELINE_STAGES[contact.pipelineStage]?.title || contact.pipelineStage;
      case 'channel':
        return CHANNEL_INFO[contact.channel]?.label || contact.channel;
      case 'address':
        return contact.address || '';
      case 'city':
        return contact.city || '';
      case 'state':
        return contact.state || '';
      case 'cpfCnpj':
        return contact.cpfCnpj || '';
      case 'consumption':
        return contact.consumption;
      case 'projectValue':
        return contact.projectValue;
      case 'createdAt':
        return new Date(contact.createdAt).toLocaleDateString('pt-BR');
      case 'lastContact':
        return new Date(contact.lastContact).toLocaleDateString('pt-BR');
      case 'notes':
        return contact.notes || '';
      default:
        return '';
    }
  };

  const handleExport = async () => {
    if (selectedColumns.length === 0) {
      toast({
        title: 'Selecione ao menos uma coluna',
        description: 'É necessário selecionar pelo menos uma coluna para exportar.',
        variant: 'destructive',
      });
      return;
    }

    setIsExporting(true);

    try {
      // Build data
      const headers = selectedColumns.map(key => {
        const col = EXPORT_COLUMNS.find(c => c.key === key);
        return col?.label || key;
      });

      const data = contacts.map(contact => {
        return selectedColumns.map(key => formatValue(contact, key));
      });

      // Create workbook
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);

      // Auto-size columns
      const colWidths = headers.map((header, i) => {
        const maxDataLength = Math.max(
          header.length,
          ...data.map(row => String(row[i]).length)
        );
        return { wch: Math.min(maxDataLength + 2, 50) };
      });
      worksheet['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Contatos');

      // Export
      const fileName = `contatos_${new Date().toISOString().split('T')[0]}`;
      if (format === 'xlsx') {
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
      } else {
        XLSX.writeFile(workbook, `${fileName}.csv`, { bookType: 'csv' });
      }

      toast({
        title: 'Exportação concluída!',
        description: `${contacts.length} contato(s) exportado(s) com sucesso.`,
      });

      onClose();
    } catch (error) {
      toast({
        title: 'Erro na exportação',
        description: 'Não foi possível exportar os contatos. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Exportar Contatos
          </DialogTitle>
          <DialogDescription>
            Selecione as colunas e o formato para exportar {contacts.length} contato(s).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden space-y-6">
          {/* Format Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Formato do arquivo</Label>
            <RadioGroup
              value={format}
              onValueChange={(value) => setFormat(value as ExportFormat)}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="xlsx" id="xlsx" />
                <Label htmlFor="xlsx" className="flex items-center gap-2 cursor-pointer">
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  Excel (.xlsx)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="flex items-center gap-2 cursor-pointer">
                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                  CSV (.csv)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Column Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Colunas a exportar</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll}>
                  Todas
                </Button>
                <Button variant="ghost" size="sm" onClick={selectNone}>
                  Mínimo
                </Button>
              </div>
            </div>
            
            <ScrollArea className="h-[200px] pr-4">
              <div className="space-y-2">
                {EXPORT_COLUMNS.map((column) => (
                  <div
                    key={column.key}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      id={column.key}
                      checked={selectedColumns.includes(column.key)}
                      onCheckedChange={() => handleColumnToggle(column.key)}
                      disabled={column.key === 'name' || column.key === 'phone'}
                    />
                    <Label
                      htmlFor={column.key}
                      className="flex-1 cursor-pointer text-sm"
                    >
                      {column.label}
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={isExporting || selectedColumns.length === 0}>
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Exportar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
