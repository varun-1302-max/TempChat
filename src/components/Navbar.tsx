import React from 'react';
import { Emblem } from './Emblem';
import { useTheme } from '../theme/useTheme';
import { getSupabaseConfig } from '../services/supabase';

interface NavbarProps {
  onOpenSupabaseModal: () => void;
  onHomeClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSupabaseModal, onHomeClick }) => {
  const { isDark, toggleTheme, soundEnabled, toggleSound } = useTheme();
  const config = getSupabaseConfig();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-surface/95 backdrop-blur-md border-b border-outline-variant/50 transition-colors duration-200">
      <div className="h-full max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Leading: Logo & Name */}
        <div
          onClick={onHomeClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onHomeClick?.();
          }}
          className="flex items-center gap-3 cursor-pointer select-none group focus:outline-none"
        >
          <Emblem className="w-9 h-9 transition-transform group-hover:scale-105" />
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight text-on-surface">
              TempChat
            </span>
            <div className="flex items-center gap-1.5 -mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] text-on-surface-variant font-medium">
                {config.isConfigured ? 'Cloud Sync' : 'Private & Temporary'}
              </span>
            </div>
          </div>
        </div>

        {/* Trailing: Clean Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Sound Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            aria-label="Sound Toggle"
            title={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">
              {soundEnabled ? 'volume_up' : 'volume_off'}
            </span>
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Theme Toggle"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">
              {isDark ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          {/* Settings / Cloud setup */}
          <button
            type="button"
            onClick={onOpenSupabaseModal}
            aria-label="Settings"
            title="Connection Settings"
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};
