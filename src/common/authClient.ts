/**
 * Wargative Auth Client - Powered by Supabase Auth
 * Manages multi-user authentication, sessions, and user IDs.
 */

import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('YOUR_PROJECT_REF') &&
  !supabaseUrl.includes('your-project') &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseAnonKey.includes('YOUR_SUPABASE') &&
  !supabaseAnonKey.includes('placeholder')
);

let supabaseInstance: SupabaseClient | null = null;

if (isConfigured) {
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  });
} else {
  console.warn(
    '[Wargative Auth] Supabase URL & Anon Key belum dikonfigurasi di .env.local atau Vercel. ' +
    'Silakan isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY untuk mengaktifkan login multi-user.'
  );
}

export const supabase = supabaseInstance;

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: string | null;
}

export async function signUpUser(email: string, password: string): Promise<AuthResponse> {
  if (!supabase) {
    return {
      user: null,
      session: null,
      error: 'Supabase belum dikonfigurasi. Harap tambahkan VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.'
    };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      return { user: null, session: null, error: error.message };
    }

    return {
      user: data.user,
      session: data.session,
      error: null
    };
  } catch (err: any) {
    return { user: null, session: null, error: err.message || 'Terjadi kesalahan saat pendaftaran.' };
  }
}

export async function signInUser(email: string, password: string): Promise<AuthResponse> {
  if (!supabase) {
    return {
      user: null,
      session: null,
      error: 'Supabase belum dikonfigurasi. Harap tambahkan VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.'
    };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return { user: null, session: null, error: error.message };
    }

    return {
      user: data.user,
      session: data.session,
      error: null
    };
  } catch (err: any) {
    return { user: null, session: null, error: err.message || 'Terjadi kesalahan saat login.' };
  }
}

export async function signOutUser(): Promise<{ error: string | null }> {
  if (!supabase) return { error: null };

  try {
    const { error } = await supabase.auth.signOut();
    return { error: error ? error.message : null };
  } catch (err: any) {
    return { error: err.message || 'Gagal logout.' };
  }
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user;
  } catch {
    return null;
  }
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session;
  } catch {
    return null;
  }
}

export function onAuthStateChange(callback: (event: string, session: Session | null) => void) {
  if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

/**
 * Mendapatkan header Authorization Bearer JWT untuk request ke serverless backend
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  const session = await getCurrentSession();
  if (!session?.access_token) return {};
  return {
    Authorization: `Bearer ${session.access_token}`
  };
}
