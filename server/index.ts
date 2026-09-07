import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

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

export interface TypingUser {
  participantId: string;
  nickname: string;
  lastTypingAt: number;
}

interface RoomStore {
  room: Room;
  participants: Map<string, Participant>;
  messages: Message[];
  typingUsers: Map<string, TypingUser>;
}

interface SocketClient {
  ws: WebSocket;
  participantId: string;
  nickname: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// In compiled dist-server/index.js, DIST_DIR is ../dist
// When running from root or dist-server, fallback cleanly
const DIST_DIR = fs.existsSync(path.resolve(__dirname, '../dist'))
  ? path.resolve(__dirname, '../dist')
  : path.resolve(process.cwd(), 'dist');

// In-memory room store for ephemeral multi-device real-time chat
const rooms = new Map<string, RoomStore>();
const socketsByRoom = new Map<string, Set<SocketClient>>();

// Periodic cleanup of expired rooms every 2 seconds
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, store] of rooms.entries()) {
    if (new Date(store.room.expires_at).getTime() <= now) {
      broadcastToRoom(id, { type: 'EXPIRED', roomId: id });
      rooms.delete(id);
      socketsByRoom.delete(id);
    }
  }
}, 2000);
cleanupTimer.unref();

function broadcastToRoom(roomId: string, data: unknown, excludeWs?: WebSocket): void {
  const list = socketsByRoom.get(roomId);
  if (!list) return;
  const payload = JSON.stringify(data);
  for (const client of list) {
    if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

function normalizeServerToken(raw: string): string {
  let t = (raw || '').trim().toLowerCase();
  if (t.includes('room=')) {
    const match = t.match(/room=([a-z0-9_-]+)/i);
    if (match) t = match[1].toLowerCase();
  }
  t = t.replace(/[^a-z0-9_-]/g, '');
  if (!t.startsWith('tc-')) {
    const cleanChars = t.replace(/[^a-z0-9]/g, '');
    if (cleanChars.length === 8) {
      return `tc-${cleanChars.slice(0, 4)}-${cleanChars.slice(4)}`;
    }
  }
  return t;
}

function generateToken(): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz';
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 4; i++) p1 += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 4; i++) p2 += chars[Math.floor(Math.random() * chars.length)];
  return `tc-${p1}-${p2}`;
}

function parseJsonBody(req: http.IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(data));
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

// Create Production HTTP Server
export const server = http.createServer(async (req, res) => {
  const url = req.url || '';

  // CORS preflight
  if (req.method === 'OPTIONS' && url.startsWith('/api/')) {
    sendJson(res, 204, {});
    return;
  }

  // --- REST API ENDPOINTS ---

  // CREATE ROOM: POST /api/rooms
  if (req.method === 'POST' && url === '/api/rooms') {
    const body = await parseJsonBody(req);
    const nickname = (body.nickname || '').trim().slice(0, 30);
    const duration = Number(body.durationMinutes) || 60;

    if (!nickname) {
      sendJson(res, 400, { error: 'Nickname is required' });
      return;
    }

    const id = crypto.randomUUID();
    const token = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + duration * 60 * 1000);

    const room: Room = {
      id,
      room_token: token,
      expires_at: expiresAt.toISOString(),
      last_activity_at: now.toISOString(),
      created_at: now.toISOString(),
    };

    const participant: Participant = {
      id: crypto.randomUUID(),
      room_id: id,
      nickname,
      session_token: crypto.randomUUID(),
      joined_at: now.toISOString(),
      last_seen_at: now.toISOString(),
    };

    const store: RoomStore = {
      room,
      participants: new Map([[participant.id, participant]]),
      messages: [],
      typingUsers: new Map(),
    };

    rooms.set(id, store);
    sendJson(res, 201, { room, participant });
    return;
  }

  // GET ROOM BY TOKEN: GET /api/rooms/:token
  if (
    req.method === 'GET' &&
    url.startsWith('/api/rooms/') &&
    !url.includes('/messages') &&
    !url.includes('/join') &&
    !url.includes('/leave')
  ) {
    const token = normalizeServerToken(url.replace('/api/rooms/', '').split('?')[0]);

    for (const store of rooms.values()) {
      if (store.room.room_token.toLowerCase() === token) {
        if (new Date(store.room.expires_at).getTime() <= Date.now()) {
          rooms.delete(store.room.id);
          sendJson(res, 404, { error: 'Room has expired' });
          return;
        }
        sendJson(res, 200, store.room);
        return;
      }
    }

    sendJson(res, 404, { error: 'Room not found or expired' });
    return;
  }

  // JOIN ROOM: POST /api/rooms/:token/join
  if (req.method === 'POST' && url.includes('/join')) {
    const token = normalizeServerToken(url.replace('/api/rooms/', '').replace('/join', '').split('?')[0]);
    const body = await parseJsonBody(req);
    const nickname = (body.nickname || '').trim().slice(0, 30);

    if (!nickname) {
      sendJson(res, 400, { error: 'Nickname is required' });
      return;
    }

    let targetStore: RoomStore | null = null;
    for (const store of rooms.values()) {
      if (store.room.room_token.toLowerCase() === token) {
        targetStore = store;
        break;
      }
    }

    if (!targetStore || new Date(targetStore.room.expires_at).getTime() <= Date.now()) {
      sendJson(res, 404, { error: 'Room expired or not found' });
      return;
    }

    const now = new Date();
    const participant: Participant = {
      id: crypto.randomUUID(),
      room_id: targetStore.room.id,
      nickname,
      session_token: crypto.randomUUID(),
      joined_at: now.toISOString(),
      last_seen_at: now.toISOString(),
    };

    targetStore.participants.set(participant.id, participant);
    targetStore.room.last_activity_at = now.toISOString();

    broadcastToRoom(targetStore.room.id, {
      type: 'SYSTEM',
      roomId: targetStore.room.id,
      text: `${nickname} joined the room`,
    });

    broadcastToRoom(targetStore.room.id, {
      type: 'PARTICIPANTS',
      roomId: targetStore.room.id,
      participants: Array.from(targetStore.participants.values()).map((p) => ({
        id: p.id,
        nickname: p.nickname,
      })),
    });

    sendJson(res, 200, { room: targetStore.room, participant });
    return;
  }

  // GET MESSAGES: GET /api/rooms/:roomId/messages
  if (req.method === 'GET' && url.includes('/messages')) {
    const roomId = url.replace('/api/rooms/', '').replace('/messages', '').split('?')[0];
    const store = rooms.get(roomId);

    if (!store || new Date(store.room.expires_at).getTime() <= Date.now()) {
      sendJson(res, 200, []);
      return;
    }

    sendJson(res, 200, store.messages);
    return;
  }

  // POST MESSAGE: POST /api/rooms/:roomId/messages
  if (req.method === 'POST' && url.includes('/messages')) {
    const roomId = url.replace('/api/rooms/', '').replace('/messages', '').split('?')[0];
    const store = rooms.get(roomId);

    if (!store || new Date(store.room.expires_at).getTime() <= Date.now()) {
      sendJson(res, 404, { error: 'Room expired or not found' });
      return;
    }

    const body = await parseJsonBody(req);
    const content = (body.content || '').trim().slice(0, 2000);
    const participantId = body.participantId;
    const nickname = body.nickname || 'Anonymous';

    if (!content) {
      sendJson(res, 400, { error: 'Message cannot be empty' });
      return;
    }

    const now = new Date();
    const message: Message = {
      id: crypto.randomUUID(),
      room_id: roomId,
      participant_id: participantId,
      nickname,
      content,
      created_at: now.toISOString(),
    };

    store.messages.push(message);
    store.room.last_activity_at = now.toISOString();

    broadcastToRoom(roomId, {
      type: 'MESSAGE',
      roomId,
      message,
    });

    sendJson(res, 201, message);
    return;
  }

  // LEAVE ROOM: POST /api/rooms/:roomId/leave
  if (req.method === 'POST' && url.includes('/leave')) {
    const roomId = url.replace('/api/rooms/', '').replace('/leave', '').split('?')[0];
    const body = await parseJsonBody(req);
    const participantId = body.participantId;
    const nickname = body.nickname;

    const store = rooms.get(roomId);
    if (store) {
      store.participants.delete(participantId);

      broadcastToRoom(roomId, {
        type: 'SYSTEM',
        roomId,
        text: `${nickname || 'Someone'} left the room`,
      });

      broadcastToRoom(roomId, {
        type: 'PARTICIPANTS',
        roomId,
        participants: Array.from(store.participants.values()).map((p) => ({
          id: p.id,
          nickname: p.nickname,
        })),
      });
    }

    sendJson(res, 200, { success: true });
    return;
  }

  // DESTROY ROOM: DELETE /api/rooms/:roomId
  if (req.method === 'DELETE' && url.startsWith('/api/rooms/')) {
    const roomId = url.replace('/api/rooms/', '').split('?')[0];
    broadcastToRoom(roomId, { type: 'EXPIRED', roomId });
    rooms.delete(roomId);
    socketsByRoom.delete(roomId);
    sendJson(res, 200, { success: true });
    return;
  }

  // --- STATIC FILE SERVING FOR PRODUCTION SPA ---
  const parsedPath = url.split('?')[0];
  const filePath = path.join(DIST_DIR, parsedPath === '/' ? 'index.html' : parsedPath);

  // Serve static file if it exists
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('Content-Type', mimeType);
    if (ext !== '.html') {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Fallback to dist/index.html for client-side SPA routing
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    fs.createReadStream(indexPath).pipe(res);
    return;
  }

  res.statusCode = 404;
  res.end('Not found');
});

// Setup WebSocket Server for Real-Time Multi-Device Sync
export const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const hostHeader = req.headers.host || 'localhost';
  const parsedUrl = new URL(req.url || '', `http://${hostHeader}`);

  if (parsedUrl.pathname === '/tempchat-ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  const hostHeader = req.headers.host || 'localhost';
  const parsedUrl = new URL(req.url || '', `http://${hostHeader}`);
  const roomId = parsedUrl.searchParams.get('roomId') || '';
  const participantId = parsedUrl.searchParams.get('participantId') || '';
  const nickname = parsedUrl.searchParams.get('nickname') || '';

  if (!roomId) {
    ws.close();
    return;
  }

  if (!socketsByRoom.has(roomId)) {
    socketsByRoom.set(roomId, new Set());
  }
  const roomSockets = socketsByRoom.get(roomId)!;
  const clientEntry: SocketClient = { ws, participantId, nickname };
  roomSockets.add(clientEntry);

  // Send initial active participants list
  const store = rooms.get(roomId);
  if (store) {
    const online = Array.from(store.participants.values()).map((p) => ({
      id: p.id,
      nickname: p.nickname,
    }));
    ws.send(JSON.stringify({ type: 'PARTICIPANTS', roomId, participants: online }));
  }

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'TYPING') {
        broadcastToRoom(
          roomId,
          {
            type: 'TYPING',
            roomId,
            typingUsers: data.typingUsers || [],
          },
          ws
        );
      }
    } catch {
      // Ignore malformed JSON
    }
  });

  ws.on('close', () => {
    roomSockets.delete(clientEntry);
    if (roomSockets.size === 0) {
      socketsByRoom.delete(roomId);
    }
  });
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`🚀 TempChat Production Server listening on http://${HOST}:${PORT}`);
});
