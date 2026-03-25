import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UseProposalFormReturn } from '@/hooks/useProposalForm';

interface StepPersonalizationProps {
  form: UseProposalFormReturn;
}

export function StepPersonalization({ form }: StepPersonalizationProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">Assinatura e garantia</h3>

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
