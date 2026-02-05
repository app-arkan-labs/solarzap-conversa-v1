-- Migration to add Reply/Quote support columns to interacoes table

-- 1. Add ID fields for mapping
ALTER TABLE interacoes ADD COLUMN IF NOT EXISTS wa_message_id text;
ALTER TABLE interacoes ADD COLUMN IF NOT EXISTS remote_jid text;

-- 2. Add Reply fields
ALTER TABLE interacoes ADD COLUMN IF NOT EXISTS reply_to_message_id text; -- ID da mensagem no WhatsApp (quoted)
ALTER TABLE interacoes ADD COLUMN IF NOT EXISTS reply_to_interacao_id bigint REFERENCES interacoes(id); -- Referência interna
ALTER TABLE interacoes ADD COLUMN IF NOT EXISTS reply_preview text; -- Preview do texto/media
ALTER TABLE interacoes ADD COLUMN IF NOT EXISTS reply_type text; -- tipo da mensagem respondida (image, text, etc)

-- 3. Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_interacoes_wa_message_id ON interacoes(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_interacoes_reply_to_interacao_id ON interacoes(reply_to_interacao_id);
