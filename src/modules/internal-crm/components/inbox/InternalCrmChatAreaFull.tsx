import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  Phone,
  Search,
  Paperclip,
  Smile,
  Mic,
  Send,
  X,
  CheckSquare,
  Copy,
  ArrowLeft,
  Reply,
  MoreVertical,
  Archive,
  CheckCheck,
  Check,
  Clock,
  StickyNote,
  PanelRightOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import EmojiPicker, { EmojiClickData, Theme, Categories } from 'emoji-picker-react';
import { MessageContent } from '@/components/solarzap/MessageContent';
import {
  resolveInternalCrmAttachmentKind,
  resolveInternalCrmMediaVariant,
} from '@/modules/internal-crm/lib/chatMedia';
import type {
  InternalCrmConversationSummary,
  InternalCrmMessage,
  InternalCrmWhatsappInstance,
} from '@/modules/internal-crm/types';

// --- Emoji category translations ---
const emojiCategories = [
  { category: Categories.SUGGESTED, name: 'Recentes' },
  { category: Categories.SMILEYS_PEOPLE, name: 'Pessoas' },
  { category: Categories.ANIMALS_NATURE, name: 'Natureza' },
  { category: Categories.FOOD_DRINK, name: 'Comidas' },
  { category: Categories.TRAVEL_PLACES, name: 'Viagens' },
  { category: Categories.ACTIVITIES, name: 'Atividades' },
  { category: Categories.OBJECTS, name: 'Objetos' },
  { category: Categories.SYMBOLS, name: 'Símbolos' },
  { category: Categories.FLAGS, name: 'Bandeiras' },
];

// --- Constants ---
const CHAT_TIME_ZONE = 'America/Sao_Paulo';
const INITIAL_MESSAGES_BATCH = 50;
const OLDER_MESSAGES_BATCH = 50;
const LOAD_OLDER_SCROLL_THRESHOLD_PX = 120;
const BOTTOM_STICKY_THRESHOLD_PX = 80;

type InternalCrmChatAreaFullProps = {
  conversation: InternalCrmConversationSummary | null;
  messages: InternalCrmMessage[];
  instance: InternalCrmWhatsappInstance | null;
  messageBody: string;
  onMessageBodyChange: (value: string) => void;
  onSendMessage: () => void;
  onSendAttachment?: (
    file: File,
    fileType: 'image' | 'video' | 'audio' | 'document',
    options?: {
      caption?: string;
      mediaVariant?: 'standard' | 'gif' | 'sticker';
      preferSticker?: boolean;
    },
  ) => Promise<void>;
  onSendAudio?: (
    audioBlob: Blob,
    durationSeconds: number,
    options?: {
      fileName?: string;
      mimeType?: string;
    },
  ) => Promise<void>;
  isSending: boolean;
  isUpdatingStatus?: boolean;
  onUpdateStatus: (status: 'open' | 'resolved' | 'archived') => void;
  onOpenActions: () => void;
  onBack: () => void;
  isDetailsPanelOpen?: boolean;
};

// --- Helpers ---
function formatMessageTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { timeZone: CHAT_TIME_ZONE, hour: '2-digit', minute: '2-digit' });
}

function getDayKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: CHAT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(d);
}

function formatDayLabel(iso: string, dayKey: string) {
  const now = new Date();
  const todayKey = getDayKey(now.toISOString());
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayKey = getDayKey(yesterday.toISOString());
  if (dayKey === todayKey) return 'Hoje';
  if (dayKey === yesterdayKey) return 'Ontem';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { timeZone: CHAT_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getDisplayName(c: InternalCrmConversationSummary) {
  return c.client_company_name || c.primary_contact_name || c.primary_phone || 'Cliente';
}

function getAvatarColor(name: string) {
  const colors = [
    'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-rose-500',
    'bg-amber-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function DeliveryIcon({ status }: { status: string }) {
  switch (status) {
    case 'read':
      return <CheckCheck className="h-3.5 w-3.5 text-blue-500" />;
    case 'delivered':
      return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground/70" />;
    case 'sent':
      return <Check className="h-3.5 w-3.5 text-muted-foreground/70" />;
    case 'failed':
      return <span className="text-[10px] text-destructive font-medium">!</span>;
    default:
      return <Clock className="h-3 w-3 text-muted-foreground/50" />;
  }
}

// --- Determine attachment type from message ---
function mapAttachmentType(messageType: string): 'image' | 'video' | 'audio' | 'document' | undefined {
  if (messageType === 'image') return 'image';
  if (messageType === 'video') return 'video';
  if (messageType === 'audio') return 'audio';
  if (messageType === 'document') return 'document';
  return undefined;
}

export function InternalCrmChatAreaFull(props: InternalCrmChatAreaFullProps) {
  const { toast } = useToast();

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingDurationRef = useRef(0);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [replyTarget, setReplyTarget] = useState<InternalCrmMessage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const dragCounterRef = useRef(0);

  // Reverse-pagination
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const isAtBottomRef = useRef(true);
  const shouldScrollToBottomRef = useRef(true);
  const prependAdjustRef = useRef<{ pending: boolean; prevScrollTop: number; prevScrollHeight: number }>({
    pending: false, prevScrollTop: 0, prevScrollHeight: 0,
  });

  const canResolve = props.conversation && props.conversation.status !== 'resolved';
  const canArchive = props.conversation && props.conversation.status !== 'archived';

  // Reset state when conversation changes
  useEffect(() => {
    setVisibleStartIndex(Math.max(0, props.messages.length - INITIAL_MESSAGES_BATCH));
    shouldScrollToBottomRef.current = true;
    setReplyTarget(null);
    setIsSelectionMode(false);
    setSelectedMessages(new Set());
  }, [props.conversation?.id]);

  // Update start index when new messages arrive
  useEffect(() => {
    const newStart = Math.max(0, props.messages.length - INITIAL_MESSAGES_BATCH);
    if (newStart > visibleStartIndex) {
      setVisibleStartIndex(newStart);
    }
  }, [props.messages.length]);

  // Auto-scroll to bottom
  const lastMessageId = props.messages[props.messages.length - 1]?.id;
  useEffect(() => {
    if (!lastMessageId) return;
    if (shouldScrollToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      shouldScrollToBottomRef.current = false;
      return;
    }
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [lastMessageId]);

  // Restore scroll position after prepending older messages
  useLayoutEffect(() => {
    const adjust = prependAdjustRef.current;
    if (adjust.pending && scrollRef.current) {
      const delta = scrollRef.current.scrollHeight - adjust.prevScrollHeight;
      scrollRef.current.scrollTop = adjust.prevScrollTop + delta;
      prependAdjustRef.current = { pending: false, prevScrollTop: 0, prevScrollHeight: 0 };
    }
  });

  // Close emoji picker on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  // Reset selection mode when details panel opens
  useEffect(() => {
    if (props.isDetailsPanelOpen) {
      setIsSelectionMode(false);
      setSelectedMessages(new Set());
    }
  }, [props.isDetailsPanelOpen]);

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        window.clearInterval(recordingIntervalRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // noop
        }
      }
      const recorder = mediaRecorderRef.current as (MediaRecorder & { stream?: MediaStream }) | null;
      recorder?.stream?.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    };
  }, []);

  const clampedStart = Math.min(visibleStartIndex, props.messages.length);
  const visibleMessages = props.messages.slice(clampedStart);

  // --- Handlers ---
  const handleSend = () => {
    if (!props.messageBody.trim()) return;
    props.onSendMessage();
    setReplyTarget(null);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    props.onMessageBodyChange(props.messageBody + emojiData.emoji);
    inputRef.current?.focus();
  };

  const handleMessagesScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distFromBottom < BOTTOM_STICKY_THRESHOLD_PX;

    if (el.scrollTop < LOAD_OLDER_SCROLL_THRESHOLD_PX && visibleStartIndex > 0 && !prependAdjustRef.current.pending) {
      prependAdjustRef.current = { pending: true, prevScrollTop: el.scrollTop, prevScrollHeight: el.scrollHeight };
      setVisibleStartIndex((prev) => Math.max(0, prev - OLDER_MESSAGES_BATCH));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!props.onSendAttachment || !e.target.files) return;
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Limite de 16 MB.', variant: 'destructive' });
      e.target.value = '';
      return;
    }
    try {
      const fileType = resolveInternalCrmAttachmentKind(file);
      const mediaVariant = resolveInternalCrmMediaVariant(file);
      await props.onSendAttachment(file, fileType, {
        caption: props.messageBody.trim() || undefined,
        mediaVariant: mediaVariant === 'voice_note' ? 'standard' : mediaVariant,
        preferSticker: mediaVariant === 'gif' || mediaVariant === 'sticker',
      });
      if (props.messageBody.trim()) {
        props.onMessageBodyChange('');
      }
    } finally {
      e.target.value = '';
    }
  };

  // Drag and drop
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current++; if (e.dataTransfer.items?.length) setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current--; if (dragCounterRef.current === 0) setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false); dragCounterRef.current = 0;
    if (!props.onSendAttachment) return;
    const files = Array.from(e.dataTransfer.files).slice(0, 10);
    for (const file of files) {
      if (file.size > 16 * 1024 * 1024) { toast({ title: 'Arquivo grande', description: `${file.name} excede 16 MB.`, variant: 'destructive' }); continue; }
      const fileType = resolveInternalCrmAttachmentKind(file);
      const mediaVariant = resolveInternalCrmMediaVariant(file);
      await props.onSendAttachment(file, fileType, {
        caption: props.messageBody.trim() || undefined,
        mediaVariant: mediaVariant === 'voice_note' ? 'standard' : mediaVariant,
        preferSticker: mediaVariant === 'gif' || mediaVariant === 'sticker',
      });
    }
    if (props.messageBody.trim()) props.onMessageBodyChange('');
  };

  const resetRecordingState = () => {
    if (recordingIntervalRef.current) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    recordingChunksRef.current = [];
    recordingDurationRef.current = 0;
    setRecordingDuration(0);
    setIsRecording(false);
  };

  const handleRecordToggle = async () => {
    if (!props.onSendAudio) {
      toast({ title: 'Áudio indisponível', description: 'O envio de áudio ainda não foi configurado.', variant: 'destructive' });
      return;
    }

    if (isRecording) {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      toast({ title: 'Microfone indisponível', description: 'Seu navegador não suporta gravação de áudio.', variant: 'destructive' });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')
        ? 'audio/ogg; codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm; codecs=opus')
          ? 'audio/webm; codecs=opus'
          : '';
      const recorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : undefined) as MediaRecorder & { stream?: MediaStream };
      recorder.stream = stream;

      recordingChunksRef.current = [];
      recordingDurationRef.current = 0;
      setRecordingDuration(0);
      setIsRecording(true);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const finalChunks = [...recordingChunksRef.current];
        const mimeType = recorder.mimeType || preferredMime || 'audio/webm';
        const durationSeconds = recordingDurationRef.current;
        resetRecordingState();
        recorder.stream?.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;

        if (finalChunks.length === 0) return;

        const audioBlob = new Blob(finalChunks, { type: mimeType });
        if (audioBlob.size === 0) return;

        try {
          await props.onSendAudio?.(audioBlob, durationSeconds, {
            mimeType,
            fileName: `audio.${mimeType.includes('ogg') ? 'ogg' : 'webm'}`,
          });
        } catch (error) {
          toast({
            title: 'Erro ao enviar áudio',
            description: error instanceof Error ? error.message : 'Falha desconhecida no envio do áudio.',
            variant: 'destructive',
          });
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      recordingIntervalRef.current = window.setInterval(() => {
        recordingDurationRef.current += 1;
        setRecordingDuration(recordingDurationRef.current);
      }, 1_000);
    } catch (error) {
      resetRecordingState();
      toast({
        title: 'Erro ao acessar microfone',
        description: error instanceof Error ? error.message : 'Não foi possível iniciar a gravação.',
        variant: 'destructive',
      });
    }
  };

  // Selection mode
  const toggleMessageSelection = (id: string) => {
    setSelectedMessages((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const exitSelectionMode = () => { setIsSelectionMode(false); setSelectedMessages(new Set()); };
  const copySelectedMessages = () => {
    const texts = props.messages.filter((m) => selectedMessages.has(m.id)).map((m) => m.body || '').join('\n\n');
    navigator.clipboard.writeText(texts).then(() => {
      toast({ title: 'Copiado!', description: `${selectedMessages.size} mensagem(ns) copiada(s).` });
      exitSelectionMode();
    });
  };

  // --- Empty state ---
  if (!props.conversation) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/60 flex items-center justify-center text-3xl">💬</div>
          <p className="text-muted-foreground">Selecione uma conversa para visualizar o histórico.</p>
        </div>
      </div>
    );
  }

  const name = getDisplayName(props.conversation);

  return (
    <div
      className="flex h-full min-h-0 flex-col relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-primary/20 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-primary rounded-lg">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
              <Paperclip className="w-8 h-8 text-primary" />
            </div>
            <p className="text-lg font-semibold text-primary">Solte os arquivos aqui</p>
            <p className="text-sm text-muted-foreground mt-1">Imagens, vídeos ou documentos</p>
          </div>
        </div>
      )}

      {/* ====== HEADER — identical to SolarZap ====== */}
      <div className="h-14 shrink-0 px-3 flex items-center justify-between border-b border-border bg-card gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 lg:hidden" onClick={props.onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <button
          onClick={props.onOpenActions}
          className="flex items-center gap-2 min-w-0 flex-1 text-left hover:bg-muted/50 pl-1 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white', getAvatarColor(name))}>
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {props.conversation.primary_phone || props.conversation.primary_email || ''}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {props.instance && (
            <Badge variant="secondary" className="h-7 px-2 text-[10px] mr-1 max-w-[140px] truncate">
              {props.instance.status === 'connected' ? '🟢' : '🔴'} {props.instance.display_name || props.instance.instance_name}
            </Badge>
          )}
          {canResolve && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => props.onUpdateStatus('resolved')} disabled={props.isUpdatingStatus}>
              <CheckCheck className="mr-1 h-3.5 w-3.5" /> Resolver
            </Button>
          )}
          {canArchive && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => props.onUpdateStatus('archived')} disabled={props.isUpdatingStatus}>
              <Archive className="mr-1 h-3.5 w-3.5" /> Arquivar
            </Button>
          )}
          <button
            onClick={() => setIsSelectionMode(!isSelectionMode)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            title="Selecionar mensagens"
          >
            <CheckSquare className="w-4 h-4" />
          </button>
          <Button variant="ghost" size="icon" className="h-8 w-8 xl:hidden" onClick={props.onOpenActions}>
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ====== MESSAGES AREA — WhatsApp pattern background ====== */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto chat-bg-pattern custom-scrollbar"
        onScroll={handleMessagesScroll}
      >
        <div className="flex flex-col space-y-1 py-2 px-4 min-h-full max-w-3xl mx-auto">
          {visibleMessages.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Nenhuma mensagem nesta conversa.
            </div>
          ) : (
            visibleMessages.map((msg, idx) => {
              const isOutbound = msg.direction === 'outbound';
              const isSystem = msg.direction === 'system';
              const isNote = msg.message_type === 'note';
              const isSelected = selectedMessages.has(msg.id);
              const attType = mapAttachmentType(msg.message_type);

              // Day separator
              const dayKey = getDayKey(msg.created_at);
              const prevDayKey = idx > 0 ? getDayKey(visibleMessages[idx - 1].created_at) : null;
              const showDayMarker = idx === 0 || dayKey !== prevDayKey;

              // System message
              if (isSystem) {
                return (
                  <React.Fragment key={msg.id}>
                    {showDayMarker && (
                      <div className="flex justify-center my-4">
                        <div className="bg-muted/80 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs text-muted-foreground border border-border/50 shadow-sm">
                          {formatDayLabel(msg.created_at, dayKey)}
                        </div>
                      </div>
                    )}
                    <div className="flex justify-center my-2">
                      <span className="rounded-lg bg-zinc-800/90 px-3 py-1.5 text-[11px] text-zinc-200 shadow-sm max-w-[85%] text-center">
                        {msg.body || '-'}
                      </span>
                    </div>
                  </React.Fragment>
                );
              }

              // Internal note
              if (isNote) {
                return (
                  <React.Fragment key={msg.id}>
                    {showDayMarker && (
                      <div className="flex justify-center my-4">
                        <div className="bg-muted/80 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs text-muted-foreground border border-border/50 shadow-sm">
                          {formatDayLabel(msg.created_at, dayKey)}
                        </div>
                      </div>
                    )}
                    <div className="flex justify-center my-2 max-w-[75%] mx-auto">
                      <div className="rounded-lg border border-dashed border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 w-full">
                        <div className="flex items-center gap-1.5 mb-1">
                          <StickyNote className="h-3 w-3" />
                          <span className="font-medium">Nota interna</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words">{msg.body || '-'}</p>
                        <p className="mt-1.5 text-[10px] opacity-70 text-right">{formatMessageTime(msg.created_at)}</p>
                      </div>
                    </div>
                  </React.Fragment>
                );
              }

              // Normal message bubble — identical to SolarZap
              return (
                <React.Fragment key={msg.id}>
                  {showDayMarker && (
                    <div className="flex justify-center my-4">
                      <div className="bg-muted/80 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs text-muted-foreground border border-border/50 shadow-sm">
                        {formatDayLabel(msg.created_at, dayKey)}
                      </div>
                    </div>
                  )}

                  <div
                    id={`msg-${msg.id}`}
                    className={cn(
                      'flex w-full items-start gap-2',
                      isOutbound ? 'justify-end' : 'justify-start',
                      isSelectionMode && 'cursor-pointer',
                    )}
                    onClick={isSelectionMode ? () => toggleMessageSelection(msg.id) : undefined}
                  >
                    {/* Selection checkbox */}
                    {isSelectionMode && (
                      <div className={cn(
                        'flex items-center justify-center w-5 h-5 mt-2 rounded border-2 transition-colors flex-shrink-0',
                        isSelected ? 'bg-primary border-primary' : 'border-muted-foreground bg-transparent',
                      )}>
                        {isSelected && <span className="text-primary-foreground text-xs">✓</span>}
                      </div>
                    )}

                    <div
                      className={cn(
                        'max-w-[78%] px-3 py-2 rounded-lg shadow-sm relative transition-colors group sm:max-w-[65%]',
                        isOutbound
                          ? 'bg-chat-sent rounded-tr-none ml-auto'
                          : 'bg-chat-received rounded-tl-none mr-auto',
                        isSelected && 'ring-2 ring-primary',
                        msg.delivery_status === 'failed' && 'ring-2 ring-red-400/70',
                      )}
                    >
                      {/* Reply action on hover */}
                      {!isSelectionMode && (
                        <div className={cn(
                          'absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 z-20',
                          isOutbound ? 'left-1' : 'right-1',
                        )}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReplyTarget(msg);
                              inputRef.current?.focus();
                            }}
                            className="p-1 bg-background/50 rounded-full shadow-sm hover:bg-background"
                            title="Responder"
                          >
                            <Reply className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {/* Message content — use SolarZap MessageContent for media rendering */}
                      {attType ? (
                        <MessageContent
                          content={msg.body || ''}
                          isSent={isOutbound}
                          attachmentUrl={msg.attachment_url}
                          attachmentType={attType}
                          attachmentReady={msg.attachment_ready !== false}
                          attachmentName={msg.attachment_name || undefined}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap break-words text-sm">{msg.body || '-'}</p>
                      )}

                      {/* Timestamp + delivery status */}
                      <div className="flex items-center justify-end gap-1 mt-1">
                        {msg.delivery_status === 'failed' ? (
                          <span className="text-[10px] text-red-600 font-medium">Falhou</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">{formatMessageTime(msg.created_at)}</span>
                        )}
                        {isOutbound && <DeliveryIcon status={msg.delivery_status} />}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ====== SELECTION MODE BAR ====== */}
      {isSelectionMode && (
        <div className="h-14 shrink-0 px-4 flex items-center justify-between border-t border-border bg-card">
          <div className="flex items-center gap-3">
            <button onClick={exitSelectionMode} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
            <span className="text-sm text-foreground">
              {selectedMessages.size} {selectedMessages.size === 1 ? 'item selecionado' : 'itens selecionados'}
            </span>
          </div>
          <button
            onClick={copySelectedMessages}
            disabled={selectedMessages.size === 0}
            className={cn(
              'p-2 rounded-lg transition-colors',
              selectedMessages.size > 0 ? 'text-muted-foreground hover:text-foreground hover:bg-muted' : 'text-muted-foreground/50 cursor-not-allowed',
            )}
            title="Copiar"
          >
            <Copy className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ====== REPLY BAR ====== */}
      {replyTarget && !isSelectionMode && (
        <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between animate-in slide-in-from-bottom-2">
          <div className="flex flex-col border-l-4 border-primary pl-2">
            <span className="text-xs font-semibold text-primary">
              Respondendo a {replyTarget.direction === 'inbound' ? name : 'Você'}
            </span>
            <span className="text-xs text-muted-foreground line-clamp-1">{replyTarget.body || 'Mídia'}</span>
          </div>
          <button onClick={() => setReplyTarget(null)} className="p-1 hover:bg-muted rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ====== MESSAGE INPUT — copied from SolarZap ====== */}
      {!isSelectionMode && (
        <div className={cn('px-4 py-3 border-t border-border bg-card shrink-0', replyTarget && 'border-t-0')}>
          {isRecording && (
            <div className="mb-2 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              <span className="font-medium">Gravando áudio...</span>
              <span>{recordingDuration}s</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            {/* Emoji */}
            <div className="relative" ref={emojiPickerRef}>
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                <Smile className="w-5 h-5" />
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-12 left-0 z-50 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl shadow-2xl">
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    theme={Theme.DARK}
                    width={typeof window === 'undefined' ? 320 : Math.min(320, Math.max(240, window.innerWidth - 16))}
                    height={typeof window === 'undefined' ? 350 : Math.min(350, Math.max(260, window.innerHeight * 0.45))}
                    categories={emojiCategories}
                    searchPlaceHolder="Buscar emoji..."
                    previewConfig={{ showPreview: false }}
                  />
                </div>
              )}
            </div>

            {/* Attachment */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="Anexar arquivo"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
              onChange={handleFileSelect}
            />

            {/* Audio record */}
            <button
              onClick={() => { void handleRecordToggle(); }}
              disabled={props.isSending}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isRecording
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
              title={isRecording ? 'Parar gravação' : 'Gravar áudio'}
            >
              <Mic className="w-5 h-5" />
            </button>

            {/* Text input */}
            <textarea
              ref={inputRef}
              rows={1}
              value={props.messageBody}
              onChange={(e) => {
                props.onMessageBodyChange(e.target.value);
                // Auto-resize
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem..."
              className="flex-1 min-h-[40px] max-h-[128px] resize-none rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-sm shadow-none focus:outline-none focus:ring-1 focus:ring-primary"
            />

            {/* Send */}
            <button
              onClick={handleSend}
              disabled={props.isSending || isRecording || !props.messageBody.trim()}
              className={cn(
                'p-2.5 rounded-lg transition-colors',
                props.messageBody.trim()
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'text-muted-foreground bg-muted/50',
              )}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input */}
    </div>
  );
}
