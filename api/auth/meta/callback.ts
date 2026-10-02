/**
 * Endpoint: GET /api/auth/meta/callback
 * Handles OAuth callback from Meta (Facebook & Instagram).
 * 
 * Security:
 * - Validates CSRF state against PostgreSQL public.oauth_states (one-time use)
 * - Derives user_id from the verified state (never trusts client params)
 * - Server-to-server token exchange using META_APP_SECRET
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

  const { code, state, error, error_description } = req.query as Record<string, string>;

  // 1. Handle user cancellation or Meta-level authorization errors
  if (error || !code || !state) {
    const errorMsg = error_description || error || 'Otorisasi dibatalkan atau parameter tidak lengkap.';
    console.warn('[API /auth/meta/callback] Otorisasi ditolak:', errorMsg);
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
      .gt('expires_at', nowIso)
      .maybeSingle();

    if (stateQueryError || !stateRecord) {
      console.error('[API /auth/meta/callback] State token tidak valid atau kedaluwarsa:', state);
      return res.redirect(
        `/planner.html?meta_error=${encodeURIComponent('Sesi otorisasi kedaluwarsa atau tidak valid (CSRF Protection). Silakan coba lagi.')}`
      );
    }

    // Immediately delete consumed state token (strict one-time use)
    await supabase.from('oauth_states').delete().eq('id', stateRecord.id);

    const userId = stateRecord.user_id;
    const requestedPlatform = stateRecord.platform; // 'facebook' or 'instagram'

    // 3. Resolve Meta App Credentials
    const metaAppId = process.env.META_APP_ID || '1074079788556384';
    const metaAppSecret = process.env.META_APP_SECRET;

    if (!metaAppSecret) {
      console.error('[API /auth/meta/callback] META_APP_SECRET belum dikonfigurasi di environment variables.');
      return res.redirect(
        `/planner.html?meta_error=${encodeURIComponent('Konfigurasi server belum lengkap (META_APP_SECRET belum diset).')}`
      );
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'wargative-editor.vercel.app';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const defaultRedirectUri = `${proto}://${host}/api/auth/meta/callback`;
    const redirectUri = process.env.META_REDIRECT_URI || defaultRedirectUri;

    // 4. Server-to-Server Token Exchange (Code -> Short-Lived Access Token)
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${metaAppId}&client_secret=${metaAppSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      const msg = tokenData.error?.message || 'Gagal menukar kode otorisasi Meta dengan access token.';
      console.error('[API /auth/meta/callback] Token exchange error:', tokenData.error);
      return res.redirect(`/planner.html?meta_error=${encodeURIComponent(msg)}`);
    }

    const shortLivedToken = tokenData.access_token;

    // 5. Exchange for Long-Lived User Access Token (~60 days validity)
    const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaAppSecret}&fb_exchange_token=${shortLivedToken}`;
    const longLivedRes = await fetch(longLivedUrl);
    const longLivedData = await longLivedRes.json();
    const userAccessToken = longLivedData.access_token || shortLivedToken;

    // 6. Query Authorized Facebook Pages and linked Instagram Business Accounts
    const accountsUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,category,instagram_business_account{id,username,name,profile_picture_url}&access_token=${userAccessToken}`;
    const accountsRes = await fetch(accountsUrl);
    const accountsData = await accountsRes.json();

    if (accountsData.error) {
      console.error('[API /auth/meta/callback] Accounts fetch error:', accountsData.error);
      return res.redirect(`/planner.html?meta_error=${encodeURIComponent(accountsData.error.message)}`);
    }

    const pages = accountsData.data || [];

    if (pages.length === 0) {
      return res.redirect(
        `/planner.html?meta_error=${encodeURIComponent('Tidak ada Facebook Page yang ditemukan pada akun Anda. Pastikan Anda memiliki peran Admin pada setidaknya satu Facebook Page.')}`
      );
    }

    let connectedAccountHandle = '';

    // 7. Store connection strictly matching the requested platform
    if (requestedPlatform === 'instagram') {
      const pageWithIg = pages.find((p: any) => p.instagram_business_account);

      if (!pageWithIg || !pageWithIg.instagram_business_account) {
        return res.redirect(
          `/planner.html?meta_error=${encodeURIComponent('Akun Instagram Bisnis tidak ditemukan. Pastikan akun Instagram Anda bertipe Business atau Creator dan sudah ditautkan ke Facebook Page Anda.')}`
        );
      }

      const ig = pageWithIg.instagram_business_account;
      const targetToken = pageWithIg.access_token || userAccessToken;
      const encryptedToken = encryptToken(targetToken);
      connectedAccountHandle = `@${ig.username}`;

      const { error: upsertError } = await supabase
        .from('social_connections')
        .upsert(
          {
            user_id: userId,
            platform: 'instagram',
            platform_account_id: ig.id,
            account_name: ig.name || ig.username,
            account_handle: connectedAccountHandle,
            avatar_url: ig.profile_picture_url || null,
            encrypted_access_token: encryptedToken,
            granted_scopes: [
              'pages_show_list',
              'pages_read_engagement',
              'pages_manage_posts',
              'instagram_basic',
              'instagram_content_publish'
            ],
            metadata: {
              linked_page_id: pageWithIg.id,
              linked_page_name: pageWithIg.name
            },
            status: 'connected',
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'user_id,platform,platform_account_id'
          }
        );

      if (upsertError) {
        console.error('[API /auth/meta/callback] Gagal menyimpan koneksi Instagram:', upsertError);
        return res.redirect(`/planner.html?meta_error=${encodeURIComponent('Gagal menyimpan koneksi Instagram ke database: ' + upsertError.message)}`);
      }
    } else {
      // Facebook Page Connection
      const page = pages[0]; // Connect primary selected Page
      const targetToken = page.access_token || userAccessToken;
      const encryptedToken = encryptToken(targetToken);
      connectedAccountHandle = page.name;

      const { error: upsertError } = await supabase
        .from('social_connections')
        .upsert(
          {
            user_id: userId,
            platform: 'facebook',
            platform_account_id: page.id,
            account_name: page.name,
            account_handle: page.name,
            avatar_url: null,
            encrypted_access_token: encryptedToken,
            granted_scopes: [
              'pages_show_list',
              'pages_read_engagement',
              'pages_manage_posts'
            ],
            metadata: {
              category: page.category || 'Business Page'
            },
            status: 'connected',
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'user_id,platform,platform_account_id'
          }
        );

      if (upsertError) {
        console.error('[API /auth/meta/callback] Gagal menyimpan koneksi Facebook:', upsertError);
        return res.redirect(`/planner.html?meta_error=${encodeURIComponent('Gagal menyimpan koneksi Facebook ke database: ' + upsertError.message)}`);
      }
    }

    // 8. Redirect back to frontend Planner with verified success parameters
    return res.redirect(
      `/planner.html?meta_success=true&platform=${requestedPlatform}&account=${encodeURIComponent(connectedAccountHandle)}`
    );
  } catch (err: any) {
    console.error('[API /auth/meta/callback] Server exception:', err);
    return res.redirect(
      `/planner.html?meta_error=${encodeURIComponent('Terjadi kesalahan server saat memproses callback Meta: ' + (err?.message || 'Unknown error'))}`
    );
  }
}
