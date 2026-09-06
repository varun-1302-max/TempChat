import React, { useState } from 'react';
import { Database, Check, Copy, X, AlertCircle, RefreshCw } from 'lucide-react';
import { getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig, testSupabaseConnection } from '../services/supabase';

interface SupabaseConfigModalProps {
  onClose: () => void;
  onConfigSaved: () => void;
}

const SCHEMA_SQL = `-- TempChat Supabase Schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rooms_token ON public.rooms(room_token);
CREATE INDEX IF NOT EXISTS idx_rooms_expires_at ON public.rooms(expires_at);

CREATE TABLE IF NOT EXISTS public.participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    nickname VARCHAR(50) NOT NULL,
    session_token TEXT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participants_room_id ON public.participants(room_id);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE,
    nickname VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_room_id ON public.messages(room_id);

-- Enable RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Non-expired policies
CREATE POLICY "view_rooms" ON public.rooms FOR SELECT USING (expires_at > now());
CREATE POLICY "insert_rooms" ON public.rooms FOR INSERT WITH CHECK (expires_at > now());
CREATE POLICY "update_rooms" ON public.rooms FOR UPDATE USING (expires_at > now());
CREATE POLICY "delete_rooms" ON public.rooms FOR DELETE USING (true);

CREATE POLICY "view_participants" ON public.participants FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = participants.room_id AND r.expires_at > now())
);
CREATE POLICY "insert_participants" ON public.participants FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = participants.room_id AND r.expires_at > now())
);
CREATE POLICY "delete_participants" ON public.participants FOR DELETE USING (true);

CREATE POLICY "view_messages" ON public.messages FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = messages.room_id AND r.expires_at > now())
);
CREATE POLICY "insert_messages" ON public.messages FOR INSERT WITH CHECK (
    char_length(content) > 0 AND char_length(content) <= 2000
    AND EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = messages.room_id AND r.expires_at > now())
);

-- Stored procedure for cleanup
CREATE OR REPLACE FUNCTION public.cleanup_expired_rooms()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE count_del integer;
BEGIN
    WITH del AS (DELETE FROM public.rooms WHERE expires_at <= now() RETURNING id)
    SELECT count(*) INTO count_del FROM del;
    RETURN count_del;
END;
$$;

-- Enable Realtime
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
END $$;`;

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({ onClose, onConfigSaved }) => {
  const currentConfig = getSupabaseConfig();
  const [url, setUrl] = useState(currentConfig.url);
  const [anonKey, setAnonKey] = useState(currentConfig.anonKey);
  const [activeTab, setActiveTab] = useState<'settings' | 'schema'>('settings');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const handleTest = async () => {
    if (!url || !anonKey) {
      setTestResult({ success: false, message: 'Please enter both URL and Anon Key' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    const res = await testSupabaseConnection(url, anonKey);
    setTestResult(res);
    setIsTesting(false);
  };

  const handleSave = () => {
    if (!url || !anonKey) return;
    saveSupabaseConfig(url, anonKey);
    onConfigSaved();
    onClose();
  };

  const handleResetToLocal = () => {
    clearSupabaseConfig();
    setUrl('');
    setAnonKey('');
    setTestResult(null);
    onConfigSaved();
  };

  const handleCopySql = async () => {
    await navigator.clipboard.writeText(SCHEMA_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl rounded-[28px] border border-m3-outline-variant/30 bg-m3-surface-container-high text-m3-on-surface shadow-m3-3 p-6 sm:p-8 animate-pop-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-m3-outline-variant/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center shadow-sm">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-medium tracking-tight text-m3-on-surface">
                Supabase & Realtime Setup
              </h2>
              <p className="text-xs text-m3-on-surface-variant">
                Cloud sync or instant multi-device engine
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="state-layer w-10 h-10 rounded-full flex items-center justify-center text-m3-on-surface-variant hover:bg-m3-on-surface/8 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex gap-2 my-4 border-b border-m3-outline-variant/30 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`state-layer text-xs font-medium px-4 py-2 rounded-full transition-colors ${
              activeTab === 'settings'
                ? 'bg-m3-primary text-m3-on-primary shadow-sm'
                : 'text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-m3-on-surface/8'
            }`}
          >
            Connection Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schema')}
            className={`state-layer text-xs font-medium px-4 py-2 rounded-full transition-colors ${
              activeTab === 'schema'
                ? 'bg-m3-primary text-m3-on-primary shadow-sm'
                : 'text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-m3-on-surface/8'
            }`}
          >
            SQL Database Schema
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {activeTab === 'settings' ? (
            <div className="space-y-4">
              {/* Status Banner */}
              <div className="p-4 rounded-2xl border border-m3-outline-variant/40 bg-m3-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {currentConfig.isConfigured ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <div>
                        <span className="text-xs font-medium text-m3-primary block">
                          Supabase Cloud Active
                        </span>
                        <span className="text-[11px] text-m3-on-surface-variant">
                          Source: {currentConfig.source === 'env' ? '.env file' : 'Custom settings'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse" />
                      <div>
                        <span className="text-xs font-medium text-m3-primary block">
                          Local / Network Realtime Active
                        </span>
                        <span className="text-[11px] text-m3-on-surface-variant">
                          Syncs instantly across tabs and devices
                        </span>
                      </div>
                    </>
                  )}
                </div>
                {currentConfig.source === 'custom' && (
                  <button
                    type="button"
                    onClick={handleResetToLocal}
                    className="text-xs font-medium text-m3-error hover:underline"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {/* URL Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-m3-on-surface-variant px-1">
                  Project URL
                </label>
                <div className="rounded-2xl border border-m3-outline bg-m3-surface-container-lowest focus-within:border-2 focus-within:border-m3-primary transition-all">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://xyzcompany.supabase.co"
                    className="w-full px-4 py-2.5 bg-transparent text-xs font-mono text-m3-on-surface placeholder:text-m3-outline focus:outline-none rounded-2xl"
                  />
                </div>
              </div>

              {/* Key Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-m3-on-surface-variant px-1">
                  Anon / Public API Key
                </label>
                <div className="rounded-2xl border border-m3-outline bg-m3-surface-container-lowest focus-within:border-2 focus-within:border-m3-primary transition-all">
                  <input
                    type="password"
                    value={anonKey}
                    onChange={(e) => setAnonKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-4 py-2.5 bg-transparent text-xs font-mono text-m3-on-surface placeholder:text-m3-outline focus:outline-none rounded-2xl"
                  />
                </div>
              </div>

              {/* Test Result Message */}
              {testResult && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs font-medium flex items-center gap-2 ${
                    testResult.success
                      ? 'bg-m3-primary-container/40 border-m3-primary/30 text-m3-primary'
                      : 'bg-m3-error-container text-m3-on-error-container border-transparent'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{testResult.message}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={isTesting}
                  className="state-layer flex-1 h-11 px-4 rounded-full border border-m3-outline-variant/60 text-xs font-medium text-m3-on-surface hover:bg-m3-on-surface/8 transition-colors flex items-center justify-center gap-1.5"
                >
                  {isTesting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>Test Connection</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="state-layer flex-1 h-11 px-4 rounded-full bg-m3-primary hover:shadow-m3-1 text-m3-on-primary text-xs font-medium transition-all shadow-sm"
                >
                  Save & Connect
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-m3-on-surface-variant">
                  Run this in your Supabase SQL Editor:
                </span>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="state-layer px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface border border-m3-outline-variant/60 transition-colors"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-m3-primary" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-m3-outline" />
                      <span>Copy SQL</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-4 rounded-2xl bg-m3-surface-container-lowest text-m3-on-surface font-mono text-[11px] overflow-x-auto max-h-72 border border-m3-outline-variant/40">
                {SCHEMA_SQL}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
