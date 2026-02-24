import { useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { supabase, InteracaoDB } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Contact, Conversation, Message } from '@/types/solarzap';

const vendedorTypes = [
    'mensagem_vendedor',
    'atendente',
    'audio_vendedor',
    'anexo_vendedor',
    'video_vendedor',
];

const interacaoToMessage = (interacao: InteracaoDB): Message => {
    const isFromClient = !vendedorTypes.includes(interacao.tipo);

    return {
        id: String(interacao.id),
        contactId: String(interacao.lead_id || 0),
        content: interacao.mensagem || '',
        timestamp: new Date(interacao.created_at),
        isFromClient,
        isRead: !isFromClient || !!interacao.read_at, // Seller msgs always read; client msgs read if read_at set
        isAutomation: interacao.tipo === 'automacao',
        instanceName: interacao.instance_name || undefined,
        phoneE164: interacao.phone_e164 || undefined, // NEW
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
    const interactionsQueryKey = useMemo(
        () => ['interactions', orgId, user?.id] as const,
        [orgId, user?.id]
    );

    /**
     * Shared human-takeover handler.
     * Respects the org-level setting `support_ai_auto_disable_on_seller_message`.
     * If the setting is false, the AI won't be paused when a seller sends a message.
     */
    const handleHumanTakeover = async (newMessage: Message, source: string) => {
        const leadId = Number(newMessage.contactId);
        if (isNaN(leadId)) return;

        try {
            // 1. Check org-level setting — respect support_ai_auto_disable_on_seller_message
            const { data: aiSettingsRow } = await supabase
                .from('ai_settings')
                .select('support_ai_auto_disable_on_seller_message')
                .eq('org_id', orgId!)
                .order('id', { ascending: true })
                .limit(1)
                .maybeSingle();

            // Default to true if column/row doesn't exist
            const autoDisableEnabled = aiSettingsRow?.support_ai_auto_disable_on_seller_message !== false;

            if (!autoDisableEnabled) {
                console.log(`[HumanTakeover/${source}] Org has auto-disable OFF — skipping pause for lead:`, leadId);
                toast({
                    title: 'Pausa automática desativada',
                    description: 'A configuração "Pausar IA ao enviar mensagem" está desligada nas configurações da org.',
                    duration: 4000,
                });
                return;
            }

            // 2. Pause AI on the lead
            console.log(`[HumanTakeover/${source}] Pausing AI for lead:`, leadId);
            const { data: pausedRows, error: pauseErr } = await supabase
                .from('leads')
                .update({
                    ai_enabled: false,
                    ai_paused_reason: 'human_takeover',
                    ai_paused_at: new Date().toISOString(),
                })
                .eq('id', leadId)
                .eq('org_id', orgId!)
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
                console.log(`[HumanTakeover/${source}] AI paused successfully`);
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
        queryFn: async () => {
            if (!user || !orgId) return [];
            console.log('[FETCH] Fetching latest interactions...');
            // CRITICAL FIX: Fetch NEWEST 1000 messages (descending), then reverse to chronological
            // Supabase default limit is 1000 - we want the NEWEST, not oldest
            const { data, error } = await supabase
                .from('interacoes')
                .select('*')
                .eq('user_id', user.id)
                .eq('org_id', orgId)
                .order('created_at', { ascending: false }) // Get newest first
                .limit(1000); // Explicit limit

            if (error) throw error;
            console.log('[FETCH] Got', data?.length || 0, 'interactions (newest first, will reverse)');
            // Reverse to get chronological order (oldest->newest for display)
            return (data || []).reverse().map(interacaoToMessage);
        },
        enabled: !!user && !!orgId,
        staleTime: 5000,
        refetchInterval: 3000,
    });

    // --- REALTIME & POLLING LOGIC ---
    useEffect(() => {
        if (!user || !orgId) return;

        // 1. Single Channel Global Subscription (User Scoped)
        console.log('[RT] Setting up robust subscription for org:', orgId);
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
                    // Guard: only process messages belonging to this user
                    if (payload.new.user_id !== user.id) return;
                    console.log('🔴 [RT INSERT]', payload.new.id);
                    const newMessage = interacaoToMessage(payload.new as InteracaoDB);
                    queryClient.setQueryData(interactionsQueryKey, (old: Message[] | undefined) => {
                        if (!old) return [newMessage];
                        if (old.some(m => m.id === newMessage.id)) return old;
                        return [...old, newMessage];
                    });
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
                    // Guard: only process messages belonging to this user
                    if (payload.new.user_id !== user.id) return;
                    console.log('🟡 [RT UPDATE]', payload.new.id, payload.new.attachment_ready);
                    const updatedMessage = interacaoToMessage(payload.new as InteracaoDB);

                    queryClient.setQueryData(interactionsQueryKey, (old: Message[] | undefined) => {
                        if (!old) return [updatedMessage];
                        return old.map(m => m.id === updatedMessage.id ? updatedMessage : m);
                    });
                }
            )
            .subscribe((status) => {
                console.log('🔵 [RT STATUS]', status);
            });

        // 2. Visibility change reconciliation (removed useless 5s heartbeat — Sprint 2/#24)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log('[RT] Tab active, reconciling...');
                queryClient.invalidateQueries({ queryKey: ['interactions', orgId] });
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            console.log('[RT] Cleanup channel:', channelName);
            supabase.removeChannel(subscription);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user, orgId, queryClient, interactionsQueryKey]);

    const sendMessageMutation = useMutation({
        mutationFn: async ({ conversationId, content, instanceName, replyTo }: { conversationId: string; content: string; instanceName?: string, replyTo?: { id: string } }) => {
            if (!user) throw new Error('User not authenticated');
            if (!orgId) throw new Error('Organização não vinculada ao usuário');

            // Validate content before sending
            const MAX_MESSAGE_LENGTH = 4096;
            const trimmedContent = content.trim();
            if (!trimmedContent) throw new Error('Mensagem não pode estar vazia');
            if (trimmedContent.length > MAX_MESSAGE_LENGTH) throw new Error(`Mensagem excede o limite de ${MAX_MESSAGE_LENGTH} caracteres`);
            const sanitizedContent = trimmedContent;

            // 1. Get Lead Phone
            const { data: lead, error: leadError } = await supabase
                .from('leads')
                .select('telefone, phone_e164')
                .eq('id', conversationId)
                .eq('org_id', orgId)
                .single();

            if (leadError || !lead) throw new Error('Lead not found');

            // Helper to format phone number
            const formatPhoneNumber = (phone: string) => {
                const cleaned = phone.replace(/\D/g, '');
                if (cleaned.length === 10 || cleaned.length === 11) {
                    return `55${cleaned}`;
                }
                return cleaned;
            };

            const formattedPhone = formatPhoneNumber(lead.telefone);
            const finalPhoneE164 = lead.phone_e164 || formattedPhone; // Use strict if available
            const fallbackRemoteJid = `${formattedPhone}@s.whatsapp.net`;

            // 2. Fetch Reply Details (Early) - needed for Instance selection and Preview
            let quotedPayload: any = undefined;
            let quotedMessageId: string | undefined;

            const replyToValues = {
                id: null as number | null,
                preview: null as string | null,
                type: 'text'
            };
            let forcedInstanceName: string | undefined;

            if (replyTo) {
                const { data: originalMsg } = await supabase
                    .from('interacoes')
                    .select('wa_message_id, mensagem, tipo, instance_name, remote_jid')
                    .eq('id', replyTo.id)
                    .single();

                if (originalMsg) {
                    if (originalMsg.wa_message_id) {
                        quotedMessageId = originalMsg.wa_message_id;
                        // Construct FULL Quoted Object (Format B - generally more robust for multi-instance)
                        quotedPayload = {
                            key: {
                                id: originalMsg.wa_message_id,
                                remoteJid: originalMsg.remote_jid || fallbackRemoteJid, // Fallback for old messages
                                fromMe: ['mensagem_vendedor', 'audio_vendedor', 'video_vendedor', 'anexo_vendedor'].includes(originalMsg.tipo)
                            },
                            message: { conversation: originalMsg.mensagem || '' }
                        };
                    }
                    if (originalMsg.instance_name) forcedInstanceName = originalMsg.instance_name;

                    replyToValues.id = Number(replyTo.id);
                    replyToValues.type = originalMsg.tipo;

                    // Generate Preview
                    if (['audio_vendedor', 'audio_cliente'].includes(originalMsg.tipo)) replyToValues.preview = '🎤 Áudio';
                    else if (['video_vendedor', 'video_cliente'].includes(originalMsg.tipo)) replyToValues.preview = '🎬 Vídeo';
                    else if (['anexo_vendedor', 'anexo_cliente'].includes(originalMsg.tipo)) replyToValues.preview = '📄 Documento/Imagem';
                    else replyToValues.preview = originalMsg.mensagem?.substring(0, 60) || '...';
                }
            }

            // 3. Determine Instance
            // Priority: Forced (Reply) > Requested (New) > Default
            const targetInstanceName = forcedInstanceName || instanceName;

            let instance;
            if (targetInstanceName) {
                const { data: specificInstance, error: instanceError } = await supabase
                    .from('whatsapp_instances')
                    .select('instance_name')
                    .eq('user_id', user.id)
                    .eq('instance_name', targetInstanceName)
                    .eq('status', 'connected')
                    .single();

                if (instanceError || !specificInstance) {
                    throw new Error(`Instância "${targetInstanceName}" não encontrada ou não conectada. (Necessária para responder a mensagem original).`);
                }
                instance = specificInstance;
            } else {
                // Default fallback
                const { data: defaultInstance, error: instanceError } = await supabase
                    .from('whatsapp_instances')
                    .select('instance_name')
                    .eq('user_id', user.id)
                    .eq('status', 'connected')
                    .limit(1)
                    .maybeSingle();

                if (instanceError) throw instanceError;
                if (!defaultInstance) throw new Error('Nenhuma instância do WhatsApp conectada. Conecte-se primeiro.');
                instance = defaultInstance;
            }

            // 4. Send via Evolution API
            const { evolutionApi } = await import('@/lib/evolutionApi');
            let response;

            try {
                console.log('Attempting to send message via Evolution API', {
                    instance: instance.instance_name,
                    phone: formattedPhone,
                    contentLength: sanitizedContent.length,
                    quotedPayload
                });

                response = await evolutionApi.sendMessage(
                    instance.instance_name,
                    formattedPhone,
                    sanitizedContent,
                    quotedPayload // Passing the full object now
                );
                console.log('Evolution API Response:', response);

                if (!response.success) {
                    throw new Error(response.error || 'Unknown error from Evolution API');
                }
            } catch (apiError) {
                console.error('API Send Error details:', apiError);
                throw new Error('Falha ao enviar mensagem no WhatsApp: ' + (apiError instanceof Error ? apiError.message : String(apiError)));
            }

            // 5. Save to DB
            const leadIdCheck = Number(conversationId);
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

            if (error) {
                console.error('Supabase Insert Error:', error);
                throw error;
            }
            return interacaoToMessage(data);
        },
        onSuccess: async (newMessage) => {
            console.log('✅ [SEND SUCCESS] Message sent, updating cache immediately:', newMessage?.id);
            // Optimistic update: Add message to cache immediately
            if (newMessage) {
                queryClient.setQueryData(interactionsQueryKey, (old: Message[] | undefined) => {
                    if (!old) return [newMessage];
                    // Avoid duplicates
                    if (old.some(m => m.id === newMessage.id)) return old;
                    return [...old, newMessage];
                });

                // --- HUMAN TAKEOVER ---
                await handleHumanTakeover(newMessage, 'sendMessage');
            }
            // NOTE: Do NOT invalidate here - it overwrites the optimistic update!
            // Polling and realtime will sync eventually.
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
                const { data: specificInstance, error: specificErr } = await supabase
                    .from('whatsapp_instances')
                    .select('instance_name')
                    .eq('user_id', user.id)
                    .eq('instance_name', instanceName)
                    .eq('status', 'connected')
                    .eq('is_active', true)
                    .single();

                if (specificErr || !specificInstance) {
                    throw new Error(`Instância "${instanceName}" não encontrada ou não conectada.`);
                }
                instance = specificInstance;
            } else {
                const { data: defaultInstance, error: instanceError } = await supabase
                    .from('whatsapp_instances')
                    .select('instance_name')
                    .eq('user_id', user.id)
                    .eq('status', 'connected')
                    .eq('is_active', true)
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
                console.log('Requesting Storage Intent for:', file.name, file.size);
                const { data: intentData, error: intentError } = await supabase.functions.invoke('storage-intent', {
                    body: {
                        fileName: file.name,
                        sizeBytes: file.size,
                        mimeType: file.type,
                        kind: fileType, // 'video', 'image', 'document'
                        leadId: conversationId
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
                    console.log(`Intent Received: Mode=${intentMode}, Path=${intentData.path}`);

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
                console.log(`Direct upload OK: Bucket=${usedBucket}, Path=${path}`);
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
            let fallbackOccurred = false;
            let currentSendMode = sendMode;
            const captionToSend = trimmedCaption.length > 0 ? trimmedCaption : undefined;

            try {
                // Strict Media Message
                const mimeType = file.type || (fileType === 'video' ? 'video/mp4' : undefined);

                response = await evolutionApi.sendMedia(
                    instance.instance_name,
                    formattedPhone,
                    publicUrl,
                    currentSendMode,
                    captionToSend,
                    file.name,
                    mimeType
                );

                if (!response.success) throw new Error(response.error || 'Evolution API returned false');

            } catch (err: any) {
                console.error(`Primary send failed (${currentSendMode}):`, err);

                // Fallback: If Video failed with new logic, try as Document
                if (currentSendMode === 'video') {
                    console.warn("Attempting Fallback: Video -> Document");
                    fallbackOccurred = true;
                    currentSendMode = 'document';

                    try {
                        response = await evolutionApi.sendMedia(
                            instance.instance_name,
                            formattedPhone,
                            publicUrl,
                            'document',
                            captionToSend,
                            file.name,
                            file.type || 'video/mp4'
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
        onSuccess: async (newMessage) => {
            console.log('✅ [ATTACHMENT SUCCESS] Attachment sent:', newMessage?.id);
            if (newMessage) {
                queryClient.setQueryData(interactionsQueryKey, (old: Message[] | undefined) => {
                    if (!old) return [newMessage];
                    if (old.some(m => m.id === newMessage.id)) return old;
                    return [...old, newMessage];
                });

                // --- HUMAN TAKEOVER ---
                await handleHumanTakeover(newMessage, 'sendAttachment');
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
                const { data: specificInstance, error: specificErr } = await supabase
                    .from('whatsapp_instances')
                    .select('instance_name')
                    .eq('user_id', user.id)
                    .eq('instance_name', instanceName)
                    .eq('status', 'connected')
                    .single();

                if (specificErr || !specificInstance) {
                    throw new Error(`Instância "${instanceName}" não encontrada ou não conectada.`);
                }
                instance = specificInstance;
            } else {
                const { data: defaultInstance, error: instanceError } = await supabase
                    .from('whatsapp_instances')
                    .select('instance_name')
                    .eq('user_id', user.id)
                    .eq('status', 'connected')
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
            console.log('Sending audio via Evolution API:', sendUrl);

            const response = await evolutionApi.sendAudio(
                instance.instance_name,
                formattedPhone,
                sendUrl // Use Signed URL
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
                    await supabase
                        .from('whatsapp_instances')
                        .delete()
                        .eq('instance_name', instance.instance_name)
                        .eq('user_id', user.id);

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
        onSuccess: async (newMessage) => {
            console.log('✅ [AUDIO SUCCESS] Audio sent:', newMessage?.id);
            if (newMessage) {
                queryClient.setQueryData(interactionsQueryKey, (old: Message[] | undefined) => {
                    if (!old) return [newMessage];
                    if (old.some(m => m.id === newMessage.id)) return old;
                    return [...old, newMessage];
                });

                // --- HUMAN TAKEOVER ---
                await handleHumanTakeover(newMessage, 'sendAudio');
            }
            // NOTE: Do NOT invalidate - lets polling/realtime sync
        }
    });

    // Derived state: Conversations (wrapped in useMemo for proper reactivity)
    const allMessages = messagesQuery.data || [];

    const conversations = useMemo(() => {
        console.log('🔄 [DERIVE] Recalculating conversations, messages:', allMessages.length, 'contacts:', contacts.length);
        const conversationsMap = new Map<string, Conversation>();

        contacts.forEach(contact => {
            const contactMessages = allMessages.filter(m => {
                // 1. Primary: Match by lead_id (most reliable, always populated)
                if (m.contactId === contact.id) {
                    return true;
                }
                // 2. Secondary: Match by phoneE164 (for messages with different lead_id but same phone)
                if (contact.phoneE164 && m.phoneE164) {
                    return contact.phoneE164 === m.phoneE164;
                }
                return false;
            });
            const unreadCount = contactMessages.filter(m => !m.isRead && m.isFromClient).length;
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
    }, [allMessages, contacts]);

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

            console.log(`[REACTION] Sending ${emoji} to message ${waMessageId} via ${instanceName}`);

            // Call whatsapp-connect function to send reaction
            const { data: funcData, error: funcError } = await supabase.functions.invoke('whatsapp-connect', {
                body: {
                    action: 'sendReaction',
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

            console.log('[REACTION] Evolution API response:', funcData);

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
            console.log(`[REACTION] Successfully sent ${emoji} to message ${messageId}`);
            // Invalidate to refresh reactions
            queryClient.invalidateQueries({ queryKey: interactionsQueryKey });
        }
    });

    // --- MARK AS READ MUTATION (Sprint 2, Item #3/#4) ---
    const markConversationAsRead = useCallback(async (conversationId: string) => {
        if (!user || !orgId) return;
        const leadId = Number(conversationId);
        if (isNaN(leadId)) return;

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


