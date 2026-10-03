/**
 * Endpoint: /api/cron/publish
 * Instagram Scheduled Posts Cron Publisher (Phase 4B-3)
 * 
 * Invoked periodically by Vercel Cron or authorized scheduler to:
 * 1. Authenticate request via CRON_SECRET Bearer token
 * 2. Query scheduled posts that have reached their scheduled_at time (scheduled_at <= NOW())
 * 3. Perform atomic claim (UPDATE status = 'publishing' WHERE id = post.id AND status = 'scheduled')
 *    to prevent duplicate processing across concurrent worker invocations
 * 4. Validate post attributes (connection_id, HTTPS media_url, platform = instagram)
 * 5. Call existing shared Instagram publisher (api/_lib/instagramPublisher.ts)
 * 6. Update status to 'published' with published_post_id, or 'failed' with error_message
 * 7. Return summary JSON without exposing any tokens or secrets
 * 
 * Security:
 * - Protected by CRON_SECRET constant-time verification
 * - Scoped strictly to database source of truth (public.scheduled_posts)
 * - Zero token or credential exposure in logs or API response
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { publishInstagramPost } from '../_lib/instagramPublisher.js';
import { publishFacebookPost } from '../_lib/facebookPublisher.js';

const BATCH_LIMIT = 10;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Method check: Support GET (default for Vercel Cron) and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: `Metode ${req.method} tidak diizinkan. Gunakan GET atau POST.`
    });
  }

  // 2. Cron Authentication: Verify CRON_SECRET Bearer token
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.trim().length === 0) {
    console.error('[Cron Publisher] CRON_SECRET belum dikonfigurasi di server environment.');
    return res.status(500).json({
      error: 'Server Misconfiguration',
      message: 'CRON_SECRET belum dikonfigurasi pada environment server.'
    });
  }

  const rawHeader = req.headers.authorization;
  const authHeader = Array.isArray(rawHeader) ? rawHeader[0] : (rawHeader || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

  let isAuthorized = false;
  try {
    const bufExpected = Buffer.from(cronSecret.trim());
    const bufToken = Buffer.from(token);
    if (bufExpected.length === bufToken.length && crypto.timingSafeEqual(bufExpected, bufToken)) {
      isAuthorized = true;
    }
  } catch {
    isAuthorized = false;
  }

  if (!isAuthorized) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Otorisasi gagal: CRON_SECRET tidak valid atau tidak disertakan.'
    });
  }

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  // 3. Query due posts: status = 'scheduled' AND scheduled_at <= NOW()
  const { data: duePosts, error: fetchError } = await supabase
    .from('scheduled_posts')
    .select('id, user_id, connection_id, platform, caption, media_url, scheduled_at, status')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (fetchError) {
    console.error('[Cron Publisher] Database fetch error:', fetchError);
    return res.status(500).json({
      error: 'Database Error',
      message: 'Gagal mengambil jadwal postingan dari database.',
      detail: fetchError.message
    });
  }

  if (!duePosts || duePosts.length === 0) {
    return res.status(200).json({
      success: true,
      processed: 0,
      published: 0,
      failed: 0,
      skipped: 0
    });
  }

  let processed = 0;
  let published = 0;
  let failed = 0;
  let skipped = 0;

  // 4. Process each due post with atomic claim
  for (const post of duePosts) {
    // ATOMIC CLAIM:
    // Only claim if status is STILL 'scheduled'
    const { data: claimedRows, error: claimError } = await supabase
      .from('scheduled_posts')
      .update({
        status: 'publishing',
        updated_at: new Date().toISOString()
      })
      .eq('id', post.id)
      .eq('status', 'scheduled')
      .select('id');

    if (claimError) {
      console.error(`[Cron Publisher] Gagal melakukan atomic claim untuk post ${post.id}:`, claimError);
      skipped++;
      continue;
    }

    if (!claimedRows || claimedRows.length === 0) {
      // 0 rows updated -> claimed by another concurrent worker instance
      console.log(`[Cron Publisher] Post ${post.id} sudah diambil worker lain. Melewati.`);
      skipped++;
      continue;
    }

    // Post successfully claimed by this worker instance
    processed++;

    // 5. Post Data Validation
    if (!post.connection_id || typeof post.connection_id !== 'string') {
      await markPostFailed(supabase, post.id, 'Parameter connection_id tidak valid atau kosong.');
      failed++;
      continue;
    }

    if (post.platform !== 'instagram' && post.platform !== 'facebook') {
      await markPostFailed(supabase, post.id, `Platform "${post.platform}" belum didukung oleh Cron Publisher.`);
      failed++;
      continue;
    }

    const rawMedia = (post.media_url || '').trim();
    let isValidMedia = false;
    if (rawMedia.startsWith('https://')) {
      isValidMedia = true;
    } else if (rawMedia.startsWith('[')) {
      try {
        const parsed = JSON.parse(rawMedia);
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.length <= 10 &&
          parsed.every((u: any) => typeof u === 'string' && u.startsWith('https://'))
        ) {
          isValidMedia = true;
        }
      } catch {}
    }

    if (!isValidMedia) {
      await markPostFailed(supabase, post.id, 'Media URL tidak valid atau bukan protokol HTTPS.');
      failed++;
      continue;
    }

    if (!post.user_id) {
      await markPostFailed(supabase, post.id, 'Postingan tidak memiliki user_id yang valid.');
      failed++;
      continue;
    }

    // 6. Execute publishing via shared publisher
    try {
      let publishedPostId: string;
      let accountIdentifier: string;

      if (post.platform === 'facebook') {
        const result = await publishFacebookPost({
          connectionId: post.connection_id,
          userId: post.user_id,
          imageUrl: post.media_url,
          caption: post.caption || undefined
        });
        publishedPostId = result.postId;
        accountIdentifier = result.accountName || result.accountHandle;
        console.log(`[Cron Publisher] Berhasil menerbitkan post ${post.id} ke Halaman Facebook (${accountIdentifier}), Post ID: ${result.postId}`);
      } else {
        const result = await publishInstagramPost({
          connectionId: post.connection_id,
          userId: post.user_id,
          imageUrl: post.media_url,
          caption: post.caption || undefined
        });
        publishedPostId = result.postId;
        accountIdentifier = `@${result.accountHandle}`;
        console.log(`[Cron Publisher] Berhasil menerbitkan post ${post.id} ke Instagram (${accountIdentifier}), Post ID: ${result.postId}`);
      }

      // 7. Update status to 'published'
      await supabase
        .from('scheduled_posts')
        .update({
          status: 'published',
          published_post_id: publishedPostId,
          error_message: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', post.id);

      published++;
    } catch (err: any) {
      const errMsg = err?.message || `Gagal menerbitkan postingan ke ${post.platform}.`;
      console.error(`[Cron Publisher] Gagal menerbitkan post ${post.id}:`, errMsg);
      await markPostFailed(supabase, post.id, errMsg);
      failed++;
    }
  }

  // 8. Return summary response
  return res.status(200).json({
    success: true,
    processed,
    published,
    failed,
    skipped
  });
}

/**
 * Helper to safely mark post as failed without throwing
 */
async function markPostFailed(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  postId: string,
  errorMessage: string
) {
  try {
    await supabase
      .from('scheduled_posts')
      .update({
        status: 'failed',
        error_message: errorMessage.slice(0, 1000),
        updated_at: new Date().toISOString()
      })
      .eq('id', postId);
  } catch (e: any) {
    console.error(`[Cron Publisher] Gagal mengupdate status failed untuk post ${postId}:`, e?.message);
  }
}
