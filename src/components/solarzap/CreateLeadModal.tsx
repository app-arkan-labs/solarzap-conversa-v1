import React, { useState } from 'react';
import { formatPhoneForDisplay } from '@/lib/phoneUtils';
import { useToast } from '@/hooks/use-toast';
import { PipelineStage, ClientType, Channel, PIPELINE_STAGES, CHANNEL_INFO } from '@/types/solarzap';
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
import { Loader2, Save, User, Building, Phone, Mail, MapPin, Zap, DollarSign, FileText, MessageSquare } from 'lucide-react';

interface CreateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateLeadData) => Promise<void>;
}

export interface CreateLeadData {
  nome: string;
  telefone: string;
  email?: string;
  empresa?: string;
  tipo_cliente: ClientType;
  canal: Channel;
  endereco?: string;
  cidade?: string;
  cep?: string;
  consumo_kwh?: number;
  valor_estimado?: number;
  observacoes?: string;
  status_pipeline: PipelineStage;
}

const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'residencial', label: 'Residencial' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'rural', label: 'Rural' },
  { value: 'usina', label: 'Usina Solar' },
];

const initialFormData: CreateLeadData = {
  nome: '',
  telefone: '',
  email: '',
  empresa: '',
  tipo_cliente: 'residencial',
  canal: 'whatsapp',
  endereco: '',
  cidade: '',
  cep: '',
  consumo_kwh: 0,
  valor_estimado: 0,
  observacoes: '',
  status_pipeline: 'novo_lead',
};

export function CreateLeadModal({ isOpen, onClose, onSave }: CreateLeadModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<CreateLeadData>(initialFormData);

  const handleChange = (field: keyof CreateLeadData, value: string | number) => {
    if (field === 'cep') {
      // CEP mask: XXXXX-XXX
      let raw = String(value).replace(/\D/g, '').slice(0, 8);
      if (raw.length > 5) raw = raw.slice(0, 5) + '-' + raw.slice(5);
      setFormData(prev => ({ ...prev, cep: raw }));
      return;
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isPhoneValid = (phone: string): boolean => {
    const digits = phone.replace(/\D/g, '');
    // After stripping, expect 12-13 digits for BR (55 + DDD + 8-9 digits)
    // or 10-11 without country code
    return digits.length >= 10 && digits.length <= 13;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome || !formData.telefone) return;

    if (!isPhoneValid(formData.telefone)) {
      return; // Phone validation feedback handled by HTML constraint
    }

    setIsLoading(true);
    try {
      const dataToSave = { ...formData };

      // Sanitize Phone
      let cleanPhone = dataToSave.telefone.replace(/\D/g, '');
      if ((cleanPhone.length === 10 || cleanPhone.length === 11) && !cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
      }
      dataToSave.telefone = cleanPhone;

      await onSave(dataToSave);
      setFormData(initialFormData);
      onClose();
    } catch (error) {
      console.error('Error creating lead:', error);
      toast({ title: 'Erro ao criar lead', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFormData(initialFormData);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <User className="w-5 h-5 text-primary" />
            Novo Lead
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dados Pessoais */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <User className="w-4 h-4" />
              Dados Pessoais
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => handleChange('nome', e.target.value)}
                  placeholder="Nome completo"
                  maxLength={120}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="empresa" className="flex items-center gap-1">
                  <Building className="w-3 h-3" />
                  Empresa
                </Label>
                <Input
                  id="empresa"
                  value={formData.empresa}
                  onChange={(e) => handleChange('empresa', e.target.value)}
                  placeholder="Nome da empresa"
                  maxLength={120}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telefone" className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  Telefone *
                </Label>
                <Input
                  id="telefone"
                  value={formatPhoneForDisplay(formData.telefone) || ''}
                  onChange={(e) => handleChange('telefone', e.target.value)}
                  placeholder="(DD) 90000-0000"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipo_cliente">Tipo de Cliente</Label>
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
                <Label htmlFor="canal" className="flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  Canal
                </Label>
                <Select
                  value={formData.canal}
                  onValueChange={(value) => handleChange('canal', value as Channel)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o canal" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {Object.entries(CHANNEL_INFO).map(([key, info]) => (
                      <SelectItem key={key} value={key}>
                        {info.icon} {info.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Endereço
            </h3>

            <div className="space-y-2">
              <Label htmlFor="endereco">Endereço</Label>
              <Input
                id="endereco"
                value={formData.endereco}
                onChange={(e) => handleChange('endereco', e.target.value)}
                placeholder="Rua, número, bairro"
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cidade">Cidade</Label>
                <Input
                  id="cidade"
                  value={formData.cidade}
                  onChange={(e) => handleChange('cidade', e.target.value)}
                  placeholder="Cidade"
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  value={formData.cep}
                  onChange={(e) => handleChange('cep', e.target.value)}
                  placeholder="00000-000"
                  maxLength={9}
                />
              </div>
            </div>
          </div>

          {/* Projeto Solar */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Projeto Solar
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="consumo_kwh" className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Consumo (kWh/mês)
                </Label>
                <Input
                  id="consumo_kwh"
                  type="number"
                  min="0"
                  value={formData.consumo_kwh || ''}
                  onChange={(e) => handleChange('consumo_kwh', Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="Ex: 500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="valor_estimado" className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Valor Estimado (R$)
                </Label>
                <Input
                  id="valor_estimado"
                  type="number"
                  min="0"
                  value={formData.valor_estimado || ''}
                  onChange={(e) => handleChange('valor_estimado', Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="Ex: 25000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status_pipeline">Etapa do Pipeline</Label>
              <Select
                value={formData.status_pipeline}
                onValueChange={(value) => handleChange('status_pipeline', value as PipelineStage)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent className="bg-popover max-h-60">
                  {Object.entries(PIPELINE_STAGES).map(([key, stage]) => (
                    <SelectItem key={key} value={key}>
                      {stage.icon} {stage.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Observações
            </h3>

            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => handleChange('observacoes', e.target.value)}
              placeholder="Anotações sobre o lead..."
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" data-testid="submit-create-lead" disabled={isLoading || !formData.nome || !formData.telefone} className="gap-2">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Criar Lead
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
