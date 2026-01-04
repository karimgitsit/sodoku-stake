'use client';

import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useWallet } from '@/components/MiniKitProvider';
import { MiniKit } from '@worldcoin/minikit-js';

// App configuration
const APP_ID = process.env.NEXT_PUBLIC_APP_ID || 'app_sodoku_stake';

interface ReferralStats {
  referralCode: string;
  totalReferrals: number;
  totalEarnings: number;
  unpaidEarnings: number;
  recentEarnings: Array<{
    id: string;
    sourceType: 'entry' | 'reveal';
    amount: number;
    commissionRate: number;
    date: string;
    paidOut: boolean;
  }>;
}

interface NotificationPreferences {
  notifications_enabled: boolean;
  notify_streak_risk: boolean;
  notify_achievements: boolean;
  notify_referrals: boolean;
  notify_reminders: boolean;
  notify_results: boolean;
}

interface UserStats {
  totalGames: number;
  totalWins: number;
  winRate: number;
  totalEarnings: number;
  currentStreak: number;
  longestStreak: number;
  hasStreakInsurance: boolean;
  rank: number | null;
}

export function ProfileScreen() {
  const { 
    currentStreak,
    hasStreakInsurance,
    referralCode: storeReferralCode,
    referralEarnings: storeReferralEarnings,
    totalReferrals: storeTotalReferrals,
    puzzleUserId,
  } = useGameStore();
  
  // Get the actual username from MiniKit/World App
  const { username: miniKitUsername } = useWallet();
  
  // Prefer MiniKit username, fallback to store or 'Anonymous'
  const displayUsername = miniKitUsername || 'Anonymous';

  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>({
    notifications_enabled: true,
    notify_streak_risk: true,
    notify_achievements: true,
    notify_referrals: true,
    notify_reminders: true,
    notify_results: true,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Use fetched stats or defaults
  const stats = userStats || {
    totalGames: 0,
    totalWins: 0,
    winRate: 0,
    totalEarnings: 0,
    currentStreak: 0,
    longestStreak: 0,
    hasStreakInsurance: false,
    rank: null,
  };

  // Use store values or API values
  const displayReferralCode = referralStats?.referralCode || storeReferralCode || 'LOADING';
  const displayTotalReferrals = referralStats?.totalReferrals ?? storeTotalReferrals ?? 0;
  const displayReferralEarnings = referralStats?.totalEarnings ?? storeReferralEarnings ?? 0;

  // Generate the invite link following World App format
  // https://docs.world.org/mini-apps/growth/invites-viral
  const generateInviteLink = useCallback(() => {
    const path = encodeURIComponent(`/?ref=${displayReferralCode}`);
    return `https://world.org/mini-app?app_id=${APP_ID}&path=${path}`;
  }, [displayReferralCode]);

  // Copy referral link to clipboard
  const handleCopyLink = async () => {
    const inviteLink = generateInviteLink();
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = inviteLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  // Share using MiniKit (World App native share)
  const handleShare = async () => {
    const inviteLink = generateInviteLink();
    
    try {
      // Check if MiniKit is available (running in World App)
      if (MiniKit.isInstalled()) {
        await MiniKit.commandsAsync.share({
          title: 'Join me on Sodoku Stake! 🧩',
          text: `I'm playing Sodoku Stake and earning real money! Join using my link and we both benefit. 💰`,
          url: inviteLink,
        });
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 2000);
      } else {
        // Fallback to Web Share API or copy
        if (navigator.share) {
          await navigator.share({
            title: 'Join me on Sodoku Stake! 🧩',
            text: `I'm playing Sodoku Stake and earning real money! Join using my link.`,
            url: inviteLink,
          });
          setShareSuccess(true);
          setTimeout(() => setShareSuccess(false), 2000);
        } else {
          // Just copy if share isn't available
          handleCopyLink();
        }
      }
    } catch (err) {
      console.error('Share failed:', err);
      // User cancelled or share failed, try copy as fallback
      handleCopyLink();
    }
  };

  // Fetch user stats from API
  useEffect(() => {
    const fetchUserStats = async () => {
      if (!puzzleUserId) {
        setIsLoadingStats(false);
        return;
      }
      
      setIsLoadingStats(true);
      try {
        const response = await fetch(`/api/user/stats?userId=${puzzleUserId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.stats) {
            setUserStats({
              totalGames: data.stats.totalGames,
              totalWins: data.stats.totalWins,
              winRate: data.stats.winRate,
              totalEarnings: data.stats.totalEarnings,
              currentStreak: data.stats.currentStreak,
              longestStreak: data.stats.longestStreak,
              hasStreakInsurance: data.stats.hasStreakInsurance,
              rank: data.stats.rank,
            });
          }
        }
      } catch (error) {
        console.error('[Profile] Failed to fetch user stats:', error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchUserStats();
  }, [puzzleUserId]);

  // Fetch notification preferences on load
  useEffect(() => {
    const fetchNotificationPrefs = async () => {
      if (!puzzleUserId) return;
      
      try {
        const response = await fetch(`/api/user/notifications?userId=${puzzleUserId}`);
        if (response.ok) {
          const prefs = await response.json();
          setNotificationPrefs(prefs);
        }
      } catch (error) {
        console.error('[Notifications] Failed to fetch preferences:', error);
      }
    };

    fetchNotificationPrefs();
  }, [puzzleUserId]);

  // Toggle a notification preference
  const toggleNotificationPref = async (key: keyof NotificationPreferences) => {
    const newValue = !notificationPrefs[key];
    const newPrefs = { ...notificationPrefs, [key]: newValue };
    
    // If disabling master toggle, disable all
    if (key === 'notifications_enabled' && !newValue) {
      Object.keys(newPrefs).forEach(k => {
        if (k !== 'notifications_enabled') {
          newPrefs[k as keyof NotificationPreferences] = false;
        }
      });
    }
    
    // If enabling a category, ensure master is on
    if (key !== 'notifications_enabled' && newValue) {
      newPrefs.notifications_enabled = true;
    }
    
    setNotificationPrefs(newPrefs);
    
    // Save to server
    if (!puzzleUserId) {
      console.log('[Notifications] No userId - preferences updated locally only');
      return;
    }
    
    setSavingPrefs(true);
    try {
      await fetch('/api/user/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: puzzleUserId, ...newPrefs }),
      });
      console.log('[Notifications] Preferences saved');
    } catch (error) {
      console.error('[Notifications] Failed to save preferences:', error);
    } finally {
      setSavingPrefs(false);
    }
  };

  // Fetch referral stats from API
  useEffect(() => {
    const fetchReferralStats = async () => {
      if (!puzzleUserId) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      try {
        const response = await fetch(`/api/referral/stats?userId=${puzzleUserId}`);
        if (response.ok) {
          const data = await response.json();
          setReferralStats({
            referralCode: data.referralCode,
            totalReferrals: data.totalReferrals,
            totalEarnings: data.totalEarnings,
            unpaidEarnings: data.unpaidEarnings,
            recentEarnings: data.recentEarnings || [],
          });
        } else {
          // If user not found or error, use store values as fallback
          setReferralStats({
            referralCode: storeReferralCode || '',
            totalReferrals: storeTotalReferrals || 0,
            totalEarnings: storeReferralEarnings || 0,
            unpaidEarnings: 0,
            recentEarnings: [],
          });
        }
      } catch (error) {
        console.error('[Profile] Failed to fetch referral stats:', error);
        // Use store values as fallback on error
        setReferralStats({
          referralCode: storeReferralCode || '',
          totalReferrals: storeTotalReferrals || 0,
          totalEarnings: storeReferralEarnings || 0,
          unpaidEarnings: 0,
          recentEarnings: [],
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchReferralStats();
  }, [puzzleUserId, storeReferralCode, storeReferralEarnings, storeTotalReferrals]);

  return (
    <div className="flex flex-col min-h-full p-4 pb-24">
      {/* Profile Header */}
      <div className="text-center py-6">
        <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-3xl">👤</span>
        </div>
        <h1 className="text-xl font-bold">@{displayUsername}</h1>
        <p className="text-sm text-muted">World ID Verified ✓</p>
      </div>

      {/* Streak Card */}
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Current Streak</p>
            <p className="text-3xl font-bold streak-badge">
              🔥 {isLoadingStats ? '...' : (stats.currentStreak ?? currentStreak)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted">Best Streak</p>
            <p className="text-2xl font-bold">
              {isLoadingStats ? '...' : stats.longestStreak}
            </p>
          </div>
        </div>
        
        {(stats.hasStreakInsurance || hasStreakInsurance) && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2 text-success">
              <span>🛡️</span>
              <span className="text-sm">Streak Insurance Active</span>
            </div>
            <p className="text-xs text-muted mt-1">
              If you lose tomorrow, you&apos;ll get 50% of your entry fee back
            </p>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold">
            {isLoadingStats ? '...' : stats.totalGames}
          </p>
          <p className="text-xs text-muted">Games Played</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-success">
            {isLoadingStats ? '...' : stats.totalWins}
          </p>
          <p className="text-xs text-muted">Wins</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold">
            {isLoadingStats ? '...' : `${stats.winRate}%`}
          </p>
          <p className="text-xs text-muted">Win Rate</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-primary">
            {isLoadingStats ? '...' : `$${stats.totalEarnings.toFixed(2)}`}
          </p>
          <p className="text-xs text-muted">Total Earnings</p>
        </div>
      </div>

      {/* Leaderboard Position */}
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Global Rank</p>
            <p className="text-2xl font-bold">
              {isLoadingStats ? '...' : (stats.rank ? `#${stats.rank}` : 'Unranked')}
            </p>
          </div>
          <div className="text-4xl">🏆</div>
        </div>
      </div>

      {/* Referral Section - Enhanced */}
      <div className="bg-gradient-to-br from-primary/10 to-purple-600/10 border border-primary/30 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🎁</span>
          <h3 className="font-bold text-lg">Invite Friends & Earn</h3>
        </div>
        <p className="text-sm text-muted mb-4">
          Earn <span className="text-primary font-semibold">10% of everything</span> your referrals spend, forever!
        </p>
        
        {/* Referral Code Display */}
        <div className="bg-background/50 border border-border rounded-xl p-3 mb-3">
          <p className="text-xs text-muted mb-1">Your Referral Code</p>
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold text-lg tracking-wider">
              {isLoading ? '...' : displayReferralCode}
            </span>
            <button
              onClick={handleCopyLink}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                copySuccess 
                  ? 'bg-success text-white' 
                  : 'bg-secondary hover:bg-secondary/80'
              }`}
            >
              {copySuccess ? '✓ Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>
        
        {/* Share Button */}
        <button
          onClick={handleShare}
          className={`w-full py-3 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 ${
            shareSuccess 
              ? 'bg-success' 
              : 'bg-primary hover:bg-primary/90 active:scale-[0.98]'
          }`}
        >
          {shareSuccess ? (
            <>✓ Shared!</>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share & Invite Friends
            </>
          )}
        </button>
        
        {/* Referral Stats */}
        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-2xl font-bold">{displayTotalReferrals}</p>
              <p className="text-xs text-muted">Friends Referred</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">${displayReferralEarnings.toFixed(2)}</p>
              <p className="text-xs text-muted">Total Earned</p>
            </div>
          </div>
          
          {referralStats?.unpaidEarnings ? (
            <div className="mt-3 bg-success/10 border border-success/30 rounded-lg p-2 text-center">
              <p className="text-sm">
                <span className="text-success font-semibold">${referralStats.unpaidEarnings.toFixed(2)}</span>
                <span className="text-muted"> pending payout</span>
              </p>
            </div>
          ) : null}
        </div>

        {/* How it works */}
        <div className="mt-4 pt-4 border-t border-border/50">
          <p className="text-xs text-muted font-medium mb-2">How it works:</p>
          <div className="space-y-1.5 text-xs text-muted">
            <div className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>Share your link with friends</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>Every time they pay to play or reveal → you earn 10%</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>Earnings are paid out daily with prizes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <h3 className="font-bold mb-3">Badges</h3>
        <div className="flex flex-wrap gap-2">
          {(stats.currentStreak ?? currentStreak) >= 7 && (
            <div className="bg-primary/20 border border-primary/50 rounded-lg px-3 py-1 text-sm">
              🔥 7-Day Streak
            </div>
          )}
          {stats.totalWins >= 10 && (
            <div className="bg-success/10 border border-success/30 rounded-lg px-3 py-1 text-sm">
              🏆 10 Wins
            </div>
          )}
          {stats.winRate >= 50 && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg px-3 py-1 text-sm">
              📈 50%+ Win Rate
            </div>
          )}
          {displayTotalReferrals >= 1 && (
            <div className="bg-purple-600/10 border border-purple-600/30 rounded-lg px-3 py-1 text-sm">
              👥 Referrer
            </div>
          )}
          {displayTotalReferrals >= 10 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-1 text-sm">
              🌟 Top Recruiter
            </div>
          )}
          <div className="bg-purple-600/10 border border-purple-600/30 rounded-lg px-3 py-1 text-sm">
            ✓ Verified Human
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <button
          onClick={() => setShowNotificationSettings(!showNotificationSettings)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔔</span>
            <div className="text-left">
              <h3 className="font-bold">Notifications</h3>
              <p className="text-xs text-muted">
                {notificationPrefs.notifications_enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>
          <svg 
            className={`w-5 h-5 text-muted transition-transform ${showNotificationSettings ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showNotificationSettings && (
          <div className="mt-4 pt-4 border-t border-border space-y-4">
            {/* Master Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">All Notifications</p>
                <p className="text-xs text-muted">Master toggle</p>
              </div>
              <button
                onClick={() => toggleNotificationPref('notifications_enabled')}
                disabled={savingPrefs}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                  notificationPrefs.notifications_enabled 
                    ? 'bg-primary' 
                    : 'bg-gray-300'
                }`}
              >
                <span 
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                    notificationPrefs.notifications_enabled ? 'translate-x-5' : 'translate-x-0'
                  }`} 
                />
              </button>
            </div>

            {/* Category Toggles */}
            <div className={`space-y-4 ${!notificationPrefs.notifications_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
              {/* Streak Risk */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>🔥</span>
                  <p className="text-sm">Streak reminders</p>
                </div>
                <button
                  onClick={() => toggleNotificationPref('notify_streak_risk')}
                  disabled={savingPrefs}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                    notificationPrefs.notify_streak_risk 
                      ? 'bg-primary' 
                      : 'bg-gray-300'
                  }`}
                >
                  <span 
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                      notificationPrefs.notify_streak_risk ? 'translate-x-5' : 'translate-x-0'
                    }`} 
                  />
                </button>
              </div>

              {/* Achievements */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>🏆</span>
                  <p className="text-sm">Achievements</p>
                </div>
                <button
                  onClick={() => toggleNotificationPref('notify_achievements')}
                  disabled={savingPrefs}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                    notificationPrefs.notify_achievements 
                      ? 'bg-primary' 
                      : 'bg-gray-300'
                  }`}
                >
                  <span 
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                      notificationPrefs.notify_achievements ? 'translate-x-5' : 'translate-x-0'
                    }`} 
                  />
                </button>
              </div>

              {/* Referrals */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>👥</span>
                  <p className="text-sm">Referral activity</p>
                </div>
                <button
                  onClick={() => toggleNotificationPref('notify_referrals')}
                  disabled={savingPrefs}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                    notificationPrefs.notify_referrals 
                      ? 'bg-primary' 
                      : 'bg-gray-300'
                  }`}
                >
                  <span 
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                      notificationPrefs.notify_referrals ? 'translate-x-5' : 'translate-x-0'
                    }`} 
                  />
                </button>
              </div>

              {/* Reminders */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>⏰</span>
                  <p className="text-sm">Daily reminders</p>
                </div>
                <button
                  onClick={() => toggleNotificationPref('notify_reminders')}
                  disabled={savingPrefs}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                    notificationPrefs.notify_reminders 
                      ? 'bg-primary' 
                      : 'bg-gray-300'
                  }`}
                >
                  <span 
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                      notificationPrefs.notify_reminders ? 'translate-x-5' : 'translate-x-0'
                    }`} 
                  />
                </button>
              </div>

              {/* Results */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>💰</span>
                  <p className="text-sm">Results & prizes</p>
                </div>
                <button
                  onClick={() => toggleNotificationPref('notify_results')}
                  disabled={savingPrefs}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                    notificationPrefs.notify_results 
                      ? 'bg-primary' 
                      : 'bg-gray-300'
                  }`}
                >
                  <span 
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                      notificationPrefs.notify_results ? 'translate-x-5' : 'translate-x-0'
                    }`} 
                  />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
