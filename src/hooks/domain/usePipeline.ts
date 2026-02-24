import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, EventoDB } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { CalendarEvent, EventType, PipelineStage } from '@/types/solarzap';

type ProposalSegment = 'residencial' | 'empresarial' | 'agronegocio' | 'usina' | 'indefinido';

const mapEventType = (tipo: string): EventType => {
    const typeMap: Record<string, EventType> = {
        'chamada': 'chamada',
        'visita': 'visita',
        'instalacao': 'instalacao',
        'followup': 'followup',
        'reuniao': 'reuniao',
    };
    return typeMap[tipo?.toLowerCase()] || 'chamada';
};

const mapClientTypeToSegment = (clientType?: string | null): ProposalSegment => {
    const normalized = (clientType || '').toLowerCase().trim();
    if (normalized === 'residencial') return 'residencial';
    if (normalized === 'comercial' || normalized === 'industrial') return 'empresarial';
    if (normalized === 'rural') return 'agronegocio';
    if (normalized === 'usina') return 'usina';
    return 'indefinido';
};

const eventoToCalendarEvent = (evento: EventoDB): CalendarEvent => ({
    id: String(evento.id),
    contactId: String(evento.lead_id || 0),
    title: evento.titulo,
    description: evento.descricao || undefined,
    type: mapEventType(evento.tipo),
    startDate: new Date(evento.data_inicio),
    endDate: new Date(evento.data_fim),
    isCompleted: evento.concluido,
});

export function usePipeline() {
    const { user, orgId } = useAuth();
    const queryClient = useQueryClient();

    const eventsQuery = useQuery({
        queryKey: ['events', orgId, user?.id],
        queryFn: async () => {
            if (!user || !orgId) return [];
            try {
                // Now fetching from 'appointments' instead of 'eventos'
                const { data, error } = await supabase
                    .from('appointments')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('org_id', orgId)
                    .order('start_at', { ascending: true });

                if (error) {
                    console.log('Appointments table fetch error:', error);
                    return [];
                }

                // Map AppointmentDB to CalendarEvent
                return (data || []).map((appt: any) => ({
                    id: String(appt.id),
                    contactId: String(appt.lead_id || 0),
                    title: appt.title,
                    description: appt.notes || undefined,
                    type: mapEventType(appt.type),
                    startDate: new Date(appt.start_at),
                    endDate: new Date(appt.end_at),
                    isCompleted: appt.status === 'done' || appt.status === 'completed',
                }));
            } catch (e) {
                console.error("Error fetching events:", e);
                return [];
            }
        },
        enabled: !!user && !!orgId,
    });

    const moveToPipelineMutation = useMutation({
        mutationFn: async ({ contactId, newStage }: { contactId: string; newStage: PipelineStage }) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organização não vinculada ao usuário');
            // 1. Update Lead Status AND Stage Changed Date
            const { error: leadError } = await supabase
                .from('leads')
                .update({
                    status_pipeline: newStage,
                    stage_changed_at: new Date().toISOString()
                })
                .eq('id', Number(contactId))
                .eq('org_id', orgId);

            if (leadError) throw leadError;

            // 2. Fetch Lead Data for Deal Logic
            const { data: lead } = await supabase
                .from('leads')
                .select('valor_estimado, user_id')
                .eq('id', Number(contactId))
                .eq('org_id', orgId)
                .single();

            if (lead) {
                // 3. Map Stage to Deal Status
                let dealStatus = 'open';
                const wonStages = [
                    'contrato_assinado', 'projeto_pago', 'aguardando_instalacao',
                    'projeto_instalado', 'coletar_avaliacao', 'contato_futuro'
                ];

                if (wonStages.includes(newStage)) {
                    dealStatus = 'won';
                } else if (newStage === 'perdido') {
                    dealStatus = 'lost';
                }

                // 4. Upsert Deal
                // Check if deal exists
                const { data: existingDeals } = await supabase
                    .from('deals')
                    .select('id')
                    .eq('lead_id', Number(contactId))
                    .eq('org_id', orgId);

                const existingDealId = existingDeals && existingDeals.length > 0 ? existingDeals[0].id : null;

                const dealData = {
                    lead_id: Number(contactId),
                    org_id: orgId,
                    user_id: lead.user_id,
                    status: dealStatus,
                    amount: lead.valor_estimado || 0,
                    // If moving to won/lost, set closed_at. If moving back to open, clear it.
                    closed_at: (dealStatus === 'won' || dealStatus === 'lost') ? new Date().toISOString() : null
                };

                if (existingDealId) {
                    const { error: dealError } = await supabase.from('deals').update(dealData).eq('id', existingDealId).eq('org_id', orgId);
                    if (dealError) console.error('Deal update error:', dealError);
                } else {
                    const { error: dealError } = await supabase.from('deals').insert(dealData);
                    if (dealError) console.error('Deal insert error:', dealError);
                }
            }

            return { contactId, newStage };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-report-client'] }); // Invalidate dashboard too
        },
    });

    const saveProposalMutation = useMutation({
        mutationFn: async (data: {
            leadId: string;
            valorProjeto: number;
            consumoKwh: number;
            potenciaKw: number;
            paineisQtd: number;
            economiaMensal: number;
            paybackAnos: number;
            status?: string;
            tipoCliente?: string;
            contactName?: string;
            observacoes?: string;
            source?: 'manual' | 'ai' | 'hybrid';
            segment?: ProposalSegment;
            premiumPayload?: Record<string, unknown>;
            contextEngine?: unknown;
        }) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organização não vinculada ao usuário');

            const sanitizeContextEngine = (raw: unknown): Record<string, unknown> | null => {
                if (!raw || typeof raw !== 'object') return null;
                const obj: any = raw as any;

                const cleanText = (value: unknown, max = 900): string | null => {
                    if (typeof value !== 'string') return null;
                    const cleaned = value.replace(/\s+/g, ' ').trim();
                    if (!cleaned) return null;
                    return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
                };

                const toIsoOrNull = (value: unknown): string | null =>
                    typeof value === 'string' && value.length >= 10 ? value : null;

                const mapArray = <T>(rawArr: unknown, limit: number, mapper: (item: any) => T | null): T[] => {
                    if (!Array.isArray(rawArr)) return [];
                    const out: T[] = [];
                    for (const item of rawArr.slice(0, Math.max(0, limit))) {
                        const mapped = mapper(item);
                        if (mapped) out.push(mapped);
                    }
                    return out;
                };

                const comments = mapArray(obj.comments, 16, (c) => {
                    if (!c || typeof c !== 'object') return null;
                    const texto = cleanText((c as any).texto ?? (c as any).text, 700);
                    if (!texto) return null;
                    return {
                        texto,
                        autor: cleanText((c as any).autor ?? (c as any).author, 120),
                        created_at: toIsoOrNull((c as any).created_at),
                    };
                });

                const objections = mapArray(obj.objections, 16, (o) => {
                    if (!o || typeof o !== 'object') return null;
                    const question = cleanText((o as any).question, 260);
                    const response = cleanText((o as any).response, 900);
                    if (!question && !response) return null;
                    const priority = Number((o as any).priority);
                    return {
                        question: question || null,
                        response: response || null,
                        priority: Number.isFinite(priority) ? priority : null,
                    };
                });

                const testimonials = mapArray(obj.testimonials, 12, (t) => {
                    if (!t || typeof t !== 'object') return null;
                    const quote = cleanText((t as any).quote_short ?? (t as any).quote, 360);
                    if (!quote) return null;
                    return {
                        display_name: cleanText((t as any).display_name ?? (t as any).name, 120),
                        quote_short: quote,
                        type: cleanText((t as any).type, 60),
                    };
                });

                const interactions = mapArray(obj.interactions, 30, (m) => {
                    if (!m || typeof m !== 'object') return null;
                    const mensagem = cleanText((m as any).mensagem ?? (m as any).message ?? (m as any).content, 900);
                    if (!mensagem) return null;
                    return {
                        id: (m as any).id ?? null,
                        created_at: toIsoOrNull((m as any).created_at),
                        wa_from_me: typeof (m as any).wa_from_me === 'boolean' ? (m as any).wa_from_me : null,
                        tipo: cleanText((m as any).tipo, 60),
                        mensagem,
                    };
                });

                const documents = mapArray(obj.documents, 12, (d) => {
                    if (!d || typeof d !== 'object') return null;
                    const title = cleanText((d as any).title, 180);
                    if (!title) return null;
                    const tags = Array.isArray((d as any).tags)
                        ? (d as any).tags.map((x: unknown) => cleanText(x, 40)).filter(Boolean).slice(0, 12)
                        : [];
                    return {
                        id: cleanText((d as any).id, 80) ?? String((d as any).id ?? ''),
                        type: cleanText((d as any).type, 40),
                        title,
                        tags,
                        created_at: toIsoOrNull((d as any).created_at),
                        body_snippet: cleanText((d as any).body_snippet ?? (d as any).snippet, 900),
                    };
                });

                const documentsRelevant = mapArray(obj.documentsRelevant, 12, (d) => {
                    if (!d || typeof d !== 'object') return null;
                    const title = cleanText((d as any).title, 180);
                    if (!title) return null;
                    return {
                        id: cleanText((d as any).id, 80) ?? String((d as any).id ?? ''),
                        type: cleanText((d as any).type, 40),
                        title,
                        body_snippet: cleanText((d as any).body_snippet ?? (d as any).snippet, 900),
                    };
                });

                const companyProfile =
                    obj.companyProfile && typeof obj.companyProfile === 'object' ? (obj.companyProfile as Record<string, unknown>) : null;

                return {
                    comments,
                    companyProfile,
                    objections,
                    testimonials,
                    interactions,
                    documents,
                    documentsRelevant,
                };
            };

            const contextEngineSnapshot = sanitizeContextEngine(data.contextEngine);
            const leadId = Number(data.leadId);

            const proposalPayload = {
                lead_id: leadId,
                org_id: orgId,
                user_id: user.id,
                valor_projeto: Math.round(data.valorProjeto),
                consumo_kwh: Math.round(data.consumoKwh),
                potencia_kw: data.potenciaKw,
                paineis_qtd: data.paineisQtd,
                economia_mensal: data.economiaMensal,
                payback_anos: data.paybackAnos,
                status: data.status || 'Enviada',
            };

            let proposal: any = null;
            try {
                const { data: existingProposal, error: existingErr } = await supabase
                    .from('propostas')
                    .select('id')
                    .eq('lead_id', leadId)
                    .eq('user_id', user.id)
                    .order('id', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (!existingErr && existingProposal?.id) {
                    const { data: upd, error: updErr } = await supabase
                        .from('propostas')
                        .update(proposalPayload)
                        .eq('id', existingProposal.id)
                        .select()
                        .single();
                    if (!updErr) proposal = upd;
                    else console.warn('Failed to update existing proposta, falling back to insert:', updErr);
                }
            } catch (existingLookupErr) {
                console.warn('Existing proposta lookup failed (non-blocking):', existingLookupErr);
            }

            if (!proposal) {
                const { data: ins, error: insErr } = await supabase
                    .from('propostas')
                    .insert(proposalPayload)
                    .select()
                    .single();
                if (insErr) throw insErr;
                proposal = ins;
            }

            const segment = data.segment || mapClientTypeToSegment(data.tipoCliente);
            const source = data.source || 'manual';
            const versionStatus = data.status === 'Enviada' ? 'sent' : 'ready';
            let proposalVersionId: string | null = null;
            let crmComments: Array<{ texto: string | null; autor: string | null; created_at: string }> = [];
            let companyProfile: Record<string, unknown> | null = null;
            let objectionResponses: Array<{ question: string; response: string; priority: number }> = [];
            let approvedTestimonials: Array<{ display_name: string | null; quote_short: string | null; type: string | null }> = [];

            try {
                const [commentsRes, companyRes, objectionsRes, testimonialsRes] = await Promise.all([
                    supabase
                        .from('comentarios_leads')
                        .select('texto, autor, created_at')
                        .eq('lead_id', Number(data.leadId))
                        .order('created_at', { ascending: false })
                        .limit(8),
                    supabase
                        .from('company_profile')
                        .select('elevator_pitch, differentials, installation_process, warranty_info, payment_options')
                        .eq('org_id', orgId)
                        .maybeSingle(),
                    supabase
                        .from('objection_responses')
                        .select('question, response, priority')
                        .eq('org_id', orgId)
                        .order('priority', { ascending: true })
                        .limit(6),
                    supabase
                        .from('testimonials')
                        .select('display_name, quote_short, type')
                        .eq('org_id', orgId)
                        .eq('status', 'approved')
                        .limit(4),
                ]);

                if (!commentsRes.error) crmComments = commentsRes.data || [];
                if (!companyRes.error) companyProfile = companyRes.data as Record<string, unknown> | null;
                if (!objectionsRes.error) objectionResponses = objectionsRes.data || [];
                if (!testimonialsRes.error) approvedTestimonials = testimonialsRes.data || [];
            } catch (contextErr) {
                console.warn('Proposal context enrichment skipped (non-blocking):', contextErr);
            }

            const contextSnapshot = {
                generated_at: new Date().toISOString(),
                context_engine: contextEngineSnapshot,
                lead: {
                    id: Number(data.leadId),
                    name: data.contactName || null,
                    tipo_cliente: data.tipoCliente || null,
                },
                values: {
                    valor_projeto: Math.round(data.valorProjeto),
                    consumo_kwh: Math.round(data.consumoKwh),
                    potencia_kw: data.potenciaKw,
                    paineis_qtd: data.paineisQtd,
                    economia_mensal: data.economiaMensal,
                    payback_anos: data.paybackAnos,
                },
                notes: data.observacoes || null,
                source,
                segment,
                premium_payload_input: data.premiumPayload || null,
                crm_comments: crmComments
                    .map((c) => ({
                        texto: c.texto,
                        autor: c.autor,
                        created_at: c.created_at,
                    })),
                knowledge_base: {
                    company_profile: companyProfile,
                    objection_responses: objectionResponses,
                    testimonials: approvedTestimonials,
                },
            };

            const customPremiumPayload =
                data.premiumPayload && typeof data.premiumPayload === 'object'
                    ? data.premiumPayload
                    : {};

            const payloadAny = customPremiumPayload as Record<string, unknown>;
            const selectedVariant =
                typeof payloadAny.selected_variant === 'string' ? payloadAny.selected_variant : null;
            const persuasionScore =
                typeof payloadAny.persuasionScore === 'number'
                    ? payloadAny.persuasionScore
                    : typeof payloadAny.persuasion_score === 'number'
                        ? payloadAny.persuasion_score
                        : null;

            const premiumPayload = {
                persuasion_pillars: ['custo', 'economia', 'confianca'],
                objective: 'elevar_conversao_proposta',
                cta: 'confirmar_aprovacao',
                ...customPremiumPayload,
            };

            try {
                let nextVersionNo = 1;
                try {
                    const { data: lastVersion, error: lastVersionErr } = await supabase
                        .from('proposal_versions')
                        .select('version_no')
                        .eq('proposta_id', proposal.id)
                        .order('version_no', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (!lastVersionErr && lastVersion?.version_no && Number(lastVersion.version_no) > 0) {
                        nextVersionNo = Number(lastVersion.version_no) + 1;
                    }
                } catch (versionLookupErr) {
                    console.warn('Proposal version lookup failed (non-blocking):', versionLookupErr);
                }

                const { data: version, error: versionError } = await supabase
                    .from('proposal_versions')
                    .insert({
                        proposta_id: proposal.id,
                        lead_id: Number(data.leadId),
                        user_id: user.id,
                        org_id: orgId,
                        version_no: nextVersionNo,
                        status: versionStatus,
                        segment,
                        source,
                        premium_payload: premiumPayload,
                        context_snapshot: contextSnapshot,
                    })
                    .select('id')
                    .single();

                if (versionError) throw versionError;
                proposalVersionId = version.id;

                try {
                    const payload = premiumPayload && typeof premiumPayload === 'object' ? premiumPayload : {};
                    const payloadObj = payload as Record<string, unknown>;

                    const sections: Array<{
                        proposal_version_id: string;
                        user_id: string;
                        org_id: string;
                        section_key: string;
                        section_title: string;
                        section_order: number;
                        content: Record<string, unknown>;
                        source: 'manual' | 'ai' | 'hybrid';
                    }> = [];

                    const pushComposerSections = (rawSections: unknown) => {
                        if (!Array.isArray(rawSections)) return false;
                        const seenKeys = new Set<string>();

                        rawSections.forEach((raw, idx) => {
                            if (!raw || typeof raw !== 'object') return;
                            const r: any = raw as any;
                            const keyCandidate =
                                typeof r.section_key === 'string'
                                    ? r.section_key
                                    : typeof r.key === 'string'
                                        ? r.key
                                        : '';
                            const sectionKey = keyCandidate.trim().toLowerCase();
                            if (!sectionKey || seenKeys.has(sectionKey)) return;
                            seenKeys.add(sectionKey);

                            const titleCandidate =
                                typeof r.section_title === 'string'
                                    ? r.section_title
                                    : typeof r.title === 'string'
                                        ? r.title
                                        : '';
                            const sectionTitle = titleCandidate.trim() || sectionKey;

                            const orderCandidate = r.section_order ?? r.order ?? (100 + idx * 10);
                            const orderNumber = Number(orderCandidate);
                            const sectionOrder = Number.isFinite(orderNumber)
                                ? Math.max(0, Math.min(1000, Math.floor(orderNumber)))
                                : (100 + idx * 10);

                            const contentCandidate = r.content && typeof r.content === 'object' ? r.content : {};
                            const sectionSourceRaw = typeof r.source === 'string' ? r.source.toLowerCase() : '';
                            const sectionSource: 'manual' | 'ai' | 'hybrid' =
                                sectionSourceRaw === 'manual' || sectionSourceRaw === 'ai' || sectionSourceRaw === 'hybrid'
                                    ? sectionSourceRaw
                                    : source;

                            sections.push({
                                proposal_version_id: version.id,
                                user_id: user.id,
                                org_id: orgId,
                                section_key: sectionKey,
                                section_title: sectionTitle,
                                section_order: sectionOrder,
                                content: contentCandidate as Record<string, unknown>,
                                source: sectionSource,
                            });
                        });

                        return sections.length > 0;
                    };

                    const pushTextSection = (key: string, title: string, order: number, value: unknown) => {
                        const text = typeof value === 'string' ? value.trim() : '';
                        if (!text) return;
                        sections.push({
                            proposal_version_id: version.id,
                            user_id: user.id,
                            org_id: orgId,
                            section_key: key,
                            section_title: title,
                            section_order: order,
                            content: { text },
                            source,
                        });
                    };

                    const pushListSection = (key: string, title: string, order: number, value: unknown) => {
                        const items = Array.isArray(value)
                            ? value
                                .map((item) => (typeof item === 'string' ? item.trim() : ''))
                                .filter(Boolean)
                                .slice(0, 12)
                            : [];
                        if (items.length === 0) return;
                        sections.push({
                            proposal_version_id: version.id,
                            user_id: user.id,
                            org_id: orgId,
                            section_key: key,
                            section_title: title,
                            section_order: order,
                            content: { items },
                            source,
                        });
                    };

                    const composerSectionsOk = pushComposerSections((payloadObj as any)?.sections);
                    if (!composerSectionsOk) {
                        pushTextSection('headline', 'Headline', 10, payloadObj.headline);
                        pushTextSection('executive_summary', 'Resumo Executivo', 20, payloadObj.executiveSummary ?? payloadObj.executive_summary);
                        pushTextSection('persona_focus', 'Foco do Cliente', 30, payloadObj.personaFocus ?? payloadObj.persona_focus);
                        pushListSection('value_pillars', 'Pilares de Valor', 40, payloadObj.valuePillars ?? payloadObj.value_pillars);
                        pushListSection('proof_points', 'Provas e Diferenciais', 50, payloadObj.proofPoints ?? payloadObj.proof_points);
                        pushListSection('objection_handlers', 'Respostas a Objeções', 60, payloadObj.objectionHandlers ?? payloadObj.objection_handlers);
                        pushTextSection('next_step_cta', 'Próximo Passo', 70, payloadObj.nextStepCta ?? payloadObj.next_step_cta);
                        pushListSection('assumptions', 'Premissas', 80, payloadObj.assumptions);
                    }

                    if (sections.length > 0) {
                        const { error: sectionsError } = await supabase.from('proposal_sections').insert(sections);
                        if (sectionsError) throw sectionsError;
                    }
                } catch (sectionsErr) {
                    console.warn('Proposal sections save skipped (non-blocking):', sectionsErr);
                }

                await supabase.from('proposal_delivery_events').insert({
                    proposal_version_id: version.id,
                    proposta_id: proposal.id,
                    lead_id: Number(data.leadId),
                    user_id: user.id,
                    channel: 'crm',
                    event_type: 'generated',
                    metadata: {
                        generated_by: source,
                        status: data.status || 'Enviada',
                        selected_variant: selectedVariant,
                        persuasion_score: persuasionScore,
                    },
                });
            } catch (versionErr) {
                console.warn('Proposal premium version save skipped (non-blocking):', versionErr);
            }

            return { proposal, proposalVersionId };
        },
    });

    const addEventMutation = useMutation({
        mutationFn: async (event: Omit<CalendarEvent, 'id'>) => {
            if (!user) throw new Error("No user");
            if (!orgId) throw new Error('Organização não vinculada ao usuário');

            const { data, error } = await supabase
                .from('appointments')
                .insert({
                    org_id: orgId,
                    lead_id: Number(event.contactId),
                    user_id: user.id,
                    title: event.title,
                    notes: event.description || null,
                    type: event.type,
                    start_at: event.startDate.toISOString(),
                    end_at: event.endDate.toISOString(),
                    status: event.isCompleted ? 'done' : 'scheduled',
                })
                .select()
                .single();

            if (error) throw error;

            // Map back to CalendarEvent for the UI update
            return {
                id: String(data.id),
                contactId: String(data.lead_id || 0),
                title: data.title,
                description: data.notes || undefined,
                type: mapEventType(data.type),
                startDate: new Date(data.start_at),
                endDate: new Date(data.end_at),
                isCompleted: data.status === 'done' || data.status === 'completed',
            };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['events', orgId] });
            queryClient.invalidateQueries({ queryKey: ['appointments', orgId] }); // Sync Calendar too!
            queryClient.invalidateQueries({ queryKey: ['dashboard-report-client'] }); // Sync Dashboard too!
        }
    });

    return {
        events: eventsQuery.data || [],
        isLoadingEvents: eventsQuery.isLoading && !!user,
        moveToPipeline: moveToPipelineMutation.mutateAsync,
        saveProposal: saveProposalMutation.mutateAsync,
        addEvent: addEventMutation.mutateAsync,
    };
}
