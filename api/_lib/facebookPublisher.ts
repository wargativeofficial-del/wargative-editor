/**
 * Shared Facebook Publishing Service
 * Handles official Meta Graph API publishing for Facebook Pages:
 * 
 * 1. Single Image: POST /{page-id}/photos (with caption)
 * 2. Multi-Image: 
 *    - Upload photos unpublished: POST /{page-id}/photos (published=false, temporary=true)
 *    - Publish multi-photo feed post: POST /{page-id}/feed (attached_media=[...], message=caption)
 * 3. Resolve Official Post ID and Permalink
 * 
 * Reusable by both Instant Publishing (/api/publish/facebook)
 * and future Scheduled Publishing Worker (/api/cron/publish).
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';
import { decryptToken } from './crypto.js';

export interface PublishFacebookOptions {
  connectionId: string;
  userId: string;
  imageUrl?: string;
  imageUrls?: string[];
  caption?: string;
}

export interface PublishFacebookResult {
  success: boolean;
  postId: string;
  permalink: string | null;
  accountHandle: string;
  accountName: string;
}

export class FacebookPublishError extends Error {
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
    this.name = 'FacebookPublishError';
    this.statusCode = options?.statusCode || 400;
    this.errorType = options?.errorType || 'Publish Error';
    this.code = options?.code;
    this.subcode = options?.subcode;
  }
}

export async function publishFacebookPost(options: PublishFacebookOptions): Promise<PublishFacebookResult> {
  const { connectionId, userId, imageUrl, imageUrls, caption } = options;

  if (!connectionId) {
    throw new FacebookPublishError('Parameter connectionId wajib disertakan.', {
      statusCode: 400,
      errorType: 'Bad Request'
    });
  }

  if (!userId) {
    throw new FacebookPublishError('User tidak terautentikasi.', {
      statusCode: 401,
      errorType: 'Unauthorized'
    });
  }

  // 1. Resolve and validate media URLs
  let resolvedUrls: string[] = [];
  if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    resolvedUrls = imageUrls;
  } else if (imageUrl && typeof imageUrl === 'string') {
    const trimmed = imageUrl.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) resolvedUrls = parsed;
        else resolvedUrls = [trimmed];
      } catch {
        resolvedUrls = [trimmed];
      }
    } else {
      resolvedUrls = [trimmed];
    }
  }

  if (resolvedUrls.length === 0) {
    throw new FacebookPublishError('Parameter imageUrl atau imageUrls wajib disertakan.', {
      statusCode: 400,
      errorType: 'Bad Request'
    });
  }

  if (resolvedUrls.length > 10) {
    throw new FacebookPublishError(
      `Facebook post hanya mendukung maksimal 10 gambar per postingan (ditemukan: ${resolvedUrls.length}).`,
      { statusCode: 400, errorType: 'Bad Request' }
    );
  }

  for (let i = 0; i < resolvedUrls.length; i++) {
    const u = resolvedUrls[i];
    if (!u || typeof u !== 'string' || !u.startsWith('https://')) {
      throw new FacebookPublishError(
        `URL media ke-${i + 1} tidak valid. Semua URL wajib berupa URL HTTPS publik yang valid.`,
        { statusCode: 400, errorType: 'Bad Request' }
      );
    }
  }

  // 2. Query verified Facebook Page connection from PostgreSQL (strict user isolation)
  const supabase = getSupabaseAdmin();
  const { data: connection, error: connError } = await supabase
    .from('social_connections')
    .select('id, user_id, platform, platform_account_id, account_name, account_handle, encrypted_access_token, status')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .eq('platform', 'facebook')
    .eq('status', 'connected')
    .single();

  if (connError || !connection) {
    console.error('[Facebook Publisher] Connection lookup failed:', connError);
    throw new FacebookPublishError(
      'Koneksi Halaman Facebook tidak ditemukan atau belum terhubung dengan akun Anda. Silakan hubungkan ulang Halaman Facebook Anda di menu Pengaturan Akun Sosial.',
      { statusCode: 404, errorType: 'Connection Not Found' }
    );
  }

  if (!connection.platform_account_id) {
    throw new FacebookPublishError('Facebook Page ID (platform_account_id) tidak ditemukan pada data koneksi.', {
      statusCode: 400,
      errorType: 'Invalid Connection'
    });
  }

  if (!connection.encrypted_access_token) {
    throw new FacebookPublishError('Token akses Halaman Facebook tidak ditemukan pada data koneksi.', {
      statusCode: 400,
      errorType: 'Missing Token'
    });
  }

  // 3. Decrypt Page Access Token (server-side only)
  let pageAccessToken: string;
  try {
    pageAccessToken = decryptToken(connection.encrypted_access_token);
  } catch (decryptErr: any) {
    console.error('[Facebook Publisher] Token decryption error:', decryptErr);
    throw new FacebookPublishError(
      'Gagal mendekripsi token akses Halaman Facebook. Silakan putuskan dan sambungkan ulang akun Halaman Facebook Anda.',
      { statusCode: 500, errorType: 'Decryption Error' }
    );
  }

  const pageId = connection.platform_account_id;
  const postCaption = typeof caption === 'string' ? caption.trim() : '';

  try {
    let publishedPostId = '';

    if (resolvedUrls.length === 1) {
      // ========================================================================
      // Single Image Flow: POST /{page-id}/photos
      // ========================================================================
      const singlePhotoUrl = `https://graph.facebook.com/v21.0/${pageId}/photos`;
      const photoRes = await fetch(singlePhotoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: resolvedUrls[0],
          caption: postCaption,
          access_token: pageAccessToken
        })
      });

      const photoData = await photoRes.json().catch(() => null);

      if (!photoRes.ok || !photoData || photoData.error) {
        handleMetaApiError(photoData?.error || { message: `HTTP ${photoRes.status}` }, 'single photo');
      }

      publishedPostId = photoData.post_id || photoData.id;
    } else {
      // ========================================================================
      // Multi-Image Flow: Upload photos unpublished -> POST /{page-id}/feed
      // ========================================================================
      const attachedMedia: Array<{ media_fbid: string }> = [];

      for (let i = 0; i < resolvedUrls.length; i++) {
        const uploadPhotoUrl = `https://graph.facebook.com/v21.0/${pageId}/photos`;
        const uploadRes = await fetch(uploadPhotoUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: resolvedUrls[i],
            published: false,
            temporary: true,
            access_token: pageAccessToken
          })
        });

        const uploadData = await uploadRes.json().catch(() => null);

        if (!uploadRes.ok || !uploadData || uploadData.error) {
          handleMetaApiError(
            uploadData?.error || { message: `Gagal mengunggah slide ke-${i + 1}` },
            `photo upload slide ${i + 1}`
          );
        }

        if (!uploadData.id) {
          throw new FacebookPublishError(`Gagal mendapatkan ID media untuk slide ke-${i + 1}.`, {
            statusCode: 502,
            errorType: 'Media Upload Error'
          });
        }

        attachedMedia.push({ media_fbid: uploadData.id });
      }

      // Publish feed post attaching all uploaded photos
      const feedPostUrl = `https://graph.facebook.com/v21.0/${pageId}/feed`;
      const feedRes = await fetch(feedPostUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: postCaption,
          attached_media: attachedMedia,
          access_token: pageAccessToken
        })
      });

      const feedData = await feedRes.json().catch(() => null);

      if (!feedRes.ok || !feedData || feedData.error) {
        handleMetaApiError(feedData?.error || { message: `HTTP ${feedRes.status}` }, 'multi-photo feed');
      }

      publishedPostId = feedData.id;
    }

    if (!publishedPostId) {
      throw new FacebookPublishError('Meta tidak mengembalikan ID postingan Facebook yang valid.', {
        statusCode: 502,
        errorType: 'Publish Failed'
      });
    }

    // 4. Resolve Official Facebook Permalink
    let permalink: string | null = null;
    try {
      const permalinkUrl = `https://graph.facebook.com/v21.0/${publishedPostId}?fields=permalink_url&access_token=${pageAccessToken}`;
      const permalinkRes = await fetch(permalinkUrl);
      const permalinkData = await permalinkRes.json().catch(() => null);
      if (permalinkRes.ok && permalinkData?.permalink_url) {
        permalink = permalinkData.permalink_url;
      }
    } catch {
      // Non-fatal, fallback to standard Facebook URL
    }

    if (!permalink) {
      permalink = `https://www.facebook.com/${publishedPostId}`;
    }

    return {
      success: true,
      postId: publishedPostId,
      permalink: permalink,
      accountHandle: connection.account_handle || connection.account_name || 'Facebook Page',
      accountName: connection.account_name || 'Facebook Page'
    };
  } catch (err: any) {
    if (err instanceof FacebookPublishError) {
      throw err;
    }
    console.error('[Facebook Publisher] Unexpected publishing exception:', err);
    throw new FacebookPublishError(err?.message || 'Terjadi kesalahan sistem saat mempublikasikan ke Facebook Page.', {
      statusCode: 500,
      errorType: 'Publish Exception'
    });
  }
}

function handleMetaApiError(err: any, context: string): never {
  const code = err.code;
  const subcode = err.error_subcode;
  const rawMsg = err.message || 'Unknown Meta API error';

  console.error(`[Facebook Publisher] Meta API error during ${context}:`, err);

  if (code === 190) {
    throw new FacebookPublishError(
      'Sesi token Halaman Facebook telah kedaluwarsa atau dicabut oleh Meta. Silakan hubungkan ulang Halaman Facebook Anda di menu Pengaturan Akun Sosial.',
      { statusCode: 401, errorType: 'Token Expired', code, subcode }
    );
  }

  if (code === 10 || code === 200 || code === 210) {
    throw new FacebookPublishError(
      `Meta menolak izin penerbitan konten pada Halaman Facebook: ${rawMsg}. Pastikan Anda memiliki peran Admin/Editor pada Halaman Facebook ini.`,
      { statusCode: 403, errorType: 'Permission Denied', code, subcode }
    );
  }

  throw new FacebookPublishError(
    `Meta menolak penerbitan konten (${context}): ${rawMsg}`,
    { statusCode: 502, errorType: 'Meta API Error', code, subcode }
  );
}
