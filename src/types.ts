export interface Room {
  id: string;
  room_token: string;
  expires_at: string;
  last_activity_at: string;
  created_at: string;
}

export interface Participant {
  id: string;
  room_id: string;
  nickname: string;
  session_token: string;
  joined_at: string;
  last_seen_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  participant_id: string;
  nickname: string;
  content: string;
  created_at: string;
  is_system?: boolean;
}

export interface ExpirationOption {
  label: string;
  valueMinutes: number;
  description: string;
}

export const EXPIRATION_OPTIONS: ExpirationOption[] = [
  { label: '10 Minutes', valueMinutes: 10, description: 'Quick burst chat' },
  { label: '1 Hour', valueMinutes: 60, description: 'Standard private session' },
  { label: '6 Hours', valueMinutes: 360, description: 'Extended discussion' },
  { label: '24 Hours', valueMinutes: 1440, description: 'Full day collaboration' },
];

export interface TypingUser {
  participantId: string;
  nickname: string;
  lastTypingAt: number;
}
