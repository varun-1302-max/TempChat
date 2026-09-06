-- ==============================================================================
-- TempChat Supabase Database Schema
-- Ephemeral, Secure, Self-Cleaning Real-Time Temporary Messaging
-- ==============================================================================

-- 1. Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Clean up any existing tables (for fresh setup)
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.participants CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;

-- 3. Create 'rooms' table
CREATE TABLE public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast token lookups and expiration scanning
CREATE INDEX idx_rooms_token ON public.rooms(room_token);
CREATE INDEX idx_rooms_expires_at ON public.rooms(expires_at);

-- 4. Create 'participants' table
CREATE TABLE public.participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    nickname VARCHAR(50) NOT NULL,
    session_token TEXT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_participants_room_id ON public.participants(room_id);
CREATE INDEX idx_participants_session ON public.participants(session_token);

-- 5. Create 'messages' table
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE,
    nickname VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_room_id ON public.messages(room_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 7. Row Level Security Policies

-- ROOMS POLICIES
-- Anyone can view an active (non-expired) room if they know the room_token
CREATE POLICY "Allow view non-expired rooms" ON public.rooms
    FOR SELECT
    USING (expires_at > now());

-- Anyone can insert a new room
CREATE POLICY "Allow create room" ON public.rooms
    FOR INSERT
    WITH CHECK (expires_at > now());

-- Allow update of last_activity_at for active rooms
CREATE POLICY "Allow update active room activity" ON public.rooms
    FOR UPDATE
    USING (expires_at > now())
    WITH CHECK (expires_at > now());

-- Allow deletion when expiring or manual leave
CREATE POLICY "Allow delete room" ON public.rooms
    FOR DELETE
    USING (true);

-- PARTICIPANTS POLICIES
-- Anyone can view participants of a non-expired room
CREATE POLICY "Allow view participants of active room" ON public.participants
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = participants.room_id AND r.expires_at > now()
        )
    );

-- Anyone can join an active room
CREATE POLICY "Allow join active room" ON public.participants
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = participants.room_id AND r.expires_at > now()
        )
    );

-- Allow participants to update their last_seen or leave
CREATE POLICY "Allow update participant presence" ON public.participants
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = participants.room_id AND r.expires_at > now()
        )
    );

CREATE POLICY "Allow delete participant" ON public.participants
    FOR DELETE
    USING (true);

-- MESSAGES POLICIES
-- Anyone in the room can view messages if the room is not expired
CREATE POLICY "Allow view messages in active room" ON public.messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = messages.room_id AND r.expires_at > now()
        )
    );

-- Anyone can insert messages into an active room
CREATE POLICY "Allow insert message into active room" ON public.messages
    FOR INSERT
    WITH CHECK (
        char_length(content) > 0 AND char_length(content) <= 2000
        AND EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = messages.room_id AND r.expires_at > now()
        )
    );

-- 8. Stored Procedure: Cleanup Expired Rooms
-- This deletes all rooms whose expiration timestamp is in the past.
-- Foreign key ON DELETE CASCADE automatically deletes all associated messages and participants!
CREATE OR REPLACE FUNCTION public.cleanup_expired_rooms()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count integer;
BEGIN
    WITH deleted_rooms AS (
        DELETE FROM public.rooms
        WHERE expires_at <= now()
        RETURNING id
    )
    SELECT count(*) INTO deleted_count FROM deleted_rooms;
    
    RETURN deleted_count;
END;
$$;

-- 9. Realtime Publication Setup & Replica Identity
-- Required for Supabase Realtime to broadcast complete changes and deletes
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
