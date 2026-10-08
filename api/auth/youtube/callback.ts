/**
 * Endpoint: GET /api/auth/youtube/callback
 * Handles Google OAuth 2.0 callback for YouTube Data API v3.
 * 
 * Security:
 * - Validates CSRF state against PostgreSQL public.oauth_states (one-time use)
 * - Derives user_id from the verified state record (never trusts client parameters)
 * - Server-to-server token exchange using GOOGLE_CLIENT_SECRET
 * - Encrypts access tokens and refresh tokens via AES-256-GCM before saving to database
 * - Enforces multi-user isolation and zero credential leakage to browser
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { encryptToken } from '../../_lib/crypto.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
