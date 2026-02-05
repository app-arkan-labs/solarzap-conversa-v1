-- Grant usage on sequence (fixes potential ID generation errors)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON TABLE leads TO service_role;
GRANT ALL ON TABLE interacoes TO service_role;
GRANT ALL ON TABLE whatsapp_instances TO service_role;

-- Ensure RLS doesn't block Service Role (Edge Functions)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access Leads" ON leads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE interacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access Interacoes" ON interacoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
