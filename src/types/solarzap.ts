// SolarZap CRM Types
import type { LeadStageData } from './ai';


export type ActiveTab = 'conversas' | 'pipelines' | 'calendario' | 'contatos' | 'propostas' | 'dashboard' | 'integracoes' | 'tracking' | 'automacoes' | 'banco_ia' | 'ia_agentes' | 'admin_members' | 'minha_conta' | 'meu_plano' | 'disparos';



export type PipelineStage =
  | 'novo_lead'
  | 'respondeu'
  | 'chamada_agendada'
  | 'chamada_realizada'
  | 'nao_compareceu'
  | 'aguardando_proposta'
  | 'proposta_pronta'
  | 'visita_agendada'
  | 'visita_realizada'
  | 'proposta_negociacao'
  | 'financiamento'
  | 'aprovou_projeto'
  | 'contrato_assinado'
  | 'projeto_pago'
  | 'aguardando_instalacao'
  | 'projeto_instalado'
  | 'coletar_avaliacao'
  | 'contato_futuro'
  | 'perdido';

export type ClientType = 'residencial' | 'comercial' | 'industrial' | 'rural' | 'usina';

export type EventType = 'chamada' | 'visita' | 'instalacao' | 'followup' | 'reuniao' | 'meeting';

export interface Contact {
  id: string;
  name: string;
  company?: string;
  phone: string;
  email?: string;
  avatar?: string;
  channel: Channel;
  pipelineStage: PipelineStage;
  clientType: ClientType;
  consumption: number; // kWh/mês
  projectValue: number;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  energyDistributor?: string;
  connectionType?: 'monofasico' | 'bifasico' | 'trifasico';
  averageMonthlyBill?: number;
  energyTariffKwh?: number;
  availabilityCostKwh?: number;
  performanceRatio?: number;
  pricePerKwp?: number;
  subtractAvailabilityInSizing?: boolean;
  latitude?: number;
  longitude?: number;
  irradianceSource?: string;
  irradianceRefAt?: string;
  cpfCnpj?: string;
  createdAt: Date;
  lastContact: Date;
  stageChangedAt?: Date;
  phoneE164?: string; // NEW
  instanceName?: string; // NEW
  assignedToUserId?: string | null;
  notes?: string;
  stageData?: LeadStageData;
  // AI Control (New)
  aiEnabled?: boolean;
  aiPausedReason?: string | null;
  aiPausedAt?: Date | null;
  followUpStep?: number;
  followUpEnabled?: boolean;
  followUpExhaustedSeen?: boolean;
  lostReason?: string | null;
}

export interface Message {
  id: string;
  contactId: string;
  content: string;
  timestamp: Date;
  isFromClient: boolean;
  isRead: boolean;
  status?: 'pending' | 'sent' | 'failed';
  clientTempId?: string;
  errorMessage?: string | null;
  attachments?: Attachment[];
  isAutomation?: boolean;
  automationNote?: string;
  instanceName?: string;
  phoneE164?: string; // NEW
  remoteJid?: string;
  waMessageId?: string;
  replyTo?: {
    id: string;
    content: string;
    type: string;
    senderName?: string;
  };
  reactions?: {
    emoji: string;
    fromMe: boolean;
    timestamp?: string;
  }[];
  // Media Fields (New)
  attachment_url?: string;
  attachment_type?: string;
  attachment_ready?: boolean;
  attachment_mimetype?: string;
  attachment_name?: string;
}

export interface Attachment {
  id: string;
  type: 'image' | 'document' | 'audio' | 'video';
  url: string;
  name: string;
}

export interface Conversation {
  id: string;
  contact: Contact;
  messages: Message[];
  unreadCount: number;
  lastMessage?: Message;
  isUrgent: boolean; // sem resposta há 3+ dias
  hasFollowupToday: boolean;
}

export interface CalendarEvent {
  id: string;
  contactId: string;
  title: string;
  description?: string;
  type: EventType;
  startDate: Date;
  endDate: Date;
  isCompleted: boolean;
}

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'done' | 'canceled' | 'no_show' | 'completed';
export type AppointmentType = 'call' | 'visit' | 'installation' | 'meeting' | 'other' | 'chamada' | 'visita' | 'instalacao' | 'reuniao';
export type LeadTaskStatus = 'open' | 'done' | 'canceled';
export type LeadTaskPriority = 'low' | 'medium' | 'high';
export type LeadTaskChannel = 'whatsapp' | 'call' | 'email' | 'other' | null;
export type LeadTaskKind = 'generic' | 'next_action' | 'follow_up_ai' | 'system';
export type LeadNextActionDueState = 'none' | 'unscheduled' | 'today' | 'upcoming' | 'overdue';

export interface LeadTask {
  id: string;
  orgId: string;
  userId: string;
  leadId: number;
  title: string;
  notes?: string | null;
  dueAt?: string | null;
  status: LeadTaskStatus;
  priority: LeadTaskPriority;
  channel: LeadTaskChannel;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  taskKind: LeadTaskKind;
  completedAt?: string | null;
  completedBy?: string | null;
  resultSummary?: string | null;
  linkedAppointmentId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface Appointment {
  id: string;
  user_id: string;
  lead_id: number; // int8
  title: string;
  type: AppointmentType;
  status: AppointmentStatus;
  start_at: string; // ISO string from Supabase
  end_at: string;
  location?: string;
  notes?: string;
  outcome?: string;
  created_at: string;
  updated_at: string;
  // Joins
  leads?: {
    id: number;
    nome: string;
    telefone: string;
  };
}

export interface DashboardMetrics {
  leadsThisMonth: number;
  leadsChange: number;
  totalSales: number;
  salesChange: number;
  conversionRate: number;
  conversionChange: number;
  avgCycleDays: number;
  cycleChange: number;
}

export interface PipelineColumn {
  id: PipelineStage;
  title: string;
  icon: string;
  color: string;
  contacts: Contact[];
}

export const PIPELINE_STAGES: Record<PipelineStage, { title: string; icon: string; color: string }> = {
  novo_lead: { title: 'Novo Lead', icon: '🔵', color: 'bg-blue-500' },
  respondeu: { title: 'Respondeu', icon: '🟡', color: 'bg-yellow-500' },
  chamada_agendada: { title: 'Chamada Agendada', icon: '📞', color: 'bg-purple-500' },
  chamada_realizada: { title: 'Chamada Realizada', icon: '✅', color: 'bg-green-500' },
  nao_compareceu: { title: 'Não Compareceu', icon: '❌', color: 'bg-red-400' },
  aguardando_proposta: { title: 'Aguardando Proposta', icon: '⏳', color: 'bg-orange-400' },
  proposta_pronta: { title: 'Proposta Pronta', icon: '📋', color: 'bg-indigo-500' },
  visita_agendada: { title: 'Visita Agendada', icon: '🏠', color: 'bg-teal-500' },
  visita_realizada: { title: 'Visita Realizada', icon: '✅', color: 'bg-green-600' },
  proposta_negociacao: { title: 'Proposta em Negociação', icon: '💬', color: 'bg-amber-500' },
  financiamento: { title: 'Financiamento', icon: '💳', color: 'bg-pink-500' },
  aprovou_projeto: { title: 'Aprovou Projeto', icon: '👍', color: 'bg-lime-500' },
  contrato_assinado: { title: 'Contrato Assinado', icon: '✍️', color: 'bg-emerald-500' },
  projeto_pago: { title: 'Projeto Pago', icon: '💰', color: 'bg-green-700' },
  aguardando_instalacao: { title: 'Aguardando Instalação', icon: '🔨', color: 'bg-slate-500' },
  projeto_instalado: { title: 'Projeto Instalado', icon: '⚡', color: 'bg-yellow-600' },
  coletar_avaliacao: { title: 'Coletar Avaliação (90 dias)', icon: '⭐', color: 'bg-amber-400' },
  contato_futuro: { title: 'Contato Futuro', icon: '📅', color: 'bg-gray-500' },
  perdido: { title: 'Perdido/Desqualificado', icon: '💀', color: 'bg-gray-700' },
};

export type Channel =
  | 'whatsapp'
  | 'messenger'
  | 'instagram'
  | 'email'
  | 'google_ads'
  | 'facebook_ads'
  | 'tiktok_ads'
  | 'indication'
  | 'event'
  | 'cold_list'
  | 'other';

export const CHANNEL_INFO: Record<Channel, { label: string; icon: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', icon: '💬', color: 'bg-green-500' },
  messenger: { label: 'Messenger', icon: '💭', color: 'bg-blue-600' },
  instagram: { label: 'Instagram DM', icon: '📷', color: 'bg-pink-500' },
  email: { label: 'E-mail', icon: '📧', color: 'bg-gray-500' },
  google_ads: { label: 'Google Ads', icon: '🔎', color: 'bg-blue-500' },
  facebook_ads: { label: 'Facebook Ads', icon: '📘', color: 'bg-blue-700' },
  tiktok_ads: { label: 'TikTok Ads', icon: '🎵', color: 'bg-black' },
  indication: { label: 'Indicação', icon: '🤝', color: 'bg-yellow-500' },
  event: { label: 'Evento', icon: '🎉', color: 'bg-purple-500' },
  cold_list: { label: 'Lista Fria', icon: '❄️', color: 'bg-cyan-500' },
  other: { label: 'Outros', icon: '🌐', color: 'bg-gray-400' },
};

export type ChannelFilter = Channel | 'todos';

export const EVENT_COLORS: Record<EventType, string> = {
  chamada: 'bg-blue-500',
  visita: 'bg-orange-500',
  instalacao: 'bg-green-500',
  followup: 'bg-yellow-500',
  reuniao: 'bg-purple-500',
  meeting: 'bg-green-500',
};
