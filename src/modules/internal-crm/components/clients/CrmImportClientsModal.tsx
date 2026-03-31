import { useState, useRef, useCallback } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Upload, FileSpreadsheet, Check, AlertCircle, Loader2, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

const CRM_DB_COLUMNS = [
  { key: 'company_name', label: 'Empresa', required: true },
  { key: 'primary_contact_name', label: 'Nome do Contato', required: false },
  { key: 'primary_phone', label: 'Telefone', required: false },
  { key: 'primary_email', label: 'E-mail', required: false },
  { key: 'source_channel', label: 'Origem', required: false },
  { key: 'notes', label: 'Observações', required: false },
];

const normalizeHeaderToken = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const HEADER_ALIASES: Record<string, string> = {
  empresa: 'company_name',
  company: 'company_name',
  nome: 'primary_contact_name',
  name: 'primary_contact_name',
  contato: 'primary_contact_name',
  telefone: 'primary_phone',
  phone: 'primary_phone',
  celular: 'primary_phone',
  email: 'primary_email',
  'e-mail': 'primary_email',
  origem: 'source_channel',
  canal: 'source_channel',
  source: 'source_channel',
  observacoes: 'notes',
  notas: 'notes',
  notes: 'notes',
};

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'result';

type CrmImportClientsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onImport: (client: Record<string, string>) => Promise<void>;
};

export function CrmImportClientsModal({ isOpen, onClose, onImport }: CrmImportClientsModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [fileData, setFileData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState('');
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importSuccess, setImportSuccess] = useState(0);
  const [importFailed, setImportFailed] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const resetState = useCallback(() => {
    setStep('upload');
    setFileData([]);
    setHeaders([]);
    setColumnMapping({});
    setFileName('');
    setImportProgress(0);
    setImportTotal(0);
    setImportSuccess(0);
    setImportFailed(0);
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: string[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        if (rows.length < 2) {
          toast({ title: 'Arquivo vazio', description: 'O arquivo precisa ter pelo menos 2 linhas.', variant: 'destructive' });
          return;
        }

        const parsedHeaders = rows[0].map((h) => String(h || '').trim());
        setHeaders(parsedHeaders);
        setFileData(rows.slice(1).filter((row) => row.some((cell) => String(cell || '').trim())));

        // Auto-map columns
        const autoMap: Record<string, string> = {};
        parsedHeaders.forEach((header, index) => {
          const token = normalizeHeaderToken(header);
          const match = HEADER_ALIASES[token];
          if (match) autoMap[match] = String(index);
        });
        setColumnMapping(autoMap);
        setStep('mapping');
      } catch {
        toast({ title: 'Erro ao ler arquivo', variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleMappingChange = (dbKey: string, headerIndex: string) => {
    setColumnMapping((prev) => ({ ...prev, [dbKey]: headerIndex }));
  };

  const previewRows = fileData.slice(0, 5);
  const hasRequiredMapping = columnMapping.company_name !== undefined;

  const handleStartImport = async () => {
    setStep('importing');
    setImportTotal(fileData.length);
    let success = 0;
    let failed = 0;

    for (let i = 0; i < fileData.length; i++) {
      const row = fileData[i];
      const record: Record<string, string> = {};
      for (const col of CRM_DB_COLUMNS) {
        const colIndex = columnMapping[col.key];
        if (colIndex !== undefined) {
          record[col.key] = String(row[Number(colIndex)] || '').trim();
        }
      }

      if (!record.company_name) {
        failed++;
        setImportProgress(i + 1);
        setImportFailed(failed);
        continue;
      }

      try {
        await onImport(record);
        success++;
      } catch {
        failed++;
      }
      setImportProgress(i + 1);
      setImportSuccess(success);
      setImportFailed(failed);
    }

    setStep('result');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Importar Clientes
          </DialogTitle>
          <DialogDescription>
            Importe clientes via planilha Excel ou CSV.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
            <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
              <FileSpreadsheet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground mb-4">Arraste um arquivo ou clique para selecionar</p>
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Selecionar Arquivo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>
        )}

        {step === 'mapping' && (
          <div className="flex-1 space-y-4 overflow-y-auto">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="w-4 h-4" />
              <span>{fileName} — {fileData.length} linhas</span>
            </div>

            <div className="space-y-3">
              {CRM_DB_COLUMNS.map((col) => (
                <div key={col.key} className="flex items-center gap-3">
                  <Label className="w-40 text-sm">
                    {col.label}
                    {col.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Select
                    value={columnMapping[col.key] ?? '__none__'}
                    onValueChange={(v) => handleMappingChange(col.key, v === '__none__' ? undefined! : v)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Não mapear" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Não mapear</SelectItem>
                      {headers.map((header, index) => (
                        <SelectItem key={index} value={String(index)}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {previewRows.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Preview (primeiras 5 linhas):</p>
                <ScrollArea className="max-h-32">
                  <div className="text-xs space-y-1">
                    {previewRows.map((row, i) => {
                      const company = columnMapping.company_name !== undefined ? row[Number(columnMapping.company_name)] : '';
                      const name = columnMapping.primary_contact_name !== undefined ? row[Number(columnMapping.primary_contact_name)] : '';
                      const phone = columnMapping.primary_phone !== undefined ? row[Number(columnMapping.primary_phone)] : '';
                      return (
                        <div key={i} className="flex gap-2 text-muted-foreground">
                          <Badge variant="outline" className="text-[10px]">{i + 1}</Badge>
                          <span>{company || '-'}</span>
                          <span className="text-foreground/60">•</span>
                          <span>{name || '-'}</span>
                          <span className="text-foreground/60">•</span>
                          <span>{phone || '-'}</span>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button disabled={!hasRequiredMapping} onClick={() => void handleStartImport()}>
                Importar {fileData.length} clientes
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'importing' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Importando {importProgress} de {importTotal}...</p>
            <Progress value={(importProgress / Math.max(importTotal, 1)) * 100} className="w-64" />
          </div>
        )}

        {step === 'result' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
            <Check className="w-12 h-12 text-green-500" />
            <p className="text-lg font-semibold">Importação concluída!</p>
            <div className="flex gap-4 text-sm">
              <span className="text-green-600">{importSuccess} importados</span>
              {importFailed > 0 && <span className="text-destructive">{importFailed} falharam</span>}
            </div>
            <Button onClick={handleClose}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
