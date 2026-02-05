import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGoogleIntegrationContext } from '@/contexts/GoogleIntegrationContext';
import { GoogleConnectModal } from './GoogleConnectModal';
import { cn } from '@/lib/utils';

interface GoogleAccountButtonProps {
  variant?: 'default' | 'compact';
  className?: string;
}

export function GoogleAccountButton({ variant = 'default', className }: GoogleAccountButtonProps) {
  const { isConnected, account } = useGoogleIntegrationContext();
  const [showModal, setShowModal] = useState(false);

  if (variant === 'compact') {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
            isConnected 
              ? "bg-green-50 text-green-700 hover:bg-green-100" 
              : "bg-muted text-muted-foreground hover:bg-muted/80",
            className
          )}
        >
          {isConnected && account ? (
            <>
              <img 
                src={account.picture} 
                alt={account.name}
                className="w-5 h-5 rounded-full"
              />
              <span className="truncate max-w-[120px]">{account.email}</span>
            </>
          ) : (
            <>
              <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-500 via-green-500 to-yellow-500 flex items-center justify-center">
                <span className="text-white font-bold text-[10px]">G</span>
              </div>
              <span>Conectar Google</span>
            </>
          )}
        </button>
        <GoogleConnectModal isOpen={showModal} onClose={() => setShowModal(false)} />
      </>
    );
  }

  return (
    <>
      <Button
        variant={isConnected ? "outline" : "default"}
        onClick={() => setShowModal(true)}
        className={cn(
          "gap-2",
          isConnected && "border-green-200 bg-green-50 text-green-700 hover:bg-green-100",
          className
        )}
      >
        {isConnected && account ? (
          <>
            <img 
              src={account.picture} 
              alt={account.name}
              className="w-5 h-5 rounded-full"
            />
            <span className="truncate max-w-[150px]">{account.name}</span>
          </>
        ) : (
          <>
            <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-500 via-green-500 to-yellow-500 flex items-center justify-center">
              <span className="text-white font-bold text-xs">G</span>
            </div>
            Conectar Google
          </>
        )}
      </Button>
      <GoogleConnectModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
