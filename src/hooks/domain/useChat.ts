import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { supabase, InteracaoDB } from '@/lib/supabase';
import {
    scopeUserOrgQuery,
    scopeWhatsappInstanceQuery,
} from '@/lib/multiOrgLeadScoping';
import { useAuth } from '@/contexts/AuthContext';
import { Contact, Conversation, Message } from '@/types/solarzap';

const vendedorTypes = [
    'mensagem_vendedor',
    'atendente',
    'audio_vendedor',
    'anexo_vendedor',
    'video_vendedor',
];

type RealtimeHealth = 'connecting' | 'subscribed' | 'degraded' | 'closed';

type ReplyMetaInput = {
    id: string;
    waMessageId?: string;
    remoteJid?: string;
    instanceName?: string;
    isFromClient?: boolean;
    preview?: string;
    type?: string;
    content?: string;
};

type SendMessageInput = {
    conversationId: string;
    content: string;
    instanceName?: string;
    replyTo?: { id: string };
    contactPhone?: string;
    contactPhoneE164?: string;
    replyMeta?: ReplyMetaInput;
    clientTraceId?: string;
    clientTempId?: string;
};

type SendMessageMutationContext = {
    clientTempId: string;
    clientTraceId: string;
    startedAtPerf: number;
};

const INTERACOES_SELECT_COLUMNS =
    'id,lead_id,user_id,mensagem,tipo,created_at,read_at,instance_name,phone_e164,remote_jid,wa_message_id,reply_to_interacao_id,reply_preview,reply_type,reactions,attachment_url,attachment_type,attachment_ready,attachment_mimetype,attachment_name';
const MAX_SCOPED_LEAD_IDS = 400;

const toPerfNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now());

const parseMessageNumericId = (value: string | number | null | undefined): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const buildFallbackRemoteJid = (phone: string): string => `${phone}@s.whatsapp.net`;

const normalizeOutboundPhone = (phone: string): string => {
    const cleaned = String(phone || '').replace(/\D/g, '');
    if (cleaned.length === 10 || cleaned.length === 11) return `55${cleaned}`;
    return cleaned;
};

const buildReplyPreviewFromType = (tipo: string | undefined, mensagem: string | undefined | null): string => {
    if (!tipo) return (mensagem || '').substring(0, 60) || '...';
    if (['audio_vendedor', 'audio_cliente'].includes(tipo)) return '🎤 Áudio';
    if (['video_vendedor', 'video_cliente'].includes(tipo)) return '🎬 Vídeo';
    if (['anexo_vendedor', 'anexo_cliente'].includes(tipo)) return '📄 Documento/Imagem';
    return (mensagem || '').substring(0, 60) || '...';
};

const interacaoToMessage = (interacao: InteracaoDB): Message => {
    const isFromClient = !vendedorTypes.includes(interacao.tipo);

    return {
        id: String(interacao.id),
        contactId: String(interacao.lead_id || 0),
        content: interacao.mensagem || '',
        timestamp: new Date(interacao.created_at),
        isFromClient,
        isRead: !isFromClient || !!interacao.read_at, // Seller msgs always read; client msgs read if read_at set
        status: 'sent',
        isAutomation: interacao.tipo === 'automacao',
        instanceName: interacao.instance_name || undefined,
        phoneE164: interacao.phone_e164 || undefined, // NEW
        remoteJid: interacao.remote_jid || undefined,
        waMessageId: interacao.wa_message_id,
        replyTo: interacao.reply_to_interacao_id
            ? {
                id: String(interacao.reply_to_interacao_id),
                content: interacao.reply_preview || 'Mensagem respondida',
                type: interacao.reply_type || 'text',
            }
            : undefined,
        reactions: (interacao as any).reactions || undefined,
        // Attachment Mapping
        attachment_url: interacao.attachment_url || undefined,
        attachment_type: interacao.attachment_type || undefined,
        attachment_ready: interacao.attachment_ready ?? undefined, // Preserves false
        attachment_mimetype: interacao.attachment_mimetype || undefined,
        attachment_name: interacao.attachment_name || undefined,
    };
};

export function useChat(contacts: Contact[] = []) {
    const { user, orgId } = useAuth();
    const queryClient = useQueryClient();
    const scopedLeadIdNumbers = useMemo(() => {
        const ids = new Set<number>();
        for (const contact of contacts) {
            const parsed = Number(contact.id);
            if (!Number.isFinite(parsed) || parsed <= 0) continue;
            ids.add(parsed);
        }
        return Array.from(ids).sort((a, b) => a - b);
    }, [contacts]);
    const scopedLeadIdSet = useMemo(
        () => new Set(scopedLeadIdNumbers.map((id) => String(id))),
        [scopedLeadIdNumbers],
    );
    const canScopeInteractionsByLead =
        scopedLeadIdNumbers.length > 0 && scopedLeadIdNumbers.length <= MAX_SCOPED_LEAD_IDS;
    const leadScopeKey = useMemo(
        () => (canScopeInteractionsByLead ? scopedLeadIdNumbers.join(',') : `all:${scopedLeadIdNumbers.length}`),
        [canScopeInteractionsByLead, scopedLeadIdNumbers],
    );
    const interactionsQueryKey = useMemo(
        () => ['interactions', orgId, user?.id, leadScopeKey] as const,
        [orgId, user?.id, leadScopeKey]
    );
    const isLeadIdInScope = useCallback((leadId: unknown) => {
        const parsed = Number(leadId);
        if (!Number.isFinite(parsed) || parsed <= 0) return false;
        if (!canScopeInteractionsByLead) return true;
        return scopedLeadIdSet.has(String(parsed));
    }, [canScopeInteractionsByLead, scopedLeadIdSet]);

    // Persistent map: conversationId → timestamp when markAsRead was called.
    // Used to override isRead in the conversations memo so unread badges
    // never reappear after a refetch — even if the DB UPDATE was slow.
    const readAtOverrides = useRef<Map<string, number>>(new Map());
    const maxSeenInteractionIdRef = useRef(0);
    const realtimeHealthRef = useRef<RealtimeHealth>('connecting');
    const lastRealtimeStatusAtRef = useRef(Date.now());
    const lastLightReconcileAtRef = useRef(0);
    const lastFullRefetchAtRef = useRef(0);
    const incrementalSyncInFlightRef = useRef(false);

    useEffect(() => {
        maxSeenInteractionIdRef.current = 0;
    }, [leadScopeKey, orgId, user?.id]);

    const updateMaxSeenFromMessages = useCallback((messages: Message[] | undefined) => {
        if (!Array.isArray(messages) || messages.length === 0) return;
        let nextMax = maxSeenInteractionIdRef.current;
        for (const msg of messages) {
            const idNum = parseMessageNumericId(msg.id);
            if (idNum > nextMax) nextMax = idNum;
        }
        maxSeenInteractionIdRef.current = nextMax;
    }, []);

    const mergeMessages = useCallback((existing: Message[] | undefined, incoming: Message[]): Message[] => {
        if (!Array.isArray(existing) || existing.length === 0) {
            const sorted = [...incoming].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            updateMaxSeenFromMessages(sorted);
            return sorted;
        }

        const byId = new Map<string, Message>();
        for (const msg of existing) byId.set(msg.id, msg);
        for (const msg of incoming) {
            const prev = byId.get(msg.id);
            byId.set(msg.id, prev ? { ...prev, ...msg } : msg);
        }

        const merged = Array.from(byId.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        updateMaxSeenFromMessages(merged);
        return merged;
    }, [updateMaxSeenFromMessages]);

    const appendMessagesToCache = useCallback((incoming: Message[]) => {
        if (!incoming.length) return;
        queryClient.setQueryData(interactionsQueryKey, (old: Message[] | undefined) => mergeMessages(old, incoming));
    }, [interactionsQueryKey, mergeMessages, queryClient]);

    const fetchInteractionsFull = useCallback(async (): Promise<Message[]> => {
        if (!user || !orgId) return [];
        if (scopedLeadIdNumbers.length === 0) return [];
        const t0 = toPerfNow();
        import.meta.env.DEV && console.log('[CHAT_LATENCY] full_fetch_start', { orgId, userId: user.id });

        let query = supabase
            .from('interacoes')
            .select(INTERACOES_SELECT_COLUMNS)
            .eq('org_id', orgId);

        if (canScopeInteractionsByLead) {
            query = query.in('lead_id', scopedLeadIdNumbers);
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(1000);

        if (error) throw error;

        const messages = (data || []).reverse().map(interacaoToMessage);
        updateMaxSeenFromMessages(messages);
        import.meta.env.DEV && console.log('[CHAT_LATENCY] full_fetch_done', {
            count: messages.length,
            elapsed_ms: Math.round(toPerfNow() - t0),
            maxSeenId: maxSeenInteractionIdRef.current,
        });
        return messages;
    }, [canScopeInteractionsByLead, orgId, scopedLeadIdNumbers, updateMaxSeenFromMessages, user]);

    const runIncrementalSync = useCallback(async (reason: 'degraded' | 'light_reconcile') => {
        if (!user || !orgId) return;
        if (scopedLeadIdNumbers.length === 0) return;

        const now = Date.now();
        const maxSeenId = maxSeenInteractionIdRef.current;
        if (maxSeenId <= 0) {
            if (now - lastFullRefetchAtRef.current > 5000) {
                lastFullRefetchAtRef.current = now;
                import.meta.env.DEV && console.log('[CHAT_LATENCY] incremental_sync_no_cursor -> full_refetch', { reason });
                queryClient.invalidateQueries({ queryKey: interactionsQueryKey });
            }
            return;
        }

        const t0 = toPerfNow();
        let query = supabase
            .from('interacoes')
            .select(INTERACOES_SELECT_COLUMNS)
            .eq('org_id', orgId)
            .gt('id', maxSeenId);

        if (canScopeInteractionsByLead) {
            query = query.in('lead_id', scopedLeadIdNumbers);
        }

        const { data, error } = await query
            .order('id', { ascending: true })
            .limit(500);

        if (error) {
            console.warn('[CHAT_LATENCY] incremental_sync_error', { reason, error: error.message, maxSeenId });
            return;
        }

        const incoming = (data || []).map(interacaoToMessage);
        if (incoming.length > 0) {
            appendMessagesToCache(incoming);
        }

        import.meta.env.DEV && console.log('[CHAT_LATENCY] incremental_sync_done', {
            reason,
            maxSeenIdBefore: maxSeenId,
            count: incoming.length,
            elapsed_ms: Math.round(toPerfNow() - t0),
            maxSeenIdAfter: maxSeenInteractionIdRef.current,
        });
    }, [appendMessagesToCache, canScopeInteractionsByLead, interactionsQueryKey, orgId, queryClient, scopedLeadIdNumbers, user]);

    /**
     * Shared human-takeover handler.
     * Respects the org-level setting `support_ai_auto_disable_on_seller_message`.
     * If the setting is false, the AI won't be paused when a seller sends a message.
     */
    const handleHumanTakeover = async (newMessage: Message, source: string) => {
        const leadId = Number(newMessage.contactId);
        if (isNaN(leadId) || !orgId) return;

        try {
            // 1. Check org-level setting — respect support_ai_auto_disable_on_seller_message
            const { data: aiSettingsRow } = await supabase
                .from('ai_settings')
                .select('support_ai_auto_disable_on_seller_message')
                .eq('org_id', orgId)
                .order('id', { ascending: true })
                .limit(1)
                .maybeSingle();

            // Default to true if column/row doesn't exist
            const autoDisableEnabled = aiSettingsRow?.support_ai_auto_disable_on_seller_message !== false;

            if (!autoDisableEnabled) {
                import.meta.env.DEV && console.log(`[HumanTakeover/${source}] Org has auto-disable OFF — skipping pause for lead:`, leadId);
                toast({
                    title: 'Pausa automática desativada',
                    description: 'A configuração "Pausar IA ao enviar mensagem" está desligada nas configurações da org.',
                    duration: 4000,
                });
                return;
            }

            // 2. Pause AI on the lead
            import.meta.env.DEV && console.log(`[HumanTakeover/${source}] Pausing AI for lead:`, leadId);
            const { data: pausedRows, error: pauseErr } = await supabase
                .from('leads')
                .update({
                    ai_enabled: false,
                    ai_paused_reason: 'human_takeover',
                    ai_paused_at: new Date().toISOString(),
                })
                .eq('id', leadId)
                .eq('org_id', orgId)
                .select('id');

            if (pauseErr) {
                console.error(`[HumanTakeover/${source}] Error:`, pauseErr);
                toast({
                    variant: 'destructive',
                    title: 'Falha ao pausar IA',
                    description: 'Erro de permissão ou conexão. IA pode continuar respondendo.',
                });
            } else if (!pausedRows?.length) {
                console.error(`[HumanTakeover/${source}] 0 rows updated. RLS or invalid lead.`, leadId);
                toast({
                    variant: 'destructive',
                    title: 'Falha ao pausar IA',
                    description: 'Não foi possível atualizar o status do lead.',
                });
            } else {
                import.meta.env.DEV && console.log(`[HumanTakeover/${source}] AI paused successfully`);
                // Optimistic update: immediately flip the toggle in the cache
                queryClient.setQueriesData(
                    { queryKey: ['leads', orgId] },
                    (oldData: Contact[] | undefined) => {
                        if (!Array.isArray(oldData)) return oldData;
                        return oldData.map(c =>
                            c.id === String(leadId)
                                ? { ...c, aiEnabled: false, aiPausedReason: 'human_takeover', aiPausedAt: new Date() }
                                : c
                        );
                    }
                );
                queryClient.invalidateQueries({ queryKey: ['leads', orgId] });
                queryClient.invalidateQueries({ queryKey: ['lead', String(leadId)] });
            }
        } catch (err) {
            console.error(`[HumanTakeover/${source}] Unexpected error:`, err);
            toast({
                variant: 'destructive',
                title: 'Erro Crítico',
                description: 'Falha ao tentar pausar a IA após envio.',
            });
        }
    };

    // Derived state: Conversations
    // We memoize this to prevent unnecessary re-renders, but ensure it updates when `contacts` changes
    // The `contacts` from useLeads SHOULD update when deleteLead invalidates the query.

    const messagesQuery = useQuery({
        queryKey: interactionsQueryKey,
        queryFn: fetchInteractionsFull,
        enabled: !!user && !!orgId && scopedLeadIdNumbers.length > 0,
        staleTime: 5000,
    });

    // --- REALTIME + INCREMENTAL FALLBACK ---
    useEffect(() => {
        if (!user || !orgId || scopedLeadIdNumbers.length === 0) return;

        realtimeHealthRef.current = 'connecting';
        lastRealtimeStatusAtRef.current = Date.now();
        import.meta.env.DEV && console.log('[RT] Setting up robust subscription for org:', orgId);
        const channelName = `rt:interacoes:${orgId}:${user.id}`;

        const subscription = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'interacoes',
                    filter: `org_id=eq.${orgId}`,
                },
                (payload) => {
                    import.meta.env.DEV && console.log('🔴 [RT INSERT]', payload.new.id);
                    realtimeHealthRef.current = 'subscribed';
                    lastRealtimeStatusAtRef.current = Date.now();
                    if (!isLeadIdInScope((payload.new as Record<string, unknown>)?.lead_id)) return;
                    const newMessage = interacaoToMessage(payload.new as InteracaoDB);
                    appendMessagesToCache([newMessage]);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'interacoes',
                    filter: `org_id=eq.${orgId}`,
                },
                (payload) => {
                    import.meta.env.DEV && console.log('🟡 [RT UPDATE]', payload.new.id, payload.new.attachment_ready);
                    realtimeHealthRef.current = 'subscribed';
                    lastRealtimeStatusAtRef.current = Date.now();
                    if (!isLeadIdInScope((payload.new as Record<string, unknown>)?.lead_id)) return;
                    const updatedMessage = interacaoToMessage(payload.new as InteracaoDB);
                    appendMessagesToCache([updatedMessage]);
                }
            )
            .subscribe((status) => {
                const normalizedStatus = String(status || '').toUpperCase();
                lastRealtimeStatusAtRef.current = Date.now();
                if (normalizedStatus === 'SUBSCRIBED') {
                    realtimeHealthRef.current = 'subscribed';
                } else if (normalizedStatus === 'CLOSED') {
                    realtimeHealthRef.current = 'closed';
                } else if (normalizedStatus === 'CHANNEL_ERROR' || normalizedStatus === 'TIMED_OUT') {
                    realtimeHealthRef.current = 'degraded';
                } else {
                    realtimeHealthRef.current = 'connecting';
                }
                import.meta.env.DEV && console.log('🔵 [RT STATUS]', status, '=>', realtimeHealthRef.current);
            });

        // Visibility change reconciliation
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                import.meta.env.DEV && console.log('[RT] Tab active, reconciling...');
                lastFullRefetchAtRef.current = Date.now();
                queryClient.invalidateQueries({ queryKey: interactionsQueryKey });
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            import.meta.env.DEV && console.log('[RT] Cleanup channel:', channelName);
            realtimeHealthRef.current = 'closed';
            lastRealtimeStatusAtRef.current = Date.now();
            supabase.removeChannel(subscription);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [appendMessagesToCache, interactionsQueryKey, isLeadIdInScope, orgId, queryClient, scopedLeadIdNumbers.length, user]);

    useEffect(() => {
        if (!user || !orgId || scopedLeadIdNumbers.length === 0) return;

        const interval = window.setInterval(() => {
            if (incrementalSyncInFlightRef.current) return;

            const now = Date.now();
            const health = realtimeHealthRef.current;
            const statusAgeMs = now - lastRealtimeStatusAtRef.current;
            const shouldDegradeSync = health !== 'subscribed' && statusAgeMs > 1000;
            const shouldLightReconcile = health === 'subscribed' && (now - lastLightReconcileAtRef.current) >= 10000;

            if (!shouldDegradeSync && !shouldLightReconcile) return;

            if (shouldDegradeSync && realtimeHealthRef.current !== 'degraded') {
                realtimeHealthRef.current = 'degraded';
                import.meta.env.DEV && console.warn('[CHAT_LATENCY] realtime_degraded -> incremental_polling', { statusAgeMs });
            }

            incrementalSyncInFlightRef.current = true;
            const reason = shouldDegradeSync ? 'degraded' as const : 'light_reconcile' as const;
            if (reason === 'light_reconcile') {
                lastLightReconcileAtRef.current = now;
            }

            void runIncrementalSync(reason)
                .catch((err) => {
                    console.warn('[CHAT_LATENCY] incremental_sync_unhandled', err);
                })
                .finally(() => {
                    incrementalSyncInFlightRef.current = false;
                });
        }, 1000);

        return () => {
            window.clearInterval(interval);
        };
    }, [orgId, runIncrementalSync, scopedLeadIdNumbers.length, user]);

    const sendMessageMutation = useMutation<Message, Error, SendMessageInput, SendMessageMutationContext>({
        mutationFn: async ({
            conversationId,
            content,
            instanceName,
            replyTo,
            contactPhone,
            contactPhoneE164,
            replyMeta,
            clientTraceId,
        }) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organização não vinculada ao usuário');
            const perf = {
                sendStart: toPerfNow(),
                leadLookup: 0,
                replyLookup: 0,
                instanceLookup: 0,
                evolutionProxy: 0,
                dbInsert: 0,
            };
            const traceId = clientTraceId || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
            import.meta.env.DEV && console.log('[CHAT_LATENCY] send_start', {
                traceId,
                conversationId,
                hasReply: Boolean(replyTo),
                hasReplyMeta: Boolean(replyMeta),
                hasPhoneContext: Boolean(contactPhone || contactPhoneE164),
            });

            // Validate content before sending
            const MAX_MESSAGE_LENGTH = 4096;
            const trimmedContent = content.trim();
            if (!trimmedContent) throw new Error('Mensagem não pode estar vazia');
            if (trimmedContent.length > MAX_MESSAGE_LENGTH) throw new Error(`Mensagem excede o limite de ${MAX_MESSAGE_LENGTH} caracteres`);
            const sanitizedContent = trimmedContent;

            // 1. Resolve target phone (prefer UI context to avoid roundtrip)
            let formattedPhone = normalizeOutboundPhone(contactPhoneE164 || contactPhone || '');
            let finalPhoneE164 = normalizeOutboundPhone(contactPhoneE164 || '');

            if (!formattedPhone) {
                const leadLookupStart = toPerfNow();
                const { data: lead, error: leadError } = await supabase
                    .from('leads')
                    .select('telefone, phone_e164')
                    .eq('id', conversationId)
                    .eq('org_id', orgId)
                    .single();
                perf.leadLookup = Math.round(toPerfNow() - leadLookupStart);
                import.meta.env.DEV && console.log('[CHAT_LATENCY] lead_lookup_ms', { traceId, ms: perf.leadLookup });

                if (leadError || !lead) throw new Error('Lead not found');
                formattedPhone = normalizeOutboundPhone(lead.phone_e164 || lead.telefone);
                finalPhoneE164 = normalizeOutboundPhone(lead.phone_e164 || formattedPhone);
            }

            if (!formattedPhone) {
                throw new Error('Telefone do lead não encontrado');
            }

            if (!finalPhoneE164) {
                finalPhoneE164 = formattedPhone;
            }

            const fallbackRemoteJid = buildFallbackRemoteJid(formattedPhone);

            // 2. Fetch Reply Details (Early) - needed for Instance selection and Preview
            let quotedPayload: any = undefined;
            let quotedMessageId: string | undefined;

            const replyToValues = {
                id: null as number | null,
                preview: null as string | null,
                type: 'text'
            };
            let forcedInstanceName: string | undefined;
            let fallbackReplyLookupNeeded = false;

            if (replyTo) {
                replyToValues.id = Number(replyTo.id);

                if (replyMeta) {
                    replyToValues.type = replyMeta.type || 'text';
                    replyToValues.preview = replyMeta.preview
                        || buildReplyPreviewFromType(replyMeta.type, replyMeta.content);
                    if (replyMeta.instanceName) forcedInstanceName = replyMeta.instanceName;

                    if (replyMeta.waMessageId) {
                        quotedMessageId = replyMeta.waMessageId;
                        quotedPayload = {
                            key: {
                                id: replyMeta.waMessageId,
                                remoteJid: replyMeta.remoteJid || fallbackRemoteJid,
                                fromMe: Boolean(replyMeta.isFromClient === false),
                            },
                            message: { conversation: replyMeta.content || '' }
                        };
                    } else {
                        fallbackReplyLookupNeeded = true;
                    }
                } else {
                    fallbackReplyLookupNeeded = true;
                }

                if (fallbackReplyLookupNeeded) {
                    const replyLookupStart = toPerfNow();
                    const { data: originalMsg } = await supabase
                        .from('interacoes')
                        .select('wa_message_id, mensagem, tipo, instance_name, remote_jid')
                        .eq('id', replyTo.id)
                        .single();
                    perf.replyLookup = Math.round(toPerfNow() - replyLookupStart);
                    import.meta.env.DEV && console.log('[CHAT_LATENCY] reply_lookup_ms', { traceId, ms: perf.replyLookup });

                    if (originalMsg) {
                        if (originalMsg.wa_message_id) {
                            quotedMessageId = originalMsg.wa_message_id;
                            quotedPayload = {
                                key: {
                                    id: originalMsg.wa_message_id,
                                    remoteJid: originalMsg.remote_jid || fallbackRemoteJid,
                                    fromMe: ['mensagem_vendedor', 'audio_vendedor', 'video_vendedor', 'anexo_vendedor'].includes(originalMsg.tipo)
                                },
                                message: { conversation: originalMsg.mensagem || '' }
                            };
                        }
                        if (originalMsg.instance_name) forcedInstanceName = originalMsg.instance_name;
                        replyToValues.type = originalMsg.tipo;
                        replyToValues.preview = buildReplyPreviewFromType(originalMsg.tipo, originalMsg.mensagem);
                    }
                }
            }

            // 3. Determine Instance
            // Priority: Forced (Reply) > Requested (New) > Default
            const targetInstanceName = forcedInstanceName || instanceName;

            let instance: { instance_name: string };
            if (targetInstanceName) {
                // Fast path: trust UI-selected instance and let evolution-proxy enforce org/user scope.
                instance = { instance_name: targetInstanceName };
            } else {
                // Default fallback
                const instanceLookupStart = toPerfNow();
                const { data: defaultInstance, error: instanceError } = await scopeWhatsappInstanceQuery(
                    (supabase
                        .from('whatsapp_instances')
                        .select('instance_name')) as any,
                    { userId: user.id, orgId }
                )
                    .limit(1)
                    .maybeSingle();
                perf.instanceLookup = Math.round(toPerfNow() - instanceLookupStart);
                import.meta.env.DEV && console.log('[CHAT_LATENCY] instance_lookup_ms', { traceId, ms: perf.instanceLookup });

                if (instanceError) throw instanceError;
                if (!defaultInstance) throw new Error('Nenhuma instância do WhatsApp conectada. Conecte-se primeiro.');
                instance = defaultInstance;
            }

            // 4. Send via Evolution API
            const { evolutionApi } = await import('@/lib/evolutionApi');
            let response;

            try {
                import.meta.env.DEV && console.log('Attempting to send message via Evolution API', {
                    instance: instance.instance_name,
                    phone: formattedPhone,
                    contentLength: sanitizedContent.length,
                    quotedPayload,
                    traceId,
                });
                const evoStart = toPerfNow();
                response = await evolutionApi.sendMessage(
                    instance.instance_name,
                    formattedPhone,
                    sanitizedContent,
                    quotedPayload,
                    { clientTraceId: traceId, orgId: orgId || undefined }
                );
                perf.evolutionProxy = Math.round(toPerfNow() - evoStart);
                import.meta.env.DEV && console.log('[CHAT_LATENCY] evolution_proxy_ms', { traceId, ms: perf.evolutionProxy });
                import.meta.env.DEV && console.log('Evolution API Response:', response);

                if (!response.success) {
                    throw new Error(response.error || 'Unknown error from Evolution API');
                }
            } catch (apiError) {
                console.error('API Send Error details:', apiError);
                throw new Error('Falha ao enviar mensagem no WhatsApp: ' + (apiError instanceof Error ? apiError.message : String(apiError)));
            }

            // 5. Save to DB
            const leadIdCheck = Number(conversationId);
            const dbInsertStart = toPerfNow();
            const { data, error } = await supabase
                .from('interacoes')
                .insert({
                    lead_id: isNaN(leadIdCheck) ? null : leadIdCheck,
                    org_id: orgId,
                    user_id: user.id,
                    mensagem: sanitizedContent,
                    tipo: 'mensagem_vendedor',
                    wa_from_me: true,
                    instance_name: instance.instance_name,
                    wa_message_id: response?.data?.key?.id || null,
                    reply_to_interacao_id: replyToValues.id,
                    reply_to_message_id: quotedMessageId || null,
                    reply_preview: replyToValues.preview,
                    reply_type: replyToValues.type,
                    phone_e164: finalPhoneE164, // CRITICAL FIX
                    remote_jid: fallbackRemoteJid // CRITICAL FIX
                })
                .select()
                .single();
            perf.dbInsert = Math.round(toPerfNow() - dbInsertStart);
            import.meta.env.DEV && console.log('[CHAT_LATENCY] db_insert_ms', { traceId, ms: perf.dbInsert });

            if (error) {
                console.error('Supabase Insert Error:', error);
                throw error;
            }
            const newMessage = interacaoToMessage(data);
            import.meta.env.DEV && console.log('[CHAT_LATENCY] send_total_ms', {
                traceId,
                lead_lookup_ms: perf.leadLookup,
                reply_lookup_ms: perf.replyLookup,
                instance_lookup_ms: perf.instanceLookup,
                evolution_proxy_ms: perf.evolutionProxy,
                db_insert_ms: perf.dbInsert,
                total_ms: Math.round(toPerfNow() - perf.sendStart),
            });
            return newMessage;
        },
        onMutate: async (variables) => {
            const startedAtPerf = toPerfNow();
            const clientTempId = variables.clientTempId
                || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                    ? `tmp_${crypto.randomUUID()}`
                    : `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
            const clientTraceId = variables.clientTraceId
                || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                    ? crypto.randomUUID()
                    : `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
            variables.clientTempId = clientTempId;
            variables.clientTraceId = clientTraceId;

            const pendingMessage: Message = {
                id: clientTempId,
                clientTempId,
                contactId: variables.conversationId,
                content: variables.content.trim(),
                timestamp: new Date(),
                isFromClient: false,
                isRead: true,
                status: 'pending',
                errorMessage: null,
                instanceName: variables.replyMeta?.instanceName || variables.instanceName,
                phoneE164: variables.contactPhoneE164
                    ? normalizeOutboundPhone(variables.contactPhoneE164)
                    : (variables.contactPhone ? normalizeOutboundPhone(variables.contactPhone) : undefined),
                remoteJid: normalizeOutboundPhone(variables.contactPhoneE164 || variables.contactPhone || '')
                    ? buildFallbackRemoteJid(normalizeOutboundPhone(variables.contactPhoneE164 || variables.contactPhone || ''))
                    : undefined,
                replyTo: variables.replyTo
                    ? {
                        id: variables.replyTo.id,
                        content: variables.replyMeta?.preview
                            || buildReplyPreviewFromType(variables.replyMeta?.type, variables.replyMeta?.content)
                            || 'Mensagem respondida',
                        type: variables.replyMeta?.type || 'text',
                    }
                    : undefined,
            };

            queryClient.setQueryData(interactionsQueryKey, (old: Message[] | undefined) => {
                if (!old) return [pendingMessage];
                if (old.some(m => m.clientTempId === clientTempId || m.id === clientTempId)) return old;
                return [...old, pendingMessage];
            });

            import.meta.env.DEV && console.log('[CHAT_LATENCY] pending_inserted', {
                clientTempId,
                clientTraceId,
                cache_update_ms: Math.round(toPerfNow() - startedAtPerf),
            });

            return { clientTempId, clientTraceId, startedAtPerf };
        },
        onError: (error, variables, context) => {
            const tempId = context?.clientTempId || variables.clientTempId;
            if (tempId) {
                queryClient.setQueryData(interactionsQueryKey, (old: Message[] | undefined) => {
                    if (!old) return old;
                    return old.map(m => (
                        (m.clientTempId === tempId || m.id === tempId)
                            ? { ...m, status: 'failed', errorMessage: error.message || 'Falha ao enviar mensagem' }
                            : m
                    ));
                });
            }
            import.meta.env.DEV && console.warn('[CHAT_LATENCY] send_failed', {
                clientTraceId: context?.clientTraceId || variables.clientTraceId,
                clientTempId: tempId,
                error: error.message,
                send_total_ms: context ? Math.round(toPerfNow() - context.startedAtPerf) : undefined,
            });
        },
        onSuccess: (newMessage, variables, context) => {
            import.meta.env.DEV && console.log('✅ [SEND SUCCESS] Message sent, updating cache immediately:', newMessage?.id);
            if (newMessage) {
                queryClient.setQueryData(interactionsQueryKey, (old: Message[] | undefined) => {
                    const finalMessage = { ...newMessage, status: 'sent', errorMessage: null } as Message;
                    if (!old) return [finalMessage];
                    const tempId = context?.clientTempId || variables.clientTempId;
                    let replaced = false;
                    const next = old.map(m => {
                        if (tempId && (m.clientTempId === tempId || m.id === tempId)) {
                            replaced = true;
                            return finalMessage;
                        }
                        return m;
                    });
                    if (!replaced && !next.some(m => m.id === newMessage.id)) {
                        next.push(finalMessage);
                    }
                    const dedupedById = new Map<string, Message>();
                    for (const msg of next) dedupedById.set(msg.id, msg);
                    return Array.from(dedupedById.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                });
                updateMaxSeenFromMessages([newMessage]);

                const takeoverStart = toPerfNow();
                void handleHumanTakeover(newMessage, 'sendMessage')
                    .then(() => {
                        import.meta.env.DEV && console.log('[CHAT_LATENCY] human_takeover_ms', {
                            clientTraceId: context?.clientTraceId || variables.clientTraceId,
                            ms: Math.round(toPerfNow() - takeoverStart),
                            source: 'sendMessage',
                        });
                    })
                    .catch((err) => {
                        console.warn('[CHAT_LATENCY] human_takeover_error', err);
                    });
            }
            import.meta.env.DEV && context && console.log('[CHAT_LATENCY] cache_update_ms', {
                clientTraceId: context.clientTraceId,
                ms: Math.round(toPerfNow() - context.startedAtPerf),
            });
        },
    });

    const sendAttachmentMutation = useMutation({
        mutationFn: async ({ conversationId, file, fileType, caption, instanceName }: { conversationId: string, file: File, fileType: string, caption?: string, instanceName?: string }) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organização não vinculada ao usuário');

            const trimmedCaption = (caption || '').trim();

            // 1. Get Lead Phone & Instance (Refreshed Logic)
            const { data: lead, error: leadError } = await supabase
                .from('leads')
                .select('telefone, phone_e164')
                .eq('id', conversationId)
                .eq('org_id', orgId)
                .single();

            if (leadError || !lead) throw new Error('Lead not found');

            let instance: { instance_name: string } | null = null;
            if (instanceName) {
                const { data: specificInstance, error: specificErr } = await scopeWhatsappInstanceQuery(
                    (supabase
                        .from('whatsapp_instances')
                        .select('instance_name')) as any,
                    { userId: user.id, orgId, instanceName, requireActive: true }
                )
                    .single();

                if (specificErr || !specificInstance) {
                    throw new Error(`Instância "${instanceName}" não encontrada ou não conectada.`);
                }
                instance = specificInstance;
            } else {
                const { data: defaultInstance, error: instanceError } = await scopeWhatsappInstanceQuery(
                    (supabase
                        .from('whatsapp_instances')
                        .select('instance_name')) as any,
                    { userId: user.id, orgId, requireActive: true }
                )
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (instanceError) {
                    throw new Error((instanceError as any)?.message || 'Falha ao buscar instância do WhatsApp.');
                }
                instance = defaultInstance;
            }

            if (!instance) throw new Error('Nenhuma instância do WhatsApp conectada. Conecte-se primeiro.');

            // 2. Upload (prefer storage-intent; fallback to direct upload if the function isn't deployed)
            const VIDEO_LIMIT = 90 * 1024 * 1024; // 90MB
            // chat-delivery is the preferred public bucket (clean URLs); chat-attachments is a legacy/compat bucket.
            const bucketCandidates = ['chat-delivery', 'chat-attachments'] as const;

            const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9.\\-_]/g, '_');
            const ensureVideoExt = (name: string) => {
                if (name.toLowerCase().endsWith('.mp4') || name.toLowerCase().endsWith('.mov')) return name;
                return `${name}.mp4`;
            };

            const pickSendMode = (): 'image' | 'video' | 'document' => {
                if (fileType === 'image') return 'image';
                if (fileType === 'video') return file.size <= VIDEO_LIMIT ? 'video' : 'document';
                return 'document';
            };

            let publicUrl = '';
            let sendMode: 'image' | 'video' | 'document' = pickSendMode();
            let path = '';
            let usedIntent = false;
            let usedBucket = '';

            try {
                import.meta.env.DEV && console.log('Requesting Storage Intent for:', file.name, file.size);
                const { data: intentData, error: intentError } = await supabase.functions.invoke('storage-intent', {
                    body: {
                        fileName: file.name,
                        sizeBytes: file.size,
                        mimeType: file.type,
                        kind: fileType, // 'video', 'image', 'document'
                        leadId: conversationId,
                        orgId,
                    }
                });

                const hasValidIntent = Boolean(
                    intentData?.uploadUrl &&
                    intentData?.publicUrl &&
                    intentData?.sendMode &&
                    intentData?.path
                );

                if (!intentError && hasValidIntent) {
                    const allowedModes = new Set(['image', 'video', 'document']);
                    const intentMode = allowedModes.has(intentData.sendMode) ? intentData.sendMode : sendMode;
                    import.meta.env.DEV && console.log(`Intent Received: Mode=${intentMode}, Path=${intentData.path}`);

                    const uploadResponse = await fetch(intentData.uploadUrl, {
                        method: 'PUT',
                        body: file,
                        headers: {
                            'Content-Type': file.type || 'application/octet-stream'
                        }
                    });

                    if (!uploadResponse.ok) {
                        throw new Error(`Upload falhou: ${uploadResponse.statusText}`);
                    }

                    publicUrl = String(intentData.publicUrl);
                    sendMode = intentMode as 'image' | 'video' | 'document';
                    path = String(intentData.path);
                    usedIntent = true;
                    usedBucket = typeof intentData.bucket === 'string' ? intentData.bucket : bucketCandidates[0];
                } else {
                    console.warn('Storage Intent unavailable, using direct upload fallback.', intentError);
                }
            } catch (err) {
                console.warn('Storage Intent failed, using direct upload fallback.', err);
            }

            if (!usedIntent) {
                const finalName = sendMode === 'video' ? ensureVideoExt(file.name) : file.name;
                const safeLeadId = String(conversationId || 'general').replace(/[^a-zA-Z0-9_-]/g, '_');
                path = `${orgId}/chat/${safeLeadId}/${Date.now()}_${sanitizeFileName(finalName)}`;

                let lastUploadError: { message?: string } | null = null;

                for (const bucket of bucketCandidates) {
                    const { error: uploadError } = await supabase.storage
                        .from(bucket)
                        .upload(path, file, { contentType: file.type || 'application/octet-stream' });

                    if (!uploadError) {
                        usedBucket = bucket;
                        break;
                    }

                    lastUploadError = uploadError as { message?: string };
                    console.warn(`Direct upload failed for bucket ${bucket}:`, uploadError);
                }

                if (!usedBucket) {
                    const detail = lastUploadError?.message || 'Erro desconhecido';
                    throw new Error(
                        `Falha ao preparar upload. Deploy a função storage-intent ou crie/configure o bucket de mídia (${bucketCandidates.join(', ')}). Detalhe: ${detail}`
                    );
                }

                const { data: publicData } = supabase.storage
                    .from(usedBucket)
                    .getPublicUrl(path);

                publicUrl = publicData.publicUrl;
                import.meta.env.DEV && console.log(`Direct upload OK: Bucket=${usedBucket}, Path=${path}`);
            }

            // 4. Send via Evolution API
            const { evolutionApi } = await import('@/lib/evolutionApi');
            const formatPhoneNumber = (phone: string) => {
                const cleaned = phone.replace(/\D/g, '');
                if (cleaned.length === 10 || cleaned.length === 11) return `55${cleaned}`;
                return cleaned;
            };

            const formattedPhone = formatPhoneNumber(lead.telefone);
            const finalPhoneE164 = (lead as any).phone_e164 || formattedPhone;
            const fallbackRemoteJid = `${formattedPhone}@s.whatsapp.net`;
            let response;
            let currentSendMode = sendMode;
            const captionToSend = trimmedCaption.length > 0 ? trimmedCaption : undefined;
            const isGifUpload = currentSendMode === 'image'
                && (
                    String(file.type || '').toLowerCase() === 'image/gif'
                    || file.name.toLowerCase().endsWith('.gif')
                );

            try {
                if (isGifUpload) {
                    response = await evolutionApi.sendSticker(
                        instance.instance_name,
                        formattedPhone,
                        publicUrl,
                        { orgId: orgId || undefined }
                    );

                    if (!response.success) throw new Error(response.error || 'Evolution API returned false');
                    currentSendMode = 'image';
                } else {
                    // Strict Media Message
                    const mimeType = file.type || (fileType === 'video' ? 'video/mp4' : undefined);

                    response = await evolutionApi.sendMedia(
                        instance.instance_name,
                        formattedPhone,
                        publicUrl,
                        currentSendMode,
                        captionToSend,
                        file.name,
                        mimeType,
                        { orgId: orgId || undefined }
                    );

                    if (!response.success) throw new Error(response.error || 'Evolution API returned false');
                }

            } catch (err: any) {
                console.error(`Primary send failed (${currentSendMode}):`, err);

                // Fallback: GIF route failed, retry via regular image send.
                if (isGifUpload) {
                    console.warn("Attempting Fallback: GIF Sticker -> Image");
                    currentSendMode = 'image';

                    try {
                        response = await evolutionApi.sendMedia(
                            instance.instance_name,
                            formattedPhone,
                            publicUrl,
                            'image',
                            captionToSend,
                            file.name,
                            file.type || 'image/gif',
                            { orgId: orgId || undefined }
                        );
                        if (!response.success) throw new Error(response.error);
                    } catch (fallbackErr: any) {
                        throw new Error(`Falha no envio (Fallback): ${fallbackErr.message}`);
                    }
                } else if (currentSendMode === 'video') {
                    // Fallback: If Video failed with new logic, try as Document
                    console.warn("Attempting Fallback: Video -> Document");
                    currentSendMode = 'document';

                    try {
                        response = await evolutionApi.sendMedia(
                            instance.instance_name,
                            formattedPhone,
                            publicUrl,
                            'document',
                            captionToSend,
                            file.name,
                            file.type || 'video/mp4',
                            { orgId: orgId || undefined }
                        );
                        if (!response.success) throw new Error(response.error);
                    } catch (fallbackErr: any) {
                        throw new Error(`Falha no envio (Fallback): ${fallbackErr.message}`);
                    }
                } else {
                    throw new Error(err.message || 'Falha ao enviar mensagem.');
                }
            }

            // 5. Save Interaction
            let messageContent = '';
            let tipointeracao = 'anexo_vendedor';

            if (currentSendMode === 'image') {
                messageContent = `🖼️ ${trimmedCaption || file.name}\n${publicUrl}`;
            } else if (currentSendMode === 'video') {
                messageContent = `🎬 ${trimmedCaption || file.name}\n${publicUrl}`;
                tipointeracao = 'video_vendedor';
            } else {
                if (fileType === 'video') {
                    messageContent = `📂 Vídeo (Arquivo) - ${file.name}\n${publicUrl}`;
                } else {
                    messageContent = `📎 ${file.name}\n${publicUrl}`;
                }
            }

            const { data, error } = await supabase
                .from('interacoes')
                .insert({
                    lead_id: Number(conversationId),
                    org_id: orgId,
                    user_id: user.id,
                    mensagem: messageContent,
                    tipo: tipointeracao,
                    instance_name: instance.instance_name,
                    remote_jid: fallbackRemoteJid,
                    phone_e164: finalPhoneE164,
                    wa_message_id: (response as any)?.data?.key?.id || null,
                    attachment_url: publicUrl,
                    attachment_type: currentSendMode,
                    attachment_ready: true,
                    attachment_mimetype: file.type || null,
                    attachment_name: file.name,
                    attachment_size: file.size,
                    wa_from_me: true
                })
                .select()
                .single();

            if (error) throw error;
            return interacaoToMessage(data);
        },
        onSuccess: (newMessage) => {
            import.meta.env.DEV && console.log('✅ [ATTACHMENT SUCCESS] Attachment sent:', newMessage?.id);
            if (newMessage) {
                queryClient.setQueryData(interactionsQueryKey, (old: Message[] | undefined) => {
                    if (!old) return [newMessage];
                    if (old.some(m => m.id === newMessage.id)) return old;
                    return [...old, newMessage];
                });

                // --- HUMAN TAKEOVER ---
                void handleHumanTakeover(newMessage, 'sendAttachment').catch((err) => {
                    console.warn('[CHAT_LATENCY] human_takeover_error', err);
                });
            }
            // NOTE: Do NOT invalidate - lets polling/realtime sync
        }
    });

    const sendAudioMutation = useMutation({
        mutationFn: async ({ conversationId, audioBlob, duration, instanceName }: { conversationId: string, audioBlob: Blob, duration: number, instanceName?: string }) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organização não vinculada ao usuário');

            // 1. Get Lead Phone
            const { data: lead, error: leadError } = await supabase
                .from('leads')
                .select('telefone, phone_e164')
                .eq('id', conversationId)
                .eq('org_id', orgId)
                .single();

            if (leadError || !lead) throw new Error('Lead not found');

            // 2. Get Connected Instance
            let instance: { instance_name: string } | null = null;
            if (instanceName) {
                const { data: specificInstance, error: specificErr } = await scopeWhatsappInstanceQuery(
                    (supabase
                        .from('whatsapp_instances')
                        .select('instance_name')) as any,
                    { userId: user.id, orgId, instanceName }
                )
                    .single();

                if (specificErr || !specificInstance) {
                    throw new Error(`Instância "${instanceName}" não encontrada ou não conectada.`);
                }
                instance = specificInstance;
            } else {
                const { data: defaultInstance, error: instanceError } = await scopeWhatsappInstanceQuery(
                    (supabase
                        .from('whatsapp_instances')
                        .select('instance_name')) as any,
                    { userId: user.id, orgId }
                )
                    .limit(1)
                    .maybeSingle();

                if (instanceError) {
                    throw new Error((instanceError as any)?.message || 'Falha ao buscar instância do WhatsApp.');
                }
                instance = defaultInstance;
            }

            if (!instance) throw new Error('Nenhuma instância do WhatsApp conectada. Conecte-se primeiro.');

            // 3. Upload Audio
            const safeLeadId = String(conversationId || 'general').replace(/[^a-zA-Z0-9_-]/g, '_');
            const fileName = `${orgId}/chat/${safeLeadId}/${Date.now()}_audio.webm`;
            const bucketCandidates = ['chat-attachments', 'chat-delivery'] as const;
            let usedBucket = '';
            let lastUploadError: { message?: string } | null = null;

            for (const bucket of bucketCandidates) {
                const { error: uploadError } = await supabase.storage
                    .from(bucket)
                    .upload(fileName, audioBlob, { contentType: 'audio/webm' });

                if (!uploadError) {
                    usedBucket = bucket;
                    break;
                }

                lastUploadError = uploadError as { message?: string };
                console.warn(`Error uploading audio to bucket ${bucket}:`, uploadError);
            }

            if (!usedBucket) {
                const detail = lastUploadError?.message || 'Erro desconhecido';
                throw new Error(
                    `Falha ao enviar áudio. Verifique o bucket de mídia (${bucketCandidates.join(', ')}). Detalhe: ${detail}`
                );
            }

            const { data: urlData } = supabase.storage.from(usedBucket).getPublicUrl(fileName);
            const publicUrl = urlData.publicUrl;

            // Generate Signed URL for Evolution API
            const { data: signedData, error: signedError } = await supabase.storage
                .from(usedBucket)
                .createSignedUrl(fileName, 300);

            const sendUrl = signedData?.signedUrl || publicUrl;

            // 4. Send via Evolution API
            const { evolutionApi } = await import('@/lib/evolutionApi');
            const formatPhoneNumber = (phone: string) => {
                const cleaned = phone.replace(/\D/g, '');
                if (cleaned.length === 10 || cleaned.length === 11) return `55${cleaned}`;
                return cleaned;
            };

            const formattedPhone = formatPhoneNumber(lead.telefone);
            const finalPhoneE164 = (lead as any).phone_e164 || formattedPhone;
            const fallbackRemoteJid = `${formattedPhone}@s.whatsapp.net`;
            import.meta.env.DEV && console.log('Sending audio via Evolution API:', sendUrl);

            const response = await evolutionApi.sendAudio(
                instance.instance_name,
                formattedPhone,
                sendUrl, // Use Signed URL
                { orgId: orgId || undefined }
            );

            if (!response.success) {
                console.error('Evolution API Audio Failed:', response.error);

                // Self-healing: If instance doesn't exist on server, remove it from DB
                if (response.error && (
                    response.error.includes('404') ||
                    response.error.includes('not found') ||
                    response.error.includes('does not exist')
                )) {
                    console.warn(`Instance ${instance.instance_name} not found on server. Deleting from DB.`);
                    await scopeUserOrgQuery(
                        (supabase
                            .from('whatsapp_instances')
                            .delete()) as any,
                        { userId: user.id, orgId }
                    )
                        .eq('instance_name', instance.instance_name);

                    throw new Error('Instância do WhatsApp inválida ou desconectada. Por favor, atualize a página e conecte novamente.');
                }

                throw new Error(response.error || 'Failed to send audio via WhatsApp');
            }

            // 5. Save Interaction
            const messageContent = `🎤 Áudio (${duration}s)\n${publicUrl}`;
            const { data, error } = await supabase.from('interacoes').insert({
                lead_id: Number(conversationId),
                org_id: orgId,
                user_id: user.id,
                mensagem: messageContent,
                tipo: 'audio_vendedor',
                instance_name: instance.instance_name,
                remote_jid: fallbackRemoteJid,
                phone_e164: finalPhoneE164,
                wa_message_id: (response as any)?.data?.key?.id || null,
                attachment_url: publicUrl,
                attachment_type: 'audio',
                attachment_ready: true,
                attachment_mimetype: audioBlob.type || 'audio/webm',
                attachment_name: `Áudio (${duration}s)`,
                attachment_size: audioBlob.size,
                wa_from_me: true,
            }).select().single();

            if (error) {
                console.error('Supabase Insert Error (Audio):', error);
                throw new Error((error as any)?.message || 'Falha ao salvar o anexo.');
            }
            return interacaoToMessage(data);
        },
        onSuccess: (newMessage) => {
            import.meta.env.DEV && console.log('✅ [AUDIO SUCCESS] Audio sent:', newMessage?.id);
            if (newMessage) {
                queryClient.setQueryData(interactionsQueryKey, (old: Message[] | undefined) => {
                    if (!old) return [newMessage];
                    if (old.some(m => m.id === newMessage.id)) return old;
                    return [...old, newMessage];
                });

                // --- HUMAN TAKEOVER ---
                void handleHumanTakeover(newMessage, 'sendAudio').catch((err) => {
                    console.warn('[CHAT_LATENCY] human_takeover_error', err);
                });
            }
            // NOTE: Do NOT invalidate - lets polling/realtime sync
        }
    });

    // Derived state: Conversations (wrapped in useMemo for proper reactivity)
    const allMessages = messagesQuery.data || [];

    const normalizePhoneDigits = useCallback((value: string | undefined | null): string => {
        if (!value) return '';
        return String(value).replace(/\D/g, '');
    }, []);

    const buildPhoneScopeKeys = useCallback((value: string | undefined | null): string[] => {
        const digits = normalizePhoneDigits(value);
        if (!digits) return [];

        const keys = new Set<string>([digits]);
        if (digits.startsWith('55')) {
            const withoutCountry = digits.slice(2);
            if (withoutCountry) keys.add(withoutCountry);
        } else {
            keys.add(`55${digits}`);
        }

        if (digits.length > 11) {
            keys.add(digits.slice(-11));
        }
        if (digits.length > 13) {
            keys.add(digits.slice(-13));
        }

        return Array.from(keys).filter(Boolean);
    }, [normalizePhoneDigits]);

    const conversations = useMemo(() => {
        import.meta.env.DEV && console.log('🔄 [DERIVE] Recalculating conversations, messages:', allMessages.length, 'contacts:', contacts.length);
        const conversationsMap = new Map<string, Conversation>();
        const messagesByLeadId = new Map<string, Message[]>();
        const messagesByPhoneKey = new Map<string, Message[]>();

        const addIndexedMessage = (map: Map<string, Message[]>, key: string, message: Message) => {
            if (!key) return;
            const current = map.get(key);
            if (current) {
                current.push(message);
                return;
            }
            map.set(key, [message]);
        };

        for (const message of allMessages) {
            addIndexedMessage(messagesByLeadId, message.contactId, message);
            for (const phoneKey of buildPhoneScopeKeys(message.phoneE164)) {
                addIndexedMessage(messagesByPhoneKey, phoneKey, message);
            }
        }

        contacts.forEach(contact => {
            const byMessageId = new Map<string, Message>();
            const directMessages = messagesByLeadId.get(contact.id) || [];
            for (const message of directMessages) {
                byMessageId.set(message.id, message);
            }

            const phoneKeys = new Set<string>([
                ...buildPhoneScopeKeys(contact.phoneE164 || null),
                ...buildPhoneScopeKeys(contact.phone || null),
            ]);

            for (const key of phoneKeys) {
                const phoneMessages = messagesByPhoneKey.get(key);
                if (!phoneMessages) continue;
                for (const message of phoneMessages) {
                    byMessageId.set(message.id, message);
                }
            }

            const contactMessages = Array.from(byMessageId.values())
                .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            const readOverrideTs = readAtOverrides.current.get(contact.id);
            const unreadCount = contactMessages.filter(m => {
                if (!m.isFromClient || m.isRead) return false;
                // If conversation was marked as read, suppress badges for messages
                // that existed before that action (new msgs after it stay unread)
                if (readOverrideTs && m.timestamp.getTime() <= readOverrideTs) return false;
                return true;
            }).length;
            const lastMessage = contactMessages[contactMessages.length - 1];

            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            const isUrgent = lastMessage?.isFromClient && new Date(lastMessage.timestamp) < threeDaysAgo;

            conversationsMap.set(contact.id, {
                id: contact.id,
                contact,
                messages: contactMessages,
                unreadCount,
                lastMessage,
                isUrgent,
                hasFollowupToday: false
            });
        });

        return Array.from(conversationsMap.values())
            .sort((a, b) => {
                const aTime = a.lastMessage?.timestamp?.getTime() || 0;
                const bTime = b.lastMessage?.timestamp?.getTime() || 0;
                return bTime - aTime;
            });
    }, [allMessages, buildPhoneScopeKeys, contacts]);

    // --- SEND REACTION MUTATION ---
    const sendReactionMutation = useMutation({
        mutationFn: async ({ messageId, waMessageId, remoteJid, emoji, instanceName }: {
            messageId: string;
            waMessageId: string;
            remoteJid: string;
            emoji: string;
            instanceName: string;
        }) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organização não vinculada ao usuário');

            import.meta.env.DEV && console.log(`[REACTION] Sending ${emoji} to message ${waMessageId} via ${instanceName}`);

            // Call whatsapp-connect function to send reaction
            const { data: funcData, error: funcError } = await supabase.functions.invoke('whatsapp-connect', {
                body: {
                    action: 'sendReaction',
                    orgId,
                    instanceName,
                    key: {
                        remoteJid,
                        fromMe: false, // Reacting to client message
                        id: waMessageId
                    },
                    reaction: emoji
                }
            });

            if (funcError) {
                console.error('[REACTION] Evolution API error:', funcError);
                throw funcError;
            }

            import.meta.env.DEV && console.log('[REACTION] Evolution API response:', funcData);

            // Update local database
            const { data: currentMsg } = await supabase
                .from('interacoes')
                .select('reactions')
                .eq('id', messageId)
                .single();

            const existingReactions: any[] = Array.isArray(currentMsg?.reactions) ? currentMsg.reactions : [];

            // CRITICAL FIX: Remove previous reaction from "ME" before adding new one
            const filtered = existingReactions.filter((r: any) => !(r.fromMe === true || r.reactorId === 'ME'));

            if (emoji) {
                // Add new reaction
                filtered.push({
                    emoji,
                    fromMe: true,
                    reactorId: 'ME',
                    timestamp: new Date().toISOString()
                });
            }

            const newReactions = filtered;

            const { error: updateError } = await supabase
                .from('interacoes')
                .update({ reactions: newReactions })
                .eq('id', messageId);

            if (updateError) throw updateError;

            return { messageId, emoji };
        },
        onSuccess: ({ messageId, emoji }) => {
            import.meta.env.DEV && console.log(`[REACTION] Successfully sent ${emoji} to message ${messageId}`);
            // Invalidate to refresh reactions
            queryClient.invalidateQueries({ queryKey: interactionsQueryKey });
        }
    });

    // --- MARK AS READ MUTATION (Sprint 2, Item #3/#4) ---
    const markConversationAsRead = useCallback(async (conversationId: string) => {
        if (!user || !orgId) return;
        const leadId = Number(conversationId);
        if (isNaN(leadId)) return;

        // Persist override so the conversations memo always forces read
        readAtOverrides.current.set(conversationId, Date.now());

        // Optimistic: mark messages read in cache immediately
        queryClient.setQueriesData(
            { queryKey: interactionsQueryKey },
            (oldData: Message[] | undefined) => {
                if (!Array.isArray(oldData)) return oldData;
                return oldData.map(m =>
                    m.contactId === conversationId && m.isFromClient && !m.isRead
                        ? { ...m, isRead: true }
                        : m
                );
            }
        );

        // Persist: update read_at for unread client messages of this lead
        try {
            const vendedorTypesList = vendedorTypes;
            const { error } = await supabase
                .from('interacoes')
                .update({ read_at: new Date().toISOString() })
                .eq('lead_id', leadId)
                .eq('user_id', user.id)
                .is('read_at', null)
                .not('tipo', 'in', `(${vendedorTypesList.join(',')})`);

            if (error) {
                console.warn('[markAsRead] DB update failed (non-blocking):', error.message);
            }
        } catch (err) {
            console.warn('[markAsRead] Unexpected error (non-blocking):', err);
        }
    }, [user, orgId, queryClient, interactionsQueryKey]);

    return {
        conversations,
        allMessages,
        isLoadingMessages: messagesQuery.isLoading,
        sendMessage: sendMessageMutation.mutateAsync,
        sendAttachment: sendAttachmentMutation.mutateAsync,
        sendAudio: sendAudioMutation.mutateAsync,
        sendReaction: sendReactionMutation.mutateAsync,
        markAsRead: markConversationAsRead,
    };
}


