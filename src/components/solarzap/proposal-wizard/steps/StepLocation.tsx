import { LocateFixed, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UseProposalFormReturn } from '@/hooks/useProposalForm';

interface StepLocationProps {
  form: UseProposalFormReturn;
}

export function StepLocation({ form }: StepLocationProps) {
  const isUsina = form.formData.tipo_cliente === 'usina';
  const hasCoordinates = Number.isFinite(Number(form.formData.latitude))
    && Number.isFinite(Number(form.formData.longitude));
  const sourceLabel = form.formData.irradianceSource === 'pvgis'
    ? 'PVGIS'
    : form.formData.irradianceSource === 'cache'
      ? 'cache solar'
      : 'media por UF (fallback)';

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">Onde e quanto consome?</h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>CEP</Label>
          <div className="flex items-center gap-2">
            <Input
              value={form.formData.cep || ''}
              maxLength={9}
              placeholder="00000-000"
              onChange={(e) => form.handleChange('cep', e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 px-2"
              disabled={form.locationLoading}
              onClick={() => {
                void (async () => {
                  const cepData = await form.autofillAddressByCep();
                  if (cepData) await form.resolvePreciseLocation(cepData);
                })();
              }}
              title="Preencher por CEP"
            >
              {form.locationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="hidden md:inline">CEP</span>
            </Button>
          </div>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Cidade</Label>
          <Input
            value={form.formData.cidade || ''}
            placeholder="Cidade"
            onChange={(e) => form.handleChange('cidade', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Estado (UF)</Label>
          <Select value={form.formData.estado} onValueChange={(v) => form.handleChange('estado', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o estado" />
            </SelectTrigger>
            <SelectContent className="max-h-64 bg-popover">
              {form.options.BRAZIL_STATES.map((state) => (
                <SelectItem key={state.uf} value={state.uf}>
                  {state.uf} - {state.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{isUsina ? 'Geracao estimada (kWh/mes)' : 'Consumo mensal (kWh)'}</Label>
          <Input
            type="number"
            min={0}
            value={form.formData.consumoMensal || ''}
            onChange={(e) => form.handleChange('consumoMensal', parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Endereco (rua, numero, bairro)</Label>
        <Input
          value={form.formData.endereco || ''}
          placeholder="Ex: Rua das Palmeiras, 120 - Centro"
          onChange={(e) => form.handleChange('endereco', e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="gap-2"
          disabled={form.locationLoading}
          onClick={() => {
            void form.resolvePreciseLocation();
          }}
        >
          {form.locationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          Calcular local exato
        </Button>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium">
          Sistema estimado: {Number(form.formData.potenciaSistema || 0).toFixed(2)} kWp
        </p>
        <p className="text-muted-foreground">
          {form.formData.quantidadePaineis || 0} paineis | Irradiancia {Number(form.formData.irradiancia || 0).toFixed(2)} kWh/m2/dia
        </p>
        <p className="text-xs text-muted-foreground">
          {hasCoordinates
            ? `Coordenadas: ${Number(form.formData.latitude).toFixed(5)}, ${Number(form.formData.longitude).toFixed(5)}`
            : 'Coordenadas: nao resolvidas'}
          {' | '}Fonte: {sourceLabel}
          {' | '}Ref: {form.formData.irradianceRefAt ? new Date(form.formData.irradianceRefAt).toLocaleString('pt-BR') : '-'}
        </p>
      </div>
    </div>
  );
}
