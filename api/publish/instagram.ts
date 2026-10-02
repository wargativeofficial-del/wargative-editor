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
    const result = await publishInstagramPost({
      connectionId,
      userId: user.id,
      imageUrl,
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
