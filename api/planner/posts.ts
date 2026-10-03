/**
 * Endpoint: /api/planner/posts
 * Scheduled Posts Management API (Phase 4B-1)
 * 
 * Supports:
 * - GET: Fetch scheduled posts for authenticated user
 * - POST: Create new scheduled post for authenticated user
 * - DELETE: Delete scheduled post owned by authenticated user
 * 
 * Security:
 * - Requires verified Supabase JWT Bearer token
 * - Derives user_id solely from verified auth token (never trusts client inputs)
 * - Verifies that connection_id belongs to authenticated user and is an active Instagram connection
 * - Enforces HTTPS media_url and future-dated scheduled_at
 * - Scopes all queries and mutations strictly by user_id
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest } from '../_lib/authMiddleware.js';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Authenticate user from session JWT
  const user = await authenticateRequest(req, res);
  if (!user) return; // 401 already sent by authenticateRequest

  const supabase = getSupabaseAdmin();

  // 2. Dispatch based on HTTP Method
  switch (req.method) {
    case 'GET':
      return handleGet(req, res, user.id, supabase);
    case 'POST':
      return handlePost(req, res, user.id, supabase);
    case 'DELETE':
      return handleDelete(req, res, user.id, supabase);
    default:
      res.setHeader('Allow', 'GET, POST, DELETE');
      return res.status(405).json({
        error: 'Method Not Allowed',
        message: `Metode ${req.method} tidak diizinkan pada endpoint ini. Gunakan GET, POST, atau DELETE.`
      });
  }
}

/**
 * GET /api/planner/posts
 * Retrieves scheduled posts owned by the authenticated user
 */
async function handleGet(
  _req: VercelRequest,
  res: VercelResponse,
  userId: string,
  supabase: ReturnType<typeof getSupabaseAdmin>
) {
  try {
    const { data: posts, error } = await supabase
      .from('scheduled_posts')
      .select(`
        id,
        user_id,
        connection_id,
        platform,
        caption,
        media_url,
        scheduled_at,
        status,
        published_post_id,
        error_message,
        created_at,
        updated_at,
        social_connections:connection_id (
          id,
          platform,
          account_name,
          account_handle,
          avatar_url
        )
      `)
      .eq('user_id', userId)
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.error('[API /planner/posts] Database fetch error:', error);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Gagal mengambil daftar postingan terjadwal.',
        detail: error.message
      });
    }

    return res.status(200).json({
      success: true,
      count: posts ? posts.length : 0,
      posts: posts || []
    });
  } catch (err: any) {
    console.error('[API /planner/posts] Server exception in GET:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan pada server saat mengambil postingan terjadwal.',
      detail: err?.message
    });
  }
}

/**
 * POST /api/planner/posts
 * Schedules a new post for the authenticated user
 */
async function handlePost(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  supabase: ReturnType<typeof getSupabaseAdmin>
) {
  const { connectionId, caption, mediaUrl, mediaUrls, scheduledAt } = req.body || {};

  // Validation: connectionId
  if (!connectionId || typeof connectionId !== 'string' || connectionId.trim().length === 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Parameter connectionId wajib disertakan.'
    });
  }

  // Resolve and validate media URLs (supports single HTTPS URL, JSON array string, or mediaUrls array)
  let resolvedMediaUrl = '';
  let urlList: string[] = [];

  if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
    urlList = mediaUrls;
    resolvedMediaUrl = urlList.length === 1 ? urlList[0] : JSON.stringify(urlList);
  } else if (mediaUrl && typeof mediaUrl === 'string') {
    const trimmed = mediaUrl.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          urlList = parsed;
          resolvedMediaUrl = urlList.length === 1 ? urlList[0] : trimmed;
        } else {
          urlList = [trimmed];
          resolvedMediaUrl = trimmed;
        }
      } catch {
        urlList = [trimmed];
        resolvedMediaUrl = trimmed;
      }
    } else {
      urlList = [trimmed];
      resolvedMediaUrl = trimmed;
    }
  }

  if (urlList.length === 0 || !resolvedMediaUrl) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Parameter mediaUrl atau mediaUrls wajib disertakan.'
    });
  }

  if (urlList.length > 10) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Instagram Carousel hanya mendukung maksimal 10 gambar per postingan (ditemukan: ${urlList.length}).`
    });
  }

  for (let i = 0; i < urlList.length; i++) {
    const u = urlList[i];
    if (!u || typeof u !== 'string' || !u.startsWith('https://')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `URL media ke-${i + 1} tidak valid. Semua URL wajib berupa URL HTTPS publik yang valid.`
      });
    }
  }

  // Validation: scheduledAt (Must be valid future date)
  if (!scheduledAt || typeof scheduledAt !== 'string') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Parameter scheduledAt wajib disertakan dalam format ISO 8601 (contoh: 2026-10-05T14:30:00.000Z).'
    });
  }

  const parsedDate = new Date(scheduledAt);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Format scheduledAt tidak valid. Gunakan format ISO 8601.'
    });
  }

  if (parsedDate.getTime() <= Date.now()) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Waktu scheduledAt harus berada di masa depan.'
    });
  }

  try {
    // Verify connection ownership, platform, and active status
    const { data: connection, error: connError } = await supabase
      .from('social_connections')
      .select('id, user_id, platform, status, account_name, account_handle')
      .eq('id', connectionId.trim())
      .eq('user_id', userId)
      .maybeSingle();

    if (connError || !connection) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Koneksi akun media sosial tidak ditemukan atau bukan milik akun Anda.'
      });
    }

    if (connection.platform !== 'instagram') {
      return res.status(400).json({
        error: 'Invalid Platform',
        message: `Platform penjadwalan saat ini hanya mendukung Instagram (ditemukan: ${connection.platform}).`
      });
    }

    if (connection.status !== 'connected') {
      return res.status(400).json({
        error: 'Connection Inactive',
        message: `Koneksi akun Instagram (${connection.account_handle || connection.account_name}) tidak aktif. Silakan hubungkan ulang akun Anda.`
      });
    }

    // Insert scheduled post record
    const { data: insertedPost, error: insertError } = await supabase
      .from('scheduled_posts')
      .insert({
        user_id: userId, // Strictly set from authenticated JWT
        connection_id: connection.id,
        platform: 'instagram', // Automatically determined as instagram
        caption: typeof caption === 'string' ? caption.trim() : null,
        media_url: resolvedMediaUrl,
        scheduled_at: parsedDate.toISOString(),
        status: 'scheduled'
      })
      .select(`
        id,
        user_id,
        connection_id,
        platform,
        caption,
        media_url,
        scheduled_at,
        status,
        created_at,
        updated_at
      `)
      .single();

    if (insertError || !insertedPost) {
      console.error('[API /planner/posts] Database insert error:', insertError);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Gagal menyimpan postingan terjadwal ke database.',
        detail: insertError?.message
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Postingan berhasil dijadwalkan.',
      post: insertedPost
    });
  } catch (err: any) {
    console.error('[API /planner/posts] Server exception in POST:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan pada server saat menjadwalkan postingan.',
      detail: err?.message
    });
  }
}

/**
 * DELETE /api/planner/posts?id=...
 * Deletes a scheduled post owned by the authenticated user
 */
async function handleDelete(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  supabase: ReturnType<typeof getSupabaseAdmin>
) {
  const postId = (req.query.id as string) || (req.body && req.body.id);

  if (!postId || typeof postId !== 'string' || postId.trim().length === 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Parameter id postingan terjadwal wajib disertakan pada query parameter (?id=...).'
    });
  }

  try {
    // Delete only if post belongs to authenticated user
    const { data: deletedPost, error: deleteError } = await supabase
      .from('scheduled_posts')
      .delete()
      .eq('id', postId.trim())
      .eq('user_id', userId)
      .select('id, user_id, status')
      .maybeSingle();

    if (deleteError) {
      console.error('[API /planner/posts] Database delete error:', deleteError);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Gagal menghapus postingan terjadwal dari database.',
        detail: deleteError.message
      });
    }

    if (!deletedPost) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Postingan terjadwal tidak ditemukan atau bukan milik akun Anda.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Postingan terjadwal berhasil dihapus.',
      deletedId: deletedPost.id
    });
  } catch (err: any) {
    console.error('[API /planner/posts] Server exception in DELETE:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan pada server saat menghapus postingan terjadwal.',
      detail: err?.message
    });
  }
}
