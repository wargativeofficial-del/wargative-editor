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
  imageUrl?: string;
  imageUrls?: string[];
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
  const { connectionId, userId, imageUrl, imageUrls, caption } = options;

  if (!connectionId) {
    throw new InstagramPublishError('Parameter connectionId wajib disertakan.', {
      statusCode: 400,
      errorType: 'Bad Request'
    });
  }

  // 1. Resolve & Validate Media URLs
  let resolvedUrls: string[] = [];
  if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    resolvedUrls = imageUrls;
  } else if (imageUrl && typeof imageUrl === 'string') {
    const trimmed = imageUrl.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          resolvedUrls = parsed;
        } else {
          resolvedUrls = [trimmed];
        }
      } catch {
        resolvedUrls = [trimmed];
      }
    } else {
      resolvedUrls = [trimmed];
    }
  }

  if (resolvedUrls.length === 0) {
    throw new InstagramPublishError('Parameter imageUrl atau imageUrls wajib disertakan.', {
      statusCode: 400,
      errorType: 'Bad Request'
    });
  }

  if (resolvedUrls.length > 10) {
    throw new InstagramPublishError(`Instagram Carousel hanya mendukung maksimal 10 gambar per postingan (ditemukan: ${resolvedUrls.length}).`, {
      statusCode: 400,
      errorType: 'Bad Request'
    });
  }

  for (let i = 0; i < resolvedUrls.length; i++) {
    const url = resolvedUrls[i];
    if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
      throw new InstagramPublishError(`URL media ke-${i + 1} tidak valid. Semua URL wajib menggunakan protokol HTTPS publik.`, {
        statusCode: 400,
        errorType: 'Bad Request'
      });
    }
  }

  const supabase = getSupabaseAdmin();

  // 2. Fetch social connection strictly scoped to user_id
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

  // 3. Decrypt Instagram Access Token
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
  const cleanCaption = caption && typeof caption === 'string' && caption.trim().length > 0 ? caption.trim() : null;

  let publishTargetContainerId: string;

  // 4. Branch: Single-Image Post vs Multi-Image Carousel Post
  if (resolvedUrls.length === 1) {
    // =========================================================================
    // WORKFLOW A: Single-Image Post (Existing Proven Workflow)
    // =========================================================================
    const containerUrl = `https://graph.instagram.com/${apiVersion}/${igUserId}/media`;
    const containerParams = new URLSearchParams({
      image_url: resolvedUrls[0],
      access_token: accessToken
    });

    if (cleanCaption) {
      containerParams.append('caption', cleanCaption);
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
      console.error('[InstagramPublisher] Single container creation error:', containerData?.error);
      throw new InstagramPublishError(`Gagal membuat media container di Instagram: ${errMsg}`, {
        statusCode: 400,
        errorType: 'Meta Container Error',
        code: errCode,
        subcode: errSubcode
      });
    }

    publishTargetContainerId = containerData.id;

    // Poll status for single container
    await pollContainerStatus(apiVersion, publishTargetContainerId, accessToken, 'gambar');
  } else {
    // =========================================================================
    // WORKFLOW B: Instagram Carousel Post (2–10 Slides)
    // =========================================================================
    const childContainerIds: string[] = [];

    // Step B1: Create child item containers for each image slide (NO caption on child)
    for (let i = 0; i < resolvedUrls.length; i++) {
      const slideUrl = resolvedUrls[i];
      const childParams = new URLSearchParams({
        image_url: slideUrl,
        is_carousel_item: 'true',
        access_token: accessToken
      });

      const childRes = await fetch(`https://graph.instagram.com/${apiVersion}/${igUserId}/media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: childParams.toString()
      });

      const childData = await childRes.json().catch(() => null);

      if (!childData || childData.error || !childData.id) {
        const errMsg = childData?.error?.message || `Meta menolak slide ke-${i + 1}.`;
        const errCode = childData?.error?.code;
        const errSubcode = childData?.error?.error_subcode;
        console.error(`[InstagramPublisher] Carousel child ${i + 1} creation error:`, childData?.error);
        throw new InstagramPublishError(`Gagal membuat item container carousel ke-${i + 1} di Instagram: ${errMsg}`, {
          statusCode: 400,
          errorType: 'Meta Carousel Item Error',
          code: errCode,
          subcode: errSubcode
        });
      }

      childContainerIds.push(childData.id);
    }

    // Step B2: Poll all child item containers until FINISHED
    for (let i = 0; i < childContainerIds.length; i++) {
      await pollContainerStatus(apiVersion, childContainerIds[i], accessToken, `slide carousel ke-${i + 1}`);
    }

    // Step B3: Create Parent Carousel Container with children IDs and caption
    const parentParams = new URLSearchParams({
      media_type: 'CAROUSEL',
      children: childContainerIds.join(','),
      access_token: accessToken
    });

    if (cleanCaption) {
      parentParams.append('caption', cleanCaption);
    }

    const parentRes = await fetch(`https://graph.instagram.com/${apiVersion}/${igUserId}/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: parentParams.toString()
    });

    const parentData = await parentRes.json().catch(() => null);

    if (!parentData || parentData.error || !parentData.id) {
      const errMsg = parentData?.error?.message || 'Meta menolak pembuatan kontainer carousel utama.';
      const errCode = parentData?.error?.code;
      const errSubcode = parentData?.error?.error_subcode;
      console.error('[InstagramPublisher] Parent carousel container creation error:', parentData?.error);
      throw new InstagramPublishError(`Gagal membuat kontainer carousel utama di Instagram: ${errMsg}`, {
        statusCode: 400,
        errorType: 'Meta Carousel Parent Error',
        code: errCode,
        subcode: errSubcode
      });
    }

    publishTargetContainerId = parentData.id;

    // Step B4: Poll status for parent carousel container
    await pollContainerStatus(apiVersion, publishTargetContainerId, accessToken, 'carousel utama');
  }

  // 5. Meta Publish: POST /{ig-user-id}/media_publish
  const publishUrl = `https://graph.instagram.com/${apiVersion}/${igUserId}/media_publish`;
  const publishParams = new URLSearchParams({
    creation_id: publishTargetContainerId,
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

  // 6. Meta Permalink: Fetch Official Post Permalink (Best Effort)
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

/**
 * Polls container status until FINISHED or ERROR/timeout
 */
async function pollContainerStatus(
  apiVersion: string,
  containerId: string,
  accessToken: string,
  label: string
): Promise<void> {
  let isReady = false;
  let attempts = 0;
  const maxAttempts = 6; // up to ~12 seconds

  while (!isReady && attempts < maxAttempts) {
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const statusUrl = `https://graph.instagram.com/${apiVersion}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`;
    const statusRes = await fetch(statusUrl);
    const statusData = await statusRes.json().catch(() => null);
    const statusCode = statusData?.status_code;

    if (statusCode === 'FINISHED') {
      isReady = true;
      break;
    } else if (statusCode === 'ERROR') {
      console.error(`[InstagramPublisher] Container (${label}) status ERROR:`, statusData);
      throw new InstagramPublishError(`Instagram gagal memproses ${label}. Pastikan format gambar adalah JPEG/PNG dengan rasio aspek antara 4:5 hingga 1.91:1.`, {
        statusCode: 400,
        errorType: 'Media Processing Error'
      });
    }
  }

  if (!isReady) {
    throw new InstagramPublishError(`Batas waktu pemrosesan ${label} di Instagram habis (timeout).`, {
      statusCode: 408,
      errorType: 'Processing Timeout'
    });
  }
}
