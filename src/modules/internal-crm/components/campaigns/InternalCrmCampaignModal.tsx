import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clock, Minus, Plus, Trash2, Upload, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { parseContactsFile, type ImportedContactRow } from '@/utils/contactsImport';
import {
  BROADCAST_MIN_TIMER_SECONDS,
  BROADCAST_SLIDER_MAX_TIMER_SECONDS,
  clampBroadcastTimerSeconds,
  formatBroadcastInterval,
} from '@/utils/broadcastTimer';
import { CrmClientSelector } from '@/modules/internal-crm/components/campaigns/CrmClientSelector';
import type { InternalCrmCampaign, InternalCrmWhatsappInstance } from '@/modules/internal-crm/types';

export type InternalCrmCampaignSavePayload = {
  campaign_id?: string;
  name: string;
  whatsapp_instance_id: string | null;
  messages: string[];
  interval_seconds: number;
  recipients: Array<{
    recipient_name: string | null;
    recipient_phone: string;
    client_id?: string;
  }>;
  status: InternalCrmCampaign['status'];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instances: InternalCrmWhatsappInstance[];
  campaign: InternalCrmCampaign | null;
  isSubmitting: boolean;
  onSave: (payload: InternalCrmCampaignSavePayload) => Promise<void>;
};

type Recipient = { name: string; phone: string; clientId?: string };

const STEPS = ['Configuração', 'Destinatários', 'Mensagens', 'Timer', 'Resumo'] as const;
const TIMER_PRESETS = [
  { label: '15s', value: 15 },
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '1h', value: 3600 },
  { label: '1d', value: 86400 },
];

export function InternalCrmCampaignModal({ open, onOpenChange, instances, campaign, isSubmitting, onSave }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [instanceId, setInstanceId] = useState('none');
  const [messages, setMessages] = useState<string[]>(['']);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientMode, setRecipientMode] = useState<'upload' | 'crm'>('crm');
  const [timerSeconds, setTimerSeconds] = useState(15);
  const [uploadFileName, setUploadFileName] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setName(campaign?.name || '');
    setInstanceId(campaign?.whatsapp_instance_id || 'none');
    setMessages(campaign?.messages?.length ? [...campaign.messages] : ['']);
    setRecipients([]);
    setTimerSeconds(campaign?.interval_seconds ?? 15);
    setRecipientMode('crm');
    setUploadFileName('');
  }, [open, campaign]);

  /* --- Step 1: Config --- */
  const canAdvanceStep0 = name.trim().length > 2;

  /* --- Step 2: Recipients upload handler --- */
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await parseContactsFile(file);
      const parsed: Recipient[] = result.contacts.map((c: ImportedContactRow) => ({
        name: c.name,
        phone: c.phone,
      }));
      setRecipients(parsed);
      setUploadFileName(result.fileName);
    } catch {
      // silently ignore invalid files
    }
    e.target.value = '';
  }

  function handleCrmSelection(selected: Array<{ id: string; name: string; phone: string }>) {
    setRecipients(selected.map((s) => ({ name: s.name, phone: s.phone, clientId: s.id })));
  }

  const canAdvanceStep1 = recipients.length > 0;

  /* --- Step 3: Messages --- */
  const validMessages = messages.filter((m) => m.trim().length > 0);
  const canAdvanceStep2 = validMessages.length > 0;

  /* --- Step 4: Timer is always valid --- */

  /* --- Save --- */
  async function handleSave(startImmediately: boolean) {
    await onSave({
      campaign_id: campaign?.id,
      name: name.trim(),
      whatsapp_instance_id: instanceId === 'none' ? null : instanceId,
      messages: validMessages,
      interval_seconds: clampBroadcastTimerSeconds(timerSeconds),
      recipients: recipients.map((r) => ({
        recipient_name: r.name || null,
        recipient_phone: r.phone,
        ...(r.clientId ? { client_id: r.clientId } : {}),
      })),
      status: startImmediately ? 'running' : 'draft',
    });
  }

  function canAdvance(): boolean {
    if (step === 0) return canAdvanceStep0;
    if (step === 1) return canAdvanceStep1;
    if (step === 2) return canAdvanceStep2;
    return true;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campaign ? 'Editar Campanha' : 'Nova Campanha'}</DialogTitle>
          <DialogDescription>
            Passo {step + 1} de {STEPS.length}: {STEPS[step]}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="flex gap-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                i <= step ? 'bg-primary' : 'bg-muted',
              )}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[300px] space-y-4">
          {/* ── STEP 0: Config ── */}
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label>Nome da campanha</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Reativação leads frios" />
              </div>
              <div className="space-y-2">
                <Label>Instância WhatsApp</Label>
                <Select value={instanceId} onValueChange={setInstanceId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem instância</SelectItem>
                    {instances.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>{inst.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* ── STEP 1: Recipients ── */}
          {step === 1 && (
            <>
              <div className="flex gap-2">
                <Button
                  variant={recipientMode === 'upload' ? 'default' : 'outline'} size="sm"
                  onClick={() => setRecipientMode('upload')}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> Arquivo CSV/XLSX
                </Button>
                <Button
                  variant={recipientMode === 'crm' ? 'default' : 'outline'} size="sm"
                  onClick={() => setRecipientMode('crm')}
                >
                  <Users className="mr-1.5 h-3.5 w-3.5" /> Clientes do CRM
                </Button>
              </div>

              {recipientMode === 'upload' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label
                      className="flex h-24 w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 text-sm text-muted-foreground hover:border-primary/50 hover:bg-muted/50 transition-colors"
                    >
                      <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileUpload} />
                      <div className="text-center">
                        <Upload className="mx-auto mb-1 h-5 w-5" />
                        {uploadFileName ? uploadFileName : 'Clique para selecionar CSV ou XLSX'}
                      </div>
                    </label>
                  </div>
                  {recipients.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      <Check className="inline h-4 w-4 text-emerald-600 mr-1" />
                      {recipients.length} contato(s) carregado(s)
                    </p>
                  )}
                </div>
              ) : (
                <CrmClientSelector
                  selected={recipients.filter((r) => r.clientId).map((r) => r.clientId!)}
                  onSelectionChange={handleCrmSelection}
                />
              )}

              {recipients.length > 0 && (
                <div className="rounded border p-3 max-h-40 overflow-y-auto text-xs space-y-1">
                  {recipients.slice(0, 50).map((r, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="font-medium">{r.name || 'Sem nome'}</span>
                      <span className="text-muted-foreground">{r.phone}</span>
                    </div>
                  ))}
                  {recipients.length > 50 && (
                    <p className="text-muted-foreground">... e mais {recipients.length - 50}</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: Messages ── */}
          {step === 2 && (
            <>
              <p className="text-sm text-muted-foreground">
                Adicione variações de mensagem para evitar bloqueios. Use <code className="text-xs bg-muted px-1 rounded">{'{{name}}'}</code> para personalizar.
              </p>
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Variação {i + 1}</Label>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">{msg.length} caracteres</span>
                        {messages.length > 1 && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                            onClick={() => setMessages(messages.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <Textarea
                      rows={3}
                      value={msg}
                      onChange={(e) => {
                        const copy = [...messages];
                        copy[i] = e.target.value;
                        setMessages(copy);
                      }}
                      placeholder="Olá {{name}}, tudo bem? Vi que você testou o SolarZap..."
                    />
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setMessages([...messages, ''])}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar variação
              </Button>
            </>
          )}

          {/* ── STEP 3: Timer ── */}
          {step === 3 && (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Intervalo entre mensagens</Label>
                  <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => setTimerSeconds((v) => Math.max(BROADCAST_MIN_TIMER_SECONDS, v - 5))}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Slider
                      min={BROADCAST_MIN_TIMER_SECONDS}
                      max={BROADCAST_SLIDER_MAX_TIMER_SECONDS}
                      step={1}
                      value={[timerSeconds]}
                      onValueChange={([v]) => setTimerSeconds(v)}
                      className="flex-1"
                    />
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => setTimerSeconds((v) => Math.min(BROADCAST_SLIDER_MAX_TIMER_SECONDS, v + 5))}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-lg font-semibold">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    {formatBroadcastInterval(timerSeconds)}
                  </div>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  {TIMER_PRESETS.map((p) => (
                    <Button
                      key={p.value}
                      variant={timerSeconds === p.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTimerSeconds(p.value)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label>Valor exato (segundos)</Label>
                  <Input
                    type="number"
                    min={BROADCAST_MIN_TIMER_SECONDS}
                    max={BROADCAST_SLIDER_MAX_TIMER_SECONDS}
                    value={timerSeconds}
                    onChange={(e) => setTimerSeconds(clampBroadcastTimerSeconds(Number(e.target.value)))}
                  />
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  O sistema adiciona uma variação aleatória de ±30% ao intervalo para evitar bloqueios.
                </p>
              </div>
            </>
          )}

          {/* ── STEP 4: Preview ── */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Campanha</p>
                  <p className="font-medium">{name}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Instância</p>
                  <p className="font-medium">
                    {instanceId === 'none' ? 'Nenhuma' : instances.find((i) => i.id === instanceId)?.display_name || instanceId}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Destinatários</p>
                  <p className="font-medium">{recipients.length}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Intervalo</p>
                  <p className="font-medium">{formatBroadcastInterval(timerSeconds)}</p>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Mensagens ({validMessages.length} variação(ões))</p>
                {validMessages.map((m, i) => (
                  <div key={i} className="rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap">
                    <Badge variant="outline" className="mb-1 text-[10px]">#{i + 1}</Badge>
                    <p>{m}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={isSubmitting}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
            </Button>
          )}

          <div className="flex-1" />

          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canAdvance()}>
              Próximo <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => void handleSave(false)} disabled={isSubmitting}>
                Salvar rascunho
              </Button>
              <Button onClick={() => void handleSave(true)} disabled={isSubmitting}>
                Salvar e iniciar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
