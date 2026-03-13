-- Migration: Add 'aprovou_projeto' stage to ai_stage_config
-- Created at: 2026-02-11T09:12:00

INSERT INTO public.ai_stage_config (pipeline_stage, is_active, prompt_override, created_at, updated_at)
VALUES (
    'aprovou_projeto', 
    true, 
    'OBJETIVO: Confirmar a aprovação do projeto, parabenizar o cliente e orientar sobre a assinatura do contrato. Manter tom profissional e positivo.',
    NOW(),
    NOW()
)
ON CONFLICT (pipeline_stage) DO NOTHING;
