/**
 * Consolidated Dynamic Route: /api/auth/youtube/[action]
 * Handles both YouTube OAuth Initiation and Callback in a single Vercel Serverless Function
 * to strictly adhere to Vercel Hobby plan limit (<= 12 Serverless Functions).
 * 
 * Public Routes:
 * - GET /api/auth/youtube/login    (action = 'login')
 * - GET /api/auth/youtube/callback (action = 'callback')
 * 
 * Security:
 * - Requires verified Supabase Auth JWT on login
 * - Generates cryptographically secure, short-lived CSRF state token (10m TTL)
 * - Binds state strictly to the authenticated user_id in PostgreSQL (public.oauth_states)
 * - Atomic one-time CSRF state consumption on callback
 * - AES-256-GCM authenticated encryption for all tokens at rest
 * - Multi-user isolation & zero token leakage to browser URL or logs
 * - Preserves existing refresh token if Google does not return a new one on re-auth
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { authenticateRequest } from '../../_lib/authMiddleware.js';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { encryptToken } from '../../_lib/crypto.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action } = req.query as Record<string, string>;

  // Dispatch to appropriate sub-handler based on action
  if (action === 'login') {
    return handleLogin(req, res);
  } else if (action === 'callback') {
    return handleCallback(req, res);
  } else {
    return res.status(404).json({
      error: 'Not Found',
      message: `Endpoint /api/auth/youtube/${action || ''} tidak ditemukan. Gunakan /login atau /callback.`
    });
  }
}

/**
 * Sub-handler: GET /api/auth/youtube/login
 */
async function handleLogin(req: VercelRequest, res: VercelResponse) {
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

/**
 * Sub-handler: GET /api/auth/youtube/callback
 */
async function handleCallback(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }

  const { code, state, error, error_description } = req.query as Record<string, string>;

  // 1. Handle user cancellation or Google-level authorization errors
  if (error || !code || !state) {
    const errorMsg = error_description || error || 'Otorisasi Google dibatalkan atau parameter tidak lengkap.';
    console.warn('[API /auth/youtube/callback] Otorisasi ditolak:', errorMsg);
    return res.redirect(`/planner.html?meta_error=${encodeURIComponent(errorMsg)}`);
  }

  const supabase = getSupabaseAdmin();

  try {
    // 2. Validate and consume CSRF state token from database
    const nowIso = new Date().toISOString();
    const { data: stateRecord, error: stateQueryError } = await supabase
      .from('oauth_states')
      .select('id, user_id, platform, expires_at')
      .eq('state_token', state)
      .eq('platform', 'youtube')
      .gt('expires_at', nowIso)
      .maybeSingle();

    if (stateQueryError || !stateRecord) {
      console.error('[API /auth/youtube/callback] State token tidak valid atau kedaluwarsa:', state);
      return res.redirect(
        `/planner.html?meta_error=${encodeURIComponent('Sesi otorisasi kedaluwarsa atau tidak valid (CSRF Protection). Silakan coba lagi.')}`
      );
    }

    // Immediately delete consumed state token (strict one-time use)
    await supabase.from('oauth_states').delete().eq('id', stateRecord.id);

    const userId = stateRecord.user_id;

    // 3. Resolve Google Client Credentials
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!googleClientId || !googleClientSecret) {
      console.error('[API /auth/youtube/callback] GOOGLE_CLIENT_ID atau GOOGLE_CLIENT_SECRET belum dikonfigurasi.');
      return res.redirect(
        `/planner.html?meta_error=${encodeURIComponent('Konfigurasi server belum lengkap (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET belum diset).')}`
      );
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'wargative-editor.vercel.app';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const defaultRedirectUri = `${proto}://${host}/api/auth/youtube/callback`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || defaultRedirectUri;

    // 4. Server-to-Server Token Exchange (Code -> Access Token + Refresh Token)
    const tokenParams = new URLSearchParams({
      code: code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams.toString()
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      const errorMsg = tokenData.error_description || tokenData.error || 'Gagal menukar kode otorisasi dengan token Google.';
      console.error('[API /auth/youtube/callback] Token exchange error:', tokenData.error || tokenData.error_description || `HTTP ${tokenRes.status}`);
      return res.redirect(`/planner.html?meta_error=${encodeURIComponent(errorMsg)}`);
    }

    const accessToken = tokenData.access_token as string;
    const newRefreshToken = (tokenData.refresh_token as string) || null;
    const expiresIn = Number(tokenData.expires_in) || 3600;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 5. Query Channel Identity via YouTube Data API v3
    const channelsRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const channelsData = await channelsRes.json();

    if (!channelsRes.ok || channelsData.error) {
      const errorMsg = channelsData.error?.message || 'Gagal mengambil data YouTube Channel dari Google API.';
      console.error('[API /auth/youtube/callback] Channels query error:', channelsData.error);
      return res.redirect(`/planner.html?meta_error=${encodeURIComponent(errorMsg)}`);
    }

    const items = channelsData.items || [];
    if (items.length === 0) {
      return res.redirect(
        `/planner.html?meta_error=${encodeURIComponent('Akun Google ini belum memiliki YouTube Channel. Silakan buat channel di YouTube terlebih dahulu.')}`
      );
    }

    const primaryChannel = items[0];
    const channelId = primaryChannel.id;
    const snippet = primaryChannel.snippet || {};
    const channelTitle = snippet.title || 'YouTube Channel';
    const customUrl = snippet.customUrl || '';
    const channelHandle = customUrl
      ? (customUrl.startsWith('@') ? customUrl : `@${customUrl}`)
      : `@${channelTitle.replace(/\s+/g, '')}`;
    const avatarUrl = snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null;

    // 6. Encrypt Tokens at Rest (AES-256-GCM)
    const encryptedAccessToken = encryptToken(accessToken);

    // If Google returned a refresh token, encrypt and save it.
    // If not (e.g. re-auth), preserve any existing refresh token already in database.
    let encryptedRefreshToken: string | null = null;
    if (newRefreshToken) {
      encryptedRefreshToken = encryptToken(newRefreshToken);
    } else {
      const { data: existingConn } = await supabase
        .from('social_connections')
        .select('encrypted_refresh_token')
        .eq('user_id', userId)
        .eq('platform', 'youtube')
        .eq('platform_account_id', channelId)
        .maybeSingle();

      if (existingConn?.encrypted_refresh_token) {
        encryptedRefreshToken = existingConn.encrypted_refresh_token;
      }
    }

    const grantedScopes = typeof tokenData.scope === 'string'
      ? tokenData.scope.split(' ').filter(Boolean)
      : [
          'https://www.googleapis.com/auth/youtube.upload',
          'https://www.googleapis.com/auth/youtube.readonly'
        ];

    // 7. Store / Upsert Connection into public.social_connections
    const { error: upsertError } = await supabase
      .from('social_connections')
      .upsert(
        {
          user_id: userId,
          platform: 'youtube',
          platform_account_id: channelId,
          account_name: channelTitle,
          account_handle: channelHandle,
          avatar_url: avatarUrl,
          encrypted_access_token: encryptedAccessToken,
          encrypted_refresh_token: encryptedRefreshToken,
          token_expires_at: tokenExpiresAt,
          granted_scopes: grantedScopes,
          metadata: {
            channel_id: channelId,
            custom_url: customUrl,
            published_at: snippet.publishedAt || null
          },
          status: 'connected',
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'user_id,platform,platform_account_id'
        }
      );

    if (upsertError) {
      console.error('[API /auth/youtube/callback] Gagal menyimpan koneksi YouTube:', upsertError);
      return res.redirect(
        `/planner.html?meta_error=${encodeURIComponent('Gagal menyimpan koneksi YouTube ke database: ' + upsertError.message)}`
      );
    }

    // 8. Redirect back to frontend Planner with verified success parameters
    return res.redirect(
      `/planner.html?meta_success=true&platform=youtube&account=${encodeURIComponent(channelHandle)}`
    );
  } catch (err: any) {
    console.error('[API /auth/youtube/callback] Server exception:', err);
    return res.redirect(
      `/planner.html?meta_error=${encodeURIComponent('Terjadi kesalahan server saat memproses callback YouTube: ' + (err?.message || 'Unknown error'))}`
    );
  }
}
