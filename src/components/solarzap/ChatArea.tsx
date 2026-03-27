import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Phone, Video, Search, Paperclip, Smile, Mic, Send, FileText, Image, Film, X, CheckSquare, Copy, Forward, ArrowLeft, Reply, Bot, UserCog, MoreVertical } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Conversation, Message, PIPELINE_STAGES, Contact, LeadTask } from '@/types/solarzap';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import EmojiPicker, { EmojiClickData, Theme, Categories } from 'emoji-picker-react';
import { ChatSearchModal } from './ChatSearchModal';
import { ForwardMessageModal } from './ForwardMessageModal';
import { MessageContent } from './MessageContent';
import { AudioDeviceModal } from './AudioDeviceModal';
import { ChatHeaderActionsDrawer } from './ChatHeaderActionsDrawer';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ImportedContact } from './ImportContactsModal';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { useMobileCapabilities } from '@/hooks/useMobileCapabilities';
import { useHoldToRecord } from '@/hooks/useHoldToRecord';
import { MobileRecordingOverlay } from './MobileRecordingOverlay';
import { Camera } from 'lucide-react';

import { InstanceSelector } from './InstanceSelector';
import { useUserWhatsAppInstances } from '@/hooks/useUserWhatsAppInstances';
import { ReactionPicker } from './ReactionPicker';
import { useAISettings } from '@/hooks/useAISettings'; // New Import
import { LeadNextActionInlineBar } from './LeadNextActionInlineBar';

import { supabase } from '@/lib/supabase'; // Imported for Internal Forwarding
import { listMembers } from '@/lib/orgAdminClient';

interface ChatAreaProps {
  conversation: Conversation | null;
  conversations?: Conversation[];
  actionsSheet?: React.ReactNode;
  onSendMessage: (
    conversationId: string,
    content: string,
    instanceName?: string,
    replyTo?: { id: string },
    options?: {
      contactPhone?: string;
      contactPhoneE164?: string;
      replyMeta?: {
        id: string;
        waMessageId?: string;
        remoteJid?: string;
        instanceName?: string;
        isFromClient?: boolean;
        preview?: string;
        type?: string;
        content?: string;
      };
    }
  ) => Promise<void>;
  onSendAttachment?: (conversationId: string, file: File, fileType: string, caption?: string, instanceName?: string) => Promise<void>;
  onSendAudio?: (conversationId: string, audioBlob: Blob, durationSeconds: number, instanceName?: string) => Promise<void>;
  onSendReaction?: (
    messageId: string,
    waMessageId: string,
    remoteJid: string,
    emoji: string,
    instanceName: string,
    fromMe: boolean
  ) => Promise<void>;
  onOpenDetails?: () => void;
  showLeadNextAction?: boolean;
  nextAction?: LeadTask | null;
  lastAction?: LeadTask | null;
  leadNextActionLoading?: boolean;
  showActionsToggle?: boolean;
  isActionsOpen?: boolean;
  onToggleActions?: () => void;
  onCreateLeadNextAction?: (input: {
    leadId: number;
    title: string;
    notes?: string | null;
    dueAt?: Date | null;
    priority?: LeadTask['priority'];
    channel?: LeadTask['channel'];
    userId?: string | null;
  }) => Promise<void>;
  onUpdateLeadNextAction?: (input: {
    taskId: string;
    title?: string;
    notes?: string | null;
    dueAt?: Date | null;
    priority?: LeadTask['priority'];
    channel?: LeadTask['channel'];
    userId?: string | null;
  }) => Promise<void>;
  onCompleteLeadNextAction?: (task: LeadTask, resultSummary: string) => Promise<void>;
  onCancelLeadNextAction?: (taskId: string) => Promise<void>;
  onToggleLeadAi?: (params: { leadId: string; enabled: boolean; reason?: 'manual' | 'human_takeover' }) => Promise<{ leadId: string; enabled: boolean }>;
  onCallAction?: (contact: Conversation['contact']) => void;
  onVideoCallAction?: (contact: Conversation['contact']) => void;
  onImportContacts?: (contacts: ImportedContact[]) => Promise<unknown>;
  initialMessage?: string;
  onInitialMessageUsed?: () => void;
  onClientMessage?: (conversationId: string) => void;
  isDetailsOpen?: boolean;
  onBack?: () => void;
}

// Traduções em português para o emoji picker
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

export function ChatArea({
  conversation,
  conversations = [],
  actionsSheet,
  onSendMessage,
  onSendAttachment,
  onSendAudio,
  onSendReaction,
  onOpenDetails,
  showLeadNextAction = false,
  nextAction = null,
  lastAction = null,
  leadNextActionLoading = false,
  showActionsToggle = false,
  isActionsOpen = false,
  onToggleActions,
  onCreateLeadNextAction,
  onUpdateLeadNextAction,
  onCompleteLeadNextAction,
  onCancelLeadNextAction,
  onCallAction,
  onImportContacts,
  initialMessage,
  onInitialMessageUsed,
  onClientMessage,
  onToggleLeadAi,
  onVideoCallAction,
  isDetailsOpen,
  onBack,
}: ChatAreaProps) {
  const { orgId, role } = useAuth();
  const isOrgManager = role === 'owner' || role === 'admin';
  // Instance Selection
  const { instances, updateColor } = useUserWhatsAppInstances();

  // Initialize from localStorage or null
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(() => {
    return localStorage.getItem('solarzap_selected_instance_id');
  });

  // Set default instance when instances load (if none selected or validity check)
  useEffect(() => {
    if (instances.length > 0) {
      if (!selectedInstanceId) {
        // No selection -> pick first connected
        const connected = instances.find(i => i.status === 'connected');
        if (connected) {
          setSelectedInstanceId(connected.id);
          localStorage.setItem('solarzap_selected_instance_id', connected.id);
        }
      } else {
        // Validation: Verify if stored ID still exists in loaded instances
        const exists = instances.find(i => i.id === selectedInstanceId);
        if (!exists) {
          // Fallback if stored instance was deleted/lost
          const connected = instances.find(i => i.status === 'connected');
          if (connected) {
            setSelectedInstanceId(connected.id);
            localStorage.setItem('solarzap_selected_instance_id', connected.id);
          }
        }
      }
    }
  }, [instances, selectedInstanceId]);

  // Sync selected instance with conversation source
  useEffect(() => {
    if (conversation?.lastMessage?.instanceName) {
      const instance = instances.find(i => i.instance_name === conversation.lastMessage!.instanceName);
      if (instance && instance.id !== selectedInstanceId) {
        import.meta.env.DEV && console.log("Switching instance context to:", instance.instance_name);
        setSelectedInstanceId(instance.id);
        localStorage.setItem('solarzap_selected_instance_id', instance.id);
      }
    }
  }, [conversation?.id, conversation?.lastMessage?.instanceName, instances]);

  // Persist selection changes
  const handleInstanceSelect = (instance: any) => {
    setSelectedInstanceId(instance.id);
    localStorage.setItem('solarzap_selected_instance_id', instance.id);
  };

  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);

  // Reset message selection mode when details panel opens
  useEffect(() => {
    if (isDetailsOpen) {
      setIsSelectionMode(false);
      setSelectedMessages(new Set());
    }
  }, [isDetailsOpen]);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showAudioDeviceModal, setShowAudioDeviceModal] = useState(false);
  const [showActionsDrawer, setShowActionsDrawer] = useState(false);
  const [showAttachDrawer, setShowAttachDrawer] = useState(false);
  const isMobileChat = useMobileViewport();
  const { isTouchDevice, isIOSWebKit, isMobileChatExperience } = useMobileCapabilities();
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string | null>(() => {
    return localStorage.getItem('solarzap_audio_input');
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraImageInputRef = useRef<HTMLInputElement>(null);
  const galleryImageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragCounterRef = useRef(0);

  const [activeReactionId, setActiveReactionId] = useState<string | null>(null);

  // Sprint 2, Item #5: Cleanup MediaRecorder + stream on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (_) { /* already stopped */ }
      }
      // Stop all media tracks to release microphone
      if (mediaRecorderRef.current && (mediaRecorderRef.current as any).stream) {
        (mediaRecorderRef.current as any).stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
    };
  }, []);

  // Reverse-pagination UI state: show latest messages first, load older as user scrolls up.
  const INITIAL_MESSAGES_BATCH = 50;
  const OLDER_MESSAGES_BATCH = 50;
  const LOAD_OLDER_SCROLL_THRESHOLD_PX = 120;
  const BOTTOM_STICKY_THRESHOLD_PX = 80;

  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const prependAdjustRef = useRef<{ pending: boolean; prevScrollTop: number; prevScrollHeight: number }>({
    pending: false,
    prevScrollTop: 0,
    prevScrollHeight: 0,
  });
  const isAtBottomRef = useRef(true);
  const shouldScrollToBottomRef = useRef(true);
  const pendingScrollToMessageIdRef = useRef<string | null>(null);

  const [attachmentType, setAttachmentType] = useState<'document' | 'image' | 'video' | null>(null);
  const { toast } = useToast();
  const { settings: aiSettings } = useAISettings(); // Get Global Settings

  // Mobile hold-to-record hook (only active mechanics on mobile)
  const mobileRecorder = useHoldToRecord({
    onSend: async (blob, dur) => {
      if (!conversation || !onSendAudio) return;
      const selectedInstance = instances.find(i => i.id === selectedInstanceId);
      await onSendAudio(conversation.id, blob, dur, selectedInstance?.instance_name);
    },
    onError: (err) => {
      console.error('Mobile recording error:', err);
      toast({
        title: 'Erro ao gravar áudio',
        description: 'Verifique as permissões do microfone e tente novamente.',
        variant: 'destructive',
      });
    },
  });

  // Force-cancel mobile recording when conversation changes
  useEffect(() => {
    mobileRecorder.forceCancel();
  }, [conversation?.id]);

  // Determine file type from mime type
  const getFileType = (file: File): 'image' | 'video' | 'document' => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return 'document';
  };

  // Handle drag and drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    if (!conversation || !onSendAttachment) return;

    const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16 MB (Evolution API limit)
    const MAX_FILES = 10;
    const files = Array.from(e.dataTransfer.files);

    if (files.length > MAX_FILES) {
      toast({
        title: "Muitos arquivos",
        description: `Máximo de ${MAX_FILES} arquivos por vez.`,
        variant: "destructive",
      });
      return;
    }

    const selectedInstance = instances.find(i => i.id === selectedInstanceId);
    const caption = message.trim() || undefined;

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "Arquivo muito grande",
          description: `${file.name} excede o limite de 16 MB.`,
          variant: "destructive",
        });
        continue;
      }

      const fileType = getFileType(file);
      await onSendAttachment(conversation.id, file, fileType, caption, selectedInstance?.instance_name);
    }
  };

  // Set initial message when provided
  const initialMessageProcessedRef = useRef(false);

  useEffect(() => {
    initialMessageProcessedRef.current = false;
  }, [conversation?.id]);

  useEffect(() => {
    // Allows overwriting/pre-filling message whenever initialMessage prop changes to a non-empty string
    // The parent component is responsible for clearing initialMessage via onInitialMessageUsed to avoid loops
    if (initialMessage && initialMessage.length > 0 && conversation) {
      setMessage(initialMessage);
      setTimeout(() => {
        onInitialMessageUsed?.();
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.style.height = 'auto';
          inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 128) + 'px';
        }
      }, 50);
    }
  }, [initialMessage, conversation]);

  // Scroll logic
  const scrollToBottom = (instant = false) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: instant ? 'auto' : 'smooth',
        block: 'end'
      });
    }
  };

  // Wrapper delay para imagens - FIX FOR SCROLL
  const handleMediaLoad = () => {
    setTimeout(() => {
      if (isAtBottomRef.current) scrollToBottom();
    }, 100);
  };

  // Fix: Only scroll if the LAST message changes (avoids scrolling on every 2s poll)
  const lastMessageId = conversation?.messages?.[conversation.messages.length - 1]?.id;

  useEffect(() => {
    if (!lastMessageId) return;

    if (shouldScrollToBottomRef.current) {
      scrollToBottom(true);
      shouldScrollToBottomRef.current = false;
      return;
    }

    if (isAtBottomRef.current) scrollToBottom();
  }, [lastMessageId]); // Depend on ID, not array reference

  // Track previous message count
  const prevMessageCountRef = useRef<number>(0);

  useEffect(() => {
    if (!conversation || !onClientMessage) return;

    const currentMessageCount = conversation.messages.length;

    if (currentMessageCount > prevMessageCountRef.current && prevMessageCountRef.current > 0) {
      const lastMessage = conversation.messages[conversation.messages.length - 1];
      if (lastMessage && lastMessage.isFromClient) {
        onClientMessage(conversation.id);
      }
    }

    prevMessageCountRef.current = currentMessageCount;
  }, [conversation?.messages?.length, conversation?.id, onClientMessage]);

  // Fechar emoji picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  const handleSend = async () => {
    if (!message.trim() || !conversation) return;

    const selectedInstance = instances.find(i => i.id === selectedInstanceId);
    const msgToSend = message;
    const replyToSend = replyToTarget;
    const replyMeta = replyTarget
      ? {
          id: replyTarget.id,
          waMessageId: replyTarget.waMessageId,
          remoteJid: replyTarget.remoteJid,
          instanceName: replyTarget.instanceName,
          isFromClient: replyTarget.isFromClient,
          preview: replyTarget.replyTo?.content || replyTarget.content?.substring(0, 60) || undefined,
          type: replyTarget.replyTo?.type || (replyTarget.attachment_type ? String(replyTarget.attachment_type) : 'text'),
          content: replyTarget.content,
        }
      : undefined;

    // Clear input immediately for responsiveness
    setMessage('');
    setReplyTarget(null);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      await onSendMessage(conversation.id, msgToSend, selectedInstance?.instance_name, replyToSend, {
        contactPhone: conversation.contact.phone,
        contactPhoneE164: conversation.contact.phoneE164,
        replyMeta,
      });
    } catch {
      // Error is already handled by SolarZapLayout's try/catch + toast
      // Restore message on failure so user doesn't lose their text
      setMessage(msgToSend);
    }
  };

  const replyToTarget = replyTarget ? { id: replyTarget.id } : undefined;

  const retryFailedMessage = async (msg: Message) => {
    if (!conversation) return;
    const selectedInstance = instances.find(i => i.id === selectedInstanceId);
    const targetInstanceName = msg.instanceName || selectedInstance?.instance_name;
    try {
      await onSendMessage(conversation.id, msg.content, targetInstanceName, undefined, {
        contactPhone: conversation.contact.phone,
        contactPhoneE164: conversation.contact.phoneE164,
      });
    } catch {
      // upstream toast already handles errors
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prev => prev + emojiData.emoji);
    inputRef.current?.focus();
  };

  const handleAttachmentSelect = (type: 'document' | 'image' | 'video') => {
    setAttachmentType(type);
    if (fileInputRef.current) {
      if (type === 'document') {
        fileInputRef.current.accept = '.pdf,.doc,.docx,.xls,.xlsx,.txt';
      } else if (type === 'image') {
        fileInputRef.current.accept = 'image/*';
      } else if (type === 'video') {
        fileInputRef.current.accept = 'video/*';
      }
      fileInputRef.current.click();
    }
  };

  /** Mobile-specific: use dedicated inputs to avoid iOS quirks with mutated accept */
  const handleMobileAttachment = (kind: 'camera' | 'gallery' | 'video' | 'document') => {
    setShowAttachDrawer(false);
    // Small delay so drawer closes before file picker opens (Safari quirk)
    setTimeout(() => {
      const refMap: Record<string, React.RefObject<HTMLInputElement | null>> = {
        camera: cameraImageInputRef,
        gallery: galleryImageInputRef,
        video: videoInputRef,
        document: documentInputRef,
      };
      const typeMap: Record<string, 'image' | 'image' | 'video' | 'document'> = {
        camera: 'image',
        gallery: 'image',
        video: 'video',
        document: 'document',
      };
      setAttachmentType(typeMap[kind]);
      const ref = refMap[kind];
      if (ref?.current) {
        ref.current.value = '';
        ref.current.click();
      }
    }, 150);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !conversation || !onSendAttachment) return;

    const caption = message.trim() || undefined;
    const selectedInstance = instances.find(i => i.id === selectedInstanceId);

    try {
      await onSendAttachment(conversation.id, file, attachmentType || 'document', caption, selectedInstance?.instance_name);
      e.target.value = '';

      if (caption) {
        setMessage('');
        if (inputRef.current) {
          inputRef.current.style.height = 'auto';
        }
      }
    } catch (error) {
      console.error('Error sending attachment:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : (error as any)?.message
              ? String((error as any).message)
              : "Erro desconhecido";
      toast({
        title: "Erro ao enviar arquivo",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const handleMicrophoneClick = () => {
    // On mobile, skip the AudioDeviceModal entirely — use default mic
    if (isMobileChatExperience) {
      startRecordingWithDevice(null);
      return;
    }
    const isAudioConfigured = localStorage.getItem('solarzap_audio_configured') === 'true';

    if (!isAudioConfigured) {
      setShowAudioDeviceModal(true);
    } else {
      startRecordingWithDevice(selectedMicrophoneId);
    }
  };

  const handleAudioDeviceConfirm = (inputDeviceId: string, outputDeviceId: string) => {
    setSelectedMicrophoneId(inputDeviceId);
    startRecordingWithDevice(inputDeviceId);
  };

  const startRecordingWithDevice = async (deviceId: string | null) => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId
          ? { deviceId: { exact: deviceId } }
          : true
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        const e = err as { name?: string; message?: string };
        const canFallback = deviceId && (e?.name === 'OverconstrainedError' || e?.name === 'NotFoundError');

        if (!canFallback) throw err;

        // If the stored/selected device is no longer available, retry with the default mic.
        console.warn('Selected microphone is unavailable; retrying with default device.', e?.name, e?.message);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setSelectedMicrophoneId(null);
        localStorage.removeItem('solarzap_audio_input');
      }
      // Prefer ogg/opus (WhatsApp-compatible) over webm
      const preferredMime = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')
        ? 'audio/ogg; codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm; codecs=opus')
          ? 'audio/webm; codecs=opus'
          : undefined;
      const mediaRecorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());

        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }

        const finalDuration = recordingDuration > 0 ? recordingDuration : 1;
        setRecordingDuration(0);

        if (conversation && onSendAudio && audioChunksRef.current.length > 0) {
          const selectedInstance = instances.find(i => i.id === selectedInstanceId);
          const actualMime = mediaRecorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: actualMime });
          try {
            await onSendAudio(conversation.id, audioBlob, finalDuration, selectedInstance?.instance_name);
          } catch (error) {
            console.error('Error sending audio:', error);
            toast({
              title: "Erro ao enviar áudio",
              description: error instanceof Error ? error.message : "Erro desconhecido",
              variant: "destructive"
            });
          }
        }

        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        title: "Erro ao acessar microfone",
        description: "Verifique as permissões do navegador e tente novamente.",
        variant: "destructive"
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const CHAT_TIME_ZONE = 'America/Sao_Paulo';

  const getDayKey = (date: Date) => {
    const d = new Date(date);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: CHAT_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);

    const year = parts.find((p) => p.type === 'year')?.value ?? '';
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    const day = parts.find((p) => p.type === 'day')?.value ?? '';
    return `${year}-${month}-${day}`;
  };

  const formatDayMarkerLabel = (date: Date, dayKey: string) => {
    const now = new Date();
    const todayKey = getDayKey(now);
    const yesterdayKey = getDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));

    if (dayKey === todayKey) return 'Hoje';
    if (dayKey === yesterdayKey) return 'Ontem';

    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: CHAT_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(date));
  };

  const formatMessageTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('pt-BR', { timeZone: CHAT_TIME_ZONE, hour: '2-digit', minute: '2-digit' });
  };

  const handleCall = () => {
    if (!conversation) return;
    onCallAction?.(conversation.contact);
  };

  const handleVideoCall = () => {
    if (!conversation) return;
    window.open('https://meet.google.com/new', '_blank');
    onVideoCallAction?.(conversation.contact);
  };

  const handleMenuAction = (action: string) => {
    if (!conversation) return;

    switch (action) {
      case 'contact_details':
        onOpenDetails?.();
        break;
      case 'select_messages':
        setIsSelectionMode(true);
        break;
      case 'mute':
        toast({ title: "Notificações silenciadas", description: `Conversa com ${conversation.contact.name} silenciada` });
        break;
      case 'temp_messages':
        toast({ title: "Mensagens temporárias", description: "Configure mensagens que desaparecem após 24h" });
        break;
      case 'favorite':
        toast({ title: "Adicionado aos favoritos", description: `${conversation.contact.name} adicionado aos favoritos` });
        break;
      case 'close':
        toast({ title: "Conversa fechada", description: "A conversa foi arquivada" });
        break;
      case 'report':
        toast({ title: "Denunciar", description: "Funcionalidade em desenvolvimento", variant: "destructive" });
        break;
      case 'block':
        toast({ title: "Bloquear", description: "Funcionalidade em desenvolvimento", variant: "destructive" });
        break;
      case 'clear':
        toast({ title: "Limpar conversa", description: "Todas as mensagens serão removidas" });
        break;
      case 'delete':
        toast({ title: "Apagar conversa", description: "A conversa será permanentemente removida", variant: "destructive" });
        break;
    }
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedMessages(new Set());
  };

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const copySelectedMessages = () => {
    if (!conversation) return;

    const selectedMsgs = conversation.messages
      .filter((msg) => selectedMessages.has(msg.id))
      .map((msg) => msg.content)
      .join('\n\n');

    navigator.clipboard.writeText(selectedMsgs).then(() => {
      toast({
        title: "Copiado!",
        description: `${selectedMessages.size} mensagem(ns) copiada(s) para a área de transferência`,
      });
      exitSelectionMode();
    });
  };

  const handleForwardToContacts = async (contactIds: string[]) => {
    let successCount = 0;
    let failCount = 0;

    const content = conversation?.messages
      .filter((msg) => selectedMessages.has(msg.id))
      .map((msg) => msg.content)
      .join('\n\n');

    if (!content) return;

    for (const contactId of contactIds) {
      try {
        const targetConv = conversations.find(c => c.id === contactId);
        // Regra de Instância: Se o destino (lead) tiver instanceName, usa. Senão, usa a selecionada.
        const targetInstanceName = targetConv?.contact?.instanceName
          || instances.find(i => i.id === selectedInstanceId)?.instance_name;

        await onSendMessage(contactId, content, targetInstanceName, undefined, {
          contactPhone: targetConv?.contact?.phone,
          contactPhoneE164: targetConv?.contact?.phoneE164,
        });
        successCount++;
      } catch (error) {
        console.error(`Falha ao encaminhar para ${contactId}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast({
        title: "Encaminhamento concluído",
        description: `${successCount} enviado(s)${failCount > 0 ? `, ${failCount} falha(s)` : ''}.`,
        variant: failCount > 0 ? "default" : "default" // Could use warning style if mixed
      });
    } else if (failCount > 0) {
      toast({
        title: "Falha no encaminhamento",
        description: "Não foi possível enviar as mensagens.",
        variant: "destructive"
      });
    }

    exitSelectionMode();
  };

  const handleForwardInternally = async (teamMemberIds: string[]) => {
    if (!conversation) return;
    if (!orgId) {
      toast({
        title: "Erro ao registrar",
        description: "Organização não vinculada ao usuário.",
        variant: "destructive"
      });
      return;
    }

    const content = conversation.messages
      .filter((msg) => selectedMessages.has(msg.id))
      .map((msg) => msg.content)
      .join('\n\n');

    if (!content) return;

    let successCount = 0;
    const memberLabelById: Record<string, string> = {};

    try {
      const response = await listMembers(orgId ?? undefined);
      for (const member of response.members) {
        const label = member.email || `user-${member.user_id.slice(0, 8)}`;
        memberLabelById[member.user_id] = label;
      }
    } catch (error) {
      console.warn('Failed to resolve team members from org-admin:', error);
    }

    for (const memberId of teamMemberIds) {
      const memberName = memberLabelById[memberId] || 'Membro da Equipe';
      const note = `[Encaminhado para ${memberName}]:\n${content}`;

      const { error } = await supabase
        .from('comentarios_leads')
        .insert({
          org_id: orgId,
          lead_id: Number(conversation.id),
          texto: note,
          autor: 'Sistema (Encaminhamento)'
        })
        .select('id'); // RULE: Always select to confirm

      if (!error) successCount++;
    }

    if (successCount > 0) {
      toast({
        title: "Registrado internamente",
        description: `Mensagem registrada como comentário para ${successCount} membro(s).`,
      });
    } else {
      toast({
        title: "Erro ao registrar",
        description: "Falha ao salvar comentário interno.",
        variant: "destructive"
      });
    }

    exitSelectionMode();
  };

  // Reset pagination window when switching conversations
  useEffect(() => {
    if (!conversation) return;

    const total = conversation.messages.length;
    setVisibleStartIndex(Math.max(0, total - INITIAL_MESSAGES_BATCH));
    prependAdjustRef.current.pending = false;
    pendingScrollToMessageIdRef.current = null;
    shouldScrollToBottomRef.current = true;
    isAtBottomRef.current = true;
  }, [conversation?.id]);

  // Keep scroll position stable when we prepend older messages (increase rendered list at the top).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const state = prependAdjustRef.current;
    if (!el || !state.pending) return;

    const delta = el.scrollHeight - state.prevScrollHeight;
    el.scrollTop = state.prevScrollTop + delta;
    state.pending = false;
  }, [visibleStartIndex]);

  // If we had to expand the window to make an older message visible, scroll to it after render.
  useEffect(() => {
    if (!conversation) return;

    const id = pendingScrollToMessageIdRef.current;
    if (!id) return;

    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pendingScrollToMessageIdRef.current = null;
  }, [visibleStartIndex, conversation?.id]);

  const allMessages = conversation?.messages || [];
  const clampedVisibleStartIndex = Math.min(visibleStartIndex, allMessages.length);
  const visibleMessages = allMessages.slice(clampedVisibleStartIndex);

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="brand-logo-disc mx-auto mb-4 h-20 w-20">
            <img
              src="/logo.png"
              alt="SolarZap Logo"
              className="brand-logo-image"
            />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">SolarZap CRM</h2>
          <p className="text-muted-foreground">Selecione uma conversa para começar</p>
        </div>
      </div>
    );
  }

  const handleMessagesScroll = () => {
    const el = scrollRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceFromBottom < BOTTOM_STICKY_THRESHOLD_PX;

    // Load older messages when the user reaches the top region of the scroll.
    if (el.scrollTop < LOAD_OLDER_SCROLL_THRESHOLD_PX && visibleStartIndex > 0 && !prependAdjustRef.current.pending) {
      prependAdjustRef.current = {
        pending: true,
        prevScrollTop: el.scrollTop,
        prevScrollHeight: el.scrollHeight,
      };
      setVisibleStartIndex((prev) => Math.max(0, prev - OLDER_MESSAGES_BATCH));
    }
  };

  const scrollToMessageById = (messageId: string) => {
    const existing = document.getElementById(`msg-${messageId}`);
    if (existing) {
      existing.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Message exists in the full list but is outside the visible window; expand then scroll.
    const idx = conversation.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;

    if (idx < visibleStartIndex) {
      pendingScrollToMessageIdRef.current = messageId;
      setVisibleStartIndex(Math.max(0, idx - 10));
    }
  };

  const stage = PIPELINE_STAGES[conversation.contact.pipelineStage];
  const isActionsWorkspaceOpen = Boolean(actionsSheet) && !isMobileChat;

  return (
    <div
      className="flex-1 flex flex-col min-w-0 min-h-0 relative overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
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
      {/* Chat Header */}
      <div className="h-14 shrink-0 px-3 flex items-center justify-between border-b border-border bg-card gap-1">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground flex-shrink-0"
            title="Voltar para conversas"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        ) : null}
        <button
          onClick={onOpenDetails}
          data-testid="chat-open-details"
          className="flex items-center gap-2 min-w-0 flex-1 text-left hover:bg-muted/50 pl-1 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0 flex items-center justify-center text-lg">
            {conversation.contact.avatar || '👤'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-medium text-sm text-foreground truncate">
                {conversation.contact.name}
              </span>
              {/* Instance color dot */}
              {isMobileChat && instances.find(i => i.id === selectedInstanceId)?.color && (
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: instances.find(i => i.id === selectedInstanceId)?.color || '#999' }}
                  title={instances.find(i => i.id === selectedInstanceId)?.display_name}
                />
              )}
              {!isDetailsOpen && !isMobileChat && (
                <Badge variant="secondary" className={cn('text-[10px] flex-shrink truncate max-w-[120px] sm:max-w-[160px] whitespace-nowrap', stage.color.replace('bg-', 'bg-'))}>
                  <span className="truncate">{stage.icon} {stage.title}</span>
                </Badge>
              )}
            </div>
            {conversation.contact.company && !isMobileChat && (
              <div className="text-xs text-muted-foreground truncate">{conversation.contact.company}</div>
            )}
          </div>
        </button>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Desktop: show all controls inline */}
          {!isMobileChat && (
            <>
              {onToggleLeadAi && (
                <div className={cn(
                  "flex items-center gap-2 mr-2 px-2 py-1 bg-muted/50 rounded-lg border border-border/50",
                  (!aiSettings?.is_active || instances.find(i => i.id === selectedInstanceId)?.ai_enabled === false) && "opacity-70"
                )}
                  title={
                    !aiSettings?.is_active
                      ? "IA Global Desativada"
                      : instances.find(i => i.id === selectedInstanceId)?.ai_enabled === false
                        ? "IA da Instância Desativada"
                        : ""
                  }
                >
                  <div className="flex items-center gap-1.5">
                    {!aiSettings?.is_active ? (
                      <Bot className="w-4 h-4 text-muted-foreground" />
                    ) : instances.find(i => i.id === selectedInstanceId)?.ai_enabled === false ? (
                      <Bot className="w-4 h-4 text-muted-foreground" />
                    ) : conversation.contact.aiEnabled !== false ? (
                      <Bot className="w-4 h-4 text-primary" />
                    ) : (
                      <UserCog className="w-4 h-4 text-orange-500" />
                    )}
                    <span className="text-xs font-medium hidden md:inline">
                      {!aiSettings?.is_active
                        ? 'Sistema Pausado'
                        : instances.find(i => i.id === selectedInstanceId)?.ai_enabled === false
                          ? (isDetailsOpen ? 'Pausada' : 'Instância Pausada')
                          : conversation.contact.aiEnabled !== false
                            ? 'IA Ativa'
                            : 'Pausada'}
                    </span>
                  </div>
                  <Switch
                    checked={conversation.contact.aiEnabled !== false}
                    onCheckedChange={(checked) => onToggleLeadAi({ leadId: conversation.contact.id, enabled: checked })}
                    className="scale-75 data-[state=checked]:bg-primary"
                    disabled={!aiSettings?.is_active || instances.find(i => i.id === selectedInstanceId)?.ai_enabled === false}
                  />
                </div>
              )}

              <div className="mr-2">
                {isOrgManager ? (
                  <InstanceSelector
                    instances={instances}
                    selectedInstanceId={selectedInstanceId}
                    onSelect={handleInstanceSelect}
                    onUpdateColor={updateColor}
                  />
                ) : (
                  <Badge
                    data-testid="user-assigned-instance-badge"
                    variant="secondary"
                    className="h-8 px-2 text-xs max-w-[220px] truncate"
                    title={instances.find(i => i.id === selectedInstanceId)?.display_name || undefined}
                  >
                    {instances.find(i => i.id === selectedInstanceId)?.display_name ||
                      instances.find(i => i.id === selectedInstanceId)?.instance_name ||
                      'Instancia atribuida'}
                  </Badge>
                )}
              </div>
              <button
                onClick={handleVideoCall}
                className="hidden"
                title="Chamada de vídeo (Google Meet)"
              >
                <Video className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowSearchModal(true)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                title="Pesquisar mensagens"
              >
                <Search className="w-5 h-5" />
              </button>
              <div className="w-px h-5 bg-border mx-1 self-center" />
              <button
                onClick={() => handleMenuAction('select_messages')}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                title="Selecionar mensagens"
              >
                <CheckSquare className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Mobile: compact — only phone + 3-dot menu */}
          {isMobileChat && (
            <>
              <button
                onClick={handleCall}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                title="Ligar"
              >
                <Phone className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowActionsDrawer(true)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                title="Mais ações"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {showLeadNextAction && conversation ? (
        <div className="shrink-0">
          <LeadNextActionInlineBar
            nextAction={nextAction}
            isLoading={leadNextActionLoading}
            showActionsToggle={showActionsToggle}
            isActionsOpen={isActionsOpen}
            onToggleActions={onToggleActions}
          />
        </div>
      ) : null}

      {isActionsWorkspaceOpen ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          {actionsSheet}
        </div>
      ) : null}

      {/* Mobile actions drawer */}
      {isMobileChat && onToggleLeadAi && (
        <ChatHeaderActionsDrawer
          open={showActionsDrawer}
          onOpenChange={setShowActionsDrawer}
          onCall={handleCall}
          onVideoCall={handleVideoCall}
          onSearch={() => setShowSearchModal(true)}
          onSelectMessages={() => handleMenuAction('select_messages')}
          aiEnabled={conversation.contact.aiEnabled !== false}
          aiGlobalActive={aiSettings?.is_active ?? false}
          aiInstanceDisabled={instances.find(i => i.id === selectedInstanceId)?.ai_enabled === false}
          onToggleAi={(checked) => onToggleLeadAi({ leadId: conversation.contact.id, enabled: checked })}
          isOrgManager={isOrgManager}
          instances={instances}
          selectedInstanceId={selectedInstanceId}
          onSelectInstance={handleInstanceSelect}
          onUpdateInstanceColor={updateColor}
        />
      )}

      {!isActionsWorkspaceOpen ? (
      <>
      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto chat-bg-pattern custom-scrollbar"
        onScroll={handleMessagesScroll}
      >
        <div className="flex flex-col space-y-1 py-2 px-4 min-h-full">
          {visibleMessages.map((msg, idx) => {
            const isSent = !msg.isFromClient;
            const isAutomation = msg.isAutomation;
            const isSelected = selectedMessages.has(msg.id);

            const dayKey = getDayKey(msg.timestamp);
            const prevDayKey = idx > 0 ? getDayKey(visibleMessages[idx - 1].timestamp) : null;
            const shouldShowDayMarker = idx === 0 || dayKey !== prevDayKey;
            const dayLabel = shouldShowDayMarker ? formatDayMarkerLabel(msg.timestamp, dayKey) : '';

            let messageStyle = {};
            let instanceNameDisplay = null;
            let instanceColor = null;

            // Get instance info for both sent and received messages
            if (msg.instanceName) {
              const instance = instances.find(i => i.instance_name === msg.instanceName);
              if (instance) {
                instanceNameDisplay = instance.display_name || instance.instance_name;
                // Only apply color styling to sent messages
                if (isSent && instance.color) {
                  instanceColor = instance.color;
                  messageStyle = {
                    backgroundColor: `${instance.color}20`,
                    borderLeft: `3px solid ${instance.color}`
                  };
                }
              }
            }

            if (isAutomation) {
              return (
                <React.Fragment key={msg.id}>
                  {shouldShowDayMarker && (
                    <div className="flex justify-center my-4" data-day={dayKey}>
                      <div className="bg-muted/80 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs text-muted-foreground border border-border/50 shadow-sm">
                        {dayLabel}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-center my-4">
                    <div className="bg-muted/80 backdrop-blur-sm px-4 py-2 rounded-lg text-sm text-muted-foreground flex items-center gap-2">
                      <span className="text-lg">🤖</span>
                      {msg.content}
                    </div>
                  </div>
                </React.Fragment>
              );
            }

            return (
              <React.Fragment key={msg.id}>
                {shouldShowDayMarker && (
                  <div className="flex justify-center my-4" data-day={dayKey}>
                    <div className="bg-muted/80 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs text-muted-foreground border border-border/50 shadow-sm">
                      {dayLabel}
                    </div>
                  </div>
                )}

                <div
                  id={`msg-${msg.id}`}
                  className={cn(
                    'flex w-full items-start gap-2',
                    isSent ? 'justify-end' : 'justify-start',
                    isSelectionMode && 'cursor-pointer'
                  )}
                  onClick={isSelectionMode ? () => toggleMessageSelection(msg.id) : undefined}
                >
                  {/* Checkbox para seleção */}
                  {isSelectionMode && (
                    <div className={cn(
                      'flex items-center justify-center w-5 h-5 mt-2 rounded border-2 transition-colors flex-shrink-0',
                      isSelected
                        ? 'bg-primary border-primary'
                        : 'border-muted-foreground bg-transparent'
                    )}>
                      {isSelected && (
                        <span className="text-primary-foreground text-xs">✓</span>
                      )}
                    </div>
                  )}

                  <div
                    className={cn(
                      'max-w-[78%] px-3 py-2 rounded-lg shadow-sm relative transition-colors group sm:max-w-[65%]',
                      isSent
                        ? 'bg-chat-sent rounded-tr-none ml-auto'
                        : 'bg-chat-received rounded-tl-none mr-auto',
                      isSelected && 'ring-2 ring-primary',
                      msg.status === 'pending' && 'opacity-70',
                      msg.status === 'failed' && 'ring-2 ring-red-400/70'
                    )}
                    style={messageStyle}
                  >
                    {/* Reply Action (Hover) */}
                    {!isSelectionMode && (
                      <div className={cn(
                        "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 z-20",
                        isSent ? "left-1" : "right-1"
                      )}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setReplyTarget(msg);
                            inputRef.current?.focus();
                          }}
                          className="p-1 bg-background/50 rounded-full shadow-sm hover:bg-background top-1"
                          title="Responder"
                        >
                          <Reply className="w-3 h-3" />
                        </button>
                        <ReactionPicker
                          isOpen={activeReactionId === msg.id}
                          onOpenChange={(open) => setActiveReactionId(open ? msg.id : null)}
                          onSelect={(emoji) => {
                            const selectedInstance = instances.find(i => i.id === selectedInstanceId);
                            const instanceToUse = msg.instanceName || selectedInstance?.instance_name;

                            if (!msg.waMessageId) {
                              toast({ title: "Erro", description: "Mensagem sem ID do WhatsApp", variant: "destructive" });
                              return;
                            }
                            if (!instanceToUse) {
                              toast({ title: "Erro", description: "Nenhuma instância disponível", variant: "destructive" });
                              return;
                            }

                            // Prefer original message remoteJid (supports @lid and other non-phone JIDs)
                            const phone = conversation.contact.phoneE164 || conversation.contact.phone;
                            const cleanPhone = phone?.replace(/\D/g, '') || '';
                            const fallbackRemoteJid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : '';
                            const remoteJid = msg.remoteJid || fallbackRemoteJid;
                            if (!remoteJid) {
                              toast({ title: "Erro", description: "Não foi possível resolver o destino da reação", variant: "destructive" });
                              return;
                            }

                            onSendReaction?.(msg.id, msg.waMessageId, remoteJid, emoji, instanceToUse, !msg.isFromClient);
                          }}
                        />
                      </div>
                    )}

                    {/* Render Quoted Message */}
                    {msg.replyTo && (
                      <div
                        className="mb-1 p-1 rounded bg-black/5 dark:bg-black/20 border-l-4 border-primary/50 text-xs cursor-pointer opacity-80"
                        onClick={() => {
                          if (msg.replyTo?.id) scrollToMessageById(msg.replyTo.id);
                        }}
                      >
                        <div className="font-semibold text-primary">{msg.replyTo.senderName || (isSent ? 'Você' : conversation.contact.name)}</div>
                        <div className="truncate text-muted-foreground">{msg.replyTo.type === 'text' ? msg.replyTo.content : (msg.replyTo.content || 'Mídia')}</div>
                      </div>
                    )}

                    {/* Instance indicator for both sent and received messages */}
                    {instanceNameDisplay && (
                      <div className="text-[10px] font-bold opacity-70 mb-1" style={{ color: instanceColor || undefined }}>
                        {instanceNameDisplay}
                      </div>
                    )}
                    <MessageContent
                      content={msg.content}
                      isSent={isSent}
                      onLoad={handleMediaLoad}
                      attachmentUrl={msg.attachment_url}
                      attachmentType={msg.attachment_type}
                      attachmentReady={msg.attachment_ready}
                      attachmentName={msg.attachment_name}
                    />
                    <div className="flex items-center justify-end gap-1 mt-1">
                      {msg.status === 'pending' ? (
                        <span className="text-[10px] text-muted-foreground font-medium">Enviando...</span>
                      ) : msg.status === 'failed' ? (
                        <>
                          <span className="text-[10px] text-red-600 font-medium">Falhou</span>
                          {!isSelectionMode && isSent && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void retryFailedMessage(msg);
                              }}
                              className="text-[10px] text-red-700 hover:text-red-800 underline"
                              title={msg.errorMessage || 'Tentar novamente'}
                            >
                              Tentar novamente
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {formatMessageTime(msg.timestamp)}
                        </span>
                      )}
                    </div>
                    {/* Reactions Badge */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="absolute -bottom-3 right-2 flex gap-0.5 z-10">
                        {/* Group reactions by emoji and count */}
                        {Object.entries(
                          msg.reactions.reduce((acc: Record<string, number>, r) => {
                            acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                            return acc;
                          }, {})
                        ).map(([emoji, count]) => (
                          <span
                            key={emoji}
                            className="bg-background border border-border rounded-full px-1.5 py-0.5 text-xs shadow-md flex items-center gap-0.5"
                            title={`${count} reação(ões)`}
                          >
                            {emoji}
                            {count > 1 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Spacer for reactions */}
                  {msg.reactions && msg.reactions.length > 0 && <div className="h-3" />}
                </div>
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Selection Mode Bar */}
      {isSelectionMode && (
        <div className="h-14 shrink-0 px-4 flex items-center justify-between border-t border-border bg-card">
          <div className="flex items-center gap-3">
            <button
              onClick={exitSelectionMode}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <span className="text-sm text-foreground">
              {selectedMessages.size} {selectedMessages.size === 1 ? 'item selecionado' : 'itens selecionados'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={copySelectedMessages}
              disabled={selectedMessages.size === 0}
              className={cn(
                'p-2 rounded-lg transition-colors',
                selectedMessages.size > 0
                  ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  : 'text-muted-foreground/50 cursor-not-allowed'
              )}
              title="Copiar"
            >
              <Copy className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowForwardModal(true)}
              disabled={selectedMessages.size === 0}
              className={cn(
                'p-2 rounded-lg transition-colors',
                selectedMessages.size > 0
                  ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  : 'text-muted-foreground/50 cursor-not-allowed'
              )}
              title="Encaminhar"
            >
              <Forward className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Reply Bar */}
      {replyTarget && !isSelectionMode && (
        <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between animate-in slide-in-from-bottom-2">
          <div className="flex flex-col border-l-4 border-primary pl-2">
            <span className="text-xs font-semibold text-primary">Respondendo a {replyTarget.isFromClient ? conversation.contact.name : 'Você'}</span>
            <span className="text-xs text-muted-foreground line-clamp-1">{replyTarget.content || 'Mídia'}</span>
          </div>
          <button onClick={() => setReplyTarget(null)} className="p-1 hover:bg-muted rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Message Input - Hidden during selection mode */}
      {!isSelectionMode && (
        <div className={cn("px-4 py-3 border-t border-border bg-card shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]", replyTarget && "border-t-0")}>
          {/* Mobile hold-to-record overlay */}
          {isMobileChatExperience && <MobileRecordingOverlay state={mobileRecorder.state} durationSeconds={mobileRecorder.durationSeconds} cancelRatio={mobileRecorder.cancelRatio} />}

          {/* Desktop recording indicator */}
          {!isMobileChatExperience && isRecording && (
            <div className="flex items-center justify-center gap-2 mb-2 py-2 bg-destructive/10 rounded-lg">
              <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
              <span className="text-destructive font-medium">
                Gravando... {formatRecordingTime(recordingDuration)}
              </span>
              <button
                onClick={stopRecording}
                className="ml-2 p-1 hover:bg-destructive/20 rounded-full"
              >
                <X className="w-4 h-4 text-destructive" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Emoji Button */}
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

            {/* Attachment Button */}
            {isMobileChat ? (
              <>
                <button
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                  onClick={() => setShowAttachDrawer(true)}
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <Drawer open={showAttachDrawer} onOpenChange={setShowAttachDrawer}>
                  <DrawerContent className="max-h-[50vh]">
                    <DrawerHeader className="pb-2">
                      <DrawerTitle>Anexar arquivo</DrawerTitle>
                    </DrawerHeader>
                    <div className="space-y-1 px-2 pb-6">
                      <button
                        type="button"
                        onClick={() => handleMobileAttachment('camera')}
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        <Camera className="w-5 h-5 text-orange-500" /> Tirar foto
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMobileAttachment('gallery')}
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        <Image className="w-5 h-5 text-green-500" /> Foto da galeria
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMobileAttachment('video')}
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        <Film className="w-5 h-5 text-purple-500" /> Vídeo
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMobileAttachment('document')}
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        <FileText className="w-5 h-5 text-blue-500" /> Documento
                      </button>
                    </div>
                  </DrawerContent>
                </Drawer>
              </>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                    <Paperclip className="w-5 h-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem onClick={() => handleAttachmentSelect('document')}>
                    <FileText className="w-4 h-4 mr-2" /> Documento
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAttachmentSelect('image')}>
                    <Image className="w-4 h-4 mr-2" /> Foto
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAttachmentSelect('video')}>
                    <Film className="w-4 h-4 mr-2" /> Vídeo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
            {/* Mobile-only dedicated file inputs with fixed accept/capture */}
            <input ref={cameraImageInputRef}  type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />
            <input ref={galleryImageInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
            <input ref={videoInputRef}         type="file" className="hidden" accept="video/*" onChange={handleFileChange} />
            <input ref={documentInputRef}      type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={handleFileChange} />

            <div className="flex-1 max-h-32 overflow-y-auto">
              <Textarea
                ref={inputRef}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Digite uma mensagem"
                className={cn("bg-muted border-0 min-h-[40px] max-h-32 resize-none py-2 px-3 leading-relaxed scrollbar-thin", isMobileChatExperience ? "text-base" : "text-sm")}
                rows={1}
              />
            </div>

            {message.trim() ? (
              <Button onClick={handleSend} size="icon" className="rounded-full">
                <Send className="w-5 h-5" />
              </Button>
            ) : (
              isMobileChatExperience ? (
                <button
                  className={cn(
                    "p-2 rounded-lg transition-colors touch-none select-none",
                    mobileRecorder.state === 'recording' || mobileRecorder.state === 'canceling'
                      ? "bg-destructive text-destructive-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  {...mobileRecorder.handlers}
                >
                  <Mic className="w-5 h-5" />
                </button>
              ) : (
                <button
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    isRecording
                      ? "bg-destructive text-destructive-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  onPointerDown={handleMicrophoneClick}
                  onPointerUp={stopRecording}
                  onPointerLeave={isRecording ? stopRecording : undefined}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <Mic className="w-5 h-5" />
                </button>
              )
            )}
          </div>
        </div>
      )}
      </>
      ) : null}

      {/* Search Modal */}
      <ChatSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        messages={conversation.messages}
        contactName={conversation.contact.name}
      />

      {/* Forward Modal */}
      <ForwardMessageModal
        isOpen={showForwardModal}
        onClose={() => setShowForwardModal(false)}
        selectedMessagesCount={selectedMessages.size}
        conversations={conversations}
        onForwardToContacts={handleForwardToContacts}
        onForwardInternally={handleForwardInternally}
      />

      {/* Audio Device Selection Modal — desktop only */}
      {!isMobileChatExperience && (
        <AudioDeviceModal
          isOpen={showAudioDeviceModal}
          onClose={() => setShowAudioDeviceModal(false)}
          onConfirm={handleAudioDeviceConfirm}
          mode="select"
        />
      )}
    </div>
  );
}
