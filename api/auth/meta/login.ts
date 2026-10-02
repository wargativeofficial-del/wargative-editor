/**
 * Endpoint: GET /api/auth/meta/login
 * Initiates official Meta OAuth 2.0 Authorization Code flow for Facebook & Instagram.
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

  // 2. Validate platform
  const platform = req.query.platform === 'instagram' ? 'instagram' : 'facebook';

  // 3. Resolve Meta App Credentials
  const metaAppId = process.env.META_APP_ID || '1074079788556384';
  if (!metaAppId) {
    return res.status(500).json({
      error: 'Configuration Error',
      message: 'META_APP_ID belum dikonfigurasi di environment variables server.'
    });
  }

  // Resolve Redirect URI
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'wargative-editor.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const defaultRedirectUri = `${proto}://${host}/api/auth/meta/callback`;
  const redirectUri = process.env.META_REDIRECT_URI || defaultRedirectUri;

  // 4. Generate cryptographically secure CSRF state token (32 bytes)
  const stateToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  try {
    const supabase = getSupabaseAdmin();

    // Store state in PostgreSQL for one-time callback validation
    const { error: stateError } = await supabase.from('oauth_states').insert({
      user_id: user.id,
      platform: platform,
      state_token: stateToken,
      expires_at: expiresAt
    });

    if (stateError) {
      console.error('[API /auth/meta/login] Gagal menyimpan oauth state:', stateError);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Gagal membuat sesi keamanan OAuth (CSRF state).',
        detail: stateError.message
      });
    }

    // 5. Define officially documented scopes (Graph API v21.0 / v22.0)
    // Facebook Pages require: pages_show_list, pages_read_engagement, pages_manage_posts
    // Instagram Business requires: same plus instagram_basic, instagram_content_publish
    let scopes = 'pages_show_list,pages_read_engagement,pages_manage_posts';
    if (platform === 'instagram') {
      scopes = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish';
    }

    // 6. Build official Meta Authorization URL
    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${stateToken}&response_type=code&scope=${encodeURIComponent(scopes)}`;

    return res.status(200).json({
      success: true,
      authUrl: authUrl,
      platform: platform,
      redirectUri: redirectUri
    });
  } catch (err: any) {
    console.error('[API /auth/meta/login] Server exception:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan saat memulai proses otorisasi Meta.',
      detail: err?.message
    });
  }
}
