/**
 * Verification test suite for TempChat Core Engine & Real-Time Functionality
 */

// Polyfill minimal browser globals for Node.js test execution
class StorageMock {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.get(key) || null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}

const mockLocalStorage = new StorageMock();
let currentTabSessionStorage = new StorageMock();

(globalThis as any).window = globalThis;
(globalThis as any).localStorage = mockLocalStorage;
Object.defineProperty(globalThis, 'sessionStorage', {
  get: () => currentTabSessionStorage,
  configurable: true,
});

// Polyfill standard BroadcastChannel for cross-tab multi-client communication
class NodeBroadcastChannel {
  name: string;
  onmessage: ((event: { data: any }) => void) | null = null;
  private static registry = new Map<string, Set<NodeBroadcastChannel>>();

  constructor(name: string) {
    this.name = name;
    if (!NodeBroadcastChannel.registry.has(name)) {
      NodeBroadcastChannel.registry.set(name, new Set());
    }
    NodeBroadcastChannel.registry.get(name)!.add(this);
  }

  postMessage(data: any) {
    const list = NodeBroadcastChannel.registry.get(this.name);
    if (!list) return;
    for (const target of list) {
      if (target.onmessage) {
        // BroadcastChannel delivers asynchronously in event loop
        setTimeout(() => target.onmessage!({ data }), 0);
      }
    }
  }

  close() {
    NodeBroadcastChannel.registry.get(this.name)?.delete(this);
  }
}

(globalThis as any).BroadcastChannel = NodeBroadcastChannel;

async function runTests() {
  // Dynamically import chatService after globals are ready
  const { ChatService } = await import('../src/services/chatService.ts');
  const { generateRoomToken, formatTimeRemaining, sanitizeMessage } = await import('../src/services/crypto.ts');

  console.log('==============================================');
  console.log('🧪 Starting TempChat Core Engine Tests');
  console.log('==============================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // 1. Room Token Generation
  const token = generateRoomToken();
  assert(token.startsWith('tc-') && token.length === 12, `Room token format valid: ${token}`);

  // 2. Message Sanitization & Normalization
  const clean = sanitizeMessage('  \u0000Hello world! <3  ');
  assert(clean === 'Hello world! <3', 'Control characters stripped and whitespace trimmed');

  // Token Normalization
  assert(
    ChatService.normalizeToken('http://localhost:5173/?room=tc-a4b2-9x1z') === 'tc-a4b2-9x1z',
    'Full URL normalized to room token'
  );
  assert(
    ChatService.normalizeToken('  #TC-A4B2-9X1Z  ') === 'tc-a4b2-9x1z',
    'Hash and uppercase normalized to lowercase room token'
  );

  // 3. Countdown Formatter
  const timer1 = formatTimeRemaining(10 * 60 * 1000); // 10 minutes
  assert(timer1.formatted === '10:00' && !timer1.isUrgent && !timer1.isExpired, `Timer 10m: ${timer1.formatted}`);

  const timer2 = formatTimeRemaining(45 * 1000); // 45 seconds (urgent)
  assert(timer2.formatted === '00:45' && timer2.isUrgent && !timer2.isExpired, `Timer urgent: ${timer2.formatted}`);

  const timer3 = formatTimeRemaining(-100); // Expired
  assert(timer3.isExpired, 'Timer correctly detects expired state');

  // --- TAB 1: Alice creates room ---
  console.log('\n--- [Tab 1: Alice] Room Creation ---');
  const aliceSessionStorage = new StorageMock();
  currentTabSessionStorage = aliceSessionStorage;

  const { room, participant: alice } = await ChatService.createRoom('Alice', 10);
  assert(room.room_token.startsWith('tc-'), `Created room token: ${room.room_token}`);
  assert(alice.nickname === 'Alice', 'Creator registered as Alice');

  // Alice subscribes to room events
  let aliceReceivedMessages: any[] = [];
  let aliceSystemEvents: string[] = [];
  const unsubAlice = ChatService.subscribeToRoom(room, alice, {
    onMessage: (msg) => aliceReceivedMessages.push(msg),
    onParticipantsUpdate: () => {},
    onSystemEvent: (text) => aliceSystemEvents.push(text),
    onTyping: () => {},
    onRoomExpired: () => {},
  });

  // Verify room lookup
  const foundRoom = await ChatService.getRoomByToken(room.room_token);
  assert(foundRoom !== null && foundRoom.id === room.id, 'Room successfully resolved by token');

  // --- TAB 2: Bob opens invite link ---
  console.log('\n--- [Tab 2: Bob] Joins via Invite Link ---');
  const bobSessionStorage = new StorageMock();
  currentTabSessionStorage = bobSessionStorage;

  const { participant: bob } = await ChatService.joinRoom(room.room_token, 'Bob');
  assert(bob.nickname === 'Bob' && bob.id !== alice.id, 'Bob joined room with unique participant ID');

  // Bob subscribes to room events
  let bobReceivedMessages: any[] = [];
  let bobSystemEvents: string[] = [];
  const unsubBob = ChatService.subscribeToRoom(room, bob, {
    onMessage: (msg) => bobReceivedMessages.push(msg),
    onParticipantsUpdate: () => {},
    onSystemEvent: (text) => bobSystemEvents.push(text),
    onTyping: () => {},
    onRoomExpired: () => {},
  });

  // Wait 20ms for event loop broadcast delivery
  await new Promise(r => setTimeout(r, 25));
  assert(aliceSystemEvents.some(e => e.includes('Bob joined')), 'Alice notified that Bob joined the room');

  // --- TAB 1: Alice sends message to Bob ---
  console.log('\n--- Testing Real-Time Messaging Sync ---');
  currentTabSessionStorage = aliceSessionStorage;
  const msg1 = await ChatService.sendMessage(room, alice, 'Hello Bob! Welcome to TempChat.');
  assert(msg1.content === 'Hello Bob! Welcome to TempChat.', 'Message sent by Alice');

  await new Promise(r => setTimeout(r, 25));
  assert(
    bobReceivedMessages.some(m => m.content.includes('Hello Bob')),
    'Bob received Alice\'s message in real time'
  );

  // --- TAB 2: Bob replies to Alice ---
  currentTabSessionStorage = bobSessionStorage;
  const msg2 = await ChatService.sendMessage(room, bob, 'Hey Alice! Real-time sync works instantly.');
  assert(msg2.content === 'Hey Alice! Real-time sync works instantly.', 'Message sent by Bob');

  await new Promise(r => setTimeout(r, 25));
  assert(
    aliceReceivedMessages.some(m => m.content.includes('Real-time sync')),
    'Alice received Bob\'s reply in real time'
  );

  // --- Room History ---
  const history = await ChatService.getMessages(room.id);
  assert(history.length === 2, `Room message history contains ${history.length} messages`);

  // --- Rate Limiting Test ---
  console.log('\n--- Testing Rate Limiting & Security ---');
  let rateLimitHit = false;
  try {
    for (let i = 0; i < 7; i++) {
      await ChatService.sendMessage(room, alice, `Spam test ${i}`);
    }
  } catch (err: any) {
    if (err.message.includes('wait a moment before sending')) {
      rateLimitHit = true;
    }
  }
  assert(rateLimitHit, 'Rate limiter prevented rapid message spam');

  // Empty Message Validation
  let emptyRejected = false;
  try {
    await ChatService.sendMessage(room, alice, '    ');
  } catch {
    emptyRejected = true;
  }
  assert(emptyRejected, 'Empty message rejected');

  // --- TAB 2: Bob leaves room ---
  console.log('\n--- Testing Room Leave & Auto-Destruction ---');
  currentTabSessionStorage = bobSessionStorage;
  await ChatService.leaveRoom(room, bob);

  await new Promise(r => setTimeout(r, 25));
  assert(aliceSystemEvents.some(e => e.includes('Bob left')), 'Alice notified that Bob left the room');

  // Destroy / Expire Room
  await ChatService.destroyRoom(room);
  const afterDestroy = await ChatService.getRoomByToken(room.room_token);
  assert(afterDestroy === null, 'Room and records permanently purged upon destruction');

  const historyAfterDestroy = await ChatService.getMessages(room.id);
  assert(historyAfterDestroy.length === 0, 'All room messages permanently erased');

  // Unauthorized & Expired Room Tests
  console.log('\n--- Testing Unauthorized & Expired Room Access ---');
  const fakeTokenLookup = await ChatService.getRoomByToken('tc-fake-token');
  assert(fakeTokenLookup === null, 'Non-existent room token safely returns null');

  let fakeJoinFailed = false;
  try {
    await ChatService.joinRoom('tc-fake-token', 'Eve');
  } catch (err: any) {
    if (err.message.includes('expired or not found')) {
      fakeJoinFailed = true;
    }
  }
  assert(fakeJoinFailed, 'Unauthorized join to fake room blocked with expired/not found');

  // Clean subscriptions
  unsubBob();
  unsubAlice();

  console.log('\n==============================================');
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('==============================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
