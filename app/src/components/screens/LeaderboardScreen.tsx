'use client';

import { useState, useEffect, useCallback } from 'react';

type LeaderboardTab = 'fastest' | 'weekly' | 'alltime' | 'streaks' | 'referrals';

interface LeaderboardEntry {
  rank: number;
  username: string;
  value: string;
  isCurrentUser?: boolean;
  subValue?: string;
}

interface LeaderboardData {
  title: string;
  metric: string;
  data: LeaderboardEntry[];
  totalCount?: number;
}

export function LeaderboardScreen() {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('fastest');
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch leaderboard data from API
  const fetchLeaderboard = useCallback(async (type: LeaderboardTab) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/leaderboard?type=${type}&limit=50`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch leaderboard');
      }
      
      setLeaderboardData({
        title: data.title,
        metric: data.metric,
        data: data.data.map((entry: { rank: number; username: string; value: string; subValue?: string }) => ({
          ...entry,
          isCurrentUser: false, // TODO: Mark current user when we have auth context
        })),
        totalCount: data.totalCount,
      });
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      setLeaderboardData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch data when tab changes
  useEffect(() => {
    fetchLeaderboard(activeTab);
  }, [activeTab, fetchLeaderboard]);

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

  const getEmptyMessage = (tab: LeaderboardTab): string => {
    switch (tab) {
      case 'fastest': return 'No one has solved today\'s puzzle yet. Be the first!';
      case 'weekly': return 'No winners this week yet. Start playing to appear here!';
      case 'alltime': return 'No players yet. Be the first to win!';
      case 'streaks': return 'No active streaks. Play daily to build your streak!';
      case 'referrals': return 'No referral earnings yet. Share your code to earn!';
    }
  };

  return (
    <div className="flex flex-col h-full p-4 pb-24 pt-14">
      {/* Header */}
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold">🏆 Leaderboard</h1>
        <p className="text-sm text-muted">See how you stack up</p>
      </div>

      {/* Tabs - 5 categories */}
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
      {leaderboardData && (
        <div className="flex justify-between items-center mb-3 px-2">
          <span className="text-sm font-medium">{leaderboardData.title}</span>
          <span className="text-xs text-muted">{leaderboardData.metric}</span>
        </div>
      )}

      {/* Leaderboard List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <p className="text-accent text-sm mb-2">⚠️ {error}</p>
            <button 
              onClick={() => fetchLeaderboard(activeTab)}
              className="text-xs text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        ) : leaderboardData && leaderboardData.data.length > 0 ? (
          <div className="space-y-2">
            {leaderboardData.data.map((entry) => (
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
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <p className="text-muted text-sm">{getEmptyMessage(activeTab)}</p>
          </div>
        )}
      </div>

      {/* Stats Footer */}
      {leaderboardData && leaderboardData.data.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Showing</p>
                <p className="text-lg font-bold">
                  {leaderboardData.data.length}
                  {leaderboardData.totalCount && leaderboardData.totalCount > leaderboardData.data.length 
                    ? ` of ${leaderboardData.totalCount}` 
                    : ''
                  } players
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted">Updated</p>
                <p className="text-sm font-medium text-primary">Just now</p>
              </div>
            </div>
          </div>
        </div>
      )}

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
