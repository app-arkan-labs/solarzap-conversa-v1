import { useEffect, useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import { CalendarClock, Check, Copy, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import type { InternalCrmPipelineBoardCard } from '@/modules/internal-crm/hooks/useInternalCrmPipelineBoard';
import { cn } from '@/lib/utils';

export type InternalCrmCallOutcomePayload = {
  client_id: string;
  deal_id: string;
  appointment_id?: string | null;
  method: 'phone' | 'whatsapp';
  outcome: 'no_answer' | 'answered' | 'reschedule' | 'invalid_number' | 'no_interest';
  attempt_count: number;
  cadence_step: string;
  notes?: string | null;
  next_call_at?: string | null;
  move_to_tentando_contato?: boolean;
  move_to_mql?: boolean;
  open_meeting_after_save?: boolean;
  qualification?: Record<string, unknown>;
  mql_grade?: number | null;
};

type InternalCrmCallFlowModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: InternalCrmPipelineBoardCard | null;
  appointmentId?: string | null;
  isSubmitting?: boolean;
  onSubmit: (payload: InternalCrmCallOutcomePayload) => Promise<void>;
};

const OUTCOME_LABELS: Record<InternalCrmCallOutcomePayload['outcome'], string> = {
  no_answer: 'Nao atendeu',
  answered: 'Atendeu',
  reschedule: 'Pediu outro horario',
  invalid_number: 'Numero invalido',
  no_interest: 'Sem interesse',
};

function onlyDigits(value: string | null | undefined) {
  return String(value || '').replace(/\D+/g, '');
}

function toDatetimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function datetimeLocalToIso(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function readCadenceStep(card: InternalCrmPipelineBoardCard | null) {
  const context = card?.deal?.commercial_context;
  if (!context || typeof context !== 'object') return 'initial_5m';
  const arkan = (context as Record<string, unknown>).arkan;
  if (!arkan || typeof arkan !== 'object') return 'initial_5m';
  const cadence = (arkan as Record<string, unknown>).contact_cadence;
  if (!cadence || typeof cadence !== 'object') return 'initial_5m';
  return String((cadence as Record<string, unknown>).current_step || 'initial_5m');
}

function readMqlGrade(card: InternalCrmPipelineBoardCard | null) {
  const context = card?.deal?.commercial_context;
  if (!context || typeof context !== 'object') return null;
  const arkan = (context as Record<string, unknown>).arkan;
  if (!arkan || typeof arkan !== 'object') return null;
  const qualification = (arkan as Record<string, unknown>).qualification;
  if (!qualification || typeof qualification !== 'object') return null;
  const grade = Number((qualification as Record<string, unknown>).mql_grade || 0);
  return [1, 2, 3, 4].includes(grade) ? grade : null;
}

export function InternalCrmCallFlowModal({
  open,
  onOpenChange,
  card,
  appointmentId,
  isSubmitting = false,
  onSubmit,
}: InternalCrmCallFlowModalProps) {
  const phoneDigits = onlyDigits(card?.client?.primary_phone);
  const whatsappUrl = phoneDigits ? `https://wa.me/${phoneDigits}` : '';
  const telUrl = phoneDigits ? `tel:${phoneDigits}` : '';
  const [method, setMethod] = useState<'phone' | 'whatsapp'>('phone');
  const [outcome, setOutcome] = useState<InternalCrmCallOutcomePayload['outcome']>('no_answer');
  const [attemptCount, setAttemptCount] = useState('3');
  const [notes, setNotes] = useState('');
  const [nextCallLocal, setNextCallLocal] = useState('');
  const [moveToTrying, setMoveToTrying] = useState(true);
  const [moveToMql, setMoveToMql] = useState(true);
  const [openMeetingAfterSave, setOpenMeetingAfterSave] = useState(true);
  const [paidTrafficStatus, setPaidTrafficStatus] = useState('unknown');
  const [monthlyAdSpendRange, setMonthlyAdSpendRange] = useState('unknown');
  const [revenueRange, setRevenueRange] = useState('unknown');
  const [hasPartner, setHasPartner] = useState('unknown');
  const [decisionMakers, setDecisionMakers] = useState('');
  const [mainChallenge, setMainChallenge] = useState('');
  const [timing, setTiming] = useState('now');
  const [mqlGrade, setMqlGrade] = useState<number | null>(3);

  useEffect(() => {
    if (!open) return;
    setMethod('phone');
    setOutcome('no_answer');
    setAttemptCount('3');
    setNotes('');
    setNextCallLocal(toDatetimeLocalValue(new Date(Date.now() + 2 * 60 * 60_000)));
    setMoveToTrying(true);
    setMoveToMql(true);
    setOpenMeetingAfterSave(true);
    setPaidTrafficStatus('unknown');
    setMonthlyAdSpendRange('unknown');
    setRevenueRange('unknown');
    setHasPartner('unknown');
    setDecisionMakers('');
    setMainChallenge('');
    setTiming('now');
    setMqlGrade(readMqlGrade(card) || 3);
  }, [card, open]);

  const qrValue = method === 'whatsapp' ? whatsappUrl : telUrl;
  const linkedCallAppointmentId =
    appointmentId ||
    (card?.nextAppointment?.appointment_type === 'call' ? card.nextAppointment.id : null);
  const cadenceStep = useMemo(() => readCadenceStep(card), [card]);
  const isAnswered = outcome === 'answered';
  const isReschedule = outcome === 'reschedule';
  const canSave = Boolean(card?.deal?.id && card?.deal?.client_id && phoneDigits) &&
    (!isAnswered || Boolean(mqlGrade)) &&
    (!isReschedule || Boolean(datetimeLocalToIso(nextCallLocal)));

  async function handleSubmit() {
    if (!card) return;
    const qualification = isAnswered
      ? {
          paid_traffic_status: paidTrafficStatus,
          monthly_ad_spend_range: monthlyAdSpendRange,
          revenue_range: revenueRange,
          has_partner: hasPartner === 'yes' ? true : hasPartner === 'no' ? false : null,
          decision_makers: decisionMakers.trim() || null,
          main_challenge: mainChallenge.trim() || null,
          timing,
          notes: notes.trim() || null,
          mql_grade: mqlGrade,
        }
      : {};

    await onSubmit({
      client_id: card.deal.client_id,
      deal_id: card.deal.id,
      appointment_id: linkedCallAppointmentId,
      method,
      outcome,
      attempt_count: Number(attemptCount || 1),
      cadence_step: cadenceStep,
      notes: notes.trim() || null,
      next_call_at: isReschedule ? datetimeLocalToIso(nextCallLocal) : null,
      move_to_tentando_contato: outcome === 'no_answer' ? moveToTrying : false,
      move_to_mql: isAnswered ? moveToMql : false,
      open_meeting_after_save: isAnswered ? openMeetingAfterSave : false,
      qualification,
      mql_grade: isAnswered ? mqlGrade : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar chamada</DialogTitle>
          <DialogDescription>
            {card ? `${card.companyName}${card.contactName ? ` - ${card.contactName}` : ''}` : 'Selecione um lead para ligar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant={method === 'phone' ? 'default' : 'outline'}
              className="h-12 justify-start rounded-lg"
              onClick={() => setMethod('phone')}
            >
              <Phone className="mr-2 h-4 w-4" />
              Telefone
            </Button>
            <Button
              type="button"
              variant={method === 'whatsapp' ? 'default' : 'outline'}
              className="h-12 justify-start rounded-lg"
              onClick={() => setMethod('whatsapp')}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              WhatsApp
            </Button>
          </div>

          <div className="grid gap-4 rounded-lg border border-border/70 p-4 sm:grid-cols-[180px_1fr]">
            <div className="flex h-40 w-full items-center justify-center rounded-lg bg-white p-3">
              {qrValue ? <QRCode value={qrValue} size={132} /> : <span className="text-xs text-muted-foreground">Sem telefone</span>}
            </div>
            <div className="flex min-w-0 flex-col justify-center gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{phoneDigits || 'Telefone indisponivel'}</div>
                <div className="text-xs text-muted-foreground">
                  {method === 'whatsapp' ? 'Escaneie ou abra o WhatsApp para chamar o lead.' : 'Escaneie ou abra a chamada no telefone.'}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!qrValue}
                  onClick={() => {
                    window.location.href = qrValue;
                  }}
                >
                  <Phone className="mr-1.5 h-3.5 w-3.5" />
                  Abrir
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!phoneDigits}
                  onClick={() => void navigator.clipboard?.writeText(phoneDigits)}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copiar
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Resultado</Label>
              <Select value={outcome} onValueChange={(value) => setOutcome(value as InternalCrmCallOutcomePayload['outcome'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tentativas nesta chamada</Label>
              <Select value={attemptCount} onValueChange={setAttemptCount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 tentativa</SelectItem>
                  <SelectItem value="2">2 tentativas</SelectItem>
                  <SelectItem value="3">3 tentativas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {outcome === 'no_answer' ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
              <label className="flex items-start gap-2 text-sm text-amber-950">
                <Checkbox checked={moveToTrying} onCheckedChange={(checked) => setMoveToTrying(checked === true)} />
                <span>Mover para Tentando Contato e seguir a cadencia.</span>
              </label>
            </div>
          ) : null}

          {isReschedule ? (
            <div className="space-y-2">
              <Label>Nova chamada</Label>
              <Input type="datetime-local" value={nextCallLocal} onChange={(event) => setNextCallLocal(event.target.value)} />
            </div>
          ) : null}

          {isAnswered ? (
            <div className="space-y-4 rounded-lg border border-border/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Check className="h-4 w-4 text-emerald-600" />
                Qualificacao MQL
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Investe em trafego pago?</Label>
                  <Select value={paidTrafficStatus} onValueChange={setPaidTrafficStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Sim</SelectItem>
                      <SelectItem value="no">Nao</SelectItem>
                      <SelectItem value="past">Ja investiu antes</SelectItem>
                      <SelectItem value="unknown">Nao sabe informar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Investimento mensal</Label>
                  <Select value={monthlyAdSpendRange} onValueChange={setMonthlyAdSpendRange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nao investe</SelectItem>
                      <SelectItem value="up_1000">Ate R$ 1.000</SelectItem>
                      <SelectItem value="1000_3000">R$ 1.000 a R$ 3.000</SelectItem>
                      <SelectItem value="3000_5000">R$ 3.000 a R$ 5.000</SelectItem>
                      <SelectItem value="over_5000">Acima de R$ 5.000</SelectItem>
                      <SelectItem value="unknown">Nao sabe informar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Faturamento medio</Label>
                  <Select value={revenueRange} onValueChange={setRevenueRange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="up_30000">Ate R$ 30 mil</SelectItem>
                      <SelectItem value="30000_50000">R$ 30 mil a R$ 50 mil</SelectItem>
                      <SelectItem value="50000_100000">R$ 50 mil a R$ 100 mil</SelectItem>
                      <SelectItem value="100000_300000">R$ 100 mil a R$ 300 mil</SelectItem>
                      <SelectItem value="over_300000">Acima de R$ 300 mil</SelectItem>
                      <SelectItem value="unknown">Nao sabe informar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Possui socio?</Label>
                  <Select value={hasPartner} onValueChange={setHasPartner}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Sim</SelectItem>
                      <SelectItem value="no">Nao</SelectItem>
                      <SelectItem value="unknown">Nao sabe informar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Quem participa da reuniao?</Label>
                  <Input value={decisionMakers} onChange={(event) => setDecisionMakers(event.target.value)} placeholder="Socio, comercial, decisor..." />
                </div>
                <div className="space-y-2">
                  <Label>Quando quer resolver?</Label>
                  <Select value={timing} onValueChange={setTiming}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="now">Agora</SelectItem>
                      <SelectItem value="30_days">Proximos 30 dias</SelectItem>
                      <SelectItem value="later">Depois</SelectItem>
                      <SelectItem value="no_urgency">Sem urgencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Principal desafio</Label>
                <Textarea value={mainChallenge} onChange={(event) => setMainChallenge(event.target.value)} rows={3} />
              </div>

              <div className="space-y-2">
                <Label>Nota MQL</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((grade) => (
                    <Button
                      key={grade}
                      type="button"
                      variant={mqlGrade === grade ? 'default' : 'outline'}
                      className={cn('h-11 rounded-lg text-base font-semibold', mqlGrade === grade && 'shadow-sm')}
                      onClick={() => setMqlGrade(grade)}
                    >
                      {grade}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-start gap-2 rounded-lg border border-border/70 p-3 text-sm">
                  <Checkbox checked={moveToMql} onCheckedChange={(checked) => setMoveToMql(checked === true)} />
                  <span>Mover para MQL</span>
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-border/70 p-3 text-sm">
                  <Checkbox checked={openMeetingAfterSave} onCheckedChange={(checked) => setOpenMeetingAfterSave(checked === true)} />
                  <span>Agendar reuniao em seguida</span>
                </label>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Observacoes</Label>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!canSave || isSubmitting}>
            {isAnswered && openMeetingAfterSave ? (
              <>
                <CalendarClock className="mr-2 h-4 w-4" />
                Salvar e agendar
              </>
            ) : (
              'Salvar chamada'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
