import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, TrendingDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Contact, PipelineStage } from '@/types/solarzap';
import type { UpdateLeadData } from './EditLeadModal';
import { supabase } from '@/lib/supabase';
import { buildLossReasonSummary, useLossReasons } from '@/hooks/useLossReasons';

interface MarkAsLostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Contact | null;
  onMoveToPipeline: (contactId: string, stage: PipelineStage) => Promise<void>;
  onUpdateLead: (contactId: string, data: UpdateLeadData) => Promise<void>;
}

export function MarkAsLostModal({
  open,
  onOpenChange,
  lead,
  onMoveToPipeline,
  onUpdateLead,
}: MarkAsLostModalProps) {
  const { orgId, user } = useAuth();
  const { toast } = useToast();
  const { reasons, isLoading, addReason, isAddingReason } = useLossReasons();
  const [selectedReasonId, setSelectedReasonId] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [newReasonLabel, setNewReasonLabel] = useState('');
  const [isReasonEditorOpen, setIsReasonEditorOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedReasonId('');
      setReasonDetail('');
      setNewReasonLabel('');
      setIsReasonEditorOpen(false);
    }
  }, [open]);

  const selectedReason = useMemo(
    () => reasons.find((reason) => reason.id === selectedReasonId) || null,
    [reasons, selectedReasonId],
  );

  const authorName = user?.user_metadata?.full_name
    || user?.email?.split('@')[0]
    || 'Vendedor';

  const canSubmit = Boolean(
    lead
      && selectedReason
      && (!selectedReason || selectedReason.key !== 'outro' || reasonDetail.trim().length > 0),
  );

  const handleAddReason = async () => {
    try {
      const createdReason = await addReason(newReasonLabel);
      setSelectedReasonId(createdReason.id);
      setNewReasonLabel('');
      setIsReasonEditorOpen(false);
      toast({
        title: 'Motivo adicionado',
        description: 'O novo motivo já está disponível para uso no dropdown.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao adicionar motivo',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async () => {
    if (!lead || !selectedReason || !orgId) return;

    const normalizedDetail = reasonDetail.trim();
    const summary = buildLossReasonSummary(selectedReason.label, normalizedDetail || null);

    setIsSubmitting(true);
    try {
      await onUpdateLead(lead.id, {
        lost_reason: summary,
        follow_up_enabled: false,
        follow_up_step: 0,
        follow_up_exhausted_seen: true,
      });

      if (lead.pipelineStage !== 'perdido') {
        await onMoveToPipeline(lead.id, 'perdido');
      }

      const { error: lossError } = await supabase
        .from('perdas_leads')
        .insert({
          org_id: orgId,
          lead_id: Number(lead.id),
          motivo_id: selectedReason.id,
          motivo_detalhe: normalizedDetail || null,
          registrado_por: authorName,
        });

      if (lossError) throw lossError;

      const { error: commentError } = await supabase
        .from('comentarios_leads')
        .insert({
          org_id: orgId,
          lead_id: Number(lead.id),
          texto: `[Lead Perdido]: ${summary}`,
          autor: authorName,
        });

      if (commentError) {
        console.warn('Failed to register loss comment:', commentError);
      }

      toast({
        title: 'Perda registrada',
        description: `${lead.name} foi movido para perdido e entrou no painel de perdas.`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to register lead loss:', error);
      toast({
        title: 'Erro ao registrar perda',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <TrendingDown className="h-5 w-5 text-rose-500" />
            Registrar perda do lead
          </DialogTitle>
          <DialogDescription>
            Registre o motivo da perda para alimentar o historico comercial e o dashboard de mitigacao.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{lead?.name || 'Lead selecionado'}</p>
                <p className="text-xs text-muted-foreground">{lead?.company || 'Sem empresa informada'}</p>
              </div>
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                {lead?.pipelineStage === 'perdido' ? 'Ja perdido' : 'Mover para perdido'}
              </Badge>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Motivo da perda</Label>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setIsReasonEditorOpen((current) => !current)}
              >
                {isReasonEditorOpen ? 'Fechar edicao' : 'Adicionar motivo'}
              </button>
            </div>
            <Select value={selectedReasonId} onValueChange={setSelectedReasonId} disabled={isLoading || isSubmitting}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? 'Carregando motivos...' : 'Selecione um motivo'} />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((reason) => (
                  <SelectItem key={reason.id} value={reason.id}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isReasonEditorOpen ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background p-4 space-y-3">
              <Label htmlFor="new-loss-reason">Novo motivo</Label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  id="new-loss-reason"
                  value={newReasonLabel}
                  onChange={(event) => setNewReasonLabel(event.target.value)}
                  placeholder="Ex.: Telhado sem viabilidade estrutural"
                  disabled={isAddingReason}
                />
                <Button type="button" variant="outline" onClick={handleAddReason} disabled={isAddingReason || !newReasonLabel.trim()}>
                  {isAddingReason ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Adicionar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Os motivos adicionados ficam disponíveis para toda a organização neste dropdown.
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="loss-detail">Contexto da perda</Label>
            <Textarea
              id="loss-detail"
              value={reasonDetail}
              onChange={(event) => setReasonDetail(event.target.value)}
              placeholder="Detalhe o que aconteceu, qual objecao venceu ou qual acao futura pode recuperar esse lead."
              className="min-h-[120px]"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              {selectedReason?.key === 'outro'
                ? 'Para o motivo Outro, o detalhe e obrigatorio.'
                : 'Use este campo para enriquecer a analise e orientar mitigacoes futuras.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {reasons.slice(0, 5).map((reason) => (
              <Badge key={reason.id} variant="secondary" className="cursor-pointer" onClick={() => setSelectedReasonId(reason.id)}>
                {reason.label}
              </Badge>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit || isSubmitting || isLoading}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Registrar perda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}