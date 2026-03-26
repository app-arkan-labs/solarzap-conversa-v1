UPDATE public._admin_feature_flags
SET default_enabled = true,
    updated_at = now()
WHERE flag_key = 'lead_next_action_v1';
