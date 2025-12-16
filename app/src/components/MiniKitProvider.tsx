'use client';

import { ReactNode, useEffect, useState, createContext, useContext } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

interface MiniKitProviderProps {
  children: ReactNode;
}

// App ID from World Developer Portal
const APP_ID = process.env.NEXT_PUBLIC_APP_ID;

// Context to share wallet address across the app
interface WalletContextType {
  walletAddress: string | null;
  username: string | null;
  isAuthenticated: boolean;
}

const WalletContext = createContext<WalletContextType>({
  walletAddress: null,
  username: null,
  isAuthenticated: false,
});

export function useWallet() {
  return useContext(WalletContext);
}

// Store wallet address globally for access from worldcoin.ts
// This is needed because MiniKit.walletAddress is only set after walletAuth
let globalWalletAddress: string | null = null;
let globalUsername: string | null = null;

export function getGlobalWalletAddress(): string | null {
  return globalWalletAddress;
}

export function getGlobalUsername(): string | null {
  return globalUsername;
}

export function MiniKitProvider({ children }: MiniKitProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Initialize MiniKit with App ID and authenticate wallet
    const initMiniKit = async () => {
      try {
        MiniKit.install(APP_ID);
        
        // Check if running inside World App
        const isInstalled = MiniKit.isInstalled();
        console.log('[MiniKit] Initialized:', isInstalled);
        
        if (!isInstalled) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[MiniKit] Running outside World App - dev mode enabled');
            // In dev mode, set mock wallet address
            const mockWallet = '0xDevMockWallet1234567890abcdef1234567890ab';
            setWalletAddress(mockWallet);
            globalWalletAddress = mockWallet;
            setUsername('DevUser');
            globalUsername = 'DevUser';
          }
          setIsReady(true);
          return;
        }
        
        // Inside World App - authenticate wallet to get address
        console.log('[MiniKit] Authenticating wallet...');
        
        try {
          // Generate a nonce for wallet authentication
          const nonce = crypto.randomUUID();
          
          // Request wallet authentication
          // This prompts the user to sign a message with their wallet
          const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
            nonce,
            statement: 'Sign in to Sodoku Stake to enable prize payouts',
            expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          });
          
          if (finalPayload && finalPayload.status === 'success') {
            // Get wallet address from MiniKit after successful auth
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const minikit = MiniKit as any;
            const wallet = minikit.walletAddress || finalPayload.address;
            const user = MiniKit.user?.username;
            
            console.log('[MiniKit] Wallet authenticated:', wallet ? `${wallet.substring(0, 12)}...` : 'null');
            console.log('[MiniKit] Username:', user);
            
            if (wallet) {
              setWalletAddress(wallet);
              globalWalletAddress = wallet;
              setIsAuthenticated(true);
            }
            
            if (user) {
              setUsername(user);
              globalUsername = user;
            }
          } else {
            console.warn('[MiniKit] Wallet auth failed or cancelled:', finalPayload);
            // Still try to get username even if wallet auth fails
            const user = MiniKit.user?.username;
            if (user) {
              setUsername(user);
              globalUsername = user;
            }
          }
        } catch (authError) {
          console.warn('[MiniKit] Wallet auth error (user may have cancelled):', authError);
          // Still try to get username even if wallet auth fails
          const user = MiniKit.user?.username;
          if (user) {
            setUsername(user);
            globalUsername = user;
          }
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

  return (
    <WalletContext.Provider value={{ walletAddress, username, isAuthenticated }}>
      {children}
    </WalletContext.Provider>
  );
}

