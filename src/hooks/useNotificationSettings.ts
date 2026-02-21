import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface NotificationSettings {
  org_id: string;
  enabled_notifications: boolean;
  enabled_whatsapp: boolean;
  enabled_email: boolean;
  enabled_reminders: boolean;
  whatsapp_instance_name: string | null;
  email_recipients: string[];
  daily_digest_enabled: boolean;
  weekly_digest_enabled: boolean;
  daily_digest_time: string;
  weekly_digest_time: string;
  timezone: string;
  updated_by: string | null;
}

export const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled_notifications: false,
  enabled_whatsapp: false,
  enabled_email: false,
  enabled_reminders: true,
  whatsapp_instance_name: null,
  email_recipients: [] as string[],
  daily_digest_enabled: false,
  weekly_digest_enabled: false,
  daily_digest_time: '19:00:00',
  weekly_digest_time: '18:00:00',
  timezone: 'America/Sao_Paulo',
};

export function useNotificationSettings() {
  const { user, orgId } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const ensureSettingsRow = useCallback(async () => {
    if (!orgId || !user?.id) return null;

    const { data, error } = await supabase
      .from('notification_settings')
      .upsert(
        {
          org_id: orgId,
          updated_by: user.id,
        },
        { onConflict: 'org_id' }
      )
      .select('*')
      .single();

    if (error) throw error;
    return data as NotificationSettings;
  }, [orgId, user?.id]);

  const fetchSettings = useCallback(async () => {
    if (!orgId || !user?.id) {
      setSettings(null);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('org_id', orgId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data as NotificationSettings);
        return;
      }

      const ensured = await ensureSettingsRow();
      setSettings(ensured);
    } finally {
      setLoading(false);
    }
  }, [ensureSettingsRow, orgId, user?.id]);

  useEffect(() => {
    fetchSettings().catch((error) => {
      console.error('Failed to fetch notification settings:', error);
      setLoading(false);
    });
  }, [fetchSettings]);

  const updateSettings = useCallback(async (patch: Partial<NotificationSettings>) => {
    if (!orgId || !user?.id) return null;

    setSaving(true);
    try {
      const rowExists = settings?.org_id === orgId;
      const payload: Record<string, unknown> = {
        updated_by: user.id,
      };
      for (const [key, value] of Object.entries(patch)) {
        if (key !== 'org_id' && value !== undefined) {
          payload[key] = value;
        }
      }

      if (!rowExists) {
        const ensured = await ensureSettingsRow();
        if (ensured) {
          setSettings(ensured);
        }
      }

      const { data, error } = await supabase
        .from('notification_settings')
        .upsert(
          {
            org_id: orgId,
            ...payload,
          },
          { onConflict: 'org_id' }
        )
        .select('*')
        .single();

      if (error) throw error;
      setSettings(data as NotificationSettings);
      return data as NotificationSettings;
    } finally {
      setSaving(false);
    }
  }, [ensureSettingsRow, orgId, settings?.org_id, user?.id]);

  return {
    settings,
    loading,
    saving,
    refetch: fetchSettings,
    updateSettings,
  };
}

