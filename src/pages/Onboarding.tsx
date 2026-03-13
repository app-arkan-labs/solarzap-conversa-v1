import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import OnboardingWizardShell from '@/components/onboarding/OnboardingWizardShell';
import { BrandingSettingsCard } from '@/components/solarzap/knowledge-base/BrandingSettingsCard';
import { useUserWhatsAppInstances } from '@/hooks/useUserWhatsAppInstances';
import { useAISettings } from '@/hooks/useAISettings';
import { useAutomationSettings } from '@/hooks/useAutomationSettings';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';

type CompanyDraft = {
  company_name: string;
  elevator_pitch: string;
  headquarters_city: string;
  headquarters_state: string;
  service_area_summary: string;
  public_phone: string;
  public_whatsapp: string;
};

const DEFAULT_COMPANY_DRAFT: CompanyDraft = {
  company_name: '',
  elevator_pitch: '',
  headquarters_city: '',
  headquarters_state: '',
  service_area_summary: '',
  public_phone: '',
  public_whatsapp: '',
};

type AIDraft = {
  is_active: boolean;
  assistant_identity_name: string;
  auto_schedule_call_enabled: boolean;
  auto_schedule_visit_enabled: boolean;
};

const DEFAULT_AI_DRAFT: AIDraft = {
  is_active: true,
  assistant_identity_name: 'Consultor Solar',
  auto_schedule_call_enabled: true,
  auto_schedule_visit_enabled: true,
};

type NotificationDraft = {
  enabled_notifications: boolean;
  enabled_whatsapp: boolean;
  enabled_email: boolean;
  enabled_reminders: boolean;
  timezone: string;
};

const DEFAULT_NOTIFICATION_DRAFT: NotificationDraft = {
  enabled_notifications: true,
  enabled_whatsapp: true,
  enabled_email: false,
  enabled_reminders: true,
  timezone: 'America/Sao_Paulo',
};

const OWNER_STEPS = [
  { key: 'profile', title: 'Seu nome' },
  { key: 'company', title: 'Empresa' },
  { key: 'branding', title: 'Branding' },
  { key: 'whatsapp', title: 'WhatsApp' },
  { key: 'ai', title: 'IA' },
  { key: 'automation', title: 'Automacao' },
  { key: 'notifications', title: 'Notificacoes' },
] as const;

const MEMBER_STEPS = [{ key: 'profile', title: 'Seu nome' }] as const;

export default function Onboarding() {
  const { user, role, loading, orgId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const onboarding = useOnboardingProgress(Boolean(user && orgId));
  const [fullName, setFullName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [companyDraft, setCompanyDraft] = useState<CompanyDraft>(DEFAULT_COMPANY_DRAFT);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyLoaded, setCompanyLoaded] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('Principal');
  const [currentQrCode, setCurrentQrCode] = useState<string | null>(null);
  const [aiDraft, setAiDraft] = useState<AIDraft>(DEFAULT_AI_DRAFT);
  const [savingAI, setSavingAI] = useState(false);
  const [notificationDraft, setNotificationDraft] = useState<NotificationDraft>(DEFAULT_NOTIFICATION_DRAFT);
  const [savingNotifications, setSavingNotifications] = useState(false);

  const whatsapp = useUserWhatsAppInstances();
  const { settings: aiSettings, loading: aiLoading, updateGlobalSettings } = useAISettings();
  const automations = useAutomationSettings();
  const notifications = useNotificationSettings();

  const isOwner = role === 'owner' || role === 'admin';
  const steps = isOwner ? OWNER_STEPS : MEMBER_STEPS;
  const currentStepKey = onboarding.data?.current_step || 'profile';
  const currentStepIndex = Math.max(steps.findIndex((step) => step.key === currentStepKey), 0);
  const currentStep = steps[currentStepIndex];

  useEffect(() => {
    if (!user) return;
    const metadataName = typeof user.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name
      : typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : '';

    if (metadataName && !fullName) {
      setFullName(metadataName);
    }
  }, [user, fullName]);

  useEffect(() => {
    if (!orgId || companyLoaded) return;
    let mounted = true;
    void (async () => {
      const { data, error } = await supabase
        .from('company_profile')
        .select('company_name, elevator_pitch, headquarters_city, headquarters_state, service_area_summary, public_phone, public_whatsapp')
        .eq('org_id', orgId)
        .maybeSingle();

      if (!mounted) return;
      if (!error && data) {
        setCompanyDraft({
          company_name: String(data.company_name || ''),
          elevator_pitch: String(data.elevator_pitch || ''),
          headquarters_city: String(data.headquarters_city || ''),
          headquarters_state: String(data.headquarters_state || ''),
          service_area_summary: String(data.service_area_summary || ''),
          public_phone: String(data.public_phone || ''),
          public_whatsapp: String(data.public_whatsapp || ''),
        });
      }
      setCompanyLoaded(true);
    })();

    return () => {
      mounted = false;
    };
  }, [orgId, companyLoaded]);

  useEffect(() => {
    if (!aiSettings) return;
    setAiDraft({
      is_active: aiSettings.is_active === true,
      assistant_identity_name: String(aiSettings.assistant_identity_name || 'Consultor Solar'),
      auto_schedule_call_enabled: aiSettings.auto_schedule_call_enabled !== false,
      auto_schedule_visit_enabled: aiSettings.auto_schedule_visit_enabled !== false,
    });
  }, [aiSettings]);

  useEffect(() => {
    if (!notifications.settings) return;
    setNotificationDraft({
      enabled_notifications: notifications.settings.enabled_notifications === true,
      enabled_whatsapp: notifications.settings.enabled_whatsapp === true,
      enabled_email: notifications.settings.enabled_email === true,
      enabled_reminders: notifications.settings.enabled_reminders === true,
      timezone: String(notifications.settings.timezone || 'America/Sao_Paulo'),
    });
  }, [notifications.settings]);

  const nextStep = useMemo(() => {
    if (currentStepIndex + 1 >= steps.length) return null;
    return steps[currentStepIndex + 1];
  }, [currentStepIndex, steps]);

  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  if (loading || onboarding.isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando onboarding...</span>
        </div>
      </div>
    );
  }

  if (onboarding.data?.is_complete) {
    return <Navigate to="/" replace />;
  }

  const handleSaveName = async (event?: FormEvent) => {
    event?.preventDefault();
    const normalized = fullName.trim();
    if (!normalized) {
      toast({
        title: 'Nome obrigatorio',
        description: 'Preencha seu nome para continuar.',
        variant: 'destructive',
      });
      return;
    }

    setSavingName(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { display_name: normalized },
      });
      if (updateError) throw updateError;

      await onboarding.completeStep('profile');

      if (!nextStep) {
        await onboarding.markComplete();
        navigate('/');
        return;
      }

      await onboarding.updateStep(nextStep.key);
      toast({ title: 'Perfil salvo', description: 'Vamos para a proxima etapa.' });
    } catch (error) {
      toast({
        title: 'Falha ao salvar perfil',
        description: error instanceof Error ? error.message : 'Erro inesperado.',
        variant: 'destructive',
      });
    } finally {
      setSavingName(false);
    }
  };

  const handleContinuePlaceholderStep = async () => {
    if (!currentStep) return;
    try {
      await onboarding.completeStep(currentStep.key);
      if (!nextStep) {
        await onboarding.markComplete();
        toast({ title: 'Onboarding concluido', description: 'Tudo pronto para usar o app.' });
        navigate('/');
        return;
      }

      await onboarding.updateStep(nextStep.key);
      toast({ title: 'Etapa concluida', description: `Avancando para ${nextStep.title}.` });
    } catch (error) {
      toast({
        title: 'Falha ao atualizar onboarding',
        description: error instanceof Error ? error.message : 'Erro inesperado.',
        variant: 'destructive',
      });
    }
  };

  const continueToNextStep = async () => {
    if (!currentStep) return;
    await onboarding.completeStep(currentStep.key);

    if (!nextStep) {
      await onboarding.markComplete();
      toast({ title: 'Onboarding concluido', description: 'Tudo pronto para usar o app.' });
      navigate('/');
      return;
    }

    await onboarding.updateStep(nextStep.key);
  };

  const saveCompanyStep = async () => {
    if (!orgId) {
      toast({ title: 'Organizacao nao encontrada', variant: 'destructive' });
      return;
    }

    if (!companyDraft.company_name.trim()) {
      toast({ title: 'Nome da empresa obrigatorio', description: 'Preencha o nome da empresa.', variant: 'destructive' });
      return;
    }

    setSavingCompany(true);
    try {
      const { error } = await supabase
        .from('company_profile')
        .upsert({ org_id: orgId, ...companyDraft, updated_at: new Date().toISOString() }, { onConflict: 'org_id' });
      if (error) throw error;

      await continueToNextStep();
    } catch (error) {
      toast({
        title: 'Falha ao salvar dados da empresa',
        description: error instanceof Error ? error.message : 'Erro inesperado.',
        variant: 'destructive',
      });
    } finally {
      setSavingCompany(false);
    }
  };

  const saveAIStep = async () => {
    setSavingAI(true);
    try {
      await updateGlobalSettings({
        is_active: aiDraft.is_active,
        assistant_identity_name: aiDraft.assistant_identity_name.trim() || 'Consultor Solar',
        auto_schedule_call_enabled: aiDraft.auto_schedule_call_enabled,
        auto_schedule_visit_enabled: aiDraft.auto_schedule_visit_enabled,
      });
      await continueToNextStep();
    } catch (error) {
      toast({
        title: 'Falha ao salvar configuracoes da IA',
        description: error instanceof Error ? error.message : 'Erro inesperado.',
        variant: 'destructive',
      });
    } finally {
      setSavingAI(false);
    }
  };

  const saveAutomationStep = async () => {
    try {
      if (automations.hasChanges) {
        const ok = await automations.saveChanges();
        if (!ok) {
          toast({ title: 'Falha ao salvar automacoes', variant: 'destructive' });
          return;
        }
      }
      await continueToNextStep();
    } catch (error) {
      toast({
        title: 'Falha ao salvar automacoes',
        description: error instanceof Error ? error.message : 'Erro inesperado.',
        variant: 'destructive',
      });
    }
  };

  const saveNotificationStep = async () => {
    setSavingNotifications(true);
    try {
      await notifications.updateSettings(notificationDraft);
      await continueToNextStep();
    } catch (error) {
      toast({
        title: 'Falha ao salvar notificacoes',
        description: error instanceof Error ? error.message : 'Erro inesperado.',
        variant: 'destructive',
      });
    } finally {
      setSavingNotifications(false);
    }
  };

  const continueBrandingStep = async () => {
    await continueToNextStep();
  };

  const continueWhatsappStep = async () => {
    if (whatsapp.connectedCount < 1) {
      toast({
        title: 'Conecte um WhatsApp ou pule a etapa',
        description: 'Sem WhatsApp conectado voce nao recebe mensagens no app.',
        variant: 'destructive',
      });
      return;
    }
    await continueToNextStep();
  };

  const createWhatsappInstance = async () => {
    const result = await whatsapp.createInstance(newInstanceName.trim() || 'Principal');
    if (result?.qrCode) {
      setCurrentQrCode(result.qrCode);
    }
  };

  const handleBack = async () => {
    if (currentStepIndex === 0) return;
    const previous = steps[currentStepIndex - 1];
    await onboarding.updateStep(previous.key);
  };

  const handleSkip = async () => {
    if (!currentStep) return;
    try {
      await onboarding.skipStep(currentStep.key);
      if (!nextStep) {
        await onboarding.markComplete();
        navigate('/');
        return;
      }
      await onboarding.updateStep(nextStep.key);
    } catch (error) {
      toast({
        title: 'Falha ao pular etapa',
        description: error instanceof Error ? error.message : 'Erro inesperado.',
        variant: 'destructive',
      });
    }
  };

  const handleNext = async () => {
    const key = currentStep?.key;
    if (!key) return;

    if (key === 'profile') {
      await handleSaveName();
      return;
    }
    if (key === 'company') {
      await saveCompanyStep();
      return;
    }
    if (key === 'branding') {
      await continueBrandingStep();
      return;
    }
    if (key === 'whatsapp') {
      await continueWhatsappStep();
      return;
    }
    if (key === 'ai') {
      await saveAIStep();
      return;
    }
    if (key === 'automation') {
      await saveAutomationStep();
      return;
    }
    if (key === 'notifications') {
      await saveNotificationStep();
      return;
    }

    await handleContinuePlaceholderStep();
  };

  const renderStepContent = () => {
    const key = currentStep?.key;
    if (!key) return null;

    if (key === 'profile') {
      return (
        <form onSubmit={(event) => void handleSaveName(event)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full-name">Nome completo</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Ex: Maria Souza"
              autoComplete="name"
              required
            />
          </div>
          <p className="text-xs text-slate-500">
            Organizacao atual: {orgId ? orgId.slice(0, 8) : 'nao definida'}
          </p>
        </form>
      );
    }

    if (key === 'company') {
      return (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="company-name">Nome da empresa</Label>
              <Input
                id="company-name"
                value={companyDraft.company_name}
                onChange={(event) => setCompanyDraft((prev) => ({ ...prev, company_name: event.target.value }))}
                placeholder="Ex: SolarZap Comercial"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="company-pitch">Resumo da empresa</Label>
              <Textarea
                id="company-pitch"
                value={companyDraft.elevator_pitch}
                onChange={(event) => setCompanyDraft((prev) => ({ ...prev, elevator_pitch: event.target.value }))}
                placeholder="Descreva rapidamente seu negocio para personalizar a IA."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-city">Cidade sede</Label>
              <Input
                id="company-city"
                value={companyDraft.headquarters_city}
                onChange={(event) => setCompanyDraft((prev) => ({ ...prev, headquarters_city: event.target.value }))}
                placeholder="Ex: Sao Paulo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-state">UF</Label>
              <Input
                id="company-state"
                value={companyDraft.headquarters_state}
                onChange={(event) => setCompanyDraft((prev) => ({ ...prev, headquarters_state: event.target.value }))}
                placeholder="Ex: SP"
                maxLength={2}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="company-service-area">Area de atendimento</Label>
              <Input
                id="company-service-area"
                value={companyDraft.service_area_summary}
                onChange={(event) => setCompanyDraft((prev) => ({ ...prev, service_area_summary: event.target.value }))}
                placeholder="Ex: Grande Sao Paulo e interior"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-phone">Telefone comercial</Label>
              <Input
                id="company-phone"
                value={companyDraft.public_phone}
                onChange={(event) => setCompanyDraft((prev) => ({ ...prev, public_phone: event.target.value }))}
                placeholder="Ex: (11) 4000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-whatsapp">WhatsApp comercial</Label>
              <Input
                id="company-whatsapp"
                value={companyDraft.public_whatsapp}
                onChange={(event) => setCompanyDraft((prev) => ({ ...prev, public_whatsapp: event.target.value }))}
                placeholder="Ex: +5511999999999"
              />
            </div>
          </div>
        </div>
      );
    }

    if (key === 'branding') {
      return (
        <div className="space-y-3">
          <BrandingSettingsCard canEdit={true} />
          <p className="text-xs text-slate-500">
            Esta etapa pode ser pulada e ajustada depois em Minha Empresa.
          </p>
        </div>
      );
    }

    if (key === 'whatsapp') {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-700">
              Instancias conectadas: <strong>{whatsapp.connectedCount}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newInstanceName}
              onChange={(event) => setNewInstanceName(event.target.value)}
              placeholder="Nome da instancia"
              className="max-w-xs"
            />
            <Button type="button" onClick={() => void createWhatsappInstance()} disabled={whatsapp.creating}>
              {whatsapp.creating ? 'Criando...' : 'Criar instancia'}
            </Button>
          </div>

          {currentQrCode ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-2 text-sm text-slate-700">Escaneie o QR Code no celular:</p>
              <img
                src={currentQrCode.startsWith('data:') ? currentQrCode : `data:image/png;base64,${currentQrCode}`}
                alt="QR Code WhatsApp"
                className="h-48 w-48 rounded border border-slate-200"
              />
            </div>
          ) : null}

          {whatsapp.instances.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
              {whatsapp.instances.map((instance) => (
                <div key={instance.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm">
                  <span>{instance.display_name || instance.instance_name}</span>
                  <span className="text-slate-600">{instance.status}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    if (key === 'ai') {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Ativar IA da operacao</p>
              <p className="text-xs text-slate-500">Permite atendimento e automacao com IA.</p>
            </div>
            <Switch
              checked={aiDraft.is_active}
              onCheckedChange={(checked) => setAiDraft((prev) => ({ ...prev, is_active: checked }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assistant-name">Nome do assistente</Label>
            <Input
              id="assistant-name"
              value={aiDraft.assistant_identity_name}
              onChange={(event) => setAiDraft((prev) => ({ ...prev, assistant_identity_name: event.target.value }))}
              placeholder="Ex: Consultor Solar"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-700">Permitir auto-agendamento de ligacao</p>
            <Switch
              checked={aiDraft.auto_schedule_call_enabled}
              onCheckedChange={(checked) => setAiDraft((prev) => ({ ...prev, auto_schedule_call_enabled: checked }))}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-700">Permitir auto-agendamento de visita</p>
            <Switch
              checked={aiDraft.auto_schedule_visit_enabled}
              onCheckedChange={(checked) => setAiDraft((prev) => ({ ...prev, auto_schedule_visit_enabled: checked }))}
            />
          </div>
        </div>
      );
    }

    if (key === 'automation') {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-700">Automacao: Chamada realizada</p>
            <Switch
              checked={automations.settings.dragDropChamadaRealizada}
              onCheckedChange={(checked) => automations.updateSetting('dragDropChamadaRealizada', checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-700">Automacao: Aguardando proposta</p>
            <Switch
              checked={automations.settings.dragDropAguardandoProposta}
              onCheckedChange={(checked) => automations.updateSetting('dragDropAguardandoProposta', checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-700">Pular automacoes em movimento para tras</p>
            <Switch
              checked={automations.settings.skipBackwardMoves}
              onCheckedChange={(checked) => automations.updateSetting('skipBackwardMoves', checked)}
            />
          </div>
        </div>
      );
    }

    if (key === 'notifications') {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-700">Ativar sistema de notificacoes</p>
            <Switch
              checked={notificationDraft.enabled_notifications}
              onCheckedChange={(checked) => setNotificationDraft((prev) => ({ ...prev, enabled_notifications: checked }))}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-700">Canal WhatsApp</p>
            <Switch
              checked={notificationDraft.enabled_whatsapp}
              onCheckedChange={(checked) => setNotificationDraft((prev) => ({ ...prev, enabled_whatsapp: checked }))}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-700">Canal E-mail</p>
            <Switch
              checked={notificationDraft.enabled_email}
              onCheckedChange={(checked) => setNotificationDraft((prev) => ({ ...prev, enabled_email: checked }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notification-timezone">Timezone</Label>
            <Input
              id="notification-timezone"
              value={notificationDraft.timezone}
              onChange={(event) => setNotificationDraft((prev) => ({ ...prev, timezone: event.target.value }))}
              placeholder="America/Sao_Paulo"
            />
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <OnboardingWizardShell
      steps={steps}
      currentStepKey={currentStep?.key || 'profile'}
      title={
        currentStep?.key === 'profile'
          ? 'Como devemos te chamar?'
          : currentStep?.key === 'company'
            ? 'Dados da empresa'
            : currentStep?.key === 'branding'
              ? 'Logo e paleta de cores'
              : currentStep?.key === 'whatsapp'
                ? 'Conectar WhatsApp'
                : currentStep?.key === 'ai'
                  ? 'Configuracoes da IA'
                  : currentStep?.key === 'automation'
                    ? 'Configuracoes de automacao'
                    : 'Configuracoes de notificacao'
      }
      description={
        currentStep?.key === 'profile'
          ? 'Esse nome sera usado em mensagens internas e no topo da sua conta.'
          : currentStep?.key === 'company'
            ? 'Preencha os dados essenciais para personalizar o app para sua operacao.'
            : currentStep?.key === 'branding'
              ? 'Voce pode pular esta etapa e ajustar depois em Minha Empresa.'
              : currentStep?.key === 'whatsapp'
                ? 'Conecte ao menos uma instancia para receber mensagens no app.'
                : currentStep?.key === 'ai'
                  ? 'Ative a IA e configure o comportamento inicial de atendimento.'
                  : currentStep?.key === 'automation'
                    ? 'Escolha as automacoes iniciais do seu funil de vendas.'
                    : 'Defina os canais de notificacao para sua equipe.'
      }
      onBack={currentStepIndex > 0 ? () => void handleBack() : undefined}
      onNext={() => void handleNext()}
      onSkip={currentStep?.key === 'branding' || currentStep?.key === 'whatsapp' ? () => void handleSkip() : undefined}
      canSkip={currentStep?.key === 'branding' || currentStep?.key === 'whatsapp'}
      isSubmitting={
        onboarding.isSaving
        || savingName
        || savingCompany
        || savingAI
        || savingNotifications
        || aiLoading
        || automations.isSaving
        || notifications.saving
      }
      nextLabel={
        currentStep?.key === 'profile'
          ? (nextStep ? 'Salvar e continuar' : 'Entrar no app')
          : currentStep?.key === 'whatsapp'
            ? (nextStep ? 'WhatsApp conectado, continuar' : 'Finalizar onboarding')
            : (nextStep ? 'Concluir etapa e continuar' : 'Finalizar onboarding')
      }
    >
      {renderStepContent()}
    </OnboardingWizardShell>
  );
}
