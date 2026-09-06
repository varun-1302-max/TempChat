import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Room, Participant, Message, TypingUser } from '../types';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ShareModal } from './ShareModal';
import { ChatService } from '../services/chatService';
import { formatTimeRemaining } from '../services/crypto';
import { sounds } from '../services/sound';

interface ChatRoomViewProps {
  room: Room;
  participant: Participant;
  onLeaveRoom: () => void;
  onRoomExpired: () => void;
}

export const ChatRoomView: React.FC<ChatRoomViewProps> = ({
  room,
  participant,
  onLeaveRoom,
  onRoomExpired,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<{ id: string; nickname: string }[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const hasExpiredRef = useRef(false);

  const [timeLeft, setTimeLeft] = useState<{ formatted: string; isUrgent: boolean; isExpired: boolean }>(() => {
    const expiresMs = new Date(room.expires_at).getTime();
    return formatTimeRemaining(expiresMs - Date.now());
  });

  const totalDurationMs = useMemo(() => {
    if (room.expires_at && room.created_at) {
      const diff = new Date(room.expires_at).getTime() - new Date(room.created_at).getTime();
      if (diff > 0) return diff;
    }
    return 60 * 60 * 1000;
  }, [room.expires_at, room.created_at]);

  const [progressPercent, setProgressPercent] = useState<number>(() => {
    const expiresMs = new Date(room.expires_at).getTime();
    const remaining = Math.max(0, expiresMs - Date.now());
    return Math.min(100, Math.max(0, (remaining / totalDurationMs) * 100));
  });

  const showToast = useCallback((msg: string) => {
    setSnackbarMessage(msg);
    setTimeout(() => {
      setSnackbarMessage(prev => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Countdown & progress updater
  const updateCountdown = useCallback(() => {
    if (hasExpiredRef.current) return;
    const expiresMs = new Date(room.expires_at).getTime();
    const remaining = expiresMs - Date.now();
    const result = formatTimeRemaining(remaining);
    setTimeLeft(result);

    const pct = Math.min(100, Math.max(0, (Math.max(0, remaining) / totalDurationMs) * 100));
    setProgressPercent(pct);

    if (result.isExpired) {
      hasExpiredRef.current = true;
      onRoomExpired();
    }
  }, [room.expires_at, totalDurationMs, onRoomExpired]);

  // Clean up stale typing status
  useEffect(() => {
    if (typingUsers.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers(prev => prev.filter(u => now - u.lastTypingAt < 2500));
    }, 1000);
    return () => clearInterval(interval);
  }, [typingUsers]);

  // Clean disconnect on tab close
  useEffect(() => {
    const handleBeforeUnload = () => {
      ChatService.leaveRoom(room, participant);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [room, participant]);

  // Messages & Realtime Subscription
  useEffect(() => {
    const timer = setInterval(updateCountdown, 1000);

    // Initial message history
    ChatService.getMessages(room.id).then((history) => {
      setMessages((prev) => {
        const map = new Map<string, Message>();
        history.forEach(m => map.set(m.id, m));
        prev.forEach(m => map.set(m.id, m));
        return Array.from(map.values()).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
    });

    // Realtime subscription
    const unsubscribe = ChatService.subscribeToRoom(room, participant, {
      onMessage: (newMsg) => {
        setMessages((prev) => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });

        if (newMsg.participant_id !== participant.id) {
          sounds.playReceived();
        }
      },
      onParticipantsUpdate: (updatedParticipants) => {
        setParticipants(updatedParticipants);
      },
      onSystemEvent: (text) => {
        const sysMsg: Message = {
          id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          room_id: room.id,
          participant_id: '',
          nickname: 'System',
          content: text,
          created_at: new Date().toISOString(),
          is_system: true,
        };
        setMessages(prev => [...prev, sysMsg]);
        sounds.playJoin();
      },
      onTyping: (typers) => {
        setTypingUsers(typers);
      },
      onRoomExpired: () => {
        if (!hasExpiredRef.current) {
          hasExpiredRef.current = true;
          onRoomExpired();
        }
      },
    });

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [room, participant, updateCountdown, onRoomExpired]);

  const handleSendMessage = async (content: string) => {
    const msg = await ChatService.sendMessage(room, participant, content);
    sounds.playSent();
    setMessages((prev) => {
      if (prev.some(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  };

  const handleTypingChange = (isTyping: boolean) => {
    ChatService.sendTyping(room, participant, isTyping);
  };


  const handleConfirmPurge = async () => {
    setShowPurgeModal(false);
    try {
      await ChatService.destroyRoom(room);
      showToast('Room deleted and all messages wiped.');
      setTimeout(() => {
        onLeaveRoom();
      }, 400);
    } catch {
      onLeaveRoom();
    }
  };

  const activeCount = participants.length > 0 ? participants.length : 1;

  return (
    <div className="flex-1 flex flex-col w-full bg-surface min-h-[calc(100vh-4rem)] pt-16">
      {/* Main Chat Workspace Viewport */}
      <div className="max-w-4xl w-full mx-auto flex flex-col h-[calc(100vh-4rem)] bg-surface shadow-xs sm:border-x border-outline-variant/40 relative">
        {/* Top Chat Bar (Instagram / WhatsApp style) */}
        <div className="h-16 px-4 sm:px-6 bg-surface flex items-center justify-between border-b border-outline-variant/50 flex-shrink-0 z-20">
          {/* Left: Back Arrow + Avatar + Room Title + Live Status */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onLeaveRoom}
              title="Leave Chat"
              className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </button>

            {/* Avatar with Online Dot */}
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center border border-primary/20">
                #
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-surface" />
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm sm:text-base font-bold text-on-surface truncate">
                  Room {room.room_token}
                </span>
              </div>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                {activeCount} active now
              </span>
            </div>
          </div>

          {/* Right: Countdown Pill + Share Button + Delete Button */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Minimalist Countdown Badge */}
            <div
              title="Time until messages and room are deleted"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                timeLeft.isUrgent
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-300 dark:border-rose-800 animate-pulse'
                  : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">timer</span>
              <span className="font-mono">{timeLeft.formatted}</span>
            </div>

            {/* Share / Invite */}
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              title="Share Room Link"
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">share</span>
            </button>

            {/* Delete / Leave */}
            <button
              type="button"
              onClick={() => setShowPurgeModal(true)}
              title="Delete Chat Room"
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">delete</span>
            </button>
          </div>
        </div>

        {/* Sleek Lifespan Progress Line */}
        <div className="w-full bg-outline-variant/30 h-[2px] overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${
              timeLeft.isUrgent ? 'bg-rose-500' : 'bg-primary'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Messages List Feed */}
        <MessageList
          messages={messages}
          currentParticipant={participant}
          typingUsers={typingUsers}
          onOpenShareModal={() => setShowShareModal(true)}
        />

        {/* Message Input Composer */}
        <MessageInput
          onSendMessage={handleSendMessage}
          onTypingChange={handleTypingChange}
          disabled={timeLeft.isExpired}
        />
      </div>

      {/* Delete / Purge Confirmation Modal */}
      {showPurgeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface rounded-3xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-4 border border-outline-variant/50 animate-pop-in">
            <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[26px]">delete_forever</span>
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-on-surface">
                Delete this chat room?
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                This will immediately close the room and delete all messages for everyone. This cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPurgeModal(false)}
                className="flex-1 py-2.5 px-4 rounded-full text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPurge}
                className="flex-1 py-2.5 px-4 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-all"
              >
                Delete for Everyone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snackbar Toast */}
      {snackbarMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-on-surface text-surface px-4 py-2.5 rounded-full shadow-lg animate-fade-in text-xs font-medium">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{snackbarMessage}</span>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal
          roomToken={room.room_token}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
};
