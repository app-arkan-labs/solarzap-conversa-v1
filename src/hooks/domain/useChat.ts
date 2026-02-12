import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { supabase, InteracaoDB } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Conversation, Message } from '@/types/solarzap';
import { useLeads } from './useLeads';

const interacaoToMessage = (interacao: InteracaoDB): Message => {
    const vendedorTypes = [
        'mensagem_vendedor',
        'atendente',
        'audio_vendedor',
        'anexo_vendedor',
        'video_vendedor',
    ];

    return {
        id: String(interacao.id),
        contactId: String(interacao.lead_id || 0),
        content: interacao.mensagem || '',
        timestamp: new Date(interacao.created_at),
        isFromClient: !vendedorTypes.includes(interacao.tipo),
        isRead: true, // Simplified
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

export function useChat() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    // Leverage cached leads - verify this is actually updating
    const { contacts } = useLeads();

    // Derived state: Conversations
    // We memoize this to prevent unnecessary re-renders, but ensure it updates when `contacts` changes
    // The `contacts` from useLeads SHOULD update when deleteLead invalidates the query.

    const messagesQuery = useQuery({
        queryKey: ['interactions', user?.id],
        queryFn: async () => {
            if (!user) return [];
            console.log('[FETCH] Fetching latest interactions...');
            // CRITICAL FIX: Fetch NEWEST 1000 messages (descending), then reverse to chronological
            // Supabase default limit is 1000 - we want the NEWEST, not oldest
            const { data, error } = await supabase
                .from('interacoes')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false }) // Get newest first
                .limit(1000); // Explicit limit

            if (error) throw error;
            console.log('[FETCH] Got', data?.length || 0, 'interactions (newest first, will reverse)');
            // Reverse to get chronological order (oldest->newest for display)
            return (data || []).reverse().map(interacaoToMessage);
        },
        enabled: !!user,
        staleTime: 5000,
        refetchInterval: 3000,
    });

    // --- REALTIME & POLLING LOGIC ---
    useEffect(() => {
        if (!user) return;

        // 1. Single Channel Global Subscription (User Scoped)
        console.log('[RT] Setting up robust subscription for user:', user.id);
        const channelName = `rt:interacoes:${user.id}`;

        const subscription = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'interacoes',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    console.log('🔴 [RT INSERT]', payload.new.id);
                    const newMessage = interacaoToMessage(payload.new as InteracaoDB);
                    queryClient.setQueryData(['interactions', user?.id], (old: Message[] | undefined) => {
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
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    console.log('🟡 [RT UPDATE]', payload.new.id, payload.new.attachment_ready);
                    const updatedMessage = interacaoToMessage(payload.new as InteracaoDB);

                    queryClient.setQueryData(['interactions', user?.id], (old: Message[] | undefined) => {
                        if (!old) return [updatedMessage];
                        return old.map(m => m.id === updatedMessage.id ? updatedMessage : m);
                    });
                }
            )
            .subscribe((status) => {
                console.log('🔵 [RT STATUS]', status);
            });

        // 2. Polling Fallback (Every 5s) - only for missed messages
        // NOTE: We no longer invalidate on polling - this would overwrite optimistic updates
        // The useQuery refetchInterval handles background sync already
        const pollingId = setInterval(() => {
            // Just log for debugging, don't invalidate
            console.log('[POLL] Heartbeat (no invalidation to preserve optimistic updates)');
        }, 5000);

        // 3. Reconcile on visibility change
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log('[RT] Tab active, reconciling...');
                queryClient.invalidateQueries({ queryKey: ['interactions'] });
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            console.log('[RT] Cleanup channel:', channelName);
            supabase.removeChannel(subscription);
            clearInterval(pollingId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user, queryClient]);

    const sendMessageMutation = useMutation({
        mutationFn: async ({ conversationId, content, instanceName, replyTo }: { conversationId: string; content: string; instanceName?: string, replyTo?: { id: string } }) => {
            if (!user) throw new Error('User not authenticated');

            // 1. Get Lead Phone
            const { data: lead, error: leadError } = await supabase
                .from('leads')
                .select('telefone, phone_e164')
                .eq('id', conversationId)
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

            let replyToValues = {
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
                    content,
                    quotedPayload
                });

                response = await evolutionApi.sendMessage(
                    instance.instance_name,
                    formattedPhone,
                    content,
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
                    user_id: user.id,
                    mensagem: content,
                    tipo: 'mensagem_vendedor',
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
                queryClient.setQueryData(['interactions', user?.id], (old: Message[] | undefined) => {
                    if (!old) return [newMessage];
                    // Avoid duplicates
                    if (old.some(m => m.id === newMessage.id)) return old;
                    return [...old, newMessage];
                });

                // --- HUMAN TAKEOVER LOGIC (STRICT PATCH) ---
                try {
                    const leadId = Number(newMessage.contactId);
                    const instanceName = newMessage.instanceName || 'unknown';

                    if (!isNaN(leadId)) {
                        console.log('[HumanTakeover] Attempting to pause AI for lead:', leadId);

                        const pausePayload = {
                            ai_enabled: false,
                            ai_paused_reason: 'human_takeover',
                            ai_paused_at: new Date().toISOString()
                        };

                        const { data: pausedRows, error: pauseErr } = await supabase
                            .from('leads')
                            .update(pausePayload)
                            .eq('id', leadId)
                            .select('id');

                        console.log('[HumanTakeover] pause lead', { leadId, instanceName, ok: pausedRows?.length });

                        if (pauseErr) {
                            console.error('[HumanTakeover] Error pausing AI:', pauseErr);
                            toast({
                                variant: "destructive",
                                title: "Falha ao pausar IA",
                                description: "Erro de permissão ou conexão. IA pode continuar respondendo."
                            });
                        } else if (!pausedRows || pausedRows.length === 0) {
                            console.error('[HumanTakeover] 0 rows updated. Check RLS or Lead ID.', { leadId, instanceName });
                            toast({
                                variant: "destructive",
                                title: "Falha ao pausar IA",
                                description: "Não foi possível atualizar o status do lead. Verifique as permissões."
                            });
                        } else {
                            console.log('[HumanTakeover] AI Paused successfully');
                            // Strict invalidation to reflect UI toggle
                            queryClient.invalidateQueries({ queryKey: ['leads'] });
                            queryClient.invalidateQueries({ queryKey: ['lead', String(leadId)] });
                        }
                    } else {
                        console.warn('[HumanTakeover] Invalid Lead ID:', newMessage.contactId);
                    }
                } catch (err) {
                    console.error("Error in Human Takeover logic:", err);
                    toast({
                        variant: "destructive",
                        title: "Erro Crítico",
                        description: "Falha ao tentar pausar a IA após envio."
                    });
                }
            }
            // NOTE: Do NOT invalidate here - it overwrites the optimistic update!
            // Polling and realtime will sync eventually.
        },
    });

    const sendAttachmentMutation = useMutation({
        mutationFn: async ({ conversationId, file, fileType }: { conversationId: string, file: File, fileType: string }) => {
            if (!user) throw new Error('User not authenticated');

            // 1. Get Lead Phone & Instance (Refreshed Logic)
            const { data: lead, error: leadError } = await supabase
                .from('leads')
                .select('telefone')
                .eq('id', conversationId)
                .single();

            if (leadError || !lead) throw new Error('Lead not found');

            const { data: instance, error: instanceError } = await supabase
                .from('whatsapp_instances')
                .select('instance_name')
                .eq('user_id', user.id)
                .eq('status', 'connected')
                .limit(1)
                .maybeSingle();

            if (instanceError) throw instanceError;
            if (!instance) throw new Error('Nenhuma instância do WhatsApp conectada. Conecte-se primeiro.');

            // 2. Call Storage Intent (Server-Side Logic)
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

            if (intentError || !intentData) {
                console.error('Storage Intent Failed (Function not deployed?):', intentError);
                // Fallback or Error? Error for now to force correct usage.
                throw new Error('Falha ao preparar upload. Verifique se a função storage-intent está deployada.');
            }

            const { uploadUrl, publicUrl, sendMode, path } = intentData;
            console.log(`Intent Received: Mode=${sendMode}, Path=${path}`);

            // 3. Perform Upload to Signed URL
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: {
                    'Content-Type': file.type || 'application/octet-stream' // Must match what we told the intent
                }
            });

            if (!uploadResponse.ok) {
                throw new Error(`Upload falhou: ${uploadResponse.statusText}`);
            }

            // 4. Send via Evolution API
            const { evolutionApi } = await import('@/lib/evolutionApi');
            const formatPhoneNumber = (phone: string) => {
                const cleaned = phone.replace(/\D/g, '');
                if (cleaned.length === 10 || cleaned.length === 11) return `55${cleaned}`;
                return cleaned;
            };

            const formattedPhone = formatPhoneNumber(lead.telefone);
            let response;
            let fallbackOccurred = false;
            let currentSendMode = sendMode;

            try {
                // Strict Media Message
                const mimeType = file.type || (fileType === 'video' ? 'video/mp4' : undefined);

                response = await evolutionApi.sendMedia(
                    instance.instance_name,
                    formattedPhone,
                    publicUrl,
                    currentSendMode,
                    '',
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
                            '',
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
                messageContent = `🖼️ ${file.name}\n${publicUrl}`;
            } else if (currentSendMode === 'video') {
                messageContent = `🎬 ${file.name}\n${publicUrl}`;
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
                    user_id: user.id,
                    mensagem: messageContent,
                    tipo: tipointeracao,
                    instance_name: instance.instance_name,
                    file_name: file.name,
                    file_size: file.size,
                    mime_type: file.type,
                    send_mode: currentSendMode,
                    fallback_from: fallbackOccurred ? 'video' : null
                })
                .select()
                .single();

            if (error) throw error;
            return interacaoToMessage(data);
        },
        onSuccess: async (newMessage) => {
            console.log('✅ [ATTACHMENT SUCCESS] Attachment sent:', newMessage?.id);
            if (newMessage) {
                queryClient.setQueryData(['interactions', user?.id], (old: Message[] | undefined) => {
                    if (!old) return [newMessage];
                    if (old.some(m => m.id === newMessage.id)) return old;
                    return [...old, newMessage];
                });

                // --- HUMAN TAKEOVER LOGIC (STRICT PATCH) ---
                try {
                    const leadId = Number(newMessage.contactId);
                    const instanceName = newMessage.instanceName || 'unknown';

                    if (!isNaN(leadId)) {
                        console.log('[HumanTakeover] Attempting to pause AI for lead:', leadId);

                        const pausePayload = {
                            ai_enabled: false,
                            ai_paused_reason: 'human_takeover',
                            ai_paused_at: new Date().toISOString()
                        };

                        const { data: pausedRows, error: pauseErr } = await supabase
                            .from('leads')
                            .update(pausePayload)
                            .eq('id', leadId)
                            .select('id');

                        console.log('[HumanTakeover] pause lead', { leadId, instanceName, ok: pausedRows?.length });

                        if (pauseErr) {
                            console.error('[HumanTakeover] Error pausing AI:', pauseErr);
                            toast({
                                variant: "destructive",
                                title: "Falha ao pausar IA",
                                description: "Erro de permissão ou conexão. IA pode continuar respondendo."
                            });
                        } else if (!pausedRows || pausedRows.length === 0) {
                            console.error('[HumanTakeover] 0 rows updated. Check RLS or Lead ID.', { leadId, instanceName });
                            toast({
                                variant: "destructive",
                                title: "Falha ao pausar IA",
                                description: "Não foi possível atualizar o status do lead. Verifique as permissões."
                            });
                        } else {
                            console.log('[HumanTakeover] AI Paused successfully');
                            queryClient.invalidateQueries({ queryKey: ['leads'] });
                            queryClient.invalidateQueries({ queryKey: ['lead', String(leadId)] });
                        }
                    }
                } catch (err) {
                    console.error("Error in Human Takeover (Attachment):", err);
                    toast({
                        variant: "destructive",
                        title: "Erro Crítico",
                        description: "Falha ao tentar pausar a IA após envio de anexo."
                    });
                }
            }
            // NOTE: Do NOT invalidate - lets polling/realtime sync
        }
    });

    const sendAudioMutation = useMutation({
        mutationFn: async ({ conversationId, audioBlob, duration }: { conversationId: string, audioBlob: Blob, duration: number }) => {
            if (!user) throw new Error('User not authenticated');

            // 1. Get Lead Phone
            const { data: lead, error: leadError } = await supabase
                .from('leads')
                .select('telefone')
                .eq('id', conversationId)
                .single();

            if (leadError || !lead) throw new Error('Lead not found');

            // 2. Get Connected Instance
            const { data: instance, error: instanceError } = await supabase
                .from('whatsapp_instances')
                .select('instance_name')
                .eq('user_id', user.id)
                .eq('status', 'connected')
                .limit(1)
                .maybeSingle();

            if (instanceError) throw instanceError;
            if (!instance) throw new Error('Nenhuma instância do WhatsApp conectada. Conecte-se primeiro.');

            // 3. Upload Audio
            const fileName = `${conversationId}/${Date.now()}.webm`;
            const { error: uploadError } = await supabase.storage
                .from('chat-attachments')
                .upload(fileName, audioBlob, { contentType: 'audio/webm' });

            if (uploadError) {
                console.error('Error uploading audio:', uploadError);
                throw new Error(`Failed to upload audio: ${uploadError.message}`);
            }

            const { data: urlData } = supabase.storage.from('chat-attachments').getPublicUrl(fileName);
            const publicUrl = urlData.publicUrl;

            // Generate Signed URL for Evolution API
            const { data: signedData, error: signedError } = await supabase.storage
                .from('chat-attachments')
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
                user_id: user.id,
                mensagem: messageContent,
                tipo: 'audio_vendedor',
                instance_name: instance.instance_name,
            }).select().single();

            if (error) throw error;
            return interacaoToMessage(data);
        },
        onSuccess: async (newMessage) => {
            console.log('✅ [AUDIO SUCCESS] Audio sent:', newMessage?.id);
            if (newMessage) {
                queryClient.setQueryData(['interactions', user?.id], (old: Message[] | undefined) => {
                    if (!old) return [newMessage];
                    if (old.some(m => m.id === newMessage.id)) return old;
                    return [...old, newMessage];
                });

                // --- HUMAN TAKEOVER LOGIC (STRICT PATCH) ---
                try {
                    const leadId = Number(newMessage.contactId);
                    const instanceName = newMessage.instanceName || 'unknown';

                    if (!isNaN(leadId)) {
                        const pausePayload = {
                            ai_enabled: false,
                            ai_paused_reason: 'human_takeover',
                            ai_paused_at: new Date().toISOString()
                        };

                        const { data: pausedRows, error: pauseErr } = await supabase
                            .from('leads')
                            .update(pausePayload)
                            .eq('id', leadId)
                            .select('id');

                        console.log('[HumanTakeover] pause lead', { leadId, instanceName, ok: pausedRows?.length });

                        if (pauseErr) {
                            console.error('[HumanTakeover] Error pausing AI:', pauseErr);
                            toast({
                                variant: "destructive",
                                title: "Falha ao pausar IA",
                                description: "Erro de permissão ou conexão. IA pode continuar respondendo."
                            });
                        } else if (!pausedRows || pausedRows.length === 0) {
                            console.error('[HumanTakeover] 0 rows updated (Audio).', { leadId, instanceName });
                            toast({
                                variant: "destructive",
                                title: "Falha ao pausar IA",
                                description: "Não foi possível atualizar o status do lead após áudio."
                            });
                        } else {
                            console.log('[HumanTakeover] AI Paused successfully (Audio)');
                            queryClient.invalidateQueries({ queryKey: ['leads'] });
                            queryClient.invalidateQueries({ queryKey: ['lead', String(leadId)] });
                        }
                    }
                } catch (err) {
                    console.error("Error in Human Takeover (Audio):", err);
                    toast({
                        variant: "destructive",
                        title: "Erro Crítico",
                        description: "Falha ao tentar pausar a IA após envio de áudio."
                    });
                }
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
            queryClient.invalidateQueries({ queryKey: ['interactions', user?.id] });
        }
    });

    return {
        conversations,
        allMessages,
        isLoadingMessages: messagesQuery.isLoading,
        sendMessage: sendMessageMutation.mutateAsync,
        sendAttachment: sendAttachmentMutation.mutateAsync,
        sendAudio: sendAudioMutation.mutateAsync,
        sendReaction: sendReactionMutation.mutateAsync,
    };
}
