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
  whatsapp_recipients: string[];
  email_recipients: string[];
  email_sender_name: string | null;
  email_reply_to: string | null;
  daily_digest_enabled: boolean;
  weekly_digest_enabled: boolean;
  daily_digest_time: string;
  weekly_digest_time: string;
  timezone: string;
  /* event-type toggles */
  evt_novo_lead: boolean;
  evt_stage_changed: boolean;
  evt_visita_agendada: boolean;
  evt_visita_realizada: boolean;
  evt_chamada_agendada: boolean;
  evt_chamada_realizada: boolean;
  evt_financiamento_update: boolean;
  evt_installment_due_check: boolean;
  updated_by: string | null;
}

export const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled_notifications: false,
  enabled_whatsapp: false,
  enabled_email: false,
  enabled_reminders: false,
  whatsapp_instance_name: null,
  whatsapp_recipients: [] as string[],
  email_recipients: [] as string[],
  email_sender_name: null as string | null,
  email_reply_to: null as string | null,
  daily_digest_enabled: false,
  weekly_digest_enabled: false,
  daily_digest_time: '19:00:00',
  weekly_digest_time: '18:00:00',
  timezone: 'America/Sao_Paulo',
  evt_novo_lead: true,
  evt_stage_changed: true,
  evt_visita_agendada: true,
  evt_visita_realizada: true,
  evt_chamada_agendada: true,
  evt_chamada_realizada: true,
  evt_financiamento_update: true,
  evt_installment_due_check: true,
};

export function useNotificationSettings() {
  const { user, orgId } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const ensureSettingsRow = useCallback(async () => {
    if (!orgId || !user?.id) return null;

    // First try to read the existing row
    const { data: existing } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();

    if (existing) return existing as NotificationSettings;

    // Row doesn't exist — insert with defaults (ignoreDuplicates handles race)
    const { data, error } = await supabase
      .from('notification_settings')
      .upsert(
        {
          org_id: orgId,
          enabled_notifications: DEFAULT_NOTIFICATION_SETTINGS.enabled_notifications,
          enabled_whatsapp: DEFAULT_NOTIFICATION_SETTINGS.enabled_whatsapp,
          enabled_email: DEFAULT_NOTIFICATION_SETTINGS.enabled_email,
          enabled_reminders: DEFAULT_NOTIFICATION_SETTINGS.enabled_reminders,
          whatsapp_instance_name: DEFAULT_NOTIFICATION_SETTINGS.whatsapp_instance_name,
          whatsapp_recipients: DEFAULT_NOTIFICATION_SETTINGS.whatsapp_recipients,
          email_recipients: DEFAULT_NOTIFICATION_SETTINGS.email_recipients,
          daily_digest_enabled: DEFAULT_NOTIFICATION_SETTINGS.daily_digest_enabled,
          weekly_digest_enabled: DEFAULT_NOTIFICATION_SETTINGS.weekly_digest_enabled,
          daily_digest_time: DEFAULT_NOTIFICATION_SETTINGS.daily_digest_time,
          weekly_digest_time: DEFAULT_NOTIFICATION_SETTINGS.weekly_digest_time,
          timezone: DEFAULT_NOTIFICATION_SETTINGS.timezone,
          updated_by: user.id,
        },
        { onConflict: 'org_id', ignoreDuplicates: true }
      )
      .select('*')
      .single();

    // If ignoreDuplicates caused a "no rows returned" we re-fetch
    if (error || !data) {
      const { data: refetched, error: refetchErr } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('org_id', orgId)
        .single();
      if (refetchErr) throw refetchErr;
      return refetched as NotificationSettings;
    }
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

