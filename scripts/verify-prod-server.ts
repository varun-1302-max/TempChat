import { WebSocket } from 'ws';

const PORT = Number(process.env.PORT) || 3847;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}`;

async function verify() {
  console.log('====================================================');
  console.log(`🧪 Verifying TempChat Production Server on port ${PORT}`);
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, name: string) {
    if (cond) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}`);
      failed++;
    }
  }

  // 1. Verify Root HTML
  console.log('1. Testing HTTP Server & SPA HTML Delivery...');
  const rootRes = await fetch(`${BASE_URL}/`);
  assert(rootRes.status === 200, 'GET / returned HTTP 200 OK');
  const rootHtml = await rootRes.text();
  assert(rootHtml.includes('<div id="root"></div>'), 'GET / delivers React SPA root container');
  assert(rootHtml.includes('TempChat'), 'GET / delivers TempChat HTML document');

  // 2. Testing SPA route fallback
  const spaRes = await fetch(`${BASE_URL}/room/tc-demo-test`);
  assert(spaRes.status === 200, 'GET /room/:token falls back to index.html (SPA routing)');

  // 3. Testing POST /api/rooms
  console.log('\n2. Testing REST API Endpoints...');
  const createRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: 'Alice', durationMinutes: 30 }),
  });
  assert(createRes.status === 201, 'POST /api/rooms returned HTTP 201 Created');
  const createData = await createRes.json();
  assert(createData.room && createData.room.room_token.startsWith('tc-'), `Room token generated: ${createData.room?.room_token}`);
  assert(createData.participant && createData.participant.nickname === 'Alice', 'Creator participant registered');

  const room = createData.room;
  const alice = createData.participant;

  // 4. Testing GET /api/rooms/:token
  const getRoomRes = await fetch(`${BASE_URL}/api/rooms/${room.room_token}`);
  assert(getRoomRes.status === 200, `GET /api/rooms/${room.room_token} successfully resolved room`);

  // 5. Testing POST /api/rooms/:token/join
  const joinRes = await fetch(`${BASE_URL}/api/rooms/${room.room_token}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: 'Bob' }),
  });
  assert(joinRes.status === 200, 'POST /api/rooms/:token/join registered Bob');
  const joinData = await joinRes.json();
  const bob = joinData.participant;

  // 6. Testing WebSocket Realtime Connection
  console.log('\n3. Testing WebSocket Real-Time Endpoint (/tempchat-ws)...');
  const wsAlice = new WebSocket(`${WS_URL}/tempchat-ws?roomId=${room.id}&participantId=${alice.id}&nickname=Alice`);
  const wsBob = new WebSocket(`${WS_URL}/tempchat-ws?roomId=${room.id}&participantId=${bob.id}&nickname=Bob`);

  let aliceWsOpened = false;
  let bobWsOpened = false;
  let bobReceivedMessage: any = null;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket connection timed out')), 5000);

    wsAlice.on('open', () => {
      aliceWsOpened = true;
      if (bobWsOpened) {
        clearTimeout(timeout);
        resolve();
      }
    });

    wsBob.on('open', () => {
      bobWsOpened = true;
      if (aliceWsOpened) {
        clearTimeout(timeout);
        resolve();
      }
    });

    wsBob.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'MESSAGE') {
          bobReceivedMessage = data.message;
        }
      } catch {}
    });
  });

  assert(aliceWsOpened && bobWsOpened, 'Both Alice and Bob WebSockets connected successfully');

  // 7. Testing Real-time Message broadcast via POST /api/rooms/:id/messages
  console.log('\n4. Testing Real-Time Message Synchronization...');
  const msgRes = await fetch(`${BASE_URL}/api/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      participantId: alice.id,
      nickname: alice.nickname,
      content: 'Hello Bob via production server!',
    }),
  });
  assert(msgRes.status === 201, 'Alice posted message via REST API');

  // Wait for WebSocket delivery
  await new Promise((r) => setTimeout(r, 100));

  assert(
    bobReceivedMessage !== null && bobReceivedMessage.content === 'Hello Bob via production server!',
    'Bob received Alice message in real time via /tempchat-ws WebSocket'
  );

  // Clean up
  wsAlice.close();
  wsBob.close();

  console.log('\n====================================================');
  console.log(`📊 Production Server Verification: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

verify().catch((err) => {
  console.error('❌ Verification failed with error:', err);
  process.exit(1);
});
