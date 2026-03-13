import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
import { Upload, FileSpreadsheet, Check, AlertCircle, Loader2, X, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CHANNEL_INFO, type ClientType } from '@/types/solarzap';
import { resolveImportedPipelineStage } from '@/lib/leadStageNormalization';
import { resolveImportedClientType } from '@/utils/importClientType';
import type { ImportLeadsSummary } from '@/lib/importLeadsSummary';
import { useAuth } from '@/contexts/AuthContext';
import { listMembers, type MemberDto } from '@/lib/orgAdminClient';
import { getMemberDisplayName } from '@/lib/memberDisplayName';

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
  status_pipeline_code?: string;
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
  assigned_to_user_id?: string;
  tipo_cliente_default?: ClientType;
}

// Database columns that can be mapped - labels must match ExportContactsModal exactly
const DB_COLUMNS = [
  { key: 'nome', label: 'Nome', required: true },
  { key: 'telefone', label: 'Telefone', required: true },
  { key: 'email', label: 'E-mail', required: false },
  { key: 'empresa', label: 'Empresa', required: false },
  { key: 'tipo_cliente', label: 'Tipo de Cliente', required: false },
  { key: 'status_pipeline', label: 'Etapa do Pipeline', required: false },
  { key: 'status_pipeline_code', label: 'Etapa do Pipeline (Código)', required: false },
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

const CLIENT_TYPE_OPTIONS: Array<{ value: ClientType; label: string }> = [
  { value: 'residencial', label: 'Residencial' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'rural', label: 'Rural' },
  { value: 'usina', label: 'Usina' },
];

const normalizeHeaderToken = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'result';

export function ImportContactsModal({ isOpen, onClose, onImport }: ImportContactsModalProps) {
  const { user, orgId } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [fileData, setFileData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportLeadsSummary | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>('cold_list'); // Default for imports
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('');
  const [defaultClientType, setDefaultClientType] = useState<ClientType>('residencial');
  const [members, setMembers] = useState<MemberDto[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [membersLoadError, setMembersLoadError] = useState<string | null>(null);
  const membersRequestRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const fallbackAssigneeId = user?.id || '';

  const selectedAssigneeLabel = useMemo(() => {
    const selectedMember = members.find((member) => member.user_id === selectedAssigneeId);
    if (selectedMember) return getMemberDisplayName(selectedMember);
    if (selectedAssigneeId && selectedAssigneeId === user?.id) {
      return user?.email || 'Usuário atual';
    }
    return 'Não definido';
  }, [members, selectedAssigneeId, user?.email, user?.id]);

  const resetState = useCallback(() => {
    setStep('upload');
    setFileData([]);
    setHeaders([]);
    setColumnMapping({});
    setFileName('');
    setIsImporting(false);
    setImportSummary(null);
    setSelectedSource('cold_list');
    setSelectedAssigneeId(fallbackAssigneeId);
    setDefaultClientType('residencial');
    setMembers([]);
    setIsLoadingMembers(false);
    setMembersLoadError(null);
  }, [fallbackAssigneeId]);

  const loadMembers = useCallback(async () => {
    if (!isOpen) return;

    membersRequestRef.current += 1;
    const currentRequestId = membersRequestRef.current;
    setIsLoadingMembers(true);
    setMembersLoadError(null);

    const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('members_timeout')), timeoutMs);
          }),
        ]);
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    };

    try {
      let response: { members: MemberDto[] };
      try {
        response = await withTimeout(listMembers(orgId ?? undefined), 7_000);
      } catch (primaryError) {
        console.warn('Primary members load failed, retrying with forced refresh...', primaryError);
        response = await withTimeout(listMembers(orgId ?? undefined, { forceRefresh: true }), 10_000);
      }

      if (!response.members?.length) {
        console.warn('No members from org scope. Retrying with active org context...');
        response = await withTimeout(listMembers(undefined, { forceRefresh: true }), 10_000);
      }

      if (membersRequestRef.current !== currentRequestId) return;

      const nextMembers = response.members || [];
      setMembers(nextMembers);

      if (nextMembers.length < 1) {
        setSelectedAssigneeId(fallbackAssigneeId);
        setMembersLoadError('Nenhum membro encontrado para esta organização.');
        return;
      }

      const preferred = nextMembers.find((member) => member.user_id === user?.id);
      setSelectedAssigneeId((current) => {
        if (current && nextMembers.some((member) => member.user_id === current)) return current;
        return preferred?.user_id || nextMembers[0].user_id;
      });
    } catch (error) {
      console.warn('Failed to load members for contact import:', error);
      if (membersRequestRef.current !== currentRequestId) return;

      setMembers([]);
      setSelectedAssigneeId(fallbackAssigneeId);
      setMembersLoadError('Não foi possível carregar os membros agora.');
    } finally {
      if (membersRequestRef.current === currentRequestId) {
        setIsLoadingMembers(false);
      }
    }
  }, [fallbackAssigneeId, isOpen, orgId, user?.id]);

  useEffect(() => {
    if (!isOpen) return;
    void loadMembers();
  }, [isOpen, loadMembers]);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const MAX_ROWS = 1000;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'Arquivo muito grande',
        description: `O arquivo excede o limite de 5MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
        variant: 'destructive',
      });
      return;
    }

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

        if (rows.length > MAX_ROWS) {
          toast({
            title: 'Arquivo com muitas linhas',
            description: `O arquivo tem ${rows.length} linhas. O limite é de ${MAX_ROWS} registros por importação.`,
            variant: 'destructive',
          });
          return;
        }

        setHeaders(fileHeaders);
        setFileData(rows);

        // Auto-map columns based on similar names
        const autoMapping: Record<string, string> = {};
        fileHeaders.forEach((header) => {
          const headerLower = normalizeHeaderToken(header);
          const headerKey = headerLower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

          for (const col of DB_COLUMNS) {
            const colLower = normalizeHeaderToken(col.label);
            const keyLower = col.key.toLowerCase();

            if (
              headerLower.includes(colLower) ||
              colLower.includes(headerLower) ||
              headerLower.includes(keyLower) ||
              headerKey.includes(keyLower) ||
              headerKey === keyLower ||
              headerLower === colLower ||
              // Common variations
              (col.key === 'nome' && (headerLower.includes('name') || headerLower.includes('cliente'))) ||
              (col.key === 'telefone' && (headerLower.includes('phone') || headerLower.includes('cel') || headerLower.includes('fone'))) ||
              (col.key === 'email' && headerLower.includes('mail')) ||
              (col.key === 'empresa' && (headerLower.includes('company') || headerLower.includes('empresa'))) ||
              (col.key === 'status_pipeline_code' && (
                (headerLower.includes('etapa') && headerLower.includes('codigo')) ||
                (headerLower.includes('pipeline') && headerLower.includes('codigo')) ||
                headerKey.includes('stage_code') ||
                headerKey.includes('pipeline_stage') ||
                headerKey.includes('status_pipeline_code')
              )) ||
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
    const mapped = fileData.map(row => {
      const contact: Record<string, any> = {};
      let hasMappedValue = false;

      headers.forEach((header, index) => {
        const dbColumn = columnMapping[header];
        if (dbColumn) {
          const rawValue = row[index];
          const rawText = String(rawValue || '').trim();
          if (rawText) {
            hasMappedValue = true;
          }

          // Convert numeric fields
          if (dbColumn === 'consumo_kwh' || dbColumn === 'valor_estimado') {
            contact[dbColumn] = parseFloat(String(rawValue).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
          } else if (dbColumn === 'telefone') {
            // Sanitize phone: strip non-digits and auto-prepend 55 for BR numbers
            let cleanPhone = String(rawValue || '').replace(/\D/g, '');
            if ((cleanPhone.length === 10 || cleanPhone.length === 11) && !cleanPhone.startsWith('55')) {
              cleanPhone = '55' + cleanPhone;
            }
            contact[dbColumn] = cleanPhone;
          } else if (dbColumn === 'status_pipeline' || dbColumn === 'status_pipeline_code') {
            contact[dbColumn] = String(rawValue || '').trim();
          } else if (dbColumn !== 'canal') { // Don't map canal from CSV, use the global selector
            contact[dbColumn] = String(rawValue || '').trim();
          }
        }
      });

      if (!hasMappedValue) {
        return null;
      }

      // Apply the global source selected by the user
      contact['canal'] = selectedSource;
      contact['status_pipeline'] = resolveImportedPipelineStage({
        statusPipeline: contact.status_pipeline,
        statusPipelineCode: contact.status_pipeline_code,
      });
      contact['tipo_cliente_default'] = defaultClientType;

      const resolvedClientType = resolveImportedClientType({
        rowClientType: contact.tipo_cliente,
        defaultClientType,
      });
      if (resolvedClientType) {
        contact['tipo_cliente'] = resolvedClientType;
      } else {
        delete contact['tipo_cliente'];
      }

      const assigneeId = (selectedAssigneeId || fallbackAssigneeId).trim();
      if (assigneeId) {
        contact['assigned_to_user_id'] = assigneeId;
      }

      return contact as ImportedContact;
    }).filter((contact): contact is ImportedContact => Boolean(contact));

    // Deduplicate by phone number within the import file
    const seen = new Set<string>();
    return mapped.filter(c => {
      const phone = String(c.telefone || '').replace(/\D/g, '');
      if (!phone) return true;
      if (seen.has(phone)) return false;
      seen.add(phone);
      return true;
    });
  };

  const requiredFieldsMapped = () => {
    const mappedValues = Object.values(columnMapping);
    return mappedValues.includes('nome') && mappedValues.includes('telefone');
  };

  const coerceImportSummary = (value: unknown): ImportLeadsSummary => {
    if (!value || typeof value !== 'object') {
      return { inserted_count: 0, updated_count: 0, failed_count: 0, failures: [] };
    }
    const obj = value as Partial<ImportLeadsSummary>;
    return {
      inserted_count: Number(obj.inserted_count || 0),
      updated_count: Number(obj.updated_count || 0),
      failed_count: Number(obj.failed_count || 0),
      failures: Array.isArray(obj.failures)
        ? obj.failures.map((failure) => ({
          row_index: Number((failure as any)?.row_index || 0),
          message: String((failure as any)?.message || 'Erro desconhecido'),
        }))
        : [],
    };
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
      const summary = coerceImportSummary(await onImport(contacts));
      setImportSummary(summary);
      setStep('result');

      if (summary.failed_count > 0 && (summary.inserted_count + summary.updated_count) > 0) {
        toast({
          title: 'Importação concluída com ressalvas',
          description: `${summary.inserted_count} inserido(s), ${summary.updated_count} atualizado(s), ${summary.failed_count} falha(s).`,
        });
      } else if (summary.failed_count > 0) {
        toast({
          title: 'Importação finalizada sem sucesso',
          description: `${summary.failed_count} linha(s) falharam. Veja o relatório no modal.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Importação concluída!',
          description: `${summary.inserted_count} inserido(s) e ${summary.updated_count} atualizado(s).`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível importar os contatos. Tente novamente.';
      toast({
        title: 'Erro na importação',
        description: message,
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
            {step === 'result' && 'Resultado da importação.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-6 py-4">
              <div className="rounded-xl border bg-muted/20 p-4 md:p-5 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="import-source">Origem da lista (obrigatório)</Label>
                    <Select value={selectedSource} onValueChange={setSelectedSource}>
                      <SelectTrigger id="import-source">
                        <SelectValue placeholder="Selecione a origem dos leads" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CHANNEL_INFO).map(([key, info]) => (
                          <SelectItem key={key} value={key}>
                            {info.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Esta origem será aplicada a todos os contatos importados desta lista.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="import-assignee">Responsável</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => void loadMembers()}
                        disabled={isLoadingMembers}
                      >
                        {isLoadingMembers ? (
                          <>
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            Atualizando...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-1 h-3.5 w-3.5" />
                            Recarregar
                          </>
                        )}
                      </Button>
                    </div>

                    <Select
                      value={selectedAssigneeId}
                      onValueChange={setSelectedAssigneeId}
                      disabled={isLoadingMembers && members.length < 1 && !fallbackAssigneeId}
                    >
                      <SelectTrigger id="import-assignee">
                        <SelectValue
                          placeholder={
                            isLoadingMembers
                              ? 'Carregando membros...'
                              : 'Selecione o responsável'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            {getMemberDisplayName(member)}
                          </SelectItem>
                        ))}
                        {members.length < 1 && fallbackAssigneeId && (
                          <SelectItem value={fallbackAssigneeId}>
                            {user?.email || 'Usuário atual'}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Leads novos e existentes terão o responsável sobrescrito.
                    </p>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="import-client-type">Tipo de projeto</Label>
                    <Select
                      value={defaultClientType}
                      onValueChange={(value) => setDefaultClientType(value as ClientType)}
                    >
                      <SelectTrigger id="import-client-type">
                        <SelectValue placeholder="Selecione o tipo de projeto" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIENT_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      O tipo da linha no arquivo tem prioridade sobre este valor padrão.
                    </p>
                  </div>
                </div>

                {membersLoadError && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {membersLoadError} Se necessário, recarregue os membros antes de importar.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Origem: {CHANNEL_INFO[selectedSource]?.label || selectedSource}</Badge>
                  <Badge variant="secondary">Responsável: {selectedAssigneeLabel}</Badge>
                  <Badge variant="secondary">
                    Tipo de projeto: {CLIENT_TYPE_OPTIONS.find((option) => option.value === defaultClientType)?.label || 'Residencial'}
                  </Badge>
                </div>
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
                className="w-full border-2 border-dashed border-muted-foreground/30 rounded-xl p-10 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors text-center group"
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
                                <span className="text-muted-foreground">- Ignorar -</span>
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
                        <div>Telefone: {contact.telefone}</div>
                        {contact.email && <div>E-mail: {contact.email}</div>}
                        {contact.empresa && <div>Empresa: {contact.empresa}</div>}
                        {contact.cidade && <div>Cidade: {contact.cidade}</div>}
                        {contact.consumo_kwh && <div>Consumo: {contact.consumo_kwh} kWh</div>}
                        {contact.valor_estimado && <div>Valor: R$ {contact.valor_estimado.toLocaleString('pt-BR')}</div>}
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

          {/* Step 5: Result */}
          {step === 'result' && importSummary && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Inseridos</div>
                  <div className="text-2xl font-semibold">{importSummary.inserted_count}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Atualizados</div>
                  <div className="text-2xl font-semibold">{importSummary.updated_count}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Falhas</div>
                  <div className="text-2xl font-semibold">{importSummary.failed_count}</div>
                </div>
              </div>

              {importSummary.failed_count > 0 && (
                <div className="rounded-lg border border-destructive/30 p-3">
                  <div className="text-sm font-medium mb-2">Linhas com falha</div>
                  <ScrollArea className="h-[180px]">
                    <div className="space-y-2 text-sm">
                      {importSummary.failures.map((failure) => (
                        <div key={`${failure.row_index}-${failure.message}`} className="rounded-md bg-destructive/5 p-2">
                          <span className="font-medium">Linha {failure.row_index}:</span>{' '}
                          <span className="text-muted-foreground">{failure.message}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
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

          {step === 'result' && (
            <Button onClick={handleClose}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
