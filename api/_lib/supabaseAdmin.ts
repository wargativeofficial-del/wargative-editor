/**
 * Supabase Backend Client
 * Only for serverless API routes - NEVER expose Service Role Key to frontend!
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseUrl) {
    throw new Error('Konfigurasi server error: SUPABASE_URL tidak ditemukan di environment variables.');
  }

  // Service role key allows backend to execute administrative tasks
  const keyToUse = supabaseServiceKey || supabaseAnonKey;
  if (!keyToUse) {
    throw new Error('Konfigurasi server error: SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di environment variables.');
  }

  return createClient(supabaseUrl, keyToUse, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

/**
 * Creates a scoped Supabase client with user's JWT
 * This natively enforces Row Level Security (RLS) in PostgreSQL (auth.uid() = user.id)
 */
export function getSupabaseUserClient(userJwtToken: string): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Konfigurasi server error: SUPABASE_URL atau SUPABASE_ANON_KEY belum dikonfigurasi.');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${userJwtToken}`
      }
    }
  });
}
