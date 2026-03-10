import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Contact, Channel, PipelineStage, ClientType } from '@/types/solarzap';
import type { LeadStageData } from '@/types/ai';
import { listMembers, type MemberDto } from '@/lib/orgAdminClient';
import { normalizeLeadStage } from '@/lib/leadStageNormalization';
import { normalizeChannelValue } from '@/lib/channelNormalization';
import {
    buildImportLeadsSummary,
    type ImportLeadsSummary,
    type ImportLeadRpcRow,
} from '@/lib/importLeadsSummary';

// Module-level cache for DB schema capabilities (to avoid repeated failed requests)
let dbSupportsExtendedColumns: boolean | null = null;
const META_TAG = '[[LEAD_META_JSON]]';

// Fields that might not exist in older DB versions
interface ExtendedLeadFields {
    endereco?: string;
    cidade?: string;
    cep?: string;
    tipo_cliente?: ClientType;
    uf?: string;
    concessionaria?: string;
    tipo_ligacao?: 'monofasico' | 'bifasico' | 'trifasico';
    conta_luz_mensal?: number;
    tarifa_kwh?: number;
    custo_disponibilidade_kwh?: number;
    performance_ratio?: number;
    preco_por_kwp?: number;
    abater_custo_disponibilidade_no_dimensionamento?: boolean;
    latitude?: number;
    longitude?: number;
    irradiance_source?: string;
    irradiance_ref_at?: string;
}

// Helper: Extract valid JSON from observations if present
const parseLeadMeta = (obs: string | null | undefined): ExtendedLeadFields => {
    if (!obs || !obs.includes(META_TAG)) return {};
    try {
        const parts = obs.split(META_TAG);
        if (parts.length < 2) return {};
        // The JSON is strictly after the tag
        let jsonStr = parts[1].trim();
        // Backwards compatibility: some payloads include a leading ':' (e.g. '[[LEAD_META_JSON]]:{...}').
        if (jsonStr.startsWith(':')) jsonStr = jsonStr.slice(1).trim();
        return JSON.parse(jsonStr) || {};
    } catch (e) {
        // console.warn('Failed to parse LEAD_META_JSON', e);
        return {};
    }
};

// Helper: Clean observations (remove old meta)
const cleanObservations = (obs: string | null | undefined): string => {
    if (!obs) return '';
    if (!obs.includes(META_TAG)) return obs;
    return obs.split(META_TAG)[0].trim();
};

// DB column `leads.consumo_kwh` may be bigint/int in some deployments.
// Normalize fractional UI inputs (e.g. 15533.22) before writes to avoid Postgres bigint cast errors.
const normalizeConsumokwhForDb = (value: number | undefined): number | undefined => {
    if (value === undefined) return undefined;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.round(numeric));
};

const toOptionalNumber = (value: unknown): number | undefined => {
    if (value === null || value === undefined || value === '') return undefined;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
};

const parseLeadStageData = (raw: unknown): LeadStageData | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const obj = raw as Record<string, unknown>;
    if (Object.keys(obj).length === 0) return undefined;
    return obj as LeadStageData;
};

// Helper: Update observations with new meta
const packLeadMeta = (currentObs: string | null | undefined, data: ExtendedLeadFields): string => {
    const baseObs = cleanObservations(currentObs);
    // Only pack if there is actual data to save
    const hasData = Object.values(data).some(v => v !== undefined && v !== null && v !== '');
    if (!hasData) return baseObs;
    return `${baseObs}\n\n${META_TAG}:${JSON.stringify(data)}`;
};

// Helper to map DB lead to Contact (Domain entity)
export const mapChannel = (canal: string): Channel => {
    return normalizeChannelValue(canal);
};

export const mapPipelineStage = (status: string): PipelineStage => {
    return normalizeLeadStage(status);
};

export const leadToContact = (lead: any): Contact => {
    // 1. Try real columns first (if type definition allowed them, assuming lead: any to bypass strict check for now)
    // 2. Fallback to meta
    const meta = parseLeadMeta(lead.observacoes || lead.notes); // DB might use either alias depending on legacy

    // Notes: clean the meta tag out for display
    const visibleNotes = cleanObservations(lead.observacoes || lead.notes);
    const stageData = parseLeadStageData(lead.lead_stage_data);

    return {
        id: String(lead.id),
        name: lead.nome || 'Sem nome',
        company: lead.empresa || undefined,
        phone: lead.telefone || '',
        email: lead.email || undefined,
        channel: mapChannel(lead.canal),
        pipelineStage: mapPipelineStage(lead.status_pipeline),

        // Extended Fields (Column ?? Meta ?? Default)
        clientType: (lead.tipo_cliente || meta.tipo_cliente || 'residencial') as ClientType,
        address: lead.endereco || meta.endereco,
        city: lead.cidade || meta.cidade,
        state: lead.uf || meta.uf,
        // Zip isn't in standard LeadDB usually, but we check:
        // @ts-ignore
        zip: lead.cep || meta.cep, // Maps to 'cep' in UI usually
        energyDistributor: lead.concessionaria || meta.concessionaria,
        connectionType: (lead.tipo_ligacao || meta.tipo_ligacao) as Contact['connectionType'] | undefined,
        averageMonthlyBill: toOptionalNumber(lead.conta_luz_mensal ?? meta.conta_luz_mensal),
        energyTariffKwh: toOptionalNumber(lead.tarifa_kwh ?? meta.tarifa_kwh),
        availabilityCostKwh: toOptionalNumber(lead.custo_disponibilidade_kwh ?? meta.custo_disponibilidade_kwh),
        performanceRatio: toOptionalNumber(lead.performance_ratio ?? meta.performance_ratio),
        pricePerKwp: toOptionalNumber(lead.preco_por_kwp ?? meta.preco_por_kwp),
        subtractAvailabilityInSizing: (lead.abater_custo_disponibilidade_no_dimensionamento ?? meta.abater_custo_disponibilidade_no_dimensionamento) ?? undefined,
        latitude: toOptionalNumber(lead.latitude ?? meta.latitude),
        longitude: toOptionalNumber(lead.longitude ?? meta.longitude),
        irradianceSource: String(lead.irradiance_source ?? meta.irradiance_source ?? '') || undefined,
        irradianceRefAt: String(lead.irradiance_ref_at ?? meta.irradiance_ref_at ?? '') || undefined,

        consumption: lead.consumo_kwh || 0,
        projectValue: lead.valor_estimado || 0,

        cpfCnpj: undefined,
        createdAt: new Date(lead.created_at),
        lastContact: lead.last_message_at ? new Date(lead.last_message_at) : new Date(lead.updated_at || lead.created_at),
        stageChangedAt: lead.stage_changed_at ? new Date(lead.stage_changed_at) : new Date(lead.created_at),
        phoneE164: lead.phone_e164 || undefined,
        instanceName: lead.instance_name || undefined,
        assignedToUserId: lead.assigned_to_user_id || null,

        notes: visibleNotes,
        stageData,

        // AI Control
        aiEnabled: lead.ai_enabled ?? true,
        aiPausedReason: lead.ai_paused_reason,
        aiPausedAt: lead.ai_paused_at ? new Date(lead.ai_paused_at) : null,
    };
};

export interface LeadPatch {
    nome?: string;
    telefone?: string;
    email?: string;
    empresa?: string;
    tipo_cliente?: ClientType;
    endereco?: string;
    cidade?: string;
    cep?: string;
    uf?: string;
    concessionaria?: string;
    tipo_ligacao?: 'monofasico' | 'bifasico' | 'trifasico';
    conta_luz_mensal?: number;
    tarifa_kwh?: number;
    custo_disponibilidade_kwh?: number;
    performance_ratio?: number;
    preco_por_kwp?: number;
    abater_custo_disponibilidade_no_dimensionamento?: boolean;
    latitude?: number;
    longitude?: number;
    irradiance_source?: string;
    irradiance_ref_at?: string;
    consumo_kwh?: number;
    valor_estimado?: number;
    observacoes?: string;
    status_pipeline?: PipelineStage;
    canal?: Channel;
    assigned_to_user_id?: string | null;
}

export type LeadScopeFilter = 'mine' | 'org_all' | `user:${string}`;

export function useLeads() {
    const { user, orgId, canViewTeamLeads, role } = useAuth();
    const queryClient = useQueryClient();
    const [leadScope, setLeadScope] = useState<LeadScopeFilter>('mine');
    const [leadScopeMembers, setLeadScopeMembers] = useState<MemberDto[]>([]);
    const [isLoadingLeadScopeMembers, setIsLoadingLeadScopeMembers] = useState(false);
    const canViewTeam = canViewTeamLeads;
    const isOrgManager = role === 'owner' || role === 'admin';
    const effectiveLeadScope: LeadScopeFilter = canViewTeam ? leadScope : 'mine';
    const scopedOwnerUserId = useMemo(() => {
        if (!user) return null;
        if (effectiveLeadScope === 'mine') return user.id;
        if (effectiveLeadScope === 'org_all') return null;
        if (effectiveLeadScope.startsWith('user:')) {
            const candidate = effectiveLeadScope.slice(5).trim();
            return candidate.length > 0 ? candidate : user.id;
        }
        return user.id;
    }, [effectiveLeadScope, user]);
    const showTeamLeads = canViewTeam && effectiveLeadScope !== 'mine';
    const [allowedInstanceNames, setAllowedInstanceNames] = useState<string[]>([]);
    const allowedInstanceSet = useMemo(() => new Set(allowedInstanceNames), [allowedInstanceNames]);
    const allowedInstanceKey = useMemo(
        () => [...allowedInstanceNames].sort((a, b) => a.localeCompare(b)).join('|'),
        [allowedInstanceNames],
    );
    const leadsQueryKey = useMemo(
        () => ['leads', orgId, user?.id, effectiveLeadScope, scopedOwnerUserId, canViewTeam, isOrgManager ? 'manager' : allowedInstanceKey] as const,
        [orgId, user?.id, effectiveLeadScope, scopedOwnerUserId, canViewTeam, isOrgManager, allowedInstanceKey]
    );

    useEffect(() => {
        setLeadScope('mine');
    }, [orgId]);

    useEffect(() => {
        if (!canViewTeam) {
            setLeadScope('mine');
        }
    }, [canViewTeam]);

    const setShowTeamLeads = useCallback((show: boolean) => {
        if (!canViewTeam) {
            setLeadScope('mine');
            return;
        }
        setLeadScope(show ? 'org_all' : 'mine');
    }, [canViewTeam]);

    useEffect(() => {
        let active = true;

        const loadScopeMembers = async () => {
            if (!canViewTeam || !orgId) {
                if (active) {
                    setLeadScopeMembers([]);
                    setIsLoadingLeadScopeMembers(false);
                }
                return;
            }

            setIsLoadingLeadScopeMembers(true);
            try {
                const response = await listMembers(orgId);
                if (!active) return;

                const seen = new Set<string>();
                const members = (response.members || []).filter((member) => {
                    if (!member.user_id) return false;
                    if (seen.has(member.user_id)) return false;
                    seen.add(member.user_id);
                    return true;
                });

                setLeadScopeMembers(members);
                setLeadScope((currentScope) => {
                    if (!currentScope.startsWith('user:')) return currentScope;
                    const scopedUserId = currentScope.slice(5).trim();
                    if (!scopedUserId) return 'mine';
                    const isKnownMember = members.some((member) => member.user_id === scopedUserId);
                    return isKnownMember ? currentScope : 'mine';
                });
            } catch (error) {
                if (!active) return;
                console.warn('Failed to load members for lead scope filter:', error);
                setLeadScopeMembers([]);
                setLeadScope((currentScope) => (currentScope.startsWith('user:') ? 'mine' : currentScope));
            } finally {
                if (active) setIsLoadingLeadScopeMembers(false);
            }
        };

        void loadScopeMembers();
        return () => {
            active = false;
        };
    }, [canViewTeam, orgId]);

    useEffect(() => {
        let alive = true;

        const loadAllowedInstances = async () => {
            if (!user || !orgId || isOrgManager) {
                if (alive) {
                    setAllowedInstanceNames([]);
                }
                return;
            }

            const { data, error } = await supabase
                .from('whatsapp_instances')
                .select('instance_name')
                .eq('org_id', orgId)
                .eq('user_id', user.id)
                .eq('is_active', true);

            if (!alive) return;
            if (error) {
                console.error('Error loading user allowed instances:', error);
                setAllowedInstanceNames([]);
                return;
            }

            const instanceNames = (data ?? [])
                .map((row) => (typeof row.instance_name === 'string' ? row.instance_name.trim() : ''))
                .filter((name) => name.length > 0);

            setAllowedInstanceNames(instanceNames);
        };

        void loadAllowedInstances();

        return () => {
            alive = false;
        };
    }, [isOrgManager, orgId, user]);

    // Real-time subscription for leads
    useEffect(() => {
        if (!user || !orgId) return;

        const subscription = supabase
            .channel(`leads-realtime-${orgId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'leads',
                    filter: `org_id=eq.${orgId}`,
                },
                (payload) => {
                    const isMineScope = scopedOwnerUserId === user.id;
                    if (payload.eventType === 'INSERT') {
                        const newLead = payload.new;
                        if (scopedOwnerUserId && newLead.assigned_to_user_id !== scopedOwnerUserId) {
                            return;
                        }
                        if (!isOrgManager && isMineScope) {
                            const instanceName = typeof newLead.instance_name === 'string' ? newLead.instance_name : null;
                            if (allowedInstanceNames.length === 0 && instanceName) {
                                return;
                            }
                            if (instanceName && !allowedInstanceSet.has(instanceName)) {
                                return;
                            }
                        }
                        const newContact = leadToContact(newLead);
                        toast.success(`Novo Lead recebido: ${newContact.name}`);
                        queryClient.setQueryData(leadsQueryKey, (oldData: Contact[] | undefined) => {
                            if (!oldData) return [newContact];
                            if (oldData.some(c => c.id === newContact.id)) return oldData;
                            return [newContact, ...oldData];
                        });
                    } else if (payload.eventType === 'DELETE') {
                        const deletedId = String(payload.old.id);
                        queryClient.setQueryData(leadsQueryKey, (oldData: Contact[] | undefined) => {
                            if (!oldData) return [];
                            return oldData.filter(c => c.id !== deletedId);
                        });
                        toast.info('Contato excluido');
                    } else {
                        // UPDATE - optimistic merge to reflect AI toggle and other changes instantly
                        const updated = payload.new;
                        if (updated) {
                            const updatedContact = leadToContact(updated);
                            if (!isOrgManager && isMineScope) {
                                const isMine = (updatedContact.assignedToUserId || '') === scopedOwnerUserId;
                                const hasAllowedInstance =
                                    !updatedContact.instanceName ||
                                    (allowedInstanceNames.length > 0 && allowedInstanceSet.has(updatedContact.instanceName));
                                if (!isMine || !hasAllowedInstance) {
                                    queryClient.setQueryData(leadsQueryKey, (oldData: Contact[] | undefined) => {
                                        if (!Array.isArray(oldData)) return oldData;
                                        return oldData.filter(c => c.id !== updatedContact.id);
                                    });
                                    return;
                                }
                            }
                            if (scopedOwnerUserId && (updatedContact.assignedToUserId || '') !== scopedOwnerUserId) {
                                queryClient.setQueryData(leadsQueryKey, (oldData: Contact[] | undefined) => {
                                    if (!Array.isArray(oldData)) return oldData;
                                    return oldData.filter(c => c.id !== updatedContact.id);
                                });
                                return;
                            }
                            queryClient.setQueryData(leadsQueryKey, (oldData: Contact[] | undefined) => {
                                if (!Array.isArray(oldData)) return oldData;
                                return oldData.map(c => c.id === updatedContact.id ? { ...c, ...updatedContact } : c);
                            });
                        }
                    }
                    queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
                }
            )
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [user, orgId, queryClient, leadsQueryKey, isOrgManager, allowedInstanceNames, allowedInstanceSet, scopedOwnerUserId]);

    const leadsQuery = useQuery({
        queryKey: leadsQueryKey,
        queryFn: async () => {
            if (!user || !orgId) return [];
            let query = supabase
                .from('leads')
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: false });

            if (scopedOwnerUserId) {
                query = query.eq('assigned_to_user_id', scopedOwnerUserId);
            }

            let { data, error } = await query;
            if (error && (error.code === '42703' || error.code === 'PGRST204')) {
                // Defensive fallback in case schema cache lags behind migration.
                // Still scope by org_id for data isolation.
                let fallbackQuery = supabase
                    .from('leads')
                    .select('*')
                    .eq('org_id', orgId)
                    .order('created_at', { ascending: false });
                if (scopedOwnerUserId) {
                    fallbackQuery = fallbackQuery.eq('user_id', scopedOwnerUserId);
                }
                const fallback = await fallbackQuery;
                data = fallback.data;
                error = fallback.error;
            }

            if (error) throw error;
            const contacts = (data || []).map(leadToContact);
            if (isOrgManager || !scopedOwnerUserId || scopedOwnerUserId !== user.id) {
                return contacts;
            }

            if (allowedInstanceNames.length === 0) {
                return contacts.filter((c) => !c.instanceName);
            }

            return contacts.filter((c) => !c.instanceName || allowedInstanceSet.has(c.instanceName));
        },
        enabled: !!user && !!orgId,
        refetchInterval: 5000,
    });

    // GENERIC HELPER: Try insert/update with Safe Fallback
    const safeSupabaseWrite = async (
        operation: 'INSERT' | 'UPDATE',
        table: string,
        basePayload: any,
        extendedPayload: ExtendedLeadFields,
        matchId?: number
    ) => {
        const hasExtendedData = Object.values(extendedPayload).some(
            (value) => value !== undefined && value !== null && value !== ''
        );

        const buildFallbackPayload = async () => {
            // If there is no extended data to pack, do not touch observations implicitly.
            if (!hasExtendedData) return { ...basePayload };

            let currentObs = basePayload.observacoes;
            if (operation === 'UPDATE' && currentObs === undefined && matchId !== undefined) {
                const { data: existing } = await supabase
                    .from(table)
                    .select('observacoes')
                    .eq('id', matchId)
                    .maybeSingle();
                currentObs = existing?.observacoes;
            }

            return {
                ...basePayload,
                observacoes: packLeadMeta(currentObs, extendedPayload),
            };
        };

        // Prepare FULL payload attempt
        const fullPayload = { ...basePayload, ...extendedPayload };

        // Optimization: If we already know DB fails on extended cols, go straight to fallback
        if (dbSupportsExtendedColumns === false) {
            // console.log('Using Cached Fallback (Meta JSON)');
            const fallbackPayload = await buildFallbackPayload();
            if (operation === 'INSERT') return supabase.from(table).insert(fallbackPayload).select().single();
            else return supabase.from(table).update(fallbackPayload).eq('id', matchId).select().single();
        }

        // Try FULL Attempt
        let query;
        if (operation === 'INSERT') query = supabase.from(table).insert(fullPayload).select().single();
        else query = supabase.from(table).update(fullPayload).eq('id', matchId).select().single();

        const { data, error } = await query;

        const isMissingColumn =
            // Postgres: undefined_column
            error && (error.code === '42703' ||
                // PostgREST: schema cache mismatch ("Could not find the 'xyz' column...")
                error.code === 'PGRST204' ||
                /schema cache/i.test(error.message || ''));

        if (isMissingColumn) {
            console.warn('DB Column missing. Switching to Meta JSON storage. Error:', error.message);
            dbSupportsExtendedColumns = false; // Cache failure for session

            // Retry with FALLBACK
            const fallbackPayload = await buildFallbackPayload();
            if (operation === 'INSERT') return supabase.from(table).insert(fallbackPayload).select().single();
            else return supabase.from(table).update(fallbackPayload).eq('id', matchId).select().single();
        } else if (!error) {
            // Success! We know columns exist (or we didn't send any extended fields that mattered)
            // Only set to true if we actually sent extended fields and it worked
            if (hasExtendedData) {
                dbSupportsExtendedColumns = true;
            }
        }

        return { data, error };
    };

    const markLeadChannelAsManual = useCallback(
        async (leadId: number, canal: string) => {
            if (!orgId || !leadId || !canal) return;
            try {
                await supabase
                    .from('lead_attribution')
                    .upsert(
                        {
                            org_id: orgId,
                            lead_id: leadId,
                            inferred_channel: canal,
                            attribution_method: 'manual',
                            channel_is_inferred: false,
                            last_touch_at: new Date().toISOString(),
                        },
                        { onConflict: 'lead_id' },
                    );
            } catch (error) {
                console.warn('Failed to persist manual lead channel attribution marker:', error);
            }
        },
        [orgId],
    );

    const createLeadMutation = useMutation({
        mutationFn: async (data: LeadPatch) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organizacao nao vinculada ao usuario');

            const basePayload = {
                org_id: orgId,
                user_id: user.id,
                assigned_to_user_id: user.id,
                nome: data.nome,
                telefone: data.telefone,
                email: data.email || null,
                empresa: data.empresa || null,
                canal: data.canal || 'whatsapp',
                consumo_kwh: normalizeConsumokwhForDb(data.consumo_kwh) || 0,
                valor_estimado: data.valor_estimado || 0,
                status_pipeline: normalizeLeadStage(data.status_pipeline || 'novo_lead'),
                observacoes: data.observacoes || '',
            };

            const extendedPayload: ExtendedLeadFields = {
                tipo_cliente: data.tipo_cliente,
                endereco: data.endereco,
                cidade: data.cidade,
                cep: data.cep,
                uf: data.uf,
                concessionaria: data.concessionaria,
                tipo_ligacao: data.tipo_ligacao,
                conta_luz_mensal: data.conta_luz_mensal,
                tarifa_kwh: data.tarifa_kwh,
                custo_disponibilidade_kwh: data.custo_disponibilidade_kwh,
                performance_ratio: data.performance_ratio,
                preco_por_kwp: data.preco_por_kwp,
                abater_custo_disponibilidade_no_dimensionamento: data.abater_custo_disponibilidade_no_dimensionamento,
                latitude: data.latitude,
                longitude: data.longitude,
                irradiance_source: data.irradiance_source,
                irradiance_ref_at: data.irradiance_ref_at,
            };

            const { data: newLead, error } = await safeSupabaseWrite('INSERT', 'leads', basePayload, extendedPayload);

            if (error) throw error;
            return leadToContact(newLead);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
        },
    });

    const updateLeadMutation = useMutation({
        mutationFn: async ({ contactId, data }: { contactId: string; data: LeadPatch }) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organizacao nao vinculada ao usuario');

            const basePayload: any = {};
            if (data.nome !== undefined) {
                basePayload.nome = data.nome;
                basePayload.name_manually_changed = true;
                basePayload.name_source = 'manual';
            }
            if (data.telefone !== undefined) basePayload.telefone = data.telefone;
            if (data.email !== undefined) basePayload.email = data.email || null;
            if (data.empresa !== undefined) basePayload.empresa = data.empresa || null;
            if (data.consumo_kwh !== undefined) basePayload.consumo_kwh = normalizeConsumokwhForDb(data.consumo_kwh);
            if (data.valor_estimado !== undefined) basePayload.valor_estimado = data.valor_estimado;
            if (data.status_pipeline !== undefined) {
                basePayload.status_pipeline = normalizeLeadStage(data.status_pipeline);
                basePayload.stage_changed_at = new Date().toISOString();
            }
            if (data.canal !== undefined) basePayload.canal = data.canal;
            if (data.observacoes !== undefined) basePayload.observacoes = data.observacoes;
            if (data.assigned_to_user_id !== undefined) basePayload.assigned_to_user_id = data.assigned_to_user_id;

            const extendedPayload: ExtendedLeadFields = {};
            if (data.tipo_cliente !== undefined) extendedPayload.tipo_cliente = data.tipo_cliente;
            if (data.endereco !== undefined) extendedPayload.endereco = data.endereco;
            if (data.cidade !== undefined) extendedPayload.cidade = data.cidade;
            if (data.cep !== undefined) extendedPayload.cep = data.cep;
            if (data.uf !== undefined) extendedPayload.uf = data.uf;
            if (data.concessionaria !== undefined) extendedPayload.concessionaria = data.concessionaria;
            if (data.tipo_ligacao !== undefined) extendedPayload.tipo_ligacao = data.tipo_ligacao;
            if (data.conta_luz_mensal !== undefined) extendedPayload.conta_luz_mensal = data.conta_luz_mensal;
            if (data.tarifa_kwh !== undefined) extendedPayload.tarifa_kwh = data.tarifa_kwh;
            if (data.custo_disponibilidade_kwh !== undefined) extendedPayload.custo_disponibilidade_kwh = data.custo_disponibilidade_kwh;
            if (data.performance_ratio !== undefined) extendedPayload.performance_ratio = data.performance_ratio;
            if (data.preco_por_kwp !== undefined) extendedPayload.preco_por_kwp = data.preco_por_kwp;
            if (data.abater_custo_disponibilidade_no_dimensionamento !== undefined) {
                extendedPayload.abater_custo_disponibilidade_no_dimensionamento = data.abater_custo_disponibilidade_no_dimensionamento;
            }
            if (data.latitude !== undefined) extendedPayload.latitude = data.latitude;
            if (data.longitude !== undefined) extendedPayload.longitude = data.longitude;
            if (data.irradiance_source !== undefined) extendedPayload.irradiance_source = data.irradiance_source;
            if (data.irradiance_ref_at !== undefined) extendedPayload.irradiance_ref_at = data.irradiance_ref_at;

            const { error } = await safeSupabaseWrite('UPDATE', 'leads', basePayload, extendedPayload, Number(contactId));

            if (error) throw error;
            if (data.canal !== undefined) {
                await markLeadChannelAsManual(Number(contactId), data.canal);
            }
            return { contactId, ...data };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
        },
    });

    const importContactsMutation = useMutation({
        mutationFn: async (contacts: any[]): Promise<ImportLeadsSummary> => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organizacao nao vinculada ao usuario');

            const payload = contacts.map((contact) => ({
                ...contact,
                status_pipeline: normalizeLeadStage(contact?.status_pipeline || 'novo_lead'),
            }));

            const { data, error } = await supabase.rpc('import_leads_batch', {
                p_org_id: orgId,
                p_rows: payload,
            });

            if (error) {
                throw new Error(error.message || 'Falha ao importar leads.');
            }

            return buildImportLeadsSummary(data as ImportLeadRpcRow[] | null | undefined);
        },
        onSuccess: (summary) => {
            if ((summary.inserted_count + summary.updated_count) > 0) {
                queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
            }
        }
    });

    const bulkAssignLeadsMutation = useMutation({
        mutationFn: async ({
            leadIds,
            assignedToUserId,
        }: {
            leadIds: string[];
            assignedToUserId: string | null;
        }): Promise<{ updatedCount: number; failedIds: string[] }> => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organizacao nao vinculada ao usuario');

            const numericLeadIds = Array.from(new Set(
                (leadIds || [])
                    .map((id) => Number(id))
                    .filter((id) => Number.isFinite(id) && id > 0)
            ));

            if (numericLeadIds.length === 0) {
                return { updatedCount: 0, failedIds: [] };
            }

            const { data, error } = await supabase
                .from('leads')
                .update({ assigned_to_user_id: assignedToUserId })
                .eq('org_id', orgId)
                .in('id', numericLeadIds)
                .select('id');

            if (error) throw error;

            const updatedIdSet = new Set((data || []).map((row: any) => String(row.id)));
            const failedIds = leadIds.filter((id) => !updatedIdSet.has(String(id)));

            return {
                updatedCount: (data || []).length,
                failedIds,
            };
        },
        onMutate: async ({ leadIds, assignedToUserId }) => {
            const snapshot = queryClient.getQueriesData({ queryKey: ['leads', orgId] });

            queryClient.setQueriesData({ queryKey: ['leads', orgId] }, (oldData: unknown) => {
                if (!Array.isArray(oldData)) return oldData;
                const idSet = new Set((leadIds || []).map((id) => String(id)));
                return oldData.map((item: any) => (
                    idSet.has(String(item?.id))
                        ? { ...item, assignedToUserId: assignedToUserId, assigned_to_user_id: assignedToUserId }
                        : item
                ));
            });

            return { snapshot };
        },
        onError: (_error, _vars, context) => {
            context?.snapshot?.forEach(([key, data]) => {
                queryClient.setQueryData(key, data);
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
        },
    });

    const deleteLeadMutation = useMutation({
        mutationFn: async (leadId: string) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organizacao nao vinculada ao usuario');
            const { data: lead } = await supabase.from('leads').select('phone_e164, instance_name').eq('id', Number(leadId)).eq('org_id', orgId).single();

            if (lead?.phone_e164) {
                const { error: rpcError } = await supabase.rpc('hard_delete_thread', {
                    p_user_id: user.id,
                    p_instance_name: lead.instance_name || '',
                    p_phone_e164: lead.phone_e164
                });
                if (rpcError) {
                    const { error } = await supabase.from('leads').delete().eq('id', Number(leadId)).eq('org_id', orgId);
                    if (error) throw error;
                }
            } else {
                const { error } = await supabase.from('leads').delete().eq('id', Number(leadId)).eq('org_id', orgId);
                if (error) throw error;
            }
            return leadId;
        },
        onSuccess: (deletedId) => {
            toast.success('Contato excluido permanentemente');
            queryClient.setQueriesData({ queryKey: ['leads', orgId] }, (old: Contact[] | undefined) =>
                Array.isArray(old) ? old.filter(c => c.id !== deletedId) : old
            );
            queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
        },
        onError: (error) => {
            console.error('Error deleting lead:', error);
            toast.error('Erro ao excluir contato');
        }
    });

    const toggleLeadAiMutation = useMutation({
        mutationFn: async ({ leadId, enabled, reason }: { leadId: string; enabled: boolean; reason?: 'manual' | 'human_takeover' }) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organizacao nao vinculada ao usuario');
            const updatePayload: any = {
                ai_enabled: enabled,
                ai_paused_reason: enabled ? null : (reason || 'manual'),
                ai_paused_at: enabled ? null : new Date().toISOString()
            };
            const { data, error } = await supabase.from('leads').update(updatePayload).eq('id', Number(leadId)).eq('org_id', orgId).select('id');
            if (error) throw error;
            if (!data?.length) {
                throw new Error('Nenhum lead atualizado. Verifique permissoes.');
            }
            return { leadId, enabled };
        },
        onSuccess: ({ leadId, enabled }) => {
            // Optimistic cache update for instant toggle feedback
            queryClient.setQueriesData(
                { queryKey: ['leads', orgId] },
                (oldData: Contact[] | undefined) => {
                    if (!Array.isArray(oldData)) return oldData;
                    return oldData.map(c =>
                        c.id === leadId
                            ? { ...c, aiEnabled: enabled, aiPausedReason: enabled ? null : 'manual', aiPausedAt: enabled ? null : new Date() }
                            : c
                    );
                }
            );
            queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
        },
        onError: (error) => {
            console.error('Error toggling lead AI:', error);
            toast.error(error instanceof Error ? error.message : 'Erro ao alterar status da IA');
        }
    });

    return {
        contacts: leadsQuery.data || [],
        isLoading: leadsQuery.isLoading && !!user,
        isError: leadsQuery.isError,
        leadScope: effectiveLeadScope,
        setLeadScope,
        leadScopeMembers,
        isLoadingLeadScopeMembers,
        showTeamLeads,
        setShowTeamLeads,
        canViewTeam,
        createLead: createLeadMutation.mutateAsync,
        updateLead: updateLeadMutation.mutateAsync,
        deleteLead: deleteLeadMutation.mutateAsync,
        importContacts: importContactsMutation.mutateAsync,
        bulkAssignLeads: bulkAssignLeadsMutation.mutateAsync,
        toggleLeadAi: toggleLeadAiMutation.mutateAsync,
    };
}


