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
 * 
 * Implementation:
 * - Delegates core publishing logic to shared helper (api/_lib/instagramPublisher.ts)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest } from '../_lib/authMiddleware.js';
import { publishInstagramPost, InstagramPublishError } from '../_lib/instagramPublisher.js';

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

  const { connectionId, imageUrl, imageUrls, caption } = req.body || {};

  if (!connectionId || typeof connectionId !== 'string') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Parameter connectionId wajib disertakan.'
    });
  }

  // Resolve media URLs (supports imageUrl string or imageUrls array)
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
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Parameter imageUrl atau imageUrls wajib disertakan.'
    });
  }

  if (resolvedUrls.length > 10) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Instagram Carousel hanya mendukung maksimal 10 gambar per postingan (ditemukan: ${resolvedUrls.length}).`
    });
  }

  for (let i = 0; i < resolvedUrls.length; i++) {
    const u = resolvedUrls[i];
    if (!u || typeof u !== 'string' || !u.startsWith('https://')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `URL media ke-${i + 1} tidak valid. Semua URL wajib berupa URL HTTPS publik yang valid.`
      });
    }
  }

  try {
    const result = await publishInstagramPost({
      connectionId,
      userId: user.id,
      imageUrls: resolvedUrls,
      caption
    });

    return res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof InstagramPublishError) {
      return res.status(err.statusCode).json({
        error: err.errorType,
        message: err.message,
        ...(err.code !== undefined ? { code: err.code } : {}),
        ...(err.subcode !== undefined ? { subcode: err.subcode } : {})
      });
    }

    console.error('[API /publish/instagram] Server exception:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan pada server saat mempublikasikan konten ke Instagram.',
      detail: err?.message
    });
  }
}
