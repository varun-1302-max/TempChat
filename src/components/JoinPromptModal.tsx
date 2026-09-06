import React, { useState } from 'react';
import { sounds } from '../services/sound';

interface JoinPromptModalProps {
  roomToken: string;
  onJoin: (nickname: string) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  error?: string | null;
}

export const JoinPromptModal: React.FC<JoinPromptModalProps> = ({
  roomToken,
  onJoin,
  onCancel,
  isLoading,
  error,
}) => {
  const [nickname, setNickname] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const clean = nickname.trim();
    if (!clean) {
      setLocalError('Please choose a nickname to enter');
      return;
    }

    try {
      sounds.playJoin();
      await onJoin(clean);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to join room');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl border border-outline-variant/60 bg-surface text-on-surface shadow-2xl p-6 sm:p-7 flex flex-col gap-4 animate-pop-in">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close dialog"
          className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div className="text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2 shadow-xs">
            <span className="material-symbols-outlined text-[24px]">chat</span>
          </div>

          <h3 className="text-lg font-bold text-on-surface">
            Join Chat Room
          </h3>
          <div className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-on-surface-variant">
            <span>Room Code:</span>
            <code className="font-mono font-bold text-primary px-2 py-0.5 rounded-md bg-surface-container border border-outline-variant/60">
              {roomToken}
            </code>
          </div>
        </div>

        {(localError || error) && (
          <div className="p-3 rounded-2xl bg-error-container text-on-error-container text-xs font-medium flex items-center gap-2 animate-fade-in border border-error/20">
            <span className="material-symbols-outlined text-[18px] text-error">error</span>
            <span>{localError || error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-on-surface-variant px-1">
              Choose Your Temporary Nickname
            </label>
            <div className="relative rounded-2xl border border-outline-variant bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all flex items-center px-3">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant mr-2">
                person
              </span>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="e.g. Alex, Maya..."
                maxLength={25}
                required
                autoFocus
                className="w-full py-3 bg-transparent text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 px-4 rounded-full text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2.5 px-4 rounded-full bg-primary hover:bg-[#0073e6] text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Enter Chat</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
