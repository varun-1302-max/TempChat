/**
 * Cryptographically secure utilities for TempChat
 */

// Generate an unpredictable, URL-safe room token: e.g. tc-a7f3-9d2e
export function generateRoomToken(): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz'; // removed easily confused characters: 0, o, 1, l, i
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += chars[array[i] % chars.length];
  }
  for (let i = 4; i < 8; i++) {
    part2 += chars[array[i] % chars.length];
  }
  
  return `tc-${part1}-${part2}`;
}

// Generate unpredictable session token for participant authorization
export function generateSessionToken(): string {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Generate random ID for messages / participants in local mode
export function generateUuid(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback RFC4122 v4
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Sanitize message text: trim and strip non-printable control characters
export function sanitizeMessage(raw: string): string {
  return Array.from(raw)
    .filter(ch => {
      const code = ch.charCodeAt(0);
      return (code >= 32 && code !== 127) || code === 9 || code === 10 || code === 13 || code > 159;
    })
    .join('')
    .trim();
}

// Format duration remaining
export function formatTimeRemaining(msRemaining: number): {
  formatted: string;
  isUrgent: boolean;
  isExpired: boolean;
} {
  if (msRemaining <= 0) {
    return { formatted: '00:00', isUrgent: true, isExpired: true };
  }

  const totalSeconds = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  let formatted = '';
  if (hours > 0) {
    formatted = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  } else {
    formatted = `${pad(minutes)}:${pad(seconds)}`;
  }

  // Urgent if less than 2 minutes remaining
  const isUrgent = totalSeconds < 120;

  return { formatted, isUrgent, isExpired: false };
}
