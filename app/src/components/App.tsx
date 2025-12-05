'use client';

import { useGameStore } from '@/store/gameStore';
import { BottomNav } from './BottomNav';
import { HomeScreen } from './screens/HomeScreen';
import { PuzzleScreen } from './screens/PuzzleScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { useEffect, useState } from 'react';

export function App() {
  const { currentScreen, setUserInfo, setTodayStats } = useGameStore();
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

  // Initialize with mock data
  useEffect(() => {
    // TODO: Replace with actual World ID and API calls
    // When user signs up, check for pending referral code
    const pendingRefCode = localStorage.getItem('pendingReferralCode');
    
    setUserInfo({
      username: 'player123',
      walletAddress: '0x1234...5678',
      streak: 12,
      insurance: true, // Mock: user has earned and not yet used insurance
      referralCode: 'STAKE1234', // User's own referral code
      referralEarnings: 1.20,
      totalReferrals: 3,
    });

    setTodayStats({
      players: 847,
      successRate: 53, // 53% failed
      pool: 677.60,
    });
    
    // TODO: In production, after verifying World ID, process the pending referral
    // if (pendingRefCode && userId) {
    //   fetch('/api/referral/process', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ userId, referralCode: pendingRefCode }),
    //   }).then(() => {
    //     localStorage.removeItem('pendingReferralCode');
    //   });
    // }
  }, [setUserInfo, setTodayStats]);

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

