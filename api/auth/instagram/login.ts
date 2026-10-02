/**
 * Endpoint: GET /api/auth/instagram/login
 * Initiates official Instagram Standalone OAuth 2.0 flow.
 * Does NOT require a Facebook Page.
 * 
 * Security:
 * - Requires verified Supabase Auth JWT
 * - Generates cryptographically secure, short-lived CSRF state token
 * - Binds state strictly to the authenticated user_id in PostgreSQL
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

  // 2. Resolve Instagram App Credentials
  const instagramAppId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
  if (!instagramAppId) {
    return res.status(500).json({
      error: 'Configuration Error',
      message: 'INSTAGRAM_APP_ID belum dikonfigurasi di environment variables server.'
    });
  }

  // Resolve Redirect URI
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'wargative-editor.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const defaultRedirectUri = `${proto}://${host}/api/auth/instagram/callback`;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || defaultRedirectUri;

  // 3. Generate cryptographically secure CSRF state token (32 bytes)
  const stateToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  try {
    const supabase = getSupabaseAdmin();

    // Store state in PostgreSQL for one-time callback validation
    const { error: stateError } = await supabase.from('oauth_states').insert({
      user_id: user.id,
      platform: 'instagram',
      state_token: stateToken,
      expires_at: expiresAt
    });

    if (stateError) {
      console.error('[API /auth/instagram/login] Gagal menyimpan oauth state:', stateError);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Gagal membuat sesi keamanan OAuth Instagram (CSRF state).',
        detail: stateError.message
      });
    }

    // 4. Scopes officially required for Instagram Content Publishing & Profile reading
    const scopes = process.env.INSTAGRAM_SCOPES || 'instagram_business_basic,instagram_business_content_publish';

    // 5. Build official Instagram Standalone Authorization URL
    const authUrl = `https://www.instagram.com/oauth/authorize?client_id=${instagramAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${stateToken}`;

    return res.status(200).json({
      success: true,
      authUrl: authUrl,
      platform: 'instagram',
      redirectUri: redirectUri
    });
  } catch (err: any) {
    console.error('[API /auth/instagram/login] Server exception:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan saat memulai proses otorisasi Instagram.',
      detail: err?.message
    });
  }
}
