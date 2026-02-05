import React, { useState, useRef, useCallback } from 'react';
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
import { Upload, FileSpreadsheet, Check, AlertCircle, Loader2, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CHANNEL_INFO } from '@/types/solarzap';

interface ImportContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (contacts: ImportedContact[]) => Promise<unknown>;
}

export interface ImportedContact {
  nome: string;
  telefone: string;
  email?: string;
  empresa?: string;
  tipo_cliente?: string;
  status_pipeline?: string;
  canal?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  consumo_kwh?: number;
  valor_estimado?: number;
  created_at?: string;
  last_contact?: string;
  observacoes?: string;
  cpf_cnpj?: string;
}

// Database columns that can be mapped - labels must match ExportContactsModal exactly
const DB_COLUMNS = [
  { key: 'nome', label: 'Nome', required: true },
  { key: 'telefone', label: 'Telefone', required: true },
  { key: 'email', label: 'E-mail', required: false },
  { key: 'empresa', label: 'Empresa', required: false },
  { key: 'tipo_cliente', label: 'Tipo de Cliente', required: false },
  { key: 'status_pipeline', label: 'Etapa do Pipeline', required: false },
  // Canal is handled globally
  { key: 'endereco', label: 'Endereço', required: false },
  { key: 'cidade', label: 'Cidade', required: false },
  { key: 'estado', label: 'Estado', required: false },
  { key: 'cpf_cnpj', label: 'CPF/CNPJ', required: false },
  { key: 'consumo_kwh', label: 'Consumo (kWh)', required: false },
  { key: 'valor_estimado', label: 'Valor do Projeto', required: false },
  { key: 'created_at', label: 'Data de Cadastro', required: false },
  { key: 'last_contact', label: 'Último Contato', required: false },
  { key: 'observacoes', label: 'Observações', required: false },
];

type Step = 'upload' | 'mapping' | 'preview' | 'importing';

export function ImportContactsModal({ isOpen, onClose, onImport }: ImportContactsModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [fileData, setFileData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string>('cold_list'); // Default for imports
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const resetState = useCallback(() => {
    setStep('upload');
    setFileData([]);
    setHeaders([]);
    setColumnMapping({});
    setFileName('');
    setIsImporting(false);
    setSelectedSource('cold_list');
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];

        if (jsonData.length < 2) {
          toast({
            title: 'Arquivo vazio',
            description: 'O arquivo precisa ter pelo menos uma linha de cabeçalho e uma de dados.',
            variant: 'destructive',
          });
          return;
        }

        const fileHeaders = jsonData[0].map(h => String(h || '').trim());
        const rows = jsonData.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ''));

        setHeaders(fileHeaders);
        setFileData(rows);

        // Auto-map columns based on similar names
        const autoMapping: Record<string, string> = {};
        fileHeaders.forEach((header) => {
          const headerLower = header.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

          for (const col of DB_COLUMNS) {
            const colLower = col.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const keyLower = col.key.toLowerCase();

            if (
              headerLower.includes(colLower) ||
              colLower.includes(headerLower) ||
              headerLower.includes(keyLower) ||
              headerLower === colLower ||
              // Common variations
              (col.key === 'nome' && (headerLower.includes('name') || headerLower.includes('cliente'))) ||
              (col.key === 'telefone' && (headerLower.includes('phone') || headerLower.includes('cel') || headerLower.includes('fone'))) ||
              (col.key === 'email' && headerLower.includes('mail')) ||
              (col.key === 'empresa' && (headerLower.includes('company') || headerLower.includes('empresa'))) ||
              (col.key === 'cidade' && headerLower.includes('city')) ||
              (col.key === 'estado' && (headerLower.includes('state') || headerLower.includes('uf'))) ||
              (col.key === 'endereco' && (headerLower.includes('address') || headerLower.includes('logradouro') || headerLower.includes('rua')))
            ) {
              if (!Object.values(autoMapping).includes(col.key)) {
                autoMapping[header] = col.key;
                break;
              }
            }
          }
        });

        setColumnMapping(autoMapping);
        setStep('mapping');
      } catch (error) {
        toast({
          title: 'Erro ao ler arquivo',
          description: 'Não foi possível processar o arquivo. Verifique se é um CSV ou XLSX válido.',
          variant: 'destructive',
        });
      }
    };

    reader.readAsBinaryString(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleMappingChange = (fileColumn: string, dbColumn: string) => {
    setColumnMapping(prev => {
      const newMapping = { ...prev };

      // Remove previous mapping to this db column
      Object.keys(newMapping).forEach(key => {
        if (newMapping[key] === dbColumn) {
          delete newMapping[key];
        }
      });

      if (dbColumn === '_ignore') {
        delete newMapping[fileColumn];
      } else {
        newMapping[fileColumn] = dbColumn;
      }

      return newMapping;
    });
  };

  const getMappedContacts = (): ImportedContact[] => {
    return fileData.map(row => {
      const contact: Record<string, any> = {};

      headers.forEach((header, index) => {
        const dbColumn = columnMapping[header];
        if (dbColumn) {
          const rawValue = row[index];

          // Convert numeric fields
          if (dbColumn === 'consumo_kwh' || dbColumn === 'valor_estimado') {
            contact[dbColumn] = parseFloat(String(rawValue).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
            // Auto-prepend 55 if likely BR number (10 or 11 digits) and missing it
            if ((cleanPhone.length === 10 || cleanPhone.length === 11) && !cleanPhone.startsWith('55')) {
              cleanPhone = '55' + cleanPhone;
            }
            contact[dbColumn] = cleanPhone;
          } else if (dbColumn !== 'canal') { // Don't map canal from CSV, use the global selector
            contact[dbColumn] = String(rawValue || '').trim();
          }
        }
      });

      // Apply the global source selected by the user
      contact['canal'] = selectedSource;

      return contact as ImportedContact;
    }).filter(c => c.nome && c.telefone); // Only include contacts with required fields
  };

  const requiredFieldsMapped = () => {
    const mappedValues = Object.values(columnMapping);
    return mappedValues.includes('nome') && mappedValues.includes('telefone');
  };

  const handleImport = async () => {
    const contacts = getMappedContacts();

    if (contacts.length === 0) {
      toast({
        title: 'Nenhum contato válido',
        description: 'Não há contatos com nome e telefone preenchidos.',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);
    setStep('importing');

    try {
      await onImport(contacts);
      toast({
        title: 'Importação concluída!',
        description: `${contacts.length} contato(s) importado(s) com sucesso.`,
      });
      handleClose();
    } catch (error) {
      toast({
        title: 'Erro na importação',
        description: 'Não foi possível importar os contatos. Tente novamente.',
        variant: 'destructive',
      });
      setStep('preview');
    } finally {
      setIsImporting(false);
    }
  };

  const previewContacts = getMappedContacts().slice(0, 5);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Importar Contatos
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Selecione um arquivo CSV ou XLSX para importar seus contatos.'}
            {step === 'mapping' && 'Correlacione as colunas do arquivo com os campos do sistema.'}
            {step === 'preview' && 'Confira a prévia dos dados antes de importar.'}
            {step === 'importing' && 'Importando contatos...'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="flex flex-col items-center justify-center py-6 space-y-6">
              <div className="w-full max-w-sm space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Origem da Lista (Obrigatório)
                </label>
                <Select
                  value={selectedSource}
                  onValueChange={setSelectedSource}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a origem dos leads" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHANNEL_INFO).map(([key, info]) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          {info.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Esta origem será aplicada a todos os contatos importados desta lista.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-lg border-2 border-dashed border-muted-foreground/30 rounded-xl p-12 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors text-center group"
              >
                <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-muted-foreground group-hover:text-primary transition-colors" />
                <p className="text-lg font-medium mb-2">Clique para selecionar arquivo</p>
                <p className="text-sm text-muted-foreground">ou arraste e solte aqui</p>
                <p className="text-xs text-muted-foreground mt-4">Formatos aceitos: CSV, XLSX, XLS</p>
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4 p-3 bg-muted rounded-lg">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                <span className="font-medium">{fileName}</span>
                <Badge variant="secondary">{fileData.length} linhas</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep('upload')}
                  className="ml-auto"
                >
                  <X className="w-4 h-4 mr-1" />
                  Trocar arquivo
                </Button>
              </div>

              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-4 px-2 py-1 text-sm font-medium text-muted-foreground">
                  <span>Coluna do Arquivo</span>
                  <span>Campo do Sistema</span>
                </div>

                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-2">
                    {headers.map((header) => (
                      <div key={header} className="grid grid-cols-2 gap-4 items-center p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{header}</span>
                          {fileData[0] && (
                            <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                              ex: {fileData[0][headers.indexOf(header)]}
                            </span>
                          )}
                        </div>
                        <Select
                          value={columnMapping[header] || '_ignore'}
                          onValueChange={(value) => handleMappingChange(header, value)}
                        >
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            <SelectItem value="_ignore">
                              <span className="text-muted-foreground">— Ignorar —</span>
                            </SelectItem>
                            {DB_COLUMNS.map((col) => {
                              const isUsed = Object.values(columnMapping).includes(col.key) && columnMapping[header] !== col.key;
                              return (
                                <SelectItem key={col.key} value={col.key} disabled={isUsed}>
                                  <span className="flex items-center gap-2">
                                    {col.label}
                                    {col.required && <Badge variant="destructive" className="text-[10px] px-1 py-0">Obrigatório</Badge>}
                                    {isUsed && <span className="text-xs text-muted-foreground">(já mapeado)</span>}
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {!requiredFieldsMapped() && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Os campos <strong>Nome</strong> e <strong>Telefone</strong> são obrigatórios.</span>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Check className="w-5 h-5 text-green-500" />
                <span className="font-medium">{getMappedContacts().length} contatos prontos para importar</span>
              </div>

              <div className="text-sm text-muted-foreground mb-2">
                Prévia dos primeiros 5 registros:
              </div>

              <ScrollArea className="h-[300px]">
                <div className="space-y-3">
                  {previewContacts.map((contact, index) => (
                    <div key={index} className="p-3 rounded-lg bg-muted/30 border border-border">
                      <div className="font-medium mb-1">{contact.nome}</div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <div>📞 {contact.telefone}</div>
                        {contact.email && <div>✉️ {contact.email}</div>}
                        {contact.empresa && <div>🏢 {contact.empresa}</div>}
                        {contact.cidade && <div>📍 {contact.cidade}</div>}
                        {contact.consumo_kwh && <div>⚡ {contact.consumo_kwh} kWh</div>}
                        {contact.valor_estimado && <div>💰 R$ {contact.valor_estimado.toLocaleString('pt-BR')}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Step 4: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium">Importando contatos...</p>
              <p className="text-sm text-muted-foreground">Aguarde enquanto processamos seus dados.</p>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          )}

          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Voltar
              </Button>
              <Button
                onClick={() => setStep('preview')}
                disabled={!requiredFieldsMapped()}
              >
                Continuar
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('mapping')}>
                Voltar
              </Button>
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Importar {getMappedContacts().length} contatos
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
