import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { UseProposalFormReturn } from '@/hooks/useProposalForm';

interface StepPersonalizationProps {
  form: UseProposalFormReturn;
}

export function StepPersonalization({ form }: StepPersonalizationProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">Personalizacao</h3>

      <div className="space-y-1.5">
        <Label>Observacoes da proposta</Label>
        <Textarea
          value={form.formData.observacoes}
          onChange={(e) => form.handleChange('observacoes', e.target.value)}
          placeholder="Condicoes especiais e observacoes tecnicas..."
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Garantia de servico (anos)</Label>
        <Input
          type="number"
          min={0}
          value={form.formData.garantiaAnos || ''}
          onChange={(e) => form.handleChange('garantiaAnos', parseInt(e.target.value, 10) || 0)}
        />
      </div>

      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-amber-500" /> IA
          </h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={form.handleAiPersonalize}
            disabled={form.aiLoading || form.isLoading}
          >
            {form.aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {form.aiContent ? 'Atualizar' : 'Personalizar com IA'}
          </Button>
        </div>

        {form.aiContent && (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">Headline (editavel)</Label>
              <Input
                value={form.aiHeadline}
                onChange={(e) => form.setAiHeadline(e.target.value)}
                placeholder="Headline personalizada..."
              />
            </div>
            {form.aiContent.executiveSummary && (
              <div className="rounded border bg-background p-2 text-xs text-muted-foreground">
                {form.aiContent.executiveSummary.slice(0, 240)}
                {form.aiContent.executiveSummary.length > 240 ? '...' : ''}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <h4 className="text-sm font-semibold">Assinatura</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nome da empresa</Label>
            <Input
              value={form.formData.signatureCompanyName || ''}
              onChange={(e) => form.handleChange('signatureCompanyName', e.target.value)}
              placeholder="Ex: IBS ENERGIA SOLAR LTDA"
            />
          </div>
          <div className="space-y-1.5">
            <Label>CNPJ da empresa</Label>
            <Input
              value={form.formData.signatureCompanyCnpj || ''}
              onChange={(e) => form.handleChange('signatureCompanyCnpj', e.target.value)}
              placeholder="00.000.000/0001-00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nome do contratante</Label>
            <Input
              value={form.formData.signatureContractorName || ''}
              onChange={(e) => form.handleChange('signatureContractorName', e.target.value)}
              placeholder="Ex: JOAO DA SILVA"
            />
          </div>
          <div className="space-y-1.5">
            <Label>CNPJ do contratante</Label>
            <Input
              value={form.formData.signatureContractorCnpj || ''}
              onChange={(e) => form.handleChange('signatureContractorCnpj', e.target.value)}
              placeholder="00.000.000/0001-00"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
