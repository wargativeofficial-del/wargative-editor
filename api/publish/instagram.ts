/**
 * Endpoint: POST /api/publish/instagram
 * Instant Content Publishing to Instagram Professional Account via Meta Graph API
 * 
 * Security:
 * - Requires verified Supabase JWT Bearer token
 * - Derives user_id solely from verified token
 * - Resolves connection strictly using: id = connectionId AND user_id = user.id
 * - Decrypts access token server-side via AES-256-GCM
 * - Zero token or credential leakage to client or server logs
 * - Strict verification of platform ('instagram') and status ('connected')
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest } from '../_lib/authMiddleware.js';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { decryptToken } from '../_lib/crypto.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: `Metode ${req.method} tidak diizinkan. Gunakan POST.`
    });
  }

  // 1. Authenticate user from session JWT
  const user = await authenticateRequest(req, res);
  if (!user) return; // 401 already sent

  const { connectionId, imageUrl, caption } = req.body || {};

  if (!connectionId || typeof connectionId !== 'string') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Parameter connectionId wajib disertakan.'
    });
  }

  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Parameter imageUrl wajib berupa URL HTTPS publik yang valid.'
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    // 2. Fetch social connection strictly scoped to authenticated user_id
    const { data: connection, error: connError } = await supabase
      .from('social_connections')
      .select('id, user_id, platform, platform_account_id, account_name, account_handle, encrypted_access_token, status, granted_scopes')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (connError || !connection) {
      console.warn(`[API /publish/instagram] Akun tidak ditemukan untuk user ${user.id} dan connectionId ${connectionId}`);
      return res.status(404).json({
        error: 'Not Found',
        message: 'Koneksi akun Instagram tidak ditemukan atau bukan milik akun Anda.'
      });
    }

    // 3. Validate Platform & Connection Status
    if (connection.platform !== 'instagram') {
      return res.status(400).json({
        error: 'Invalid Platform',
        message: `Koneksi ini bukan platform Instagram (ditemukan: ${connection.platform}).`
      });
    }

    if (connection.status !== 'connected') {
      return res.status(400).json({
        error: 'Connection Inactive',
        message: `Status koneksi akun Instagram adalah "${connection.status}". Silakan hubungkan ulang akun Anda.`
      });
    }

    // 4. Decrypt Instagram Access Token
    let accessToken: string;
    try {
      accessToken = decryptToken(connection.encrypted_access_token);
      if (!accessToken) throw new Error('Token kosong setelah didekripsi.');
    } catch (decryptErr: any) {
      console.error('[API /publish/instagram] Gagal mendekripsi token akses:', decryptErr.message);
      return res.status(500).json({
        error: 'Decryption Error',
        message: 'Gagal mendekripsi kredensial akses Instagram di server.'
      });
    }

    const igUserId = connection.platform_account_id;
    const apiVersion = process.env.META_GRAPH_VERSION || 'v21.0';

    // 5. Meta Step 1: Create Media Container (POST /{ig-user-id}/media)
    const containerUrl = `https://graph.instagram.com/${apiVersion}/${igUserId}/media`;
    const containerParams = new URLSearchParams({
      image_url: imageUrl,
      access_token: accessToken
    });

    if (caption && typeof caption === 'string' && caption.trim().length > 0) {
      containerParams.append('caption', caption.trim());
    }

    const containerRes = await fetch(containerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: containerParams.toString()
    });

    const containerData = await containerRes.json().catch(() => null);

    if (!containerData || containerData.error || !containerData.id) {
      const errMsg = containerData?.error?.message || 'Meta menolak pembuatan kontainer media.';
      const errSubcode = containerData?.error?.error_subcode;
      console.error('[API /publish/instagram] Container creation error:', containerData?.error);
      return res.status(400).json({
        error: 'Meta Container Error',
        message: `Gagal membuat media container di Instagram: ${errMsg}`,
        code: containerData?.error?.code,
        subcode: errSubcode
      });
    }

    const containerId = containerData.id;

    // 6. Meta Step 2: Poll Container Readiness (Status Check)
    let isReady = false;
    let attempts = 0;
    const maxAttempts = 6; // up to ~12 seconds

    while (!isReady && attempts < maxAttempts) {
      attempts++;
      // Wait 2 seconds before status check
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const statusUrl = `https://graph.instagram.com/${apiVersion}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`;
      const statusRes = await fetch(statusUrl);
      const statusData = await statusRes.json().catch(() => null);
      const statusCode = statusData?.status_code;

      if (statusCode === 'FINISHED') {
        isReady = true;
        break;
      } else if (statusCode === 'ERROR') {
        console.error('[API /publish/instagram] Container processing status ERROR:', statusData);
        return res.status(400).json({
          error: 'Media Processing Error',
          message: 'Instagram gagal memproses gambar. Pastikan format gambar adalah JPEG dengan rasio aspek antara 4:5 hingga 1.91:1.'
        });
      }
      // If IN_PROGRESS or undefined, continue loop
    }

    // 7. Meta Step 3: Publish Container (POST /{ig-user-id}/media_publish)
    const publishUrl = `https://graph.instagram.com/${apiVersion}/${igUserId}/media_publish`;
    const publishParams = new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken
    });

    const publishRes = await fetch(publishUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: publishParams.toString()
    });

    const publishData = await publishRes.json().catch(() => null);

    if (!publishData || publishData.error || !publishData.id) {
      const errMsg = publishData?.error?.message || 'Meta menolak penerbitan postingan.';
      console.error('[API /publish/instagram] Media publish error:', publishData?.error);
      return res.status(400).json({
        error: 'Meta Publish Error',
        message: `Gagal mempublikasikan ke Instagram: ${errMsg}`,
        code: publishData?.error?.code
      });
    }

    const publishedPostId = publishData.id;

    // 8. Meta Step 4: Fetch Official Post Permalink (Best Effort)
    let permalink: string | null = null;
    try {
      const permalinkUrl = `https://graph.instagram.com/${apiVersion}/${publishedPostId}?fields=id,permalink&access_token=${encodeURIComponent(accessToken)}`;
      const permalinkRes = await fetch(permalinkUrl);
      const permalinkData = await permalinkRes.json().catch(() => null);
      if (permalinkData && permalinkData.permalink) {
        permalink = permalinkData.permalink;
      }
    } catch {
      // Best effort only; ignore permalink resolution failure
    }

    return res.status(200).json({
      success: true,
      postId: publishedPostId,
      permalink: permalink,
      accountHandle: connection.account_handle,
      accountName: connection.account_name
    });
  } catch (err: any) {
    console.error('[API /publish/instagram] Server exception:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan pada server saat mempublikasikan konten ke Instagram.',
      detail: err?.message
    });
  }
}
