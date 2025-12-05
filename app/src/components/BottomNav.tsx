'use client';

import { useGameStore } from '@/store/gameStore';
import { AppScreen } from '@/types';

const navItems: { id: AppScreen; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'puzzle', label: 'Play', icon: '🧩' },
  { id: 'leaderboard', label: 'Ranks', icon: '🏆' },
  { id: 'profile', label: 'Profile', icon: '👤' },
];

export function BottomNav() {
  const { currentScreen, setScreen } = useGameStore();

  const handleNavClick = (screen: AppScreen) => {
    setScreen(screen);
  };

  return (
    <nav className="bottom-nav">
      <div className="flex justify-around items-center py-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNavClick(item.id)}
            className={`nav-item flex-1 ${currentScreen === item.id ? 'active' : ''}`}
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="text-xs mt-1">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

