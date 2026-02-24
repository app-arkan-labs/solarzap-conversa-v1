import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    ShieldQuestion,
    Plus,
    ChevronDown,
    ChevronUp,
    Trash2,
    Edit2,
    Save,
    X,
    Loader2,
    Sparkles,
    GripVertical
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface ObjectionItem {
    id: string;
    question: string;
    response: string;
    is_preset: boolean;
    priority: number;
}

// Pre-filled common objections for solar industry
const PRESET_OBJECTIONS = [
    {
        question: "É muito caro / Não tenho dinheiro agora",
        response: "Entendo! Na verdade, com nosso financiamento, a parcela costuma ser menor que sua conta de luz atual. Você troca uma despesa por um investimento que valoriza seu imóvel."
    },
    {
        question: "Preciso pensar / Vou falar com minha esposa(o)",
        response: "Claro! Quer que eu prepare uma proposta completa para vocês analisarem juntos? Posso incluir a simulação de economia dos próximos 25 anos."
    },
    {
        question: "Não tenho espaço no telhado",
        response: "Fazemos uma visita técnica gratuita para avaliar! Muitas vezes conseguimos otimizar o espaço, e com os painéis de alta eficiência, precisamos de menos área do que você imagina."
    },
    {
        question: "Minha conta de luz não é tão alta",
        response: "Mesmo com conta menor, a economia ao longo de 25 anos é significativa! Além disso, seu imóvel valoriza e você fica protegido contra aumentos futuros da tarifa."
    },
    {
        question: "Vou esperar baixar o preço / Tecnologia melhorar",
        response: "Enquanto espera, você continua pagando conta de luz cheia. Os equipamentos já são excelentes e os preços subiram nos últimos anos. Quanto antes instalar, mais economia acumula!"
    },
    {
        question: "Lei 14.300 acabou com energia solar?",
        response: "Não! A energia solar continua muito vantajosa. A taxação é progressiva e apenas sobre o fio B, mas a economia final ainda gira em torno de 90%. O retorno do investimento mudou poucos meses, mas a segurança energética continua."
    },
    {
        question: "Homologação demora / concessionária barra?",
        response: "Nós cuidamos de toda a burocracia. O prazo regulamentar é de até 30 dias para parecer de acesso, e nossa engenharia garante que o projeto siga todas as normas para evitar reprovas."
    },
    {
        question: "Funciona no inverno / em dias nublados?",
        response: "Sim! Os painéis funcionam com radiação, não calor. Em dias nublados a produção é menor, mas compensa com os créditos gerados nos dias de sol intenso (sistema de compensação)."
    },
    {
        question: "E manutenção / limpeza / garantia?",
        response: "A manutenção é mínima, basicamente limpeza dos painéis 1 ou 2 vezes ao ano. Os equipamentos têm garantia longa (inversores ~10 anos, painéis ~25 anos de performance)."
    }
];

export function ObjecoesFAQTab() {
    const { toast } = useToast();
    const { user, orgId } = useAuth();
    const [objections, setObjections] = useState<ObjectionItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ question: '', response: '' });

    // New item form
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newForm, setNewForm] = useState({ question: '', response: '' });

    useEffect(() => {
        loadObjections();
    }, [orgId]);

    const loadObjections = async () => {
        try {
            if (!user || !orgId) return;

            const { data, error } = await supabase
                .from('objection_responses')
                .select('*')
                .eq('org_id', orgId)
                .order('priority', { ascending: true });

            if (error) throw error;

            if (data && data.length > 0) {
                setObjections(data);
            } else {
                // Initialize with presets
                await initializePresets(orgId);
            }
        } catch (error) {
            console.error('Error loading objections:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const initializePresets = async (orgId: string) => {
        try {
            const presetsToInsert = PRESET_OBJECTIONS.map((p, i) => ({
                org_id: orgId,
                question: p.question,
                response: p.response,
                is_preset: true,
                priority: i
            }));

            const { data, error } = await supabase
                .from('objection_responses')
                .insert(presetsToInsert)
                .select();

            if (error) throw error;
            setObjections(data || []);
        } catch (error) {
            console.error('Error initializing presets:', error);
        }
    };

    const handleToggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
        setEditingId(null);
    };

    const handleStartEdit = (item: ObjectionItem) => {
        setEditingId(item.id);
        setEditForm({ question: item.question, response: item.response });
        setExpandedId(item.id);
    };

    const handleSaveEdit = async () => {
        if (!editingId) return;

        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('objection_responses')
                .update({
                    question: editForm.question,
                    response: editForm.response
                })
                .eq('id', editingId);

            if (error) throw error;

            setObjections(prev => prev.map(o =>
                o.id === editingId
                    ? { ...o, question: editForm.question, response: editForm.response }
                    : o
            ));
            setEditingId(null);
            toast({ title: "Resposta atualizada!" });
        } catch (error) {
            console.error('Error saving:', error);
            toast({
                title: "Erro ao salvar",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditForm({ question: '', response: '' });
    };

    const handleAddNew = async () => {
        if (!newForm.question.trim() || !newForm.response.trim()) {
            toast({
                title: "Preencha a pergunta e resposta",
                variant: "destructive",
            });
            return;
        }

        setIsSaving(true);
        try {
            if (!user || !orgId) throw new Error('Not authenticated');

            const { data, error } = await supabase
                .from('objection_responses')
                .insert({
                    org_id: orgId,
                    question: newForm.question,
                    response: newForm.response,
                    is_preset: false,
                    priority: objections.length
                })
                .select()
                .single();

            if (error) throw error;

            setObjections(prev => [...prev, data]);
            setNewForm({ question: '', response: '' });
            setIsAddingNew(false);
            toast({ title: "Objeção adicionada!" });
        } catch (error) {
            console.error('Error adding:', error);
            toast({
                title: "Erro ao adicionar",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase
                .from('objection_responses')
                .delete()
                .eq('id', id);

            if (error) throw error;

            setObjections(prev => prev.filter(o => o.id !== id));
            toast({ title: "Removido" });
        } catch (error) {
            console.error('Error deleting:', error);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg">
                        <ShieldQuestion className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Objeções & FAQ</h2>
                        <p className="text-sm text-muted-foreground">
                            Respostas prontas para as objeções mais comuns
                        </p>
                    </div>
                </div>
                <Button onClick={() => setIsAddingNew(true)} variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Nova Objeção
                </Button>
            </div>

            {/* Info banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm text-amber-800">
                        <strong>Dica:</strong> Edite as respostas para combinar com o jeito da sua empresa falar.
                        A IA vai usar essas respostas quando o cliente fizer essas objeções.
                    </p>
                </div>
            </div>

            {/* Add New Form */}
            {isAddingNew && (
                <Card className="border-2 border-dashed border-primary/50">
                    <CardContent className="p-4 space-y-4">
                        <div>
                            <Label>Qual objeção ou pergunta o cliente faz?</Label>
                            <Input
                                placeholder='Ex: "Vocês trabalham com qual marca de inversor?"'
                                value={newForm.question}
                                onChange={(e) => setNewForm(prev => ({ ...prev, question: e.target.value }))}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label>Qual a melhor resposta?</Label>
                            <Textarea
                                placeholder="Ex: Trabalhamos com as melhores marcas do mercado..."
                                value={newForm.response}
                                onChange={(e) => setNewForm(prev => ({ ...prev, response: e.target.value }))}
                                rows={3}
                                className="mt-1"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setIsAddingNew(false)}>
                                Cancelar
                            </Button>
                            <Button onClick={handleAddNew} disabled={isSaving}>
                                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Adicionar
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Objections List */}
            <div className="space-y-3">
                {objections.map((item) => (
                    <Card
                        key={item.id}
                        className={cn(
                            "transition-all",
                            expandedId === item.id ? "shadow-md" : "hover:shadow-sm"
                        )}
                    >
                        <CardHeader
                            className="py-3 px-4 cursor-pointer"
                            onClick={() => handleToggleExpand(item.id)}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                    <GripVertical className="w-4 h-4 text-muted-foreground/50" />
                                    <span className="font-medium text-foreground">{item.question}</span>
                                    {item.is_preset && (
                                        <Badge variant="secondary" className="text-xs">Sugerido</Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleStartEdit(item);
                                        }}
                                    >
                                        <Edit2 className="w-4 h-4 text-muted-foreground" />
                                    </Button>
                                    {!item.is_preset && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(item.id);
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                                        </Button>
                                    )}
                                    {expandedId === item.id ? (
                                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                    )}
                                </div>
                            </div>
                        </CardHeader>

                        {expandedId === item.id && (
                            <CardContent className="pt-0 pb-4 px-4">
                                {editingId === item.id ? (
                                    <div className="space-y-4 pt-2 border-t">
                                        <div>
                                            <Label className="text-sm">Objeção/Pergunta</Label>
                                            <Input
                                                value={editForm.question}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, question: e.target.value }))}
                                                className="mt-1"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-sm">Resposta</Label>
                                            <Textarea
                                                value={editForm.response}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, response: e.target.value }))}
                                                rows={4}
                                                className="mt-1"
                                            />
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                                                <X className="w-4 h-4 mr-1" />
                                                Cancelar
                                            </Button>
                                            <Button size="sm" onClick={handleSaveEdit} disabled={isSaving}>
                                                {isSaving ? (
                                                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                                ) : (
                                                    <Save className="w-4 h-4 mr-1" />
                                                )}
                                                Salvar
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="pt-2 border-t">
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                            {item.response}
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    );
}
