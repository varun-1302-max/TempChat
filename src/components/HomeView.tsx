import React, { useState } from 'react';
import { Emblem } from './Emblem';
import { EXPIRATION_OPTIONS } from '../types';
import { sounds } from '../services/sound';
import { ChatService } from '../services/chatService';

interface HomeViewProps {
  onCreateRoom: (nickname: string, durationMinutes: number) => Promise<void>;
  onJoinRoom: (token: string, nickname?: string) => Promise<void>;
  isLoading: boolean;
  error?: string | null;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onCreateRoom,
  onJoinRoom,
  isLoading,
  error,
}) => {
  const [nickname, setNickname] = useState('');
  const [selectedDuration, setSelectedDuration] = useState<number>(60); // default 1 hour
  const [burnOnExit, setBurnOnExit] = useState(true);
  const [liveTyping, setLiveTyping] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joinNickname, setJoinNickname] = useState('');
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmed = nickname.trim() || 'Guest';
    if (trimmed.length > 25) {
      setValidationError('Nickname must be 25 characters or fewer');
      return;
    }

    try {
      sounds.playJoin();
      await onCreateRoom(trimmed, selectedDuration);
    } catch (err: any) {
      setValidationError(err.message || 'Failed to create room');
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const rawCode = joinCode.trim();
    if (!rawCode) {
      setValidationError('Please enter a room code or invite link');
      return;
    }

    const code = ChatService.normalizeToken(rawCode);
    if (!code) {
      setValidationError('Invalid room code or link format');
      return;
    }

    const trimmedNick = joinNickname.trim() || 'Guest';

    try {
      sounds.playJoin();
      await onJoinRoom(code, trimmedNick);
    } catch (err: any) {
      setValidationError(err.message || 'Room not found or expired');
    }
  };

  return (
    <div className="w-full pt-20 pb-12 bg-surface min-h-[calc(100vh-4rem)] flex flex-col justify-between px-4">
      <div className="w-full max-w-lg mx-auto flex flex-col items-center">
        {/* Hero Header Section */}
        <div className="flex flex-col items-center text-center mb-8 select-none">
          <div className="mb-4">
            <Emblem className="w-16 h-16 object-contain shadow-md rounded-2xl" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
            TempChat
          </h1>
          <p className="text-sm sm:text-base text-on-surface-variant mt-2 max-w-sm leading-relaxed">
            Simple, private temporary messaging. No accounts, no footprints.
          </p>

          {/* Clean Assist Pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container text-on-surface-variant text-xs font-medium">
              <span className="material-symbols-outlined text-[15px] text-primary">timer</span>
              <span>Auto-deleting</span>
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container text-on-surface-variant text-xs font-medium">
              <span className="material-symbols-outlined text-[15px] text-primary">lock</span>
              <span>No signup</span>
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container text-on-surface-variant text-xs font-medium">
              <span className="material-symbols-outlined text-[15px] text-primary">bolt</span>
              <span>Real-time</span>
            </span>
          </div>
        </div>

        {/* Segmented Tab Switcher (iOS / WhatsApp style) */}
        <div className="w-full max-w-md bg-surface-container p-1 rounded-2xl flex items-center mb-6 border border-outline-variant/60 shadow-xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab('create');
              setValidationError(null);
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              activeTab === 'create'
                ? 'bg-surface text-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Create a Chat
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('join');
              setValidationError(null);
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              activeTab === 'join'
                ? 'bg-surface text-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Join with Code
          </button>
        </div>

        {/* Global Error Banner */}
        {(validationError || error) && (
          <div className="w-full max-w-md mb-5 p-3.5 rounded-2xl bg-error-container text-on-error-container text-xs font-medium flex items-center gap-2.5 animate-fade-in border border-error/20">
            <span className="material-symbols-outlined text-[18px] text-error flex-shrink-0">
              error
            </span>
            <span>{validationError || error}</span>
          </div>
        )}

        {/* Main Form Card */}
        <div className="w-full max-w-md bg-surface-container-low rounded-3xl p-6 sm:p-7 border border-outline-variant/50 shadow-sm">
          {activeTab === 'create' ? (
            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-5">
              {/* Nickname Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-on-surface-variant px-1">
                  Your Nickname
                </label>
                <div className="relative flex items-center rounded-2xl bg-surface border border-outline-variant focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant ml-3.5">
                    person
                  </span>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="e.g. Alex, Maya (optional)"
                    maxLength={25}
                    className="w-full py-3 px-3 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Room Lifespan Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-on-surface-variant px-1">
                  Room Duration
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {EXPIRATION_OPTIONS.map((opt) => {
                    const isSelected = selectedDuration === opt.valueMinutes;
                    return (
                      <button
                        key={opt.valueMinutes}
                        type="button"
                        onClick={() => setSelectedDuration(opt.valueMinutes)}
                        className={`py-2.5 px-3 rounded-2xl text-xs font-semibold transition-all duration-150 flex flex-col items-center gap-1 border ${
                          isSelected
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-surface text-on-surface border-outline-variant/60 hover:bg-surface-container'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Privacy Preferences */}
              <div className="pt-2 border-t border-outline-variant/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-on-surface">Burn on Exit</span>
                    <span className="text-[11px] text-on-surface-variant">
                      Auto-destroy room if all participants leave
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={burnOnExit}
                    onClick={() => setBurnOnExit(!burnOnExit)}
                    className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none ${
                      burnOnExit ? 'bg-primary' : 'bg-outline-variant'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                        burnOnExit ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-on-surface">Typing Indicators</span>
                    <span className="text-[11px] text-on-surface-variant">
                      Show when other participants are typing
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={liveTyping}
                    onClick={() => setLiveTyping(!liveTyping)}
                    className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none ${
                      liveTyping ? 'bg-primary' : 'bg-outline-variant'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                        liveTyping ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-6 rounded-full bg-primary hover:bg-[#0073e6] active:scale-[0.98] text-white font-semibold text-sm shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 mt-1 disabled:opacity-60"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Create Chat</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinSubmit} className="flex flex-col gap-5">
              {/* Join Code Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-on-surface-variant px-1">
                  Room Code or Invite Link
                </label>
                <div className="relative flex items-center rounded-2xl bg-surface border border-outline-variant focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant ml-3.5">
                    tag
                  </span>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="e.g. tc-a4b2-9x1z or paste URL"
                    required
                    className="w-full py-3 px-3 bg-transparent text-sm text-on-surface font-mono placeholder:text-on-surface-variant/50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Nickname for Joining */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-on-surface-variant px-1">
                  Your Nickname
                </label>
                <div className="relative flex items-center rounded-2xl bg-surface border border-outline-variant focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant ml-3.5">
                    person
                  </span>
                  <input
                    type="text"
                    value={joinNickname}
                    onChange={(e) => setJoinNickname(e.target.value)}
                    placeholder="e.g. Alex (optional)"
                    maxLength={25}
                    className="w-full py-3 px-3 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-6 rounded-full bg-primary hover:bg-[#0073e6] active:scale-[0.98] text-white font-semibold text-sm shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 mt-1 disabled:opacity-60"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Enter Chat</span>
                    <span className="material-symbols-outlined text-[18px]">login</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
