import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Plus, Trash2, Loader2, Sparkles } from 'lucide-react';
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
import type { BroadcastCampaignInput, BroadcastRecipientInput } from '@/hooks/useBroadcasts';
import type { UserWhatsAppInstance } from '@/hooks/useUserWhatsAppInstances';
import { CHANNEL_INFO, type Channel } from '@/types/solarzap';
import { parseContactsFile, type ImportedContactRow } from '@/utils/contactsImport';

interface BroadcastCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  instances: UserWhatsAppInstance[];
  onSubmit: (input: BroadcastCampaignInput, autoStart: boolean) => Promise<void>;
}

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<Step, string> = {
  1: 'Configuracao',
  2: 'Upload',
  3: 'Mensagens',
  4: 'Timer',
  5: 'Preview',
};

const DEFAULT_MESSAGES = [''];

const clampTimer = (value: number): number => {
  if (!Number.isFinite(value)) return 15;
  return Math.min(120, Math.max(10, Math.round(value)));
};

export function BroadcastCampaignModal({ isOpen, onClose, instances, onSubmit }: BroadcastCampaignModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const connectedInstances = useMemo(
    () => instances.filter((instance) => instance.status === 'connected' && instance.is_active),
    [instances],
  );

  const [step, setStep] = useState<Step>(1);
  const [campaignName, setCampaignName] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [sourceChannel, setSourceChannel] = useState<Channel>('cold_list');
  const [messages, setMessages] = useState<string[]>(DEFAULT_MESSAGES);
  const [timerSeconds, setTimerSeconds] = useState(15);
  const [contacts, setContacts] = useState<ImportedContactRow[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [invalidRows, setInvalidRows] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (instanceName) return;
    const preferred = connectedInstances[0]?.instance_name;
    if (preferred) {
      setInstanceName(preferred);
    }
  }, [connectedInstances, instanceName, isOpen]);

  const resetState = () => {
    setStep(1);
    setCampaignName('');
    setInstanceName('');
    setSourceChannel('cold_list');
    setMessages(DEFAULT_MESSAGES);
    setTimerSeconds(15);
    setContacts([]);
    setUploadedFileName('');
    setInvalidRows(0);
    setIsSubmitting(false);
    setIsParsing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
      if (contacts.length < 1) {
        toast({ title: 'Importe pelo menos 1 contato valido', variant: 'destructive' });
        return false;
      }
    }

    if (step === 3) {
      if (parseMessages().length < 1) {
        toast({ title: 'Inclua ao menos 1 mensagem para o disparo', variant: 'destructive' });
        return false;
      }
    }

    if (step === 4) {
      if (clampTimer(timerSeconds) < 10) {
        toast({ title: 'O timer minimo e 10 segundos', variant: 'destructive' });
        return false;
      }
    }

    return true;
  };

  const goNext = () => {
    const next = Math.min(5, step + 1) as Step;
    if (!canProceedStep(next)) return;
    setStep(next);
  };

  const goBack = () => {
    const previous = Math.max(1, step - 1) as Step;
    setStep(previous);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);

    try {
      const parsed = await parseContactsFile(file);
      setUploadedFileName(parsed.fileName);
      setContacts(parsed.contacts);
      setInvalidRows(parsed.invalidRows);

      toast({
        title: 'Arquivo processado',
        description: `${parsed.contacts.length} contato(s) valido(s) carregado(s).`,
      });
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Falha ao processar arquivo';
      toast({ title: 'Erro no upload', description: message, variant: 'destructive' });
      setUploadedFileName('');
      setContacts([]);
      setInvalidRows(0);
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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

    if (contacts.length < 1) {
      toast({ title: 'Nenhum contato valido para salvar a campanha', variant: 'destructive' });
      return;
    }

    const recipients: BroadcastRecipientInput[] = contacts.map((contact) => ({
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
    }));

    setIsSubmitting(true);

    try {
      await onSubmit(
        {
          name: campaignName.trim(),
          instance_name: instanceName,
          source_channel: sourceChannel,
          messages: normalizedMessages,
          interval_seconds: clampTimer(timerSeconds),
          pipeline_stage: 'novo_lead',
          ai_enabled: true,
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

  const previewContacts = contacts.slice(0, 8);
  const completedSteps = step - 1;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Nova Campanha de Disparo</DialogTitle>
          <DialogDescription>
            Etapa {step} de 5: {STEP_LABELS[step]}
          </DialogDescription>
          <div className="flex items-center gap-2 pt-2">
            {([1, 2, 3, 4, 5] as Step[]).map((stepNumber) => (
              <div
                key={stepNumber}
                className={`h-1.5 flex-1 rounded-full ${stepNumber <= completedSteps + 1 ? 'bg-primary' : 'bg-muted'}`}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Nome da campanha</Label>
                <Input
                  id="campaign-name"
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                  placeholder="Ex.: Lista Fria Zona Sul"
                />
              </div>

              <div className="space-y-2">
                <Label>Instancia WhatsApp</Label>
                <Select value={instanceName} onValueChange={setInstanceName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma instancia conectada" />
                  </SelectTrigger>
                  <SelectContent>
                    {connectedInstances.map((instance) => (
                      <SelectItem key={instance.id} value={instance.instance_name}>
                        {instance.display_name || instance.instance_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {connectedInstances.length === 0 && (
                  <p className="text-xs text-destructive">Nenhuma instancia conectada encontrada.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Origem dos leads</Label>
                <Select value={sourceChannel} onValueChange={(value) => setSourceChannel(value as Channel)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a origem" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHANNEL_INFO).map(([value, info]) => (
                      <SelectItem key={value} value={value}>
                        {info.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />

              <button
                type="button"
                className="w-full border-2 border-dashed border-muted-foreground/30 rounded-xl p-10 hover:border-primary/50 hover:bg-muted/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing}
              >
                <div className="flex flex-col items-center gap-3 text-center">
                  {isParsing ? (
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  ) : (
                    <Upload className="w-10 h-10 text-muted-foreground" />
                  )}
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
                  <p className="text-xs text-muted-foreground">{contacts.length} contato(s) valido(s).</p>
                  {invalidRows > 0 && (
                    <p className="text-xs text-amber-600">{invalidRows} linha(s) ignorada(s) por falta de nome/telefone.</p>
                  )}
                </div>
              )}

              {previewContacts.length > 0 && (
                <ScrollArea className="h-[260px] border rounded-md p-3">
                  <div className="space-y-2">
                    {previewContacts.map((contact) => (
                      <div key={contact.phone} className="rounded border p-2 text-sm">
                        <p className="font-medium">{contact.name}</p>
                        <p className="text-muted-foreground">{contact.phone}</p>
                        {contact.email && <p className="text-muted-foreground">{contact.email}</p>}
                      </div>
                    ))}
                    {contacts.length > previewContacts.length && (
                      <p className="text-xs text-muted-foreground">Mostrando {previewContacts.length} de {contacts.length} contatos.</p>
                    )}
                  </div>
                </ScrollArea>
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
                    <div key={`broadcast-msg-${index}`} className="rounded-lg border p-3 space-y-2">
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={messages.length <= 1}
                          onClick={() => removeMessage(index)}
                        >
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
                <Label>Intervalo entre mensagens</Label>
                <div className="flex items-center gap-3">
                  <Slider
                    min={10}
                    max={120}
                    step={1}
                    value={[timerSeconds]}
                    onValueChange={(values) => setTimerSeconds(clampTimer(values[0] || 15))}
                  />
                  <Input
                    type="number"
                    min={10}
                    max={120}
                    className="w-28"
                    value={timerSeconds}
                    onChange={(event) => setTimerSeconds(clampTimer(Number(event.target.value)))}
                  />
                  <span className="text-sm text-muted-foreground">segundos</span>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Randomizacao anti-bloqueio
                </p>
                <p className="text-muted-foreground">
                  O sistema aplica variacao automatica de ±30% no intervalo por destinatario para reduzir padrao repetitivo.
                </p>
                <p className="text-xs text-amber-600">Timer minimo de seguranca: 10s.</p>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
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
                  <p className="font-semibold">{contacts.length}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Intervalo base</p>
                  <p className="font-semibold">{clampTimer(timerSeconds)}s (±30%)</p>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Mensagens cadastradas</p>
                <div className="space-y-2 max-h-[220px] overflow-auto pr-2">
                  {parseMessages().map((message, index) => (
                    <div key={`preview-message-${index}`} className="rounded-md bg-muted/40 p-2 text-sm whitespace-pre-wrap">
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
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => void handleSubmit(false)}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar rascunho'}
              </Button>
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleSubmit(true)}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Salvar e iniciar disparo'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
