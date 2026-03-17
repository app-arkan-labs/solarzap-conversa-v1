import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { QuestionCard } from './QuestionCard';
import { Building2, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BRAZIL_STATES } from '@/constants/solarIrradiance';

interface CompanyProfile {
    company_name: string;
    elevator_pitch: string;
    differentials: string;
    installation_process: string;
    warranty_info: string;
    payment_options: string;
    headquarters_city: string;
    headquarters_state: string;
    headquarters_address: string;
    headquarters_zip: string;
    service_area_summary: string;
    business_hours_text: string;
    public_phone: string;
    public_whatsapp: string;
    technical_visit_is_free: boolean | null;
    technical_visit_fee_notes: string;
    supports_financing: boolean | null;
    supports_card_installments: boolean | null;
    payment_policy_summary: string;
}

const DEFAULT_PROFILE: CompanyProfile = {
    company_name: '',
    elevator_pitch: '',
    differentials: '',
    installation_process: '',
    warranty_info: '',
    payment_options: '',
    headquarters_city: '',
    headquarters_state: '',
    headquarters_address: '',
    headquarters_zip: '',
    service_area_summary: '',
    business_hours_text: '',
    public_phone: '',
    public_whatsapp: '',
    technical_visit_is_free: null,
    technical_visit_fee_notes: '',
    supports_financing: null,
    supports_card_installments: null,
    payment_policy_summary: '',
};

const PROFILE_PROGRESS_KEYS: Array<keyof CompanyProfile> = [
    'company_name',
    'elevator_pitch',
    'differentials',
    'installation_process',
    'warranty_info',
    'payment_options',
    'headquarters_city',
    'headquarters_state',
    'headquarters_address',
    'headquarters_zip',
    'service_area_summary',
    'business_hours_text',
    'public_phone',
    'public_whatsapp',
    'technical_visit_is_free',
    'technical_visit_fee_notes',
    'supports_financing',
    'supports_card_installments',
    'payment_policy_summary',
];

const isProfileFieldFilled = (value: CompanyProfile[keyof CompanyProfile]): boolean => {
    if (typeof value === 'boolean') return true;
    if (value === null || value === undefined) return false;
    return String(value).trim().length > 0;
};

export function SobreEmpresaTab() {
    const { toast } = useToast();
    const { user, orgId } = useAuth();
    const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_PROFILE);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [savedFields, setSavedFields] = useState<Set<keyof CompanyProfile>>(new Set());

    // Warn user before leaving with unsaved changes
    useEffect(() => {
        if (!hasChanges) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [hasChanges]);

    useEffect(() => {
        loadProfile();
    }, [orgId]);

    const loadProfile = async () => {
        try {
            if (!user || !orgId) return;

            const { data, error } = await supabase
                .from('company_profile')
                .select('*')
                .eq('org_id', orgId)
                .maybeSingle();

            if (data) {
                setProfile({
                    company_name: data.company_name || '',
                    elevator_pitch: data.elevator_pitch || '',
                    differentials: data.differentials || '',
                    installation_process: data.installation_process || '',
                    warranty_info: data.warranty_info || '',
                    payment_options: data.payment_options || '',
                    headquarters_city: data.headquarters_city || '',
                    headquarters_state: data.headquarters_state || '',
                    headquarters_address: data.headquarters_address || '',
                    headquarters_zip: data.headquarters_zip || '',
                    service_area_summary: data.service_area_summary || '',
                    business_hours_text: data.business_hours_text || '',
                    public_phone: data.public_phone || '',
                    public_whatsapp: data.public_whatsapp || '',
                    technical_visit_is_free: typeof data.technical_visit_is_free === 'boolean'
                        ? data.technical_visit_is_free
                        : null,
                    technical_visit_fee_notes: data.technical_visit_fee_notes || '',
                    supports_financing: typeof data.supports_financing === 'boolean'
                        ? data.supports_financing
                        : null,
                    supports_card_installments: typeof data.supports_card_installments === 'boolean'
                        ? data.supports_card_installments
                        : null,
                    payment_policy_summary: data.payment_policy_summary || '',
                });
                // Mark all non-empty fields as saved
                const saved = new Set<keyof CompanyProfile>();
                PROFILE_PROGRESS_KEYS.forEach((key) => {
                    if (isProfileFieldFilled((data as any)?.[key])) {
                        saved.add(key);
                    }
                });
                setSavedFields(saved);
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleChange = (field: keyof CompanyProfile, value: string) => {
        setProfile(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    const handleBooleanChange = (
        field: 'technical_visit_is_free' | 'supports_financing' | 'supports_card_installments',
        rawValue: string,
    ) => {
        const value = rawValue === 'sim' ? true : rawValue === 'nao' ? false : null;
        setProfile((prev) => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (!user || !orgId) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('company_profile')
                .upsert({
                    org_id: orgId,
                    ...profile,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'org_id' });

            if (error) throw error;

            // Update saved fields
            const saved = new Set<keyof CompanyProfile>();
            PROFILE_PROGRESS_KEYS.forEach((key) => {
                if (isProfileFieldFilled(profile[key])) {
                    saved.add(key);
                }
            });
            setSavedFields(saved);
            setHasChanges(false);

            toast({
                title: "Informações salvas!",
                description: "Os dados da empresa foram atualizados.",
            });
        } catch (error) {
            console.error('Error saving profile:', error);
            toast({
                title: "Erro ao salvar",
                description: "Não foi possível salvar as informações.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Calculate progress
    const totalFields = PROFILE_PROGRESS_KEYS.length;
    const filledFields = PROFILE_PROGRESS_KEYS.filter((key) => isProfileFieldFilled(profile[key])).length;
    const progressPercent = Math.round((filledFields / totalFields) * 100);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header with Progress */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="brand-gradient-bg flex h-10 w-10 items-center justify-center rounded-xl shadow-lg shadow-primary/20">
                        <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Sobre sua Empresa</h2>
                        <p className="text-sm text-muted-foreground">
                            Essas informações ajudam a IA a entender e representar seu negócio
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {/* Progress indicator */}
                    <div className="flex items-center gap-2">
                        <div className="w-24 h-2 overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-full bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--secondary)))] transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <span className="text-sm text-muted-foreground">{filledFields}/{totalFields}</span>
                    </div>
                    {hasChanges && (
                        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                            {isSaving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4" />
                            )}
                            Salvar
                        </Button>
                    )}
                </div>
            </div>

            {/* All fields complete celebration */}
            {filledFields === totalFields && (
                <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/8 p-4">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span className="font-medium text-foreground">
                        Excelente! Todas as informações foram preenchidas. A IA está pronta para usar esses dados.
                    </span>
                </div>
            )}

            {/* Question Cards */}
            <div className="space-y-4">
                <QuestionCard
                    question="Nome da empresa"
                    hint="Esse nome é usado pela IA para se apresentar corretamente ao lead"
                    placeholder="Ex: SolarTech Energia Solar"
                    value={profile.company_name}
                    onChange={(v) => handleChange('company_name', v)}
                    maxLength={120}
                    isSaved={savedFields.has('company_name')}
                />

                <QuestionCard
                    question="Descreva sua empresa em poucas palavras"
                    hint="Um resumo rápido que a IA pode usar para se apresentar ao cliente"
                    placeholder="Ex: Somos a SolarTech, especializada em energia solar residencial e comercial há 8 anos, com mais de 500 projetos instalados na região..."
                    value={profile.elevator_pitch}
                    onChange={(v) => handleChange('elevator_pitch', v)}
                    multiline
                    rows={3}
                    maxLength={500}
                    isSaved={savedFields.has('elevator_pitch')}
                />

                <QuestionCard
                    question="Quais são os diferenciais da sua empresa?"
                    hint="O que faz vocês serem diferentes da concorrência?"
                    placeholder="Ex: Garantia estendida de 25 anos, equipe própria de instalação, financiamento em até 84x sem entrada, atendimento 24h..."
                    value={profile.differentials}
                    onChange={(v) => handleChange('differentials', v)}
                    multiline
                    rows={3}
                    maxLength={500}
                    isSaved={savedFields.has('differentials')}
                />

                <QuestionCard
                    question="Como funciona o processo de instalação?"
                    hint="Explique o passo a passo desde o contato inicial até a instalação"
                    placeholder="Ex: 1) Visita técnica gratuita, 2) Proposta personalizada em 24h, 3) Aprovação do financiamento, 4) Instalação em 7 dias, 5) Homologação com a concessionária..."
                    value={profile.installation_process}
                    onChange={(v) => handleChange('installation_process', v)}
                    multiline
                    rows={4}
                    maxLength={800}
                    isSaved={savedFields.has('installation_process')}
                />

                <QuestionCard
                    question="Qual a garantia oferecida?"
                    hint="Detalhe as garantias dos equipamentos e serviços"
                    placeholder="Ex: Painéis: 25 anos de garantia linear de performance. Inversor: 10 anos de garantia. Instalação: 5 anos de garantia contra defeitos..."
                    value={profile.warranty_info}
                    onChange={(v) => handleChange('warranty_info', v)}
                    multiline
                    rows={3}
                    maxLength={400}
                    isSaved={savedFields.has('warranty_info')}
                />

                <QuestionCard
                    question="Quais formas de pagamento vocês aceitam?"
                    hint="Liste as opções de pagamento e financiamento disponíveis"
                    placeholder="Ex: À vista com 10% de desconto, cartão em 12x, financiamento bancário em até 84x, consórcio contemplado..."
                    value={profile.payment_options}
                    onChange={(v) => handleChange('payment_options', v)}
                    multiline
                    rows={3}
                    maxLength={400}
                    isSaved={savedFields.has('payment_options')}
                />
                <QuestionCard
                    question="Cidade da sede da empresa"
                    hint="Ajuda a IA a responder corretamente onde a empresa fica"
                    placeholder="Ex: Maringa"
                    value={profile.headquarters_city}
                    onChange={(v) => handleChange('headquarters_city', v)}
                    maxLength={120}
                    isSaved={savedFields.has('headquarters_city')}
                />

                <div className="rounded-xl border bg-card p-4">
                    <p className="text-sm font-medium">Estado (UF) da sede</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Selecione a UF principal da empresa.
                    </p>
                    <div className="mt-3">
                        <Select
                            value={profile.headquarters_state || '__none'}
                            onValueChange={(value) => handleChange('headquarters_state', value === '__none' ? '' : value)}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecione a UF" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none">Selecione</SelectItem>
                                {BRAZIL_STATES.map((state) => (
                                    <SelectItem key={state.uf} value={state.uf}>
                                        {state.uf} - {state.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <QuestionCard
                    question="Endereco principal da empresa"
                    hint="Endereco usado quando o lead pergunta localizacao"
                    placeholder="Ex: Av. Brasil, 1234 - Centro"
                    value={profile.headquarters_address}
                    onChange={(v) => handleChange('headquarters_address', v)}
                    multiline
                    rows={2}
                    maxLength={220}
                    isSaved={savedFields.has('headquarters_address')}
                />

                <QuestionCard
                    question="CEP da sede (opcional)"
                    hint="Pode ser usado em respostas objetivas de localizacao"
                    placeholder="Ex: 87010-000"
                    value={profile.headquarters_zip}
                    onChange={(v) => handleChange('headquarters_zip', v)}
                    maxLength={20}
                    isSaved={savedFields.has('headquarters_zip')}
                />

                <QuestionCard
                    question="Resumo da area de atendimento"
                    hint="Exemplo: atendemos todo o Noroeste do PR e regioes proximas"
                    placeholder="Ex: Atendemos Mandaguacu, Maringa e regiao metropolitana"
                    value={profile.service_area_summary}
                    onChange={(v) => handleChange('service_area_summary', v)}
                    multiline
                    rows={2}
                    maxLength={300}
                    isSaved={savedFields.has('service_area_summary')}
                />

                <QuestionCard
                    question="Horario comercial"
                    hint="Usado para orientar respostas e expectativa de retorno"
                    placeholder="Ex: Seg a Sex 08:00-18:00, Sab 08:00-12:00"
                    value={profile.business_hours_text}
                    onChange={(v) => handleChange('business_hours_text', v)}
                    maxLength={160}
                    isSaved={savedFields.has('business_hours_text')}
                />

                <QuestionCard
                    question="Telefone publico"
                    hint="Telefone da empresa para contato geral"
                    placeholder="Ex: (44) 99999-9999"
                    value={profile.public_phone}
                    onChange={(v) => handleChange('public_phone', v)}
                    maxLength={40}
                    isSaved={savedFields.has('public_phone')}
                />

                <QuestionCard
                    question="WhatsApp publico"
                    hint="Canal principal de contato da empresa"
                    placeholder="Ex: 44988888888"
                    value={profile.public_whatsapp}
                    onChange={(v) => handleChange('public_whatsapp', v)}
                    maxLength={40}
                    isSaved={savedFields.has('public_whatsapp')}
                />

                <div className="rounded-xl border bg-card p-4">
                    <p className="text-sm font-medium">A visita tecnica e gratuita?</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Essa resposta evita informacoes contraditorias no atendimento.
                    </p>
                    <div className="mt-3">
                        <Select
                            value={
                                profile.technical_visit_is_free === true
                                    ? 'sim'
                                    : profile.technical_visit_is_free === false
                                        ? 'nao'
                                        : 'nao_informado'
                            }
                            onValueChange={(value) => handleBooleanChange('technical_visit_is_free', value)}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="sim">Sim</SelectItem>
                                <SelectItem value="nao">Nao</SelectItem>
                                <SelectItem value="nao_informado">Nao informado</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <QuestionCard
                    question="Observacoes sobre custo de visita"
                    hint="Exemplo: gratuita em raio de 30km, fora disso consultar taxa"
                    placeholder="Ex: Visita tecnica gratuita para cidades atendidas"
                    value={profile.technical_visit_fee_notes}
                    onChange={(v) => handleChange('technical_visit_fee_notes', v)}
                    multiline
                    rows={2}
                    maxLength={260}
                    isSaved={savedFields.has('technical_visit_fee_notes')}
                />

                <div className="rounded-xl border bg-card p-4">
                    <p className="text-sm font-medium">Aceita financiamento?</p>
                    <div className="mt-3">
                        <Select
                            value={
                                profile.supports_financing === true
                                    ? 'sim'
                                    : profile.supports_financing === false
                                        ? 'nao'
                                        : 'nao_informado'
                            }
                            onValueChange={(value) => handleBooleanChange('supports_financing', value)}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="sim">Sim</SelectItem>
                                <SelectItem value="nao">Nao</SelectItem>
                                <SelectItem value="nao_informado">Nao informado</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="rounded-xl border bg-card p-4">
                    <p className="text-sm font-medium">Aceita parcelamento no cartao?</p>
                    <div className="mt-3">
                        <Select
                            value={
                                profile.supports_card_installments === true
                                    ? 'sim'
                                    : profile.supports_card_installments === false
                                        ? 'nao'
                                        : 'nao_informado'
                            }
                            onValueChange={(value) => handleBooleanChange('supports_card_installments', value)}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="sim">Sim</SelectItem>
                                <SelectItem value="nao">Nao</SelectItem>
                                <SelectItem value="nao_informado">Nao informado</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <QuestionCard
                    question="Resumo da politica comercial de pagamento"
                    hint="Use este campo para consolidar regras de parcelamento/financiamento"
                    placeholder="Ex: Parcelamento em ate 12x no cartao e financiamento bancario em ate 84x sujeito a analise"
                    value={profile.payment_policy_summary}
                    onChange={(v) => handleChange('payment_policy_summary', v)}
                    multiline
                    rows={3}
                    maxLength={320}
                    isSaved={savedFields.has('payment_policy_summary')}
                />
            </div>
        </div>
    );
}
