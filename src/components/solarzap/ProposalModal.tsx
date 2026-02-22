import React, { useState } from 'react';
import { Contact } from '@/types/solarzap';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, FileText, Zap, DollarSign, Sun, Battery, Ruler, Download, User } from 'lucide-react';
import { generateProposalPDF } from '@/utils/generateProposalPDF';
import { useToast } from '@/hooks/use-toast';
import { useLeads } from '@/hooks/domain/useLeads';
import { ClientType } from '@/types/solarzap';

interface ProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  onGenerate: (data: ProposalData) => Promise<void>;
}

export interface ProposalData {
  contactId: string;
  consumoMensal: number;
  potenciaSistema: number;
  quantidadePaineis: number;
  valorTotal: number;
  economiaAnual: number;
  paybackMeses: number;
  garantiaAnos: number;
  observacoes?: string;
  tipo_cliente?: ClientType;
  premiumPayload?: Record<string, unknown>;
  contextEngine?: unknown;
}

const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'residencial', label: 'Residencial' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'rural', label: 'Rural' },
];

export function ProposalModal({ isOpen, onClose, contact, onGenerate }: ProposalModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { updateLead } = useLeads();
  const [formData, setFormData] = useState({
    consumoMensal: contact?.consumption || 0,
    potenciaSistema: 0,
    quantidadePaineis: 0,
    valorTotal: contact?.projectValue || 0,
    economiaAnual: 0,
    paybackMeses: 0,
    garantiaAnos: 25,
    observacoes: '',
    tipo_cliente: contact?.clientType || 'residencial' as ClientType,
  });
  const { toast } = useToast();

  // Auto-calculate values based on consumption
  const calculateSystem = (consumo: number) => {
    const potencia = Math.ceil((consumo * 12) / (4.5 * 30 * 12));
    const paineis = Math.ceil(potencia * 1000 / 550);
    const valorKwp = 4500;
    const valor = potencia * valorKwp;
    const economiaAnual = consumo * 0.85 * 12;
    const payback = Math.ceil((valor / economiaAnual) * 12);

    setFormData(prev => ({
      ...prev,
      consumoMensal: consumo,
      potenciaSistema: potencia,
      quantidadePaineis: paineis,
      valorTotal: valor,
      economiaAnual: consumo * 0.85 * 12,
      paybackMeses: payback,
    }));
  };

  const handleChange = (field: keyof typeof formData, value: number | string) => {
    if (field === 'consumoMensal') {
      calculateSystem(value as number);
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;

    setIsLoading(true);
    try {
      // 1. Update Lead with new values (Consumo, Valor, Tipo)
      // This ensures consistency across the platform
      await updateLead({
        contactId: contact.id,
        data: {
          consumo_kwh: formData.consumoMensal,
          valor_estimado: formData.valorTotal,
          tipo_cliente: formData.tipo_cliente,
        }
      }).catch(err => console.error('Failed to update lead data during proposal:', err));

      // 2. Generate and download PDF
      generateProposalPDF({
        contact,
        ...formData,
        // @ts-ignore - generateProposalPDF might not strictly type `tipo_cliente` yet, but we pass it
        tipo_cliente: formData.tipo_cliente
      });

      // 3. Update Pipeline (Trigger)
      await onGenerate({
        contactId: contact.id,
        ...formData,
      });

      toast({
        title: "Proposta gerada!",
        description: "O PDF foi baixado e os dados do lead atualizados.",
      });

      onClose();
    } catch (error) {
      console.error('Error generating proposal:', error);
      toast({
        title: "Erro ao gerar proposta",
        description: "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    if (contact && isOpen) {
      calculateSystem(contact.consumption || 500);
    }
  }, [contact, isOpen]);

  if (!contact || !isOpen) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="w-5 h-5 text-green-500" />
            Gerar Proposta em PDF
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Client Info */}
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-2xl">
                {contact.avatar || '👤'}
              </div>
              <div>
                <div className="font-semibold text-lg">{contact.name}</div>
                <div className="text-sm text-muted-foreground">{contact.company}</div>
                <div className="text-sm text-muted-foreground">{contact.phone}</div>
              </div>
            </div>
          </div>

          {/* System Sizing */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Dimensionamento do Sistema
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipo_cliente" className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  Tipo de Cliente
                </Label>
                <Select
                  value={formData.tipo_cliente}
                  onValueChange={(value) => handleChange('tipo_cliente', value as ClientType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {CLIENT_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="consumoMensal" className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Consumo Mensal (kWh)
                </Label>
                <Input
                  id="consumoMensal"
                  type="number"
                  value={formData.consumoMensal}
                  onChange={(e) => handleChange('consumoMensal', parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="potenciaSistema" className="flex items-center gap-1">
                  <Sun className="w-3 h-3" />
                  Potência do Sistema (kWp)
                </Label>
                <Input
                  id="potenciaSistema"
                  type="number"
                  step="0.1"
                  value={formData.potenciaSistema}
                  onChange={(e) => handleChange('potenciaSistema', parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantidadePaineis" className="flex items-center gap-1">
                  <Battery className="w-3 h-3" />
                  Quantidade de Painéis
                </Label>
                <Input
                  id="quantidadePaineis"
                  type="number"
                  value={formData.quantidadePaineis}
                  onChange={(e) => handleChange('quantidadePaineis', parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="garantiaAnos" className="flex items-center gap-1">
                  <Ruler className="w-3 h-3" />
                  Garantia (anos)
                </Label>
                <Input
                  id="garantiaAnos"
                  type="number"
                  value={formData.garantiaAnos}
                  onChange={(e) => handleChange('garantiaAnos', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          {/* Financial */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Valores
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg text-center">
                <div className="text-sm text-muted-foreground mb-1">Valor Total</div>
                <div className="text-xl font-bold text-green-600">
                  {formatCurrency(formData.valorTotal)}
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg text-center">
                <div className="text-sm text-muted-foreground mb-1">Economia Anual</div>
                <div className="text-xl font-bold text-blue-600">
                  {formatCurrency(formData.economiaAnual)}
                </div>
              </div>

              <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg text-center">
                <div className="text-sm text-muted-foreground mb-1">Payback</div>
                <div className="text-xl font-bold text-purple-600">
                  {formData.paybackMeses} meses
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="valorTotal">Valor Total (R$)</Label>
              <Input
                id="valorTotal"
                type="number"
                value={formData.valorTotal}
                onChange={(e) => handleChange('valorTotal', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações da Proposta</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => handleChange('observacoes', e.target.value)}
              placeholder="Condições especiais, observações técnicas..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="gap-2 bg-green-500 hover:bg-green-600">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Gerar e Baixar PDF
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
