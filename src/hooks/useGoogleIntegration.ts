import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface GoogleAccount {
  email: string;
  name: string;
  picture: string;
  connectedAt: Date;
  services: {
    calendar: boolean;
    meet: boolean;
    gmail: boolean;
  };
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  attendees: string[];
  meetLink?: string;
  location?: string;
}

export function useGoogleIntegration() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [account, setAccount] = useState<GoogleAccount | null>(null);

  // Load account from Supabase DB
  const loadAccount = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading google integration:', error);
        return;
      }

      if (data) {
        setAccount({
          email: data.account_email,
          name: data.account_name,
          picture: data.account_picture,
          connectedAt: new Date(data.connected_at),
          services: data.services || { calendar: false, meet: false, gmail: false },
        });
        setIsConnected(true);
      } else {
        setAccount(null);
        setIsConnected(false);
      }
    } catch (err) {
      console.error('Failed to load google account', err);
    }
  }, []);

  // Initiate OAuth flow
  const connectGoogle = useCallback(async (email?: string): Promise<boolean> => {
    setIsConnecting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast.error('Você precisa estar logado para conectar.');
        setIsConnecting(false);
        return false;
      }

      // Generate State
      const stateObj = {
        user_id: user.id,
        redirect_url: window.location.origin
      };
      const state = btoa(JSON.stringify(stateObj));

      // Configuration
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      if (!clientId || !supabaseUrl) {
        console.error('Vars missing:', { clientId, supabaseUrl });
        toast.error('Configuração incompleta (Client ID ou URL).');
        setIsConnecting(false);
        return false;
      }

      const redirectUri = `${supabaseUrl}/functions/v1/google-callback`;
      const scopes = [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'openid'
      ].join(' ');

      // Construct Auth URL
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;

      // Redirect
      window.location.href = authUrl;
      return true;

    } catch (error) {
      console.error('Erro ao conectar Google:', error);
      toast.error('Erro ao iniciar conexão com Google.');
      setIsConnecting(false);
      return false;
    }
  }, []);

  // Disconnect
  const disconnectGoogle = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_integrations')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', 'google');

      if (error) throw error;

      setAccount(null);
      setIsConnected(false);
      toast.success('Conta do Google desconectada.');
    } catch (err) {
      console.error('Error disconnecting google:', err);
      toast.error('Erro ao desconectar conta.');
    }
  }, []);

  // Events/Emails/Meet logic would go here (calling other Edge Functions)
  // For now we keep them as placeholder or move them to Edge Functions later.
  // ... (Keeping the interface compatible but warning about implementation)

  const createCalendarEvent = useCallback(async (event: any): Promise<GoogleCalendarEvent | null> => {
    // TODO: Call Edge Function 'google-calendar-create'
    console.warn('createCalendarEvent not fully implemented yet - requires backend function');
    toast.info('Funcionalidade sendo implementada no backend...');
    return null;
  }, []);

  const sendEmail = useCallback(async (params: any): Promise<boolean> => {
    // TODO: Call Edge Function 'google-gmail-send'
    console.warn('sendEmail not fully implemented yet');
    toast.info('Funcionalidade sendo implementada no backend...');
    return false;
  }, []);

  const createMeetLink = useCallback(async (): Promise<string> => {
    // TODO: Call Edge Function or use Calendar event
    console.warn('createMeetLink not fully implemented yet');
    toast.info('Funcionalidade sendo implementada no backend...');
    return '';
  }, []);

  return {
    isConnected,
    isConnecting,
    account,
    connectGoogle,
    disconnectGoogle,
    loadAccount,
    createCalendarEvent,
    sendEmail,
    createMeetLink,
  };
}
