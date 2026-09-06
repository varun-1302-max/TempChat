import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { generateQrSvgUri } from '../services/qr';

interface ShareModalProps {
  roomToken: string;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ roomToken, onClose }) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const fullUrl = `${window.location.origin}${window.location.pathname}?room=${roomToken}`;
  const qrUri = generateQrSvgUri(fullUrl);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedLink(true);
      confetti({
        particleCount: 35,
        spread: 55,
        origin: { y: 0.7 },
        colors: ['#0084ff', '#60a5fa', '#3b82f6'],
      });
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // Fallback
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomToken);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl border border-outline-variant/60 bg-surface text-on-surface shadow-2xl p-6 sm:p-7 flex flex-col gap-4 animate-pop-in">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        {/* Dialog Header */}
        <div className="text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2 shadow-xs">
            <span className="material-symbols-outlined text-[24px]">share</span>
          </div>
          <h3 className="text-lg font-bold text-on-surface">
            Invite to Chat
          </h3>
          <p className="text-xs text-on-surface-variant mt-1">
            Share this link or code. Anyone with access can join until the timer runs out.
          </p>
        </div>

        {/* Room Code Box */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant px-1">
            Room Code
          </label>
          <div className="flex items-center justify-between p-2.5 rounded-2xl border border-outline-variant/70 bg-surface-container-low">
            <code className="font-mono text-base font-bold text-primary px-2 select-all">
              {roomToken}
            </code>
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface text-on-surface text-xs font-semibold hover:bg-surface-container transition-colors border border-outline-variant/60 shadow-2xs"
            >
              <span className="material-symbols-outlined text-[15px]">
                {copiedCode ? 'check' : 'content_copy'}
              </span>
              <span>{copiedCode ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Direct Link Box */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant px-1">
            Shareable Link
          </label>
          <div className="flex items-center gap-2 p-1.5 rounded-2xl border border-outline-variant/70 bg-surface-container-low">
            <input
              type="text"
              readOnly
              value={fullUrl}
              className="w-full bg-transparent text-xs text-on-surface font-mono px-2 outline-none select-all overflow-ellipsis"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1 px-3.5 py-2 rounded-full bg-primary text-white text-xs font-semibold hover:bg-[#0073e6] transition-all shadow-xs flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[15px]">
                {copiedLink ? 'check' : 'link'}
              </span>
              <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
            </button>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="border-t border-outline-variant/40 pt-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[17px] text-on-surface-variant">qr_code_2</span>
              <span>QR Code</span>
            </span>
            <button
              type="button"
              onClick={() => setShowQr(!showQr)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {showQr ? 'Hide' : 'Show QR'}
            </button>
          </div>

          {showQr && (
            <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white shadow-xs border border-outline-variant/40">
              <img
                src={qrUri}
                alt="Room QR Code"
                className="w-36 h-36 rounded-lg object-contain"
                loading="lazy"
              />
              <span className="text-[11px] text-slate-500 mt-2 text-center">
                Scan with mobile camera to join instantly
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
