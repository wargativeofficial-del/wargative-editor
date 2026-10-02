/**
 * Endpoint: GET /api/auth/instagram/callback
 * Handles OAuth callback from official Instagram Standalone Login.
 * 
 * Security:
 * - Validates CSRF state against PostgreSQL public.oauth_states (one-time use)
 * - Derives user_id from the verified state (never trusts client params)
 * - Server-to-server token exchange using INSTAGRAM_APP_SECRET
 * - Exchanges short-lived token for long-lived 60-day token
 * - Encrypts access tokens via AES-256-GCM before saving to database
 * - Enforces zero token leakage to browser
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { encryptToken } from '../../_lib/crypto.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }

  const { code, state, error, error_reason, error_description } = req.query as Record<string, string>;

  // 1. Handle user cancellation or Instagram-level authorization errors
  if (error || !code || !state) {
    const errorMsg = error_description || error_reason || error || 'Otorisasi Instagram dibatalkan atau parameter tidak lengkap.';
    console.warn('[API /auth/instagram/callback] Otorisasi ditolak:', errorMsg);
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
      .eq('platform', 'instagram')
      .gt('expires_at', nowIso)
      .maybeSingle();

    if (stateQueryError || !stateRecord) {
      console.error('[API /auth/instagram/callback] State token tidak valid atau kedaluwarsa:', state);
      return res.redirect(
        `/planner.html?meta_error=${encodeURIComponent('Sesi otorisasi Instagram kedaluwarsa atau tidak valid (CSRF Protection). Silakan coba lagi.')}`
      );
    }

    // Immediately delete consumed state token (strict one-time use)
    await supabase.from('oauth_states').delete().eq('id', stateRecord.id);

    const userId = stateRecord.user_id;

    // 3. Resolve Instagram App Credentials
    const instagramAppId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
    const instagramAppSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;

    if (!instagramAppId || !instagramAppSecret) {
      console.error('[API /auth/instagram/callback] Kredensial Instagram belum lengkap di environment variables.');
      return res.redirect(
        `/planner.html?meta_error=${encodeURIComponent('Konfigurasi server belum lengkap (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET belum diset).')}`
      );
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'wargative-editor.vercel.app';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const defaultRedirectUri = `${proto}://${host}/api/auth/instagram/callback`;
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || defaultRedirectUri;

    // 4. Server-to-Server Token Exchange (Code -> Short-Lived Access Token)
    // Instagram requires application/x-www-form-urlencoded POST
    const tokenRequestBody = new URLSearchParams({
      client_id: instagramAppId,
      client_secret: instagramAppSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code: code
    });

    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenRequestBody.toString()
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error_type || tokenData.error_message || !tokenData.access_token) {
      const msg = tokenData.error_message || tokenData.error_type || 'Gagal menukar kode otorisasi Instagram dengan access token.';
      console.error('[API /auth/instagram/callback] Short-lived token exchange error:', tokenData);
      return res.redirect(`/planner.html?meta_error=${encodeURIComponent(msg)}`);
    }

    const shortLivedToken = tokenData.access_token;
    const rawUserId = String(tokenData.user_id || '');

    // 5. Exchange for Long-Lived User Access Token (~60 days validity)
    const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(instagramAppSecret)}&access_token=${encodeURIComponent(shortLivedToken)}`;
    const longLivedRes = await fetch(longLivedUrl);
    const longLivedData = await longLivedRes.json();

    if (longLivedData.error) {
      console.warn('[API /auth/instagram/callback] Gagal menukar long-lived token, fallback ke short-lived token:', longLivedData.error);
    }

    const finalAccessToken = longLivedData.access_token || shortLivedToken;
    const expiresInSec = longLivedData.expires_in || (60 * 24 * 3600); // Default to 60 days
    const tokenExpiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

    // 6. Fetch Instagram User Profile
    const profileUrl = `https://graph.instagram.com/me?fields=user_id,username,name,account_type,profile_picture_url&access_token=${encodeURIComponent(finalAccessToken)}`;
    const profileRes = await fetch(profileUrl);
    const profileData = await profileRes.json();

    if (profileData.error) {
      console.error('[API /auth/instagram/callback] Profile fetch error:', profileData.error);
      return res.redirect(`/planner.html?meta_error=${encodeURIComponent(profileData.error.message || 'Gagal mengambil profil Instagram.')}`);
    }

    const igUserId = String(profileData.user_id || profileData.id || rawUserId);
    const igUsername = profileData.username || 'instagram_user';
    const igName = profileData.name || igUsername;
    const igAccountType = profileData.account_type || 'BUSINESS';
    const igAvatarUrl = profileData.profile_picture_url || null;

    // 7. Encrypt Token with AES-256-GCM
    const encryptedToken = encryptToken(finalAccessToken);
    const accountHandle = `@${igUsername}`;

    // 8. Store Connection in PostgreSQL (Multi-Account Supported)
    const { error: upsertError } = await supabase
      .from('social_connections')
      .upsert(
        {
          user_id: userId,
          platform: 'instagram',
          platform_account_id: igUserId,
          account_name: igName,
          account_handle: accountHandle,
          avatar_url: igAvatarUrl,
          encrypted_access_token: encryptedToken,
          token_expires_at: tokenExpiresAt,
          granted_scopes: [
            'instagram_business_basic',
            'instagram_business_content_publish'
          ],
          metadata: {
            account_type: igAccountType,
            provider: 'instagram_standalone'
          },
          status: 'connected',
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'user_id,platform,platform_account_id'
        }
      );

    if (upsertError) {
      console.error('[API /auth/instagram/callback] Gagal menyimpan koneksi Instagram ke database:', upsertError);
      return res.redirect(`/planner.html?meta_error=${encodeURIComponent('Gagal menyimpan koneksi Instagram ke database: ' + upsertError.message)}`);
    }

    // 9. Redirect back to frontend Planner with success parameter
    return res.redirect(
      `/planner.html?meta_success=true&platform=instagram&account=${encodeURIComponent(accountHandle)}`
    );
  } catch (err: any) {
    console.error('[API /auth/instagram/callback] Server exception:', err);
    return res.redirect(
      `/planner.html?meta_error=${encodeURIComponent('Terjadi kesalahan server saat memproses otorisasi Instagram: ' + (err?.message || 'Unknown error'))}`
    );
  }
}
