'use client';

import { useState, useEffect } from 'react';

type LeaderboardTab = 'fastest' | 'weekly' | 'alltime' | 'streaks' | 'referrals';

interface LeaderboardEntry {
  rank: number;
  username: string;
  value: string;
  isCurrentUser?: boolean;
  subValue?: string; // Secondary info like "5 referrals"
}

export function LeaderboardScreen() {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('fastest');
  const [referralLeaderboard, setReferralLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoadingReferrals, setIsLoadingReferrals] = useState(false);

  // Fetch referral leaderboard from API
  useEffect(() => {
    const fetchReferralLeaderboard = async () => {
      if (activeTab !== 'referrals') return;
      
      setIsLoadingReferrals(true);
      try {
        // TODO: Replace with actual API call
        // const response = await fetch('/api/referral/leaderboard?limit=10');
        // const data = await response.json();
        // setReferralLeaderboard(data.leaderboard);
        
        // Mock data for now
        setReferralLeaderboard([
          { rank: 1, username: 'networker', value: '$284.50', subValue: '47 referrals' },
          { rank: 2, username: 'influencer', value: '$198.20', subValue: '32 referrals' },
          { rank: 3, username: 'connector', value: '$156.80', subValue: '28 referrals' },
          { rank: 4, username: 'socialking', value: '$124.40', subValue: '21 referrals' },
          { rank: 5, username: 'ambassador', value: '$98.60', subValue: '17 referrals' },
          { rank: 6, username: 'recruiter', value: '$76.30', subValue: '14 referrals' },
          { rank: 7, username: 'you', value: '$12.40', subValue: '3 referrals', isCurrentUser: true },
          { rank: 8, username: 'teambuilder', value: '$8.20', subValue: '2 referrals' },
          { rank: 9, username: 'sharer', value: '$4.60', subValue: '1 referral' },
          { rank: 10, username: 'newrecruiter', value: '$2.10', subValue: '1 referral' },
        ]);
      } catch (error) {
        console.error('Failed to fetch referral leaderboard:', error);
      } finally {
        setIsLoadingReferrals(false);
      }
    };

    fetchReferralLeaderboard();
  }, [activeTab]);

  // Mock data for other leaderboards
  const leaderboards: Record<Exclude<LeaderboardTab, 'referrals'>, { title: string; metric: string; data: LeaderboardEntry[] }> = {
    fastest: {
      title: 'Fastest Today',
      metric: 'Time',
      data: [
        { rank: 1, username: 'speedmaster', value: '3:42' },
        { rank: 2, username: 'puzzlepro', value: '4:15' },
        { rank: 3, username: 'sudokuwiz', value: '4:28' },
        { rank: 4, username: 'braingame', value: '5:01' },
        { rank: 5, username: 'quicksolve', value: '5:33' },
        { rank: 6, username: 'you', value: '14:32', isCurrentUser: true },
        { rank: 7, username: 'player123', value: '15:20' },
        { rank: 8, username: 'gridmaster', value: '16:45' },
        { rank: 9, username: 'numbercrunch', value: '18:02' },
        { rank: 10, username: 'dailyplayer', value: '19:33' },
      ],
    },
    weekly: {
      title: 'Top Earners (Week)',
      metric: 'Earnings',
      data: [
        { rank: 1, username: 'bigwinner', value: '$24.50' },
        { rank: 2, username: 'luckycharm', value: '$19.80' },
        { rank: 3, username: 'consistent', value: '$17.20' },
        { rank: 4, username: 'streakking', value: '$15.90' },
        { rank: 5, username: 'dailygrind', value: '$14.30' },
        { rank: 6, username: 'you', value: '$8.40', isCurrentUser: true },
        { rank: 7, username: 'smartplay', value: '$7.80' },
        { rank: 8, username: 'puzzlelover', value: '$6.50' },
        { rank: 9, username: 'newbie2024', value: '$5.20' },
        { rank: 10, username: 'weekend', value: '$4.10' },
      ],
    },
    alltime: {
      title: 'Highest Earners (All Time)',
      metric: 'Total Earnings',
      data: [
        { rank: 1, username: 'legendary', value: '$1,842.50' },
        { rank: 2, username: 'consistent', value: '$1,456.20' },
        { rank: 3, username: 'veteran', value: '$1,234.80' },
        { rank: 4, username: 'dedicated', value: '$987.60' },
        { rank: 5, username: 'committed', value: '$876.40' },
        { rank: 6, username: 'streakking', value: '$754.30' },
        { rank: 7, username: 'dailygrind', value: '$632.10' },
        { rank: 8, username: 'you', value: '$245.80', isCurrentUser: true },
        { rank: 9, username: 'rising_star', value: '$198.50' },
        { rank: 10, username: 'newcomer', value: '$156.20' },
      ],
    },
    streaks: {
      title: 'Longest Streaks',
      metric: 'Days',
      data: [
        { rank: 1, username: 'ironwill', value: '156 🔥' },
        { rank: 2, username: 'dedicated', value: '134 🔥' },
        { rank: 3, username: 'everyday', value: '98 🔥' },
        { rank: 4, username: 'committed', value: '87 🔥' },
        { rank: 5, username: 'persistence', value: '76 🔥' },
        { rank: 6, username: 'reliable', value: '65 🔥' },
        { rank: 7, username: 'steady', value: '54 🔥' },
        { rank: 8, username: 'you', value: '12 🔥', isCurrentUser: true },
        { rank: 9, username: 'growing', value: '11 🔥' },
        { rank: 10, username: 'starter', value: '8 🔥' },
      ],
    },
  };

  // Get the current leaderboard data
  const getCurrentLeaderboard = () => {
    if (activeTab === 'referrals') {
      return {
        title: 'Top Referral Earners',
        metric: 'Referral Earnings',
        data: referralLeaderboard,
      };
    }
    return leaderboards[activeTab];
  };

  const currentLeaderboard = getCurrentLeaderboard();

  const getRankEmoji = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  const getTabLabel = (tab: LeaderboardTab): { emoji: string; label: string } => {
    switch (tab) {
      case 'fastest': return { emoji: '⚡', label: 'Today' };
      case 'weekly': return { emoji: '📅', label: 'Week' };
      case 'alltime': return { emoji: '💰', label: 'All' };
      case 'streaks': return { emoji: '🔥', label: 'Streaks' };
      case 'referrals': return { emoji: '🎁', label: 'Referrals' };
    }
  };

  const getYourPosition = () => {
    switch (activeTab) {
      case 'fastest': return { rank: '#6 of 392 solvers', percentile: '2%' };
      case 'weekly': return { rank: '#6 of 1,247 players', percentile: '0.5%' };
      case 'alltime': return { rank: '#8 of 5,432 players', percentile: '0.1%' };
      case 'streaks': return { rank: '#8 of 5,432 players', percentile: '0.1%' };
      case 'referrals': return { rank: '#7 of 892 referrers', percentile: '0.8%' };
    }
  };

  const yourPosition = getYourPosition();

  return (
    <div className="flex flex-col h-full p-4 pb-24 pt-14">
      {/* Header */}
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold">🏆 Leaderboard</h1>
        <p className="text-sm text-muted">See how you stack up</p>
      </div>

      {/* Tabs - 5 categories now including referrals */}
      <div className="grid grid-cols-5 gap-1 bg-secondary rounded-xl p-1 mb-4">
        {(['fastest', 'weekly', 'alltime', 'streaks', 'referrals'] as LeaderboardTab[]).map((tab) => {
          const { emoji, label } = getTabLabel(tab);
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                py-2 px-1 rounded-lg text-xs font-medium transition-all text-center flex flex-col items-center justify-center
                ${activeTab === tab 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-muted hover:text-foreground'
                }
              `}
            >
              <span className="text-base leading-none">{emoji}</span>
              <span className="mt-1">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Leaderboard Title */}
      <div className="flex justify-between items-center mb-3 px-2">
        <span className="text-sm font-medium">{currentLeaderboard.title}</span>
        <span className="text-xs text-muted">{currentLeaderboard.metric}</span>
      </div>

      {/* Leaderboard List */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingReferrals && activeTab === 'referrals' ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-2">
            {currentLeaderboard.data.map((entry) => (
              <div
                key={entry.rank}
                className={`
                  flex items-center justify-between p-3 rounded-xl
                  ${entry.isCurrentUser 
                    ? 'bg-primary/10 border border-primary/30' 
                    : 'bg-card border border-border'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-lg w-8 ${entry.rank <= 3 ? '' : 'text-muted'}`}>
                    {getRankEmoji(entry.rank)}
                  </span>
                  <div className="flex flex-col">
                    <span className={`font-medium ${entry.isCurrentUser ? 'text-primary' : ''}`}>
                      @{entry.username}
                      {entry.isCurrentUser && ' (you)'}
                    </span>
                    {entry.subValue && (
                      <span className="text-xs text-muted">{entry.subValue}</span>
                    )}
                  </div>
                </div>
                <span className={`font-bold ${entry.isCurrentUser ? 'text-primary' : ''}`}>
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Your Position Summary */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Your Position</p>
              <p className="text-xl font-bold">{yourPosition.rank}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted">Top</p>
              <p className="text-xl font-bold text-primary">{yourPosition.percentile}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Referral CTA when viewing referrals tab */}
      {activeTab === 'referrals' && (
        <div className="mt-3 bg-gradient-to-r from-primary/20 to-purple-600/20 border border-primary/30 rounded-xl p-3 text-center">
          <p className="text-sm">
            <span className="font-semibold">Earn 10% lifetime</span> on all referral activity!
          </p>
          <p className="text-xs text-muted mt-1">
            Go to your Profile to get your invite link 🔗
          </p>
        </div>
      )}
    </div>
  );
}
