'use client';

import { useGameStore } from '@/store/gameStore';
import { BottomNav } from './BottomNav';
import { HomeScreen } from './screens/HomeScreen';
import { PuzzleScreen } from './screens/PuzzleScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { useWallet } from './MiniKitProvider';
import { useEffect, useState } from 'react';

export function App() {
  const { currentScreen, setUserInfo, setTodayStats } = useGameStore();
  const { username: miniKitUsername, walletAddress: miniKitWalletAddress } = useWallet();
  const [referralProcessed, setReferralProcessed] = useState(false);

  // Handle incoming referral code from URL
  // Following World App deep link format: /?ref=XXXXX
  useEffect(() => {
    const handleReferral = async () => {
      if (referralProcessed) return;
      
      try {
        // Check URL for referral code
        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref');
        
        if (refCode) {
          console.log('[Referral] Detected referral code:', refCode);
          
          // Store the referral code in localStorage to process after user signs up
          localStorage.setItem('pendingReferralCode', refCode);
          
          // Clear the URL parameter to prevent re-processing
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
          
          // Show a brief toast/notification that they came from a referral
          console.log('[Referral] Referral code saved for processing after signup');
        }
        
        setReferralProcessed(true);
      } catch (error) {
        console.error('[Referral] Error handling referral:', error);
        setReferralProcessed(true);
      }
    };
    
    handleReferral();
  }, [referralProcessed]);

  // Initialize user info from MiniKit when available
  useEffect(() => {
    // Set user info from MiniKit (or defaults)
    // The actual values come from World App via MiniKitProvider
    setUserInfo({
      username: miniKitUsername || 'Player',
      walletAddress: miniKitWalletAddress || '',
      streak: 0, // Will be updated from API when user plays
      insurance: false,
    });

    // Stats will be fetched from API by HomeScreen
    // Don't set fake mock data here
  }, [setUserInfo, miniKitUsername, miniKitWalletAddress]);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <HomeScreen />;
      case 'puzzle':
        return <PuzzleScreen />;
      case 'results':
        return <ResultsScreen />;
      case 'leaderboard':
        return <LeaderboardScreen />;
      case 'profile':
        return <ProfileScreen />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <div className="mobile-frame">
      <div id="app-container" className="flex flex-col h-full bg-background">
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {renderScreen()}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

