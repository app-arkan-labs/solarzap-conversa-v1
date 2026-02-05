import { createClient } from '@supabase/supabase-js';

// Supabase Self-Hosted na VPS ArkanLabs
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Types for database tables - Estrutura REAL do Supabase
export interface LeadDB {
  id: number;                    // int8, não string!
  user_id: string;               // UUID do usuário (multi-tenancy)
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
