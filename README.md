# TempChat — Ephemeral Real-Time Private Messaging

> **"Chat privately. Leave no history."**

TempChat is a modern, privacy-first temporary messaging web platform. Users can instantly generate a disposable private chat room without creating an account. The room produces a unique, cryptographically random shareable link/code. Anyone with the link can join and chat in real time. When the room reaches its expiration or is closed, all messages and session records are permanently deleted.

---

## 🚀 Key Features

* **Zero Accounts & Zero Footprint**: No emails, passwords, phone numbers, or user profiles stored.
* **Cryptographically Unpredictable Room Codes**: Secure non-sequential identifiers (e.g. `tc-a4b2-9x1z`).
* **Configurable Expiration**: Choose between **10 minutes**, **1 hour**, **6 hours**, or **24 hours** lifetimes.
* **Live Self-Destruct Countdown**: Real-time countdown timer with urgency styling and automatic cleanup.
* **Real-Time Multi-Tab & Multi-Client Sync**: Messages, participants, system join/leave events, and typing status stream in sub-second latency.
* **Dual Realtime Engine**:
  1. **Supabase Cloud Engine**: PostgreSQL with Row Level Security (RLS), Supabase Realtime publication & presence.
  2. **Zero-Config Local Multi-Tab Engine**: Uses the native Web standard `BroadcastChannel` API and cross-tab storage for instantaneous testing across browser tabs/windows without credentials.
* **Security & Hardening**:
  * Row Level Security (RLS) on `rooms`, `participants`, and `messages`.
  * Cascading deletes (`ON DELETE CASCADE`) ensuring no orphan records remain.
  * Anti-spam rate limiter (5 messages / 3s).
  * HTML sanitization preventing XSS attacks.
  * Participant session tokens preventing identity spoofing.
* **Shareable QR Code & One-Click Link Copying**: Built-in SVG QR code generator for rapid mobile device pairing.
* **Subtle Audio Feedback**: Synthesized Web Audio API sound cues for sent/received messages and joins (with mute toggle).
* **Responsive Dark & Light Mode**: Tailored for both desktop and mobile viewports.

---

## 🛠️ Tech Stack

* **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Vite
* **Database & Realtime**: Supabase (PostgreSQL, Realtime, Presence, Stored Procedures, RLS)
* **Testing**: Automated end-to-end multi-client test suite (`scripts/verify-tempchat.ts`)

---

## ⚡ Quick Start

### 1. Start Dev Server
```bash
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 2. Multi-Tab Testing (Out of the Box)
1. Open [http://localhost:5173](http://localhost:5173) in **Tab 1**.
2. Enter nickname "Alice", select an expiration (e.g. 10 Minutes), and click **Create Chat**.
3. Click **Copy Invite Link** (or copy the room code `tc-xxxx-xxxx`).
4. Open **Tab 2** with the invite link.
5. Enter nickname "Bob" and click **Join Chat**.
6. Type in either tab — messages, presence counts, join notifications, and typing indicators appear instantly in both tabs!

---

## ☁️ Supabase Cloud Integration

To connect your own Supabase project:

1. Create a project at [supabase.com](https://supabase.com).
2. Run the SQL schema located in `supabase/schema.sql` inside your **Supabase SQL Editor**.
3. Create a `.env` file in the project root:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```
   *(Alternatively, click the **Supabase / Realtime** pill in the top navigation bar of the running app to enter and test your project credentials directly without restarting).*

---

## 🧪 Automated Test Suite

Run the full end-to-end multi-user real-time test suite:
```bash
npm run test:e2e
# or:
npx tsx scripts/verify-tempchat.ts
```

All 22 core assertions covering room creation, link joining, real-time message sync, presence, rate limiting, and cascade destruction are verified.
