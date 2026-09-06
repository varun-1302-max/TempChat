import React from 'react';

interface RoomExpiredViewProps {
  onBackHome: () => void;
  reason?: string;
}

export const RoomExpiredView: React.FC<RoomExpiredViewProps> = ({
  onBackHome,
  reason = 'This temporary chat room has expired or ended.',
}) => {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-surface pt-16">
      <div className="max-w-md w-full rounded-3xl border border-outline-variant/60 bg-surface shadow-lg p-7 text-center animate-pop-in flex flex-col items-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center">
          <span className="material-symbols-outlined text-[32px]">timer_off</span>
        </div>

        <h2 className="text-xl font-bold text-on-surface tracking-tight mb-2">
          Chat Room Ended
        </h2>

        <p className="text-sm text-on-surface-variant mb-6 leading-relaxed max-w-sm">
          {reason} To preserve your privacy, all messages and session keys have been permanently destroyed.
        </p>

        <div className="w-full space-y-2.5">
          <button
            type="button"
            onClick={onBackHome}
            className="w-full py-3 px-6 rounded-full font-semibold text-sm bg-primary hover:bg-[#0073e6] text-white shadow-xs transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Create a New Chat</span>
          </button>

          <button
            type="button"
            onClick={onBackHome}
            className="w-full py-2.5 px-4 rounded-full text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Back to Home</span>
          </button>
        </div>
      </div>
    </div>
  );
};
