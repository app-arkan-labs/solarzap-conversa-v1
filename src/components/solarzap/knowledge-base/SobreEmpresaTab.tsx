import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { QuestionCard } from './QuestionCard';
import { Building2, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface CompanyProfile {
    elevator_pitch: string;
    differentials: string;
    installation_process: string;
    warranty_info: string;
    payment_options: string;
}

const DEFAULT_PROFILE: CompanyProfile = {
    elevator_pitch: '',
    differentials: '',
    installation_process: '',
    warranty_info: '',
    payment_options: ''
};

export function SobreEmpresaTab() {
    const { toast } = useToast();
    const { user, orgId } = useAuth();
    const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_PROFILE);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [savedFields, setSavedFields] = useState<Set<keyof CompanyProfile>>(new Set());

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
                    elevator_pitch: data.elevator_pitch || '',
                    differentials: data.differentials || '',
                    installation_process: data.installation_process || '',
                    warranty_info: data.warranty_info || '',
                    payment_options: data.payment_options || ''
                });
                // Mark all non-empty fields as saved
                const saved = new Set<keyof CompanyProfile>();
                Object.entries(data).forEach(([key, val]) => {
                    if (val && typeof val === 'string' && val.trim()) {
                        saved.add(key as keyof CompanyProfile);
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
            Object.entries(profile).forEach(([key, val]) => {
                if (val && val.trim()) {
                    saved.add(key as keyof CompanyProfile);
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
    const totalFields = 5;
    const filledFields = Object.values(profile).filter(v => v && v.trim()).length;
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
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
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
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-300"
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
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="text-green-800 font-medium">
                        Excelente! Todas as informações foram preenchidas. A IA está pronta para usar esses dados.
                    </span>
                </div>
            )}

            {/* Question Cards */}
            <div className="space-y-4">
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
            </div>
        </div>
    );
}
