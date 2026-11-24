CREATE FUNCTION public.solarzap_vault_read(secret_id uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = secret_id;
$$;

CREATE FUNCTION public.solarzap_vault_create(new_secret text, new_name text, new_description text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT vault.create_secret(new_secret, new_name, new_description);
$$;

CREATE FUNCTION public.solarzap_vault_delete(secret_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  DELETE FROM vault.secrets WHERE id = secret_id;
$$;

REVOKE ALL ON FUNCTION public.solarzap_vault_read(uuid),
  public.solarzap_vault_create(text, text, text),
  public.solarzap_vault_delete(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.solarzap_vault_read(uuid),
  public.solarzap_vault_create(text, text, text),
  public.solarzap_vault_delete(uuid) TO service_role;
