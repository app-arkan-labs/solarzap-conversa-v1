import React, { useState, useEffect } from 'react';
import { formatPhoneForDisplay } from '@/lib/phoneUtils';
import { useToast } from '@/hooks/use-toast';
import { Contact, PipelineStage, ClientType, PIPELINE_STAGES, Channel } from '@/types/solarzap';
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
import { BRAZIL_STATES } from '@/constants/solarIrradiance';
import { Loader2, Save, User, Building, Phone, Mail, MapPin, Zap, DollarSign, FileText } from 'lucide-react';
import { LeadStageDataSection } from './LeadStageDataSection';

interface EditLeadModalProps {
  contact: Contact | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (contactId: string, data: UpdateLeadData) => Promise<void>;
}

export interface UpdateLeadData {
  nome?: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  tipo_cliente?: ClientType;
  endereco?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  consumo_kwh?: number;
  valor_estimado?: number;
  observacoes?: string;
  status_pipeline?: PipelineStage;
  canal?: Channel;
  follow_up_enabled?: boolean;
  follow_up_step?: number;
  follow_up_exhausted_seen?: boolean;
  lost_reason?: string | null;
}

const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'residencial', label: 'Residencial' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'rural', label: 'Rural' },
  { value: 'usina', label: 'Usina Solar' },
];

export function EditLeadModal({ contact, isOpen, onClose, onSave }: EditLeadModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<UpdateLeadData>({});
  const [isDirty, setIsDirty] = useState(false);

  // Reset form when contact changes (only if ID changes or Modal opens)
  // CRITICAL: We DO NOT reset if the user is typing (isDirty=true)
  useEffect(() => {
    // If modal is closed, or we are switching to a NEW contact (ID changed), we reset everything.
    // Ideally we track the "current loaded ID" to know if it changed.

    // Safety check: if we are dirty and the contact ID is the SAME, do NOT reset.
    // This allows background updates to 'contact' prop to be ignored regarding the FORM fields.
    if (isOpen && contact) {
      // If we are already dirty and it's the SAME contact, return (don't overwrite)
      // NOTE: We rely on checking formData.nome vs current contact.name if needed, but isDirty is safer.
      // However, we need to know if the ID changed.
      // We can use a ref for the previous ID, but here relies on the effect dependency.
      // This effect runs when `contact.id` changes (because of dependency).
      // SO WE ARE SAFE TO RESET if `contact.id` changed.

      // BUT, if `contact` changed reference but ID is same (background update), this effect might NOT run if we listed only ID.
      // Dependency is [contact?.id, isOpen]. 
      // If `contact` reference changes (new timestamp) but ID is same, THIS EFFECT DOES NOT RUN.
      // So `isDirty` isn't even checked.

      // However, to be extra safe against parent remounting with same ID:
      setIsDirty(false);

      setFormData({
        nome: contact.name,
        telefone: contact.phone,
        email: contact.email || '',
        empresa: contact.company || '',
        tipo_cliente: contact.clientType,
        endereco: contact.address || '',
        cidade: contact.city || '',
        uf: contact.state || '',
        cep: contact.zip || '',
        consumo_kwh: contact.consumption,
        valor_estimado: contact.projectValue,
        observacoes: contact.notes || '',
        status_pipeline: contact.pipelineStage,
        canal: contact.channel,
      });
    }
  }, [contact?.id, isOpen]); // Only run if ID changes or Modal toggles. IGNORE other contact updates.

  const handleChange = (field: keyof UpdateLeadData, value: string | number) => {
    if (field === 'cep') {
      let raw = String(value).replace(/\D/g, '').slice(0, 8);
      if (raw.length > 5) raw = raw.slice(0, 5) + '-' + raw.slice(5);
      setIsDirty(true);
      setFormData(prev => ({ ...prev, cep: raw }));
      return;
    }
    setIsDirty(true); // User has touched the form
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isPhoneValid = (phone: string | undefined): boolean => {
    if (!phone) return true; // optional for edit
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 13;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;
    if (!isPhoneValid(formData.telefone)) return;

    setIsLoading(true);
    try {
      // Sanitize Phone
      const dataToSave = { ...formData };
      if (dataToSave.telefone) {
        let cleanPhone = dataToSave.telefone.replace(/\D/g, '');
        if ((cleanPhone.length === 10 || cleanPhone.length === 11) && !cleanPhone.startsWith('55')) {
          cleanPhone = '55' + cleanPhone;
        }
        dataToSave.telefone = cleanPhone;
      }

      await onSave(contact.id, dataToSave);
      onClose();
    } catch (error) {
      console.error('Error saving contact:', error);
      toast({ title: 'Erro ao salvar contato', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!contact) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <User className="w-5 h-5 text-primary" />
            Editar Lead
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
                  value={formData.nome || ''}
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
                  value={formData.empresa || ''}
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
                  placeholder="(DD) 00000-0000"
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
                  value={formData.email || ''}
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
                <Label htmlFor="canal">Canal de Origem</Label>
                <Select
                  value={formData.canal}
                  onValueChange={(value) => handleChange('canal', value as Channel)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a origem" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="messenger">Messenger</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="google_ads">Google Ads</SelectItem>
                    <SelectItem value="facebook_ads">Facebook Ads</SelectItem>
                    <SelectItem value="tiktok_ads">TikTok Ads</SelectItem>
                    <SelectItem value="indication">Indicação</SelectItem>
                    <SelectItem value="event">Evento</SelectItem>
                    <SelectItem value="cold_list">Lista Fria</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
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
                value={formData.endereco || ''}
                onChange={(e) => handleChange('endereco', e.target.value)}
                placeholder="Rua, número, bairro"
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cidade">Cidade</Label>
                <Input
                  id="cidade"
                  value={formData.cidade || ''}
                  onChange={(e) => handleChange('cidade', e.target.value)}
                  placeholder="Cidade"
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="uf">UF</Label>
                <Select value={formData.uf || ''} onValueChange={(value) => handleChange('uf', value)}>
                  <SelectTrigger id="uf">
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover max-h-60">
                    {BRAZIL_STATES.map((s) => (
                      <SelectItem key={s.uf} value={s.uf}>{s.uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  value={formData.cep || ''}
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
              value={formData.observacoes || ''}
              onChange={(e) => handleChange('observacoes', e.target.value)}
              placeholder="Anotações sobre o lead..."
              rows={4}
            />
          </div>

          <LeadStageDataSection contact={contact} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="gap-2">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
