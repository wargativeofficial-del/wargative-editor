/**
 * Shared Instagram Publishing Service
 * Handles official 2-step Meta Graph API publishing:
 * 1. Create Media Container (POST /{ig-user-id}/media)
 * 2. Status Polling until FINISHED
 * 3. Media Publish (POST /{ig-user-id}/media_publish)
 * 4. Resolve Official Post ID and Permalink
 * 
 * Reusable by both Instant Publishing (/api/publish/instagram)
 * and Scheduled Publishing Worker (/api/cron/publish).
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';
import { decryptToken } from './crypto.js';

export interface PublishInstagramOptions {
  connectionId: string;
  userId: string;
  imageUrl: string;
  caption?: string;
}

export interface PublishInstagramResult {
  success: boolean;
  postId: string;
  permalink: string | null;
  accountHandle: string;
  accountName: string;
}

export class InstagramPublishError extends Error {
  public statusCode: number;
  public errorType: string;
  public code?: number;
  public subcode?: number;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      errorType?: string;
      code?: number;
      subcode?: number;
    }
  ) {
    super(message);
    this.name = 'InstagramPublishError';
    this.statusCode = options?.statusCode || 400;
    this.errorType = options?.errorType || 'Publish Error';
    this.code = options?.code;
    this.subcode = options?.subcode;
  }
}

export async function publishInstagramPost(options: PublishInstagramOptions): Promise<PublishInstagramResult> {
  const { connectionId, userId, imageUrl, caption } = options;

  if (!connectionId) {
    throw new InstagramPublishError('Parameter connectionId wajib disertakan.', {
      statusCode: 400,
      errorType: 'Bad Request'
    });
  }

  if (!imageUrl || !imageUrl.startsWith('https://')) {
    throw new InstagramPublishError('Parameter imageUrl wajib berupa URL HTTPS publik yang valid.', {
      statusCode: 400,
      errorType: 'Bad Request'
    });
  }

  const supabase = getSupabaseAdmin();

  // 1. Fetch social connection strictly scoped to user_id
  const { data: connection, error: connError } = await supabase
    .from('social_connections')
    .select('id, user_id, platform, platform_account_id, account_name, account_handle, encrypted_access_token, status')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (connError || !connection) {
    throw new InstagramPublishError('Koneksi akun Instagram tidak ditemukan atau bukan milik akun Anda.', {
      statusCode: 404,
      errorType: 'Not Found'
    });
  }

  if (connection.platform !== 'instagram') {
    throw new InstagramPublishError(`Koneksi ini bukan platform Instagram (ditemukan: ${connection.platform}).`, {
      statusCode: 400,
      errorType: 'Invalid Platform'
    });
  }

  if (connection.status !== 'connected') {
    throw new InstagramPublishError(`Status koneksi akun Instagram adalah "${connection.status}". Silakan hubungkan ulang akun Anda.`, {
      statusCode: 400,
      errorType: 'Connection Inactive'
    });
  }

  // 2. Decrypt Instagram Access Token
  let accessToken: string;
  try {
    accessToken = decryptToken(connection.encrypted_access_token);
    if (!accessToken) throw new Error('Token kosong.');
  } catch (decryptErr: any) {
    console.error('[InstagramPublisher] Gagal mendekripsi token akses:', decryptErr.message);
    throw new InstagramPublishError('Gagal mendekripsi kredensial akses Instagram di server.', {
      statusCode: 500,
      errorType: 'Decryption Error'
    });
  }

  const igUserId = connection.platform_account_id;
  const apiVersion = process.env.META_GRAPH_VERSION || 'v21.0';

  // 3. Meta Step 1: Create Media Container (POST /{ig-user-id}/media)
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
    const errCode = containerData?.error?.code;
    const errSubcode = containerData?.error?.error_subcode;
    console.error('[InstagramPublisher] Container creation error:', containerData?.error);
    throw new InstagramPublishError(`Gagal membuat media container di Instagram: ${errMsg}`, {
      statusCode: 400,
      errorType: 'Meta Container Error',
      code: errCode,
      subcode: errSubcode
    });
  }

  const containerId = containerData.id;

  // 4. Meta Step 2: Poll Container Readiness (Status Check)
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
      console.error('[InstagramPublisher] Container processing status ERROR:', statusData);
      throw new InstagramPublishError('Instagram gagal memproses gambar. Pastikan format gambar adalah JPEG dengan rasio aspek antara 4:5 hingga 1.91:1.', {
        statusCode: 400,
        errorType: 'Media Processing Error'
      });
    }
  }

  // 5. Meta Step 3: Publish Container (POST /{ig-user-id}/media_publish)
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
    const errCode = publishData?.error?.code;
    console.error('[InstagramPublisher] Media publish error:', publishData?.error);
    throw new InstagramPublishError(`Gagal mempublikasikan ke Instagram: ${errMsg}`, {
      statusCode: 400,
      errorType: 'Meta Publish Error',
      code: errCode
    });
  }

  const publishedPostId = publishData.id;

  // 6. Meta Step 4: Fetch Official Post Permalink (Best Effort)
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

  return {
    success: true,
    postId: publishedPostId,
    permalink: permalink,
    accountHandle: connection.account_handle,
    accountName: connection.account_name
  };
}
