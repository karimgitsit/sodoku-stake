'use client';

import { ReactNode, useEffect, useState } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

interface MiniKitProviderProps {
  children: ReactNode;
}

// App ID from World Developer Portal
const APP_ID = process.env.NEXT_PUBLIC_APP_ID;

export function MiniKitProvider({ children }: MiniKitProviderProps) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Initialize MiniKit with App ID
    const initMiniKit = async () => {
      try {
        MiniKit.install(APP_ID);
        
        // Check if running inside World App
        const isInstalled = MiniKit.isInstalled();
        console.log('[MiniKit] Initialized:', isInstalled);
        
        if (!isInstalled && process.env.NODE_ENV === 'development') {
          console.log('[MiniKit] Running outside World App - dev mode enabled');
        }
        
        // Get user info if available
        if (isInstalled && MiniKit.user) {
          console.log('[MiniKit] User:', MiniKit.user.username);
        }
      } catch (error) {
        console.error('[MiniKit] Initialization error:', error);
      } finally {
        setIsReady(true);
      }
    };

    initMiniKit();
  }, []);

  // Show loading state while MiniKit initializes
  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🧩</div>
          <p className="text-foreground/60">Loading Sodoku Stake...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

