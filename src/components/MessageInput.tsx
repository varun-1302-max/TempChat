import React, { useState, useRef, useEffect } from 'react';

interface MessageInputProps {
  onSendMessage: (content: string) => Promise<void>;
  onTypingChange: (isTyping: boolean) => void;
  disabled?: boolean;
}

const COMMON_EMOJIS = ['👋', '😊', '❤️', '👍', '🔥', '🎉', '😂', '✨'];

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  onTypingChange,
  disabled = false,
}) => {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value);
    setRateLimitError(null);

    // Notify typing
    onTypingChange(true);
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      onTypingChange(false);
    }, 1500);
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed || isSending || disabled) return;

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    onTypingChange(false);
    setShowEmojiPicker(false);

    try {
      setIsSending(true);
      await onSendMessage(trimmed);
      setContent('');
    } catch (err: any) {
      setRateLimitError(err.message || 'Failed to send message');
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const insertEmoji = (emoji: string) => {
    setContent(prev => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const hasText = content.trim().length > 0;

  return (
    <div className="p-3 bg-surface border-t border-outline-variant/50 flex flex-col z-20 flex-shrink-0 relative">
      {/* Rate limit warning */}
      {rateLimitError && (
        <div className="mb-2 px-3 py-1.5 rounded-xl bg-error-container text-on-error-container text-xs font-medium flex items-center gap-1.5 animate-fade-in shadow-xs">
          <span className="material-symbols-outlined text-[16px]">error</span>
          <span>{rateLimitError}</span>
        </div>
      )}

      {/* Emoji picker popup */}
      {showEmojiPicker && (
        <div className="absolute bottom-16 left-3 bg-surface border border-outline-variant/60 rounded-2xl p-1.5 shadow-lg flex items-center gap-1 z-30 animate-pop-in">
          {COMMON_EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => insertEmoji(emoji)}
              className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-lg transition-transform hover:scale-110 active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Main Composer Bar (WhatsApp / Instagram style) */}
      <form
        className="flex items-center gap-2 max-w-4xl mx-auto w-full"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        {/* Emoji Button */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker(prev => !prev)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors flex-shrink-0"
          title="Insert Emoji"
        >
          <span className="material-symbols-outlined text-[22px]">sentiment_satisfied</span>
        </button>

        {/* Rounded Input Pill */}
        <div className="flex-1 bg-[#f0f2f5] dark:bg-[#262626] rounded-full px-4 py-2 flex items-center focus-within:ring-2 focus-within:ring-primary/40 transition-all">
          <input
            ref={inputRef}
            type="text"
            value={content}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={disabled || isSending}
            autoComplete="off"
            placeholder="Message..."
            maxLength={2000}
            className="w-full bg-transparent border-none outline-none text-sm sm:text-[15px] text-on-surface placeholder:text-on-surface-variant/60"
          />
        </div>

        {/* Circular Send Button (Activates with blue when text is present) */}
        <button
          type="submit"
          disabled={!hasText || isSending || disabled}
          aria-label="Send Message"
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
            hasText
              ? 'bg-primary text-white hover:bg-[#0073e6] shadow-xs active:scale-95 cursor-pointer'
              : 'text-on-surface-variant/40 cursor-default'
          }`}
        >
          {isSending ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <span
              className="material-symbols-outlined text-[20px]"
              style={hasText ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              send
            </span>
          )}
        </button>
      </form>
    </div>
  );
};
