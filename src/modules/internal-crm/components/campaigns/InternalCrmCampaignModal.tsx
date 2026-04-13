/**
 * InternalCrmCampaignModal - admin broadcast flow for the internal CRM.
 * Keeps CRM recipient selection and upload recipients fully isolated.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Phone, Plus, Sparkles, Trash2, Upload, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { parseContactsFile, type ImportedContactRow } from '@/utils/contactsImport';
import {
  BROADCAST_MIN_TIMER_SECONDS,
  BROADCAST_SLIDER_MAX_TIMER_SECONDS,
  clampBroadcastTimerSeconds,
  formatBroadcastInterval,
} from '@/utils/broadcastTimer';
import { CrmClientSelector } from './CrmClientSelector';

interface AdminInstance {
  id: string;
  instance_name: string;
  display_name: string;
  status: string;
  is_active: boolean;
}

interface InternalCrmCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  instances: AdminInstance[];
  onSubmit: (input: InternalCrmCampaignInput, autoStart: boolean) => Promise<void>;
}

type Step = 1 | 2 | 3 | 4 | 5;
type RecipientSource = 'upload' | 'crm';
type SelectedCrmClient = { id: string; name: string; phone: string; email?: string };
export type InternalCrmCampaignRecipientInput = {
  client_id?: string;
  name: string;
  phone: string;
  email?: string;
};
export type InternalCrmCampaignInput = {
  name: string;
  messages: string[];
  instance_name: string;
  interval_seconds?: number;
  recipients?: InternalCrmCampaignRecipientInput[];
};

const STEP_LABELS: Record<Step, string> = {
  1: 'Configuracao',
  2: 'Destinatarios',
  3: 'Mensagens',
  4: 'Timer',
  5: 'Preview',
};

const DEFAULT_MESSAGES = [''];
const PREVIEW_CONTACTS_LIMIT = 40;
const TIMER_PRESETS_SECONDS = [60, 300, 900, 3600, 86400];

export function InternalCrmCampaignModal({ isOpen, onClose, instances, onSubmit }: InternalCrmCampaignModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const connectedInstances = useMemo(
    () => instances.filter((instance) => instance.status === 'connected' && instance.is_active),
    [instances],
  );

  const [step, setStep] = useState<Step>(1);
  const [campaignName, setCampaignName] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [messages, setMessages] = useState<string[]>(DEFAULT_MESSAGES);
  const [timerSeconds, setTimerSeconds] = useState(BROADCAST_MIN_TIMER_SECONDS);
  const [uploadedContacts, setUploadedContacts] = useState<ImportedContactRow[]>([]);
  const [selectedCrmClients, setSelectedCrmClients] = useState<SelectedCrmClient[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [invalidRows, setInvalidRows] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [contactSource, setContactSource] = useState<RecipientSource>('upload');

  useEffect(() => {
    if (!isOpen || instanceName) return;
    const preferred = connectedInstances[0]?.instance_name;
    if (preferred) setInstanceName(preferred);
  }, [connectedInstances, instanceName, isOpen]);

  const crmRecipients = useMemo<ImportedContactRow[]>(
    () => selectedCrmClients.map((client) => ({ name: client.name, phone: client.phone, email: '' })),
    [selectedCrmClients],
  );
  const activeRecipients = contactSource === 'crm' ? crmRecipients : uploadedContacts;

  const resetState = () => {
    setStep(1);
    setCampaignName('');
    setInstanceName('');
    setMessages(DEFAULT_MESSAGES);
    setTimerSeconds(BROADCAST_MIN_TIMER_SECONDS);
    setUploadedContacts([]);
    setSelectedCrmClients([]);
    setUploadedFileName('');
    setInvalidRows(0);
    setIsSubmitting(false);
    setIsParsing(false);
    setContactSource('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const parseMessages = () => messages.map((message) => message.trim()).filter((message) => message.length > 0);

  const canProceedStep = (targetStep: Step): boolean => {
    if (targetStep <= step) return true;

    if (step === 1) {
      if (!campaignName.trim()) {
        toast({ title: 'Informe o nome da campanha', variant: 'destructive' });
        return false;
      }
      if (!instanceName.trim()) {
        toast({ title: 'Selecione uma instancia de WhatsApp', variant: 'destructive' });
        return false;
      }
    }

    if (step === 2) {
      if (activeRecipients.length < 1) {
        toast({
          title: contactSource === 'crm' ? 'Selecione ao menos 1 lead do CRM' : 'Importe pelo menos 1 contato valido',
          variant: 'destructive',
        });
        return false;
      }
    }

    if (step === 3 && parseMessages().length < 1) {
      toast({ title: 'Inclua ao menos 1 mensagem para o disparo', variant: 'destructive' });
      return false;
    }

    if (step === 4 && clampBroadcastTimerSeconds(timerSeconds) < BROADCAST_MIN_TIMER_SECONDS) {
      toast({ title: 'O timer minimo e 60 segundos', variant: 'destructive' });
      return false;
    }

    return true;
  };

  const goNext = () => {
    const nextStep = Math.min(5, step + 1) as Step;
    if (!canProceedStep(nextStep)) return;
    setStep(nextStep);
  };

  const goBack = () => {
    setStep(Math.max(1, step - 1) as Step);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    try {
      const parsed = await parseContactsFile(file);
      setUploadedFileName(parsed.fileName);
      setUploadedContacts(parsed.contacts);
      setInvalidRows(parsed.invalidRows);
      toast({
        title: 'Arquivo processado',
        description: `${parsed.contacts.length} contato(s) valido(s) carregado(s).`,
      });
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Falha ao processar arquivo';
      toast({ title: 'Erro no upload', description: message, variant: 'destructive' });
      setUploadedFileName('');
      setUploadedContacts([]);
      setInvalidRows(0);
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCrmSelection = useCallback((selected: SelectedCrmClient[]) => {
    setSelectedCrmClients(selected);
  }, []);

  const updateMessage = (index: number, value: string) => {
    setMessages((previous) => previous.map((current, currentIndex) => (currentIndex === index ? value : current)));
  };

  const addMessage = () => {
    setMessages((previous) => [...previous, '']);
  };

  const removeMessage = (index: number) => {
    setMessages((previous) => {
      if (previous.length <= 1) return previous;
      return previous.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const handleSubmit = async (autoStart: boolean) => {
    const normalizedMessages = parseMessages();
    if (normalizedMessages.length < 1) {
      toast({ title: 'Adicione ao menos uma mensagem', variant: 'destructive' });
      return;
    }

    if (activeRecipients.length < 1) {
      toast({ title: 'Nenhum contato valido para salvar a campanha', variant: 'destructive' });
      return;
    }

    const recipients: InternalCrmCampaignRecipientInput[] = contactSource === 'crm'
      ? selectedCrmClients.map((recipient) => ({
          client_id: recipient.id,
          name: recipient.name,
          phone: recipient.phone,
          email: recipient.email,
        }))
      : activeRecipients.map((recipient) => ({
          name: recipient.name,
          phone: recipient.phone,
          email: recipient.email,
        }));

    setIsSubmitting(true);
    try {
      await onSubmit(
        {
          name: campaignName.trim(),
          instance_name: instanceName,
          messages: normalizedMessages,
          interval_seconds: clampBroadcastTimerSeconds(timerSeconds),
          recipients,
        },
        autoStart,
      );
      handleClose();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Falha ao salvar campanha';
      toast({ title: 'Erro ao salvar campanha', description: message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const normalizedTimerSeconds = clampBroadcastTimerSeconds(timerSeconds);
  const previewContacts = activeRecipients.slice(0, PREVIEW_CONTACTS_LIMIT);
  const completedSteps = step - 1;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nova Campanha de Disparo</DialogTitle>
          <DialogDescription>
            Etapa {step} de 5: {STEP_LABELS[step]}
          </DialogDescription>
          <div className="flex items-center gap-2 pt-2">
            {([1, 2, 3, 4, 5] as Step[]).map((currentStep) => (
              <div key={currentStep} className={`h-1.5 flex-1 rounded-full ${currentStep <= completedSteps + 1 ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-green-500" />
                  Instancia de disparo
                </Label>
                <Select value={instanceName} onValueChange={setInstanceName}>
                  <SelectTrigger className="border-green-200 focus:ring-green-500">
                    <SelectValue placeholder="Selecione uma instancia conectada" />
                  </SelectTrigger>
                  <SelectContent>
                    {connectedInstances.map((instance) => (
                      <SelectItem key={instance.id} value={instance.instance_name}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                          {instance.display_name || instance.instance_name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {connectedInstances.length === 0 && (
                  <p className="text-xs text-destructive">Nenhuma instancia conectada encontrada.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-campaign-name">Nome da campanha</Label>
                <Input
                  id="admin-campaign-name"
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                  placeholder="Ex.: Reativacao leads frios"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 h-full flex flex-col min-h-0">
              <div className="flex rounded-lg border bg-muted/30 p-1 gap-1">
                <button
                  type="button"
                  className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    contactSource === 'upload' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => {
                    if (contactSource !== 'upload') {
                      setUploadedContacts([]);
                      setSelectedCrmClients([]);
                      setUploadedFileName('');
                      setInvalidRows(0);
                      setContactSource('upload');
                    }
                  }}
                >
                  <Upload className="w-4 h-4" />
                  Upload CSV/XLSX
                </button>
                <button
                  type="button"
                  className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    contactSource === 'crm' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => {
                    if (contactSource !== 'crm') {
                      setUploadedContacts([]);
                      setSelectedCrmClients([]);
                      setUploadedFileName('');
                      setInvalidRows(0);
                      setContactSource('crm');
                    }
                  }}
                >
                  <Users className="w-4 h-4" />
                  Clientes do CRM
                </button>
              </div>

              {contactSource === 'upload' && (
                <>
                  <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                  <button
                    type="button"
                    className="w-full border-2 border-dashed border-muted-foreground/30 rounded-xl p-6 hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isParsing}
                  >
                    <div className="flex flex-col items-center gap-3 text-center">
                      {isParsing ? <Loader2 className="w-8 h-8 animate-spin text-primary" /> : <Upload className="w-8 h-8 text-muted-foreground" />}
                      <div>
                        <p className="font-medium">Upload CSV/XLSX</p>
                        <p className="text-sm text-muted-foreground">Colunas esperadas: nome, telefone, email (opcional).</p>
                      </div>
                    </div>
                  </button>

                  {uploadedFileName && (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4" />
                        {uploadedFileName}
                      </p>
                      <p className="text-xs text-muted-foreground">{uploadedContacts.length} contato(s) validos.</p>
                      {invalidRows > 0 && (
                        <p className="text-xs text-amber-600">{invalidRows} linha(s) ignorada(s) por falta de nome/telefone.</p>
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-h-0 border rounded-md p-3">
                    {previewContacts.length > 0 ? (
                      <ScrollArea className="h-[320px] sm:h-[360px] lg:h-[420px] pr-2">
                        <div className="space-y-2">
                          {previewContacts.map((contact) => (
                            <div key={contact.phone} className="rounded border p-2 text-sm">
                              <p className="font-medium">{contact.name}</p>
                              <p className="text-muted-foreground">{contact.phone}</p>
                              {contact.email && <p className="text-muted-foreground">{contact.email}</p>}
                            </div>
                          ))}
                          {activeRecipients.length > previewContacts.length && (
                            <p className="text-xs text-muted-foreground">
                              Mostrando {previewContacts.length} de {activeRecipients.length} contatos.
                            </p>
                          )}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        A lista importada aparecera aqui.
                      </div>
                    )}
                  </div>
                </>
              )}

              {contactSource === 'crm' && (
                <CrmClientSelector
                  selected={selectedCrmClients}
                  onSelectionChange={handleCrmSelection}
                />
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{messages.length} variacao(oes)</Badge>
                  <p className="text-xs text-muted-foreground">Quanto mais variacoes, menor risco de bloqueio.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addMessage}>
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar mensagem
                </Button>
              </div>
              <ScrollArea className="h-[320px] pr-3">
                <div className="space-y-3">
                  {messages.map((message, index) => (
                    <div key={`admin-msg-${index}`} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Mensagem {index + 1}</span>
                        <span>{message.length} caracteres</span>
                      </div>
                      <Textarea
                        value={message}
                        onChange={(event) => updateMessage(index, event.target.value)}
                        placeholder="Escreva a mensagem que sera enviada para esse contato"
                        rows={4}
                      />
                      <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="sm" disabled={messages.length <= 1} onClick={() => removeMessage(index)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label>Intervalo entre mensagens (minimo 60s, sem limite maximo)</Label>
                <div className="flex items-center gap-3">
                  <Slider
                    min={BROADCAST_MIN_TIMER_SECONDS}
                    max={BROADCAST_SLIDER_MAX_TIMER_SECONDS}
                    step={10}
                    value={[Math.min(timerSeconds, BROADCAST_SLIDER_MAX_TIMER_SECONDS)]}
                    onValueChange={(values) => setTimerSeconds(clampBroadcastTimerSeconds(values[0] || BROADCAST_MIN_TIMER_SECONDS))}
                  />
                  <Input
                    type="number"
                    min={BROADCAST_MIN_TIMER_SECONDS}
                    className="w-28"
                    value={timerSeconds}
                    onChange={(event) => setTimerSeconds(clampBroadcastTimerSeconds(Number(event.target.value)))}
                  />
                  <span className="text-sm text-muted-foreground">segundos</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {TIMER_PRESETS_SECONDS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      variant={timerSeconds === preset ? 'default' : 'outline'}
                      onClick={() => setTimerSeconds(preset)}
                    >
                      {formatBroadcastInterval(preset)}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Intervalo atual: {formatBroadcastInterval(normalizedTimerSeconds)} ({normalizedTimerSeconds}s)
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Randomizacao anti-bloqueio
                </p>
                <p className="text-muted-foreground">
                  O sistema aplica variacao automatica de ate +/-30% no intervalo por destinatario, sempre respeitando o minimo operacional de 60 segundos.
                </p>
                <p className="text-xs text-amber-600">Timer minimo de seguranca: 60s.</p>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Campanha</p>
                  <p className="font-semibold">{campaignName || '-'}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Instancia</p>
                  <p className="font-semibold">{instanceName || '-'}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Contatos validos</p>
                  <p className="font-semibold">
                    {activeRecipients.length}
                    <span className="text-xs font-normal text-muted-foreground ml-1">
                      ({contactSource === 'crm' ? 'CRM' : 'Upload'})
                    </span>
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Intervalo base</p>
                  <p className="font-semibold">
                    {formatBroadcastInterval(normalizedTimerSeconds)} ({normalizedTimerSeconds}s, variacao de ate +/-30%)
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Mensagens cadastradas</p>
                <div className="space-y-2 max-h-[220px] overflow-auto pr-2">
                  {parseMessages().map((message, index) => (
                    <div key={`preview-msg-${index}`} className="rounded-md bg-muted/40 p-2 text-sm whitespace-pre-wrap">
                      {message}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={goBack} disabled={isSubmitting || isParsing}>
              Voltar
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting || isParsing}>
              Cancelar
            </Button>
          )}

          {step < 5 && (
            <Button type="button" onClick={goNext} disabled={isSubmitting || isParsing}>
              Continuar
            </Button>
          )}

          {step === 5 && (
            <>
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => void handleSubmit(false)}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar rascunho'}
              </Button>
              <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit(true)}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar e iniciar disparo'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
