import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMzkyMTEsImV4cCI6MjA4MzYxNTIxMX0.KMk4XqFCm4FkvOZg7LNWaI_4lknMwcdCkYSGjBjDdOg';

const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const envSupabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseUrl =
  typeof envSupabaseUrl === 'string' && envSupabaseUrl.trim().length > 0
    ? envSupabaseUrl
    : DEFAULT_SUPABASE_URL;
const supabaseKey =
  typeof envSupabaseKey === 'string' && envSupabaseKey.trim().length > 0
    ? envSupabaseKey
    : DEFAULT_SUPABASE_ANON_KEY;

if (
  (typeof envSupabaseUrl !== 'string' || envSupabaseUrl.trim().length === 0) ||
  (typeof envSupabaseKey !== 'string' || envSupabaseKey.trim().length === 0)
) {
  console.warn('[supabase] Missing VITE_SUPABASE_* envs. Using fallback project credentials.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Types for database tables - Estrutura REAL do Supabase
export interface LeadDB {
  id: number;                    // int8, não string!
  user_id: string;               // UUID do usuário (multi-tenancy)
  org_id?: string;               // UUID da organização
  assigned_to_user_id?: string | null;
  nome: string | null;
  empresa: string | null;
  telefone: string | null;
  email: string | null;
  canal: string;                 // default: 'WhatsApp'
  status_pipeline: string;       // default: 'Novo Lead'
  valor_estimado: number | null;
  consumo_kwh: number | null;
  created_at: string;
  stage_changed_at?: string;
  phone_e164?: string | null;     // NEW
  instance_name?: string | null;  // NEW
  whatsapp_name?: string | null;  // NEW
  // Extended fields used by leadToContact
  observacoes?: string | null;
  notes?: string | null;          // Alias for observacoes in some contexts
  tipo_cliente?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  concessionaria?: string | null;
  tipo_ligacao?: 'monofasico' | 'bifasico' | 'trifasico' | null;
  conta_luz_mensal?: number | null;
  tarifa_kwh?: number | null;
  custo_disponibilidade_kwh?: number | null;
  performance_ratio?: number | null;
  preco_por_kwp?: number | null;
  abater_custo_disponibilidade_no_dimensionamento?: boolean | null;
  name_source?: string | null;
  name_updated_at?: string | null;
  // AI Control
  ai_enabled?: boolean;
  ai_paused_reason?: string | null;
  ai_paused_at?: string | null; // ISO String from DB
  lead_stage_data?: Record<string, unknown> | null;
}

// Estrutura REAL da tabela interacoes
export interface InteracaoDB {
  id: number;                    // int8
  lead_id: number | null;        // int8
  user_id: string | null;        // UUID do usuário
  tipo: string;                  // default: 'mensagem'
  mensagem: string | null;
  created_at: string;
  instance_name?: string | null;
  wa_message_id?: string | null;
  remote_jid?: string | null;      // NEW
  phone_e164?: string | null;      // NEW
  reply_to_message_id?: string | null;
  reply_to_interacao_id?: number | null;
  reply_preview?: string | null;
  reply_type?: string | null;
  // Video / Media Fields
  mime_type?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  send_mode?: string | null;
  fallback_from?: string | null;
  // New Attachment Integration
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_mimetype?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  attachment_ready?: boolean | null;
  attachment_error?: boolean | null;
  attachment_error_message?: string | null;
  wa_from_me?: boolean | null;
  read_at?: string | null;
}

// Estrutura REAL da tabela propostas
export interface PropostaDB {
  id: number;
  lead_id: number | null;
  user_id: string | null;        // UUID do usuário
  valor_projeto: number | null;
  consumo_kwh: number | null;
  potencia_kw: number | null;
  paineis_qtd: number | null;
  economia_mensal: number | null;
  payback_anos: number | null;
  status: string;                // default: 'Rascunho'
  created_at: string;
}

export interface ProposalVersionDB {
  id: string;
  proposta_id: number;
  lead_id: number;
  user_id: string;
  org_id?: string | null;
  version_no: number;
  status: 'draft' | 'ready' | 'sent' | 'accepted' | 'rejected' | 'archived';
  segment: 'residencial' | 'empresarial' | 'agronegocio' | 'usina' | 'indefinido';
  source: 'manual' | 'ai' | 'hybrid';
  premium_payload: Record<string, unknown>;
  context_snapshot: Record<string, unknown>;
  generated_prompt?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalDeliveryEventDB {
  id: string;
  proposal_version_id: string;
  proposta_id: number;
  lead_id: number;
  user_id: string;
  channel: 'crm' | 'whatsapp' | 'email' | 'pdf_download' | 'web';
  event_type: 'generated' | 'downloaded' | 'shared' | 'opened' | 'viewed' | 'signed' | 'accepted' | 'rejected' | 'expired';
  metadata: Record<string, unknown>;
  created_at: string;
}

// Tabela eventos pode não existir ainda
export interface EventoDB {
  id: number;
  lead_id: number | null;
  titulo: string;
  descricao: string | null;
  tipo: string;
  data_inicio: string;
  data_fim: string;
  concluido: boolean;
}
