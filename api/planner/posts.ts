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

/**
 * Strict ISO 8601 regex:
 * Format: YYYY-MM-DDTHH:mm:ss(.sss)?(Z|[+-]HH:mm)
 * Example: 2026-10-05T14:30:00Z, 2026-10-05T14:30:00.000Z, 2026-10-05T14:30:00+07:00, 2026-10-05T14:30:00-05:00
 */
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

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
    case 'PATCH':
      return handlePatch(req, res, user.id, supabase);
    case 'DELETE':
      return handleDelete(req, res, user.id, supabase);
    default:
      res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
      return res.status(405).json({
        error: 'Method Not Allowed',
        message: `Metode ${req.method} tidak diizinkan pada endpoint ini. Gunakan GET, POST, PATCH, atau DELETE.`
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
      message: `Penjadwalan postingan hanya mendukung maksimal 10 gambar per postingan (ditemukan: ${urlList.length}).`
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

  const trimmedPostDate = scheduledAt.trim();
  if (!ISO_8601_REGEX.test(trimmedPostDate)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Format scheduledAt tidak valid. Gunakan format ISO 8601 resmi (contoh: 2026-10-05T14:30:00Z atau 2026-10-05T14:30:00+07:00).'
    });
  }

  const parsedDate = new Date(trimmedPostDate);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Nilai tanggal atau waktu pada parameter scheduledAt tidak valid.'
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

    if (connection.platform !== 'instagram' && connection.platform !== 'facebook') {
      return res.status(400).json({
        error: 'Invalid Platform',
        message: `Platform penjadwalan saat ini hanya mendukung Instagram dan Facebook (ditemukan: ${connection.platform}).`
      });
    }

    if (connection.status !== 'connected') {
      const platformLabel = connection.platform === 'facebook' ? 'Halaman Facebook' : 'Instagram';
      return res.status(400).json({
        error: 'Connection Inactive',
        message: `Koneksi akun ${platformLabel} (${connection.account_handle || connection.account_name}) tidak aktif. Silakan hubungkan ulang akun Anda.`
      });
    }

    // Insert scheduled post record
    const { data: insertedPost, error: insertError } = await supabase
      .from('scheduled_posts')
      .insert({
        user_id: userId, // Strictly set from authenticated JWT
        connection_id: connection.id,
        platform: connection.platform, // Determines either instagram or facebook
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
 * PATCH /api/planner/posts
 * Updates scheduled post content (caption, scheduledAt) or status (Phase 4A/4B)
 * Supports:
 * 1. Reschedule (scheduledAt) and Edit Caption (caption) for 'scheduled' posts
 * 2. Atomic claim to 'publishing' for Instant Publish
 * 3. Completion to 'published' with publishedPostId
 * 4. Revert to 'scheduled' if instant publishing fails
 */
async function handlePatch(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  supabase: ReturnType<typeof getSupabaseAdmin>
) {
  const { id, status, publishedPostId, caption, scheduledAt } = req.body || {};

  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Parameter id postingan terjadwal wajib disertakan.'
    });
  }

  const cleanId = id.trim();
  const isContentUpdate = caption !== undefined || scheduledAt !== undefined;

  // Validation for content update (reschedule / edit caption)
  let parsedScheduledDate: Date | null = null;
  if (scheduledAt !== undefined) {
    if (typeof scheduledAt !== 'string' || scheduledAt.trim().length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Parameter scheduledAt harus berupa string tanggal dan waktu ISO yang valid.'
      });
    }

    const trimmedDate = scheduledAt.trim();
    if (!ISO_8601_REGEX.test(trimmedDate)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Format parameter scheduledAt tidak valid. Gunakan format ISO 8601 resmi (contoh: 2026-10-05T14:30:00Z atau 2026-10-05T14:30:00+07:00).'
      });
    }

    const d = new Date(trimmedDate);
    if (isNaN(d.getTime())) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Nilai tanggal atau waktu pada parameter scheduledAt tidak valid.'
      });
    }

    if (d.getTime() <= Date.now()) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Waktu jadwal (scheduledAt) harus berada di masa depan.'
      });
    }

    parsedScheduledDate = d;
  }

  if (caption !== undefined && typeof caption !== 'string') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Parameter caption harus berupa teks string.'
    });
  }

  // If not a content update, validate status parameter for existing status transitions
  if (!isContentUpdate) {
    if (!status || !['publishing', 'published', 'scheduled'].includes(status)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Parameter status tidak valid. Status yang diizinkan: publishing, published, scheduled.'
      });
    }
  }

  try {
    // Branch A: Reschedule or Edit Caption (Phase 4B)
    // Strictly allowed ONLY when current record status is 'scheduled'
    if (isContentUpdate) {
      const updates: Record<string, any> = {
        updated_at: new Date().toISOString()
      };
      if (caption !== undefined) {
        updates.caption = caption.trim();
      }
      if (parsedScheduledDate) {
        updates.scheduled_at = parsedScheduledDate.toISOString();
      }

      const { data: updatedPost, error: updateError } = await supabase
        .from('scheduled_posts')
        .update(updates)
        .eq('id', cleanId)
        .eq('user_id', userId)
        .eq('status', 'scheduled')
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
          updated_at
        `)
        .maybeSingle();

      if (updateError) {
        console.error('[API /planner/posts] Database update error in PATCH (content/schedule):', updateError);
        return res.status(500).json({
          error: 'Database Error',
          message: 'Gagal memperbarui postingan terjadwal.',
          detail: updateError.message
        });
      }

      if (!updatedPost) {
        // Inspect current post status to provide clear, actionable conflict feedback
        const { data: existingPost } = await supabase
          .from('scheduled_posts')
          .select('id, status')
          .eq('id', cleanId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!existingPost) {
          return res.status(404).json({
            error: 'Not Found',
            message: 'Postingan terjadwal tidak ditemukan atau bukan milik akun Anda.'
          });
        }

        return res.status(409).json({
          error: 'Conflict',
          message: `Postingan tidak dapat diedit atau dijadwalkan ulang karena status saat ini adalah "${existingPost.status}". Hanya postingan berstatus terjadwal yang dapat diedit.`
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Postingan terjadwal berhasil diperbarui.',
        post: updatedPost
      });
    }

    // Branch B: Status Transitions (Phase 4A Backward Compatibility)
    // 1. Transition to 'publishing' (Atomic claim for Instant Publish)
    if (status === 'publishing') {
      const { data: claimedPost, error: claimError } = await supabase
        .from('scheduled_posts')
        .update({
          status: 'publishing',
          updated_at: new Date().toISOString()
        })
        .eq('id', cleanId)
        .eq('user_id', userId)
        .eq('status', 'scheduled')
        .select('id, status')
        .maybeSingle();

      if (claimError) {
        console.error('[API /planner/posts] Database claim error in PATCH:', claimError);
        return res.status(500).json({
          error: 'Database Error',
          message: 'Gagal memperbarui status postingan ke antrean publikasi.',
          detail: claimError.message
        });
      }

      if (!claimedPost) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Postingan tidak dapat dipublikasikan karena sedang diproses oleh sistem atau sudah tidak berstatus terjadwal.'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Postingan berhasil diklaim untuk publikasi.',
        post: claimedPost
      });
    }

    // 2. Transition to 'published' (Instant Publish succeeded)
    if (status === 'published') {
      const { data: publishedPost, error: pubError } = await supabase
        .from('scheduled_posts')
        .update({
          status: 'published',
          published_post_id: typeof publishedPostId === 'string' ? publishedPostId.trim() : null,
          error_message: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', cleanId)
        .eq('user_id', userId)
        .in('status', ['publishing', 'scheduled'])
        .select('id, status, published_post_id')
        .maybeSingle();

      if (pubError) {
        console.error('[API /planner/posts] Database update error in PATCH (published):', pubError);
        return res.status(500).json({
          error: 'Database Error',
          message: 'Gagal memperbarui status postingan ke published.',
          detail: pubError.message
        });
      }

      if (!publishedPost) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Postingan tidak ditemukan atau bukan milik akun Anda.'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Status postingan berhasil diubah menjadi published.',
        post: publishedPost
      });
    }

    // 3. Transition to 'scheduled' (Instant Publish failed, revert claim)
    if (status === 'scheduled') {
      const { data: revertedPost, error: revError } = await supabase
        .from('scheduled_posts')
        .update({
          status: 'scheduled',
          updated_at: new Date().toISOString()
        })
        .eq('id', cleanId)
        .eq('user_id', userId)
        .eq('status', 'publishing')
        .select('id, status')
        .maybeSingle();

      if (revError) {
        console.error('[API /planner/posts] Database update error in PATCH (scheduled revert):', revError);
        return res.status(500).json({
          error: 'Database Error',
          message: 'Gagal mengembalikan status postingan ke scheduled.',
          detail: revError.message
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Status postingan dikembalikan ke scheduled.',
        post: revertedPost
      });
    }
  } catch (err: any) {
    console.error('[API /planner/posts] Server exception in PATCH:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan pada server saat memperbarui postingan.',
      detail: err?.message
    });
  }
}

/**
 * DELETE /api/planner/posts?id=...
 * Deletes a scheduled post owned by the authenticated user
 * Strictly protected against deleting posts that are 'publishing' or 'published'
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

  const cleanId = postId.trim();

  try {
    // 1. Verify existence and current status
    const { data: existingPost, error: fetchError } = await supabase
      .from('scheduled_posts')
      .select('id, user_id, status')
      .eq('id', cleanId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      console.error('[API /planner/posts] Database check error:', fetchError);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Gagal memeriksa status postingan.',
        detail: fetchError.message
      });
    }

    if (!existingPost) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Postingan terjadwal tidak ditemukan atau bukan milik akun Anda.'
      });
    }

    // 2. Reject deletion if currently publishing
    if (existingPost.status === 'publishing') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Postingan sedang dalam proses publikasi oleh sistem dan tidak dapat dihapus.'
      });
    }

    // 3. Reject deletion if already published
    if (existingPost.status === 'published') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Postingan yang sudah berhasil tayang tidak dapat dihapus melalui fitur hapus jadwal.'
      });
    }

    // 4. Atomic delete: only delete if status is still 'scheduled' or 'failed'
    const { data: deletedPost, error: deleteError } = await supabase
      .from('scheduled_posts')
      .delete()
      .eq('id', cleanId)
      .eq('user_id', userId)
      .in('status', ['scheduled', 'failed'])
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
      return res.status(409).json({
        error: 'Conflict',
        message: 'Status postingan berubah saat hendak dihapus. Postingan mungkin sedang diproses oleh sistem.'
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
