import React, { createContext, useContext, ReactNode } from 'react';
import { useIntegrations, Integration, WhatsAppInstance } from '@/hooks/useIntegrations';

interface IntegrationsContextType {
  integrations: Integration[];
  whatsappInstance: WhatsAppInstance | null;
  loading: boolean;
  connecting: string | null;
  fetchIntegrations: () => Promise<void>;
  connectGoogle: () => Promise<void>;
  connectMeta: (platform: 'messenger' | 'instagram') => Promise<void>;
  connectWhatsApp: () => Promise<{ configured: boolean; qrCode?: string; instanceName?: string } | null>;
  getWhatsAppStatus: () => Promise<unknown>;
  disconnect: (provider: string) => Promise<void>;
  isConnected: (provider: string) => boolean;
  getIntegration: (provider: string) => Integration | undefined;
}

const IntegrationsContext = createContext<IntegrationsContextType | undefined>(undefined);

export function IntegrationsProvider({ children }: { children: ReactNode }) {
  const integrations = useIntegrations();

  return (
    <IntegrationsContext.Provider value={integrations}>
      {children}
    </IntegrationsContext.Provider>
  );
}

export function useIntegrationsContext() {
  const context = useContext(IntegrationsContext);
  if (context === undefined) {
    throw new Error('useIntegrationsContext must be used within an IntegrationsProvider');
  }
  return context;
}
