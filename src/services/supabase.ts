import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY_URL = 'tempchat_supabase_url';
const STORAGE_KEY_KEY = 'tempchat_supabase_anon_key';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConfigured: boolean;
  source: 'env' | 'custom' | 'none';
}

export function getSupabaseConfig(): SupabaseConfig {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {} as Record<string, string>;
  const envUrl = env.VITE_SUPABASE_URL || '';
  const envKey = env.VITE_SUPABASE_ANON_KEY || '';

  const customUrl = localStorage.getItem(STORAGE_KEY_URL) || '';
  const customKey = localStorage.getItem(STORAGE_KEY_KEY) || '';

  if (customUrl && customKey) {
    return {
      url: customUrl.trim(),
      anonKey: customKey.trim(),
      isConfigured: true,
      source: 'custom',
    };
  }

  if (envUrl && envKey && !envUrl.includes('your-project-id')) {
    return {
      url: envUrl.trim(),
      anonKey: envKey.trim(),
      isConfigured: true,
      source: 'env',
    };
  }

  return {
    url: '',
    anonKey: '',
    isConfigured: false,
    source: 'none',
  };
}

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config.isConfigured) {
    return null;
  }

  const configKey = `${config.url}_${config.anonKey}`;
  if (cachedClient && cachedConfigKey === configKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(config.url, config.anonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    cachedConfigKey = configKey;
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export async function testSupabaseConnection(url: string, anonKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const client = createClient(url.trim(), anonKey.trim());
    // Try pinging public.rooms
    const { error } = await client.from('rooms').select('id').limit(1);
    if (error) {
      // If error code is '42P01' table doesn't exist, schema needs running
      if (error.code === '42P01') {
        return {
          success: true,
          message: 'Connected to Supabase, but tables not found yet. Please run the SQL schema in your SQL Editor.',
        };
      }
      return {
        success: false,
        message: error.message || 'Error querying database',
      };
    }

    return {
      success: true,
      message: 'Successfully connected to Supabase and verified tables!',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Network error connecting to Supabase',
    };
  }
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  localStorage.setItem(STORAGE_KEY_URL, url.trim());
  localStorage.setItem(STORAGE_KEY_KEY, anonKey.trim());
  cachedClient = null;
  cachedConfigKey = '';
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_KEY);
  cachedClient = null;
  cachedConfigKey = '';
}
