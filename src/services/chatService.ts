import type { Room, Participant, Message, TypingUser } from '../types';
import { generateRoomToken, generateSessionToken, generateUuid, sanitizeMessage } from './crypto';
import { getSupabaseClient } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface RoomSubscriptionCallbacks {
  onMessage: (message: Message) => void;
  onParticipantsUpdate: (participants: { id: string; nickname: string }[]) => void;
  onSystemEvent: (text: string) => void;
  onTyping: (typingUsers: TypingUser[]) => void;
  onRoomExpired: () => void;
}

// Rate limiter helper: max 5 messages per 3 seconds per participant
class MessageRateLimiter {
  private userTimestamps = new Map<string, number[]>();
  private limit = 5;
  private windowMs = 3000;

  canSend(participantId: string): boolean {
    const now = Date.now();
    const timestamps = (this.userTimestamps.get(participantId) || []).filter(t => now - t < this.windowMs);
    if (timestamps.length >= this.limit) {
      return false;
    }
    timestamps.push(now);
    this.userTimestamps.set(participantId, timestamps);
    return true;
  }
}

const rateLimiter = new MessageRateLimiter();

// ==============================================================================
// LOCAL STORAGE & BROADCAST ENGINE
// ==============================================================================

const LOCAL_ROOMS_KEY = 'tempchat_local_rooms';
const LOCAL_PARTICIPANTS_KEY = 'tempchat_local_participants';
const LOCAL_MESSAGES_KEY = 'tempchat_local_messages';

function getLocalData<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalData<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error(`Error saving ${key}:`, err);
  }
}

function cleanupLocalExpired(): void {
  const now = new Date().toISOString();
  const rooms = getLocalData<Room>(LOCAL_ROOMS_KEY);
  const validRooms = rooms.filter(r => r.expires_at > now);
  const expiredRoomIds = new Set(rooms.filter(r => r.expires_at <= now).map(r => r.id));

  if (expiredRoomIds.size > 0) {
    setLocalData(LOCAL_ROOMS_KEY, validRooms);

    const participants = getLocalData<Participant>(LOCAL_PARTICIPANTS_KEY).filter(
      p => !expiredRoomIds.has(p.room_id)
    );
    setLocalData(LOCAL_PARTICIPANTS_KEY, participants);

    const messages = getLocalData<Message>(LOCAL_MESSAGES_KEY).filter(
      m => !expiredRoomIds.has(m.room_id)
    );
    setLocalData(LOCAL_MESSAGES_KEY, messages);
  }
}

// Global broadcast channel for cross-tab communication
let localBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    localBroadcastChannel = new BroadcastChannel('tempchat_local_hub');
  }
} catch {
  localBroadcastChannel = null;
}

// Active local room subscriptions & WebSocket connections
const activeLocalSubscriptions = new Map<string, Set<RoomSubscriptionCallbacks>>();
const activeLocalTyping = new Map<string, Map<string, TypingUser>>();
const activeSupabaseChannels = new Map<string, RealtimeChannel>();
const activeWebSockets = new Map<string, WebSocket>();

if (localBroadcastChannel) {
  localBroadcastChannel.onmessage = (event) => {
    const data = event.data;
    if (!data || !data.roomId) return;

    const listeners = activeLocalSubscriptions.get(data.roomId);
    if (!listeners) return;

    if (data.type === 'MESSAGE' && data.message) {
      listeners.forEach(cb => cb.onMessage(data.message));
    } else if (data.type === 'SYSTEM' && data.text) {
      listeners.forEach(cb => cb.onSystemEvent(data.text));
    } else if (data.type === 'PARTICIPANTS' && data.participants) {
      listeners.forEach(cb => cb.onParticipantsUpdate(data.participants));
    } else if (data.type === 'TYPING' && data.typingUsers) {
      listeners.forEach(cb => cb.onTyping(data.typingUsers));
    } else if (data.type === 'EXPIRED') {
      listeners.forEach(cb => cb.onRoomExpired());
    }
  };
}

// ==============================================================================
// SERVER API HTTP CLIENT HELPER
// ==============================================================================

async function fetchServer(path: string, options?: RequestInit): Promise<any> {
  if (typeof window === 'undefined' || !window.location || !window.location.host || typeof fetch !== 'function') {
    return null;
  }
  try {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }
    return res.status === 204 ? null : await res.json();
  } catch (err: any) {
    // If explicit error from server thrown above, re-throw
    if (
      err.message &&
      !err.message.includes('fetch') &&
      !err.message.includes('Failed to fetch') &&
      !err.message.includes('Failed to parse URL') &&
      !err.message.includes('Invalid URL')
    ) {
      throw err;
    }
    return null;
  }
}

// ==============================================================================
// UNIFIED CHAT SERVICE IMPLEMENTATION
// ==============================================================================

export class ChatService {
  /**
   * Normalize room token from code, URL, or hash
   */
  static normalizeToken(raw: string): string {
    let t = raw.trim().toLowerCase();
    if (t.includes('room=')) {
      try {
        const url = new URL(t, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
        const param = url.searchParams.get('room');
        if (param) t = param.trim().toLowerCase();
      } catch {
        const match = t.match(/room=([a-z0-9_-]+)/i);
        if (match) t = match[1].toLowerCase();
      }
    } else if (t.includes('/room/')) {
      const parts = t.split('/room/');
      if (parts[1]) t = parts[1].split(/[?#]/)[0].trim().toLowerCase();
    } else if (t.startsWith('#')) {
      t = t.replace(/^#+/, '').trim().toLowerCase();
    }

    t = t.replace(/[^a-z0-9_-]/g, '');

    // Auto-prefix tc- if user provided 8 characters (e.g. "a4b2-9x1z" or "a4b29x1z")
    if (!t.startsWith('tc-')) {
      if (t.startsWith('tc')) {
        const rest = t.slice(2).replace(/[^a-z0-9]/g, '');
        if (rest.length === 8) {
          return `tc-${rest.slice(0, 4)}-${rest.slice(4)}`;
        }
      }
      const cleanChars = t.replace(/[^a-z0-9]/g, '');
      if (cleanChars.length === 8) {
        return `tc-${cleanChars.slice(0, 4)}-${cleanChars.slice(4)}`;
      }
    }

    return t;
  }

  /**
   * Create a new temporary chat room
   */
  static async createRoom(nickname: string, durationMinutes: number): Promise<{ room: Room; participant: Participant }> {
    const cleanNick = sanitizeMessage(nickname).slice(0, 30);
    if (!cleanNick) throw new Error('Nickname is required');

    const supabase = getSupabaseClient();

    // 1. SUPABASE CLOUD (If configured)
    if (supabase) {
      const token = generateRoomToken();
      const sessionToken = generateSessionToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .insert({
          room_token: token,
          expires_at: expiresAt.toISOString(),
          last_activity_at: now.toISOString(),
          created_at: now.toISOString(),
        })
        .select()
        .single();

      if (roomError || !roomData) {
        throw new Error(roomError?.message || 'Failed to create room in database');
      }

      const { data: partData, error: partError } = await supabase
        .from('participants')
        .insert({
          room_id: roomData.id,
          nickname: cleanNick,
          session_token: sessionToken,
          joined_at: now.toISOString(),
          last_seen_at: now.toISOString(),
        })
        .select()
        .single();

      if (partError || !partData) {
        throw new Error(partError?.message || 'Failed to register participant');
      }

      sessionStorage.setItem(`tempchat_session_${roomData.id}`, JSON.stringify(partData));
      return { room: roomData as Room, participant: partData as Participant };
    }

    // 2. BUILT-IN BACKEND SERVER (Works across all devices, mobile phones & browsers on the network)
    const serverResult = await fetchServer('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ nickname: cleanNick, durationMinutes }),
    });

    if (serverResult && serverResult.room && serverResult.participant) {
      sessionStorage.setItem(`tempchat_session_${serverResult.room.id}`, JSON.stringify(serverResult.participant));
      return serverResult;
    }

    // 3. FALLBACK LOCAL IN-MEMORY MODE (Node tests / offline)
    cleanupLocalExpired();
    const token = generateRoomToken();
    const sessionToken = generateSessionToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

    const newRoom: Room = {
      id: generateUuid(),
      room_token: token,
      expires_at: expiresAt.toISOString(),
      last_activity_at: now.toISOString(),
      created_at: now.toISOString(),
    };

    const newPart: Participant = {
      id: generateUuid(),
      room_id: newRoom.id,
      nickname: cleanNick,
      session_token: sessionToken,
      joined_at: now.toISOString(),
      last_seen_at: now.toISOString(),
    };

    const rooms = getLocalData<Room>(LOCAL_ROOMS_KEY);
    rooms.push(newRoom);
    setLocalData(LOCAL_ROOMS_KEY, rooms);

    const parts = getLocalData<Participant>(LOCAL_PARTICIPANTS_KEY);
    parts.push(newPart);
    setLocalData(LOCAL_PARTICIPANTS_KEY, parts);

    sessionStorage.setItem(`tempchat_session_${newRoom.id}`, JSON.stringify(newPart));
    return { room: newRoom, participant: newPart };
  }

  /**
   * Find an active room by token
   */
  static async getRoomByToken(token: string): Promise<Room | null> {
    const cleanToken = this.normalizeToken(token);
    if (!cleanToken) return null;

    const supabase = getSupabaseClient();

    // 1. SUPABASE CLOUD
    if (supabase) {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_token', cleanToken)
        .maybeSingle();

      if (error || !data) return null;

      if (new Date(data.expires_at).getTime() <= Date.now()) {
        supabase.from('rooms').delete().eq('id', data.id);
        return null;
      }

      return data as Room;
    }

    // 2. BUILT-IN BACKEND SERVER
    const serverRoom = await fetchServer(`/api/rooms/${cleanToken}`);
    if (serverRoom && serverRoom.id) {
      return serverRoom as Room;
    }

    // 3. LOCAL STORAGE FALLBACK
    cleanupLocalExpired();
    const rooms = getLocalData<Room>(LOCAL_ROOMS_KEY);
    const found = rooms.find(r => r.room_token.toLowerCase() === cleanToken);
    if (!found) return null;

    if (new Date(found.expires_at).getTime() <= Date.now()) {
      cleanupLocalExpired();
      return null;
    }

    return found;
  }

  /**
   * Join an existing active room
   */
  static async joinRoom(roomToken: string, nickname: string): Promise<{ room: Room; participant: Participant }> {
    const cleanNick = sanitizeMessage(nickname).slice(0, 30);
    if (!cleanNick) throw new Error('Nickname is required');

    const cleanToken = this.normalizeToken(roomToken);
    const room = await this.getRoomByToken(cleanToken);
    if (!room) {
      throw new Error('Room expired or not found');
    }

    // Check if we already have a session for this room in sessionStorage
    const saved = sessionStorage.getItem(`tempchat_session_${room.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Participant;
        if (parsed && parsed.room_id === room.id) {
          return { room, participant: parsed };
        }
      } catch {
        // Fresh join
      }
    }

    const supabase = getSupabaseClient();

    // 1. SUPABASE CLOUD
    if (supabase) {
      const sessionToken = generateSessionToken();
      const now = new Date();

      const { data: partData, error: partError } = await supabase
        .from('participants')
        .insert({
          room_id: room.id,
          nickname: cleanNick,
          session_token: sessionToken,
          joined_at: now.toISOString(),
          last_seen_at: now.toISOString(),
        })
        .select()
        .single();

      if (partError || !partData) {
        throw new Error(partError?.message || 'Failed to join room');
      }

      await supabase
        .from('rooms')
        .update({ last_activity_at: now.toISOString() })
        .eq('id', room.id);

      sessionStorage.setItem(`tempchat_session_${room.id}`, JSON.stringify(partData));
      return { room, participant: partData as Participant };
    }

    // 2. BUILT-IN BACKEND SERVER
    const serverResult = await fetchServer(`/api/rooms/${cleanToken}/join`, {
      method: 'POST',
      body: JSON.stringify({ nickname: cleanNick }),
    });

    if (serverResult && serverResult.room && serverResult.participant) {
      sessionStorage.setItem(`tempchat_session_${room.id}`, JSON.stringify(serverResult.participant));
      return serverResult;
    }

    // 3. LOCAL STORAGE FALLBACK
    const sessionToken = generateSessionToken();
    const now = new Date();

    const newPart: Participant = {
      id: generateUuid(),
      room_id: room.id,
      nickname: cleanNick,
      session_token: sessionToken,
      joined_at: now.toISOString(),
      last_seen_at: now.toISOString(),
    };

    const parts = getLocalData<Participant>(LOCAL_PARTICIPANTS_KEY);
    parts.push(newPart);
    setLocalData(LOCAL_PARTICIPANTS_KEY, parts);

    const rooms = getLocalData<Room>(LOCAL_ROOMS_KEY);
    const rIdx = rooms.findIndex(r => r.id === room.id);
    if (rIdx >= 0) {
      rooms[rIdx].last_activity_at = now.toISOString();
      setLocalData(LOCAL_ROOMS_KEY, rooms);
    }

    sessionStorage.setItem(`tempchat_session_${room.id}`, JSON.stringify(newPart));

    if (localBroadcastChannel) {
      localBroadcastChannel.postMessage({
        roomId: room.id,
        type: 'SYSTEM',
        text: `${cleanNick} joined the room`,
      });
    }

    return { room, participant: newPart };
  }

  /**
   * Load existing messages for a room
   */
  static async getMessages(roomId: string): Promise<Message[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(150);

      if (error || !data) return [];
      return data as Message[];
    }

    // Backend server
    const serverMessages = await fetchServer(`/api/rooms/${roomId}/messages`);
    if (Array.isArray(serverMessages)) {
      return serverMessages;
    }

    // Local storage
    const messages = getLocalData<Message>(LOCAL_MESSAGES_KEY);
    return messages.filter(m => m.room_id === roomId);
  }

  /**
   * Send a chat message
   */
  static async sendMessage(
    room: Room,
    participant: Participant,
    content: string
  ): Promise<Message> {
    const cleanContent = sanitizeMessage(content);
    if (!cleanContent) {
      throw new Error('Message cannot be empty');
    }
    if (cleanContent.length > 2000) {
      throw new Error('Message exceeds 2000 characters limit');
    }

    if (new Date(room.expires_at).getTime() <= Date.now()) {
      throw new Error('Room has expired');
    }

    if (!rateLimiter.canSend(participant.id)) {
      throw new Error('Please wait a moment before sending another message');
    }

    const now = new Date();
    const supabase = getSupabaseClient();

    // 1. SUPABASE CLOUD
    if (supabase) {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          room_id: room.id,
          participant_id: participant.id,
          nickname: participant.nickname,
          content: cleanContent,
          created_at: now.toISOString(),
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Failed to send message');
      }

      await supabase
        .from('rooms')
        .update({ last_activity_at: now.toISOString() })
        .eq('id', room.id);

      return data as Message;
    }

    // 2. BUILT-IN BACKEND SERVER
    const serverMsg = await fetchServer(`/api/rooms/${room.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        participantId: participant.id,
        nickname: participant.nickname,
        content: cleanContent,
      }),
    });

    if (serverMsg && serverMsg.id) {
      return serverMsg as Message;
    }

    // 3. LOCAL STORAGE FALLBACK
    const newMsg: Message = {
      id: generateUuid(),
      room_id: room.id,
      participant_id: participant.id,
      nickname: participant.nickname,
      content: cleanContent,
      created_at: now.toISOString(),
    };

    const messages = getLocalData<Message>(LOCAL_MESSAGES_KEY);
    messages.push(newMsg);
    setLocalData(LOCAL_MESSAGES_KEY, messages);

    const rooms = getLocalData<Room>(LOCAL_ROOMS_KEY);
    const rIdx = rooms.findIndex(r => r.id === room.id);
    if (rIdx >= 0) {
      rooms[rIdx].last_activity_at = now.toISOString();
      setLocalData(LOCAL_ROOMS_KEY, rooms);
    }

    if (localBroadcastChannel) {
      localBroadcastChannel.postMessage({
        roomId: room.id,
        type: 'MESSAGE',
        message: newMsg,
      });
    }

    return newMsg;
  }

  /**
   * Subscribe to real-time room events (messages, presence, typing, expiry)
   */
  static subscribeToRoom(
    room: Room,
    participant: Participant,
    callbacks: RoomCallbacks
  ): () => void {
    const supabase = getSupabaseClient();

    const checkExpiration = () => {
      if (new Date(room.expires_at).getTime() <= Date.now()) {
        callbacks.onRoomExpired();
      }
    };
    const expiryInterval = setInterval(checkExpiration, 1000);

    // 1. SUPABASE REALTIME
    if (supabase) {
      let presenceChannel: RealtimeChannel | null = null;

      try {
        presenceChannel = supabase.channel(`tempchat:${room.id}`, {
          config: {
            presence: { key: participant.id },
            broadcast: { self: false },
          },
        });

        presenceChannel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `room_id=eq.${room.id}`,
          },
          (payload) => {
            if (payload.new) {
              callbacks.onMessage(payload.new as Message);
            }
          }
        );

        presenceChannel.on('broadcast', { event: 'typing' }, (event) => {
          if (event.payload) {
            callbacks.onTyping(event.payload.typingUsers || []);
          }
        });

        presenceChannel.on('presence', { event: 'sync' }, () => {
          if (!presenceChannel) return;
          const state = presenceChannel.presenceState();
          const onlineList: { id: string; nickname: string }[] = [];
          Object.values(state).forEach((presences: any) => {
            presences.forEach((p: any) => {
              if (p && p.participantId && p.nickname) {
                onlineList.push({ id: p.participantId, nickname: p.nickname });
              }
            });
          });
          callbacks.onParticipantsUpdate(onlineList);
        });

        presenceChannel.on('presence', { event: 'join' }, ({ newPresences }) => {
          newPresences.forEach((p: any) => {
            if (p.participantId !== participant.id) {
              callbacks.onSystemEvent(`${p.nickname || 'Someone'} joined the room`);
            }
          });
        });

        presenceChannel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
          leftPresences.forEach((p: any) => {
            if (p.participantId !== participant.id) {
              callbacks.onSystemEvent(`${p.nickname || 'Someone'} left the room`);
            }
          });
        });

        presenceChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && presenceChannel) {
            await presenceChannel.track({
              participantId: participant.id,
              nickname: participant.nickname,
              onlineAt: new Date().toISOString(),
            });
          }
        });
        activeSupabaseChannels.set(room.id, presenceChannel);
      } catch (err) {
        console.error('Error establishing Supabase Realtime channel:', err);
      }

      return () => {
        clearInterval(expiryInterval);
        activeSupabaseChannels.delete(room.id);
        if (presenceChannel && supabase) {
          presenceChannel.untrack();
          supabase.removeChannel(presenceChannel);
        }
      };
    }

    // 2. BUILT-IN SERVER WEBSOCKET (Multi-device, phone, tablet & cross-browser real-time sync)
    let ws: WebSocket | null = null;
    if (typeof window !== 'undefined' && 'WebSocket' in window && window.location && window.location.host) {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/tempchat-ws?roomId=${room.id}&participantId=${participant.id}&nickname=${encodeURIComponent(participant.nickname)}`;
        ws = new WebSocket(wsUrl);
        activeWebSockets.set(room.id, ws);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'MESSAGE' && data.message) {
              callbacks.onMessage(data.message);
            } else if (data.type === 'SYSTEM' && data.text) {
              callbacks.onSystemEvent(data.text);
            } else if (data.type === 'PARTICIPANTS' && data.participants) {
              callbacks.onParticipantsUpdate(data.participants);
            } else if (data.type === 'TYPING' && data.typingUsers) {
              callbacks.onTyping(data.typingUsers);
            } else if (data.type === 'EXPIRED') {
              callbacks.onRoomExpired();
            }
          } catch {
            // Ignore malformed
          }
        };
      } catch (err) {
        console.warn('WebSocket connection fallback:', err);
      }
    }

    // 3. ALSO REGISTER IN LOCAL BROADCAST CHANNEL (For multi-tab on same browser & Node test suite)
    if (!activeLocalSubscriptions.has(room.id)) {
      activeLocalSubscriptions.set(room.id, new Set());
    }
    const roomSubs = activeLocalSubscriptions.get(room.id)!;
    roomSubs.add(callbacks);

    const parts = getLocalData<Participant>(LOCAL_PARTICIPANTS_KEY).filter(
      p => p.room_id === room.id
    );
    if (parts.length > 0) {
      callbacks.onParticipantsUpdate(parts.map(p => ({ id: p.id, nickname: p.nickname })));
    }

    if (localBroadcastChannel) {
      localBroadcastChannel.postMessage({
        roomId: room.id,
        type: 'PARTICIPANTS',
        participants: parts.map(p => ({ id: p.id, nickname: p.nickname })),
      });
    }

    return () => {
      clearInterval(expiryInterval);
      if (ws) {
        ws.close();
        activeWebSockets.delete(room.id);
      }
      roomSubs.delete(callbacks);
      if (roomSubs.size === 0) {
        activeLocalSubscriptions.delete(room.id);
      }
    };
  }

  /**
   * Broadcast typing status to the room
   */
  static sendTyping(
    room: Room,
    participant: Participant,
    isTyping: boolean
  ): void {
    const supabase = getSupabaseClient();

    if (supabase) {
      const channel = activeSupabaseChannels.get(room.id) || supabase.channel(`tempchat:${room.id}`);
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          typingUsers: isTyping
            ? [{ participantId: participant.id, nickname: participant.nickname, lastTypingAt: Date.now() }]
            : [],
        },
      });
      return;
    }

    const typingUsers = isTyping
      ? [{ participantId: participant.id, nickname: participant.nickname, lastTypingAt: Date.now() }]
      : [];

    // Send over WebSocket to other devices and browsers
    const ws = activeWebSockets.get(room.id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'TYPING', typingUsers }));
    }

    // Local broadcast channel
    if (!activeLocalTyping.has(room.id)) {
      activeLocalTyping.set(room.id, new Map());
    }
    const roomTyping = activeLocalTyping.get(room.id)!;

    if (isTyping) {
      roomTyping.set(participant.id, {
        participantId: participant.id,
        nickname: participant.nickname,
        lastTypingAt: Date.now(),
      });
    } else {
      roomTyping.delete(participant.id);
    }

    const typingArray = Array.from(roomTyping.values());

    if (localBroadcastChannel) {
      localBroadcastChannel.postMessage({
        roomId: room.id,
        type: 'TYPING',
        typingUsers: typingArray,
      });
    }

    const listeners = activeLocalSubscriptions.get(room.id);
    if (listeners) {
      listeners.forEach(cb => cb.onTyping(typingArray));
    }
  }

  /**
   * Leave a chat room
   */
  static async leaveRoom(room: Room, participant: Participant): Promise<void> {
    sessionStorage.removeItem(`tempchat_session_${room.id}`);
    const supabase = getSupabaseClient();

    if (supabase) {
      await supabase
        .from('participants')
        .delete()
        .eq('id', participant.id);
      return;
    }

    // Notify backend server
    await fetchServer(`/api/rooms/${room.id}/leave`, {
      method: 'POST',
      body: JSON.stringify({ participantId: participant.id, nickname: participant.nickname }),
    });

    // Local storage cleanup
    const parts = getLocalData<Participant>(LOCAL_PARTICIPANTS_KEY).filter(
      p => p.id !== participant.id
    );
    setLocalData(LOCAL_PARTICIPANTS_KEY, parts);

    if (localBroadcastChannel) {
      localBroadcastChannel.postMessage({
        roomId: room.id,
        type: 'SYSTEM',
        text: `${participant.nickname} left the room`,
      });

      localBroadcastChannel.postMessage({
        roomId: room.id,
        type: 'PARTICIPANTS',
        participants: parts.filter(p => p.room_id === room.id).map(p => ({ id: p.id, nickname: p.nickname })),
      });
    }
  }

  /**
   * Delete room and all its records immediately
   */
  static async destroyRoom(room: Room): Promise<void> {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('rooms').delete().eq('id', room.id);
      return;
    }

    // Backend server destroy
    await fetchServer(`/api/rooms/${room.id}`, { method: 'DELETE' });

    // Local cleanup
    const rooms = getLocalData<Room>(LOCAL_ROOMS_KEY).filter(r => r.id !== room.id);
    setLocalData(LOCAL_ROOMS_KEY, rooms);

    const parts = getLocalData<Participant>(LOCAL_PARTICIPANTS_KEY).filter(p => p.room_id !== room.id);
    setLocalData(LOCAL_PARTICIPANTS_KEY, parts);

    const msgs = getLocalData<Message>(LOCAL_MESSAGES_KEY).filter(m => m.room_id !== room.id);
    setLocalData(LOCAL_MESSAGES_KEY, msgs);

    if (localBroadcastChannel) {
      localBroadcastChannel.postMessage({
        roomId: room.id,
        type: 'EXPIRED',
      });
    }
  }
}

export type RoomCallbacks = RoomSubscriptionCallbacks;
