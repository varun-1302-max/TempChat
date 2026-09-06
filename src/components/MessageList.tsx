import React, { useEffect, useRef, useState } from 'react';
import type { Message, Participant, TypingUser } from '../types';

interface MessageListProps {
  messages: Message[];
  currentParticipant: Participant;
  typingUsers: TypingUser[];
  onOpenShareModal: () => void;
}

const NICKNAME_COLORS = [
  'text-blue-600 dark:text-blue-400',
  'text-purple-600 dark:text-purple-400',
  'text-emerald-600 dark:text-emerald-400',
  'text-amber-600 dark:text-amber-400',
  'text-rose-600 dark:text-rose-400',
  'text-indigo-600 dark:text-indigo-400',
];

function getNicknameColor(nick: string): string {
  let hash = 0;
  for (let i = 0; i < nick.length; i++) {
    hash = nick.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NICKNAME_COLORS[Math.abs(hash) % NICKNAME_COLORS.length];
}

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentParticipant,
  typingUsers,
  onOpenShareModal,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Auto-scroll on message or typing change
  useEffect(() => {
    if (!showScrollBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, typingUsers, showScrollBottom]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isUp = scrollHeight - scrollTop - clientHeight > 100;
    setShowScrollBottom(isUp);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  const otherTypingUsers = typingUsers.filter(
    u => u.participantId !== currentParticipant.id
  );

  return (
    <div className="relative flex-1 flex flex-col min-h-0 bg-surface">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 flex flex-col gap-2.5"
      >
        {/* Subtle Disappearing Notice Pill */}
        <div className="flex justify-center my-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant text-[11px] font-medium shadow-2xs text-center">
            <span className="material-symbols-outlined text-[14px]">lock</span>
            <span>Messages disappear when the room timer ends. Zero logs kept.</span>
          </div>
        </div>

        {/* Empty state when no messages */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center my-auto py-12 text-center animate-fade-in">
            <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[28px]">chat_bubble_outline</span>
            </div>
            <h4 className="text-base font-bold text-on-surface">
              No Messages Yet
            </h4>
            <p className="text-xs text-on-surface-variant max-w-xs mt-1 mb-4">
              Say hello or share the link with a friend to start chatting.
            </p>
            <button
              type="button"
              onClick={onOpenShareModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-white text-xs font-semibold hover:bg-[#0073e6] transition-all shadow-xs"
            >
              <span className="material-symbols-outlined text-[16px]">share</span>
              <span>Share Invite Link</span>
            </button>
          </div>
        )}

        {/* Messages Feed */}
        {messages.map((msg) => {
          if (msg.is_system) {
            return (
              <div key={msg.id} className="flex justify-center my-1.5">
                <span className="px-3 py-1 rounded-full bg-surface-container text-on-surface-variant text-[11px] font-medium">
                  {msg.content}
                </span>
              </div>
            );
          }

          const isSelf = msg.participant_id === currentParticipant.id;

          if (isSelf) {
            return (
              <div
                key={msg.id}
                className="flex items-end justify-end max-w-[85%] sm:max-w-md self-end transition-all"
              >
                <div className="flex flex-col items-end">
                  {/* Outgoing Bubble (Messenger Blue) */}
                  <div className="bg-primary text-white px-4 py-2.5 rounded-2xl rounded-tr-xs shadow-xs break-words">
                    <p className="text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                  {/* Timestamp & Read Receipt */}
                  <div className="flex items-center gap-1 mt-1 pr-1 text-[11px] text-on-surface-variant">
                    <span>{formatTime(msg.created_at)}</span>
                    <span
                      className="material-symbols-outlined text-[14px] text-primary"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      done_all
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          // Incoming Bubble (Messenger / WhatsApp Grey)
          return (
            <div
              key={msg.id}
              className="flex items-start gap-2 max-w-[85%] sm:max-w-md self-start group transition-all"
            >
              <div className="flex flex-col items-start">
                {/* Sender Nickname */}
                <span className={`text-[11px] font-semibold mb-0.5 ml-1 ${getNicknameColor(msg.nickname || 'A')}`}>
                  {msg.nickname}
                </span>
                {/* Bubble */}
                <div className="bg-[#f0f2f5] dark:bg-[#262626] text-[#050505] dark:text-[#f3f4f6] px-4 py-2.5 rounded-2xl rounded-tl-xs shadow-xs break-words">
                  <p className="text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>
                </div>
                {/* Timestamp */}
                <span className="text-[11px] text-on-surface-variant mt-1 ml-1">
                  {formatTime(msg.created_at)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Real-time Typing Indicator (Messenger / iMessage 3 dots) */}
        {otherTypingUsers.length > 0 && (
          <div className="flex items-center gap-2 animate-fade-in self-start ml-1 mt-1">
            <div className="bg-[#f0f2f5] dark:bg-[#262626] px-3.5 py-2.5 rounded-full flex items-center gap-1.5 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-on-surface-variant/70 animate-bounce" style={{ animationDelay: '0s' }} />
              <span className="w-2 h-2 rounded-full bg-on-surface-variant/70 animate-bounce" style={{ animationDelay: '0.15s' }} />
              <span className="w-2 h-2 rounded-full bg-on-surface-variant/70 animate-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
            <span className="text-xs text-on-surface-variant">
              {otherTypingUsers.map(u => u.nickname).join(', ')} typing…
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 right-6 w-9 h-9 rounded-full bg-surface text-on-surface border border-outline-variant shadow-md hover:shadow-lg transition-transform hover:scale-105 flex items-center justify-center animate-fade-in z-10"
          aria-label="Scroll to bottom"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
        </button>
      )}
    </div>
  );
};
