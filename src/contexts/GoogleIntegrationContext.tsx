import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { useGoogleIntegration, GoogleAccount, GoogleCalendarEvent } from '@/hooks/useGoogleIntegration';

interface GoogleIntegrationContextType {
  isConnected: boolean;
  isConnecting: boolean;
  account: GoogleAccount | null;
  connectGoogle: (email: string) => Promise<boolean>;
  disconnectGoogle: () => void;
  createCalendarEvent: (event: {
    title: string;
    description?: string;
    startDate: Date;
    endDate: Date;
    attendeeEmail: string;
    location?: string;
    withMeet?: boolean;
  }) => Promise<GoogleCalendarEvent>;
  sendEmail: (params: { to: string; subject: string; body: string }) => Promise<boolean>;
  createMeetLink: () => Promise<string>;
}

const GoogleIntegrationContext = createContext<GoogleIntegrationContextType | undefined>(undefined);

export function GoogleIntegrationProvider({ children }: { children: ReactNode }) {
  const googleIntegration = useGoogleIntegration();

  useEffect(() => {
    googleIntegration.loadAccount();
  }, []);

  return (
    <GoogleIntegrationContext.Provider value={googleIntegration}>
      {children}
    </GoogleIntegrationContext.Provider>
  );
}

export function useGoogleIntegrationContext() {
  const context = useContext(GoogleIntegrationContext);
  if (!context) {
    throw new Error('useGoogleIntegrationContext must be used within a GoogleIntegrationProvider');
  }
  return context;
}
