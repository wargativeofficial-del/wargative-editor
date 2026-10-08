/**
 * Endpoint: GET /api/auth/youtube/login
 * Initiates Google OAuth 2.0 Authorization Code flow for YouTube Data API v3.
 * 
 * Security:
 * - Requires verified Supabase Auth JWT
 * - Generates cryptographically secure, short-lived CSRF state token
 * - Binds state strictly to the authenticated user_id in PostgreSQL (public.oauth_states)
 * - Forces offline access (access_type=offline) and re-consent (prompt=consent) to guarantee Refresh Token issuance
 * - Never trusts client-supplied user identity
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { authenticateRequest } from '../../_lib/authMiddleware.js';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: `Metode ${req.method} tidak diizinkan. Gunakan GET.`
    });
  }

  // 1. Authenticate user from session JWT
  const user = await authenticateRequest(req, res);
  if (!user) return; // Response handled by authenticateRequest

  // 2. Resolve Google Client Credentials
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    return res.status(500).json({
      error: 'Configuration Error',
      message: 'GOOGLE_CLIENT_ID belum dikonfigurasi di environment variables server.'
    });
  }

  // 3. Resolve Redirect URI
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'wargative-editor.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const defaultRedirectUri = `${proto}://${host}/api/auth/youtube/callback`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || defaultRedirectUri;

  // 4. Generate cryptographically secure CSRF state token (32 bytes / 64 hex characters)
  const stateToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes validity

  try {
    const supabase = getSupabaseAdmin();

    // Store state in PostgreSQL for one-time callback validation
    const { error: stateError } = await supabase.from('oauth_states').insert({
      user_id: user.id,
      platform: 'youtube',
      state_token: stateToken,
      expires_at: expiresAt
    });

    if (stateError) {
      console.error('[API /auth/youtube/login] Gagal menyimpan oauth state:', stateError);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Gagal membuat sesi keamanan OAuth (CSRF state).',
        detail: stateError.message
      });
    }

    // 5. Build official Google OAuth 2.0 Authorization URL
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly'
    ].join(' ');

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', googleClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('state', stateToken);

    return res.status(200).json({
      success: true,
      authUrl: authUrl.toString(),
      platform: 'youtube',
      redirectUri: redirectUri
    });
  } catch (err: any) {
    console.error('[API /auth/youtube/login] Server exception:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan saat memulai proses otorisasi YouTube.',
      detail: err?.message
    });
  }
}
