/**
 * Reconciliation Service for Stale Scheduled Posts (Phase 4B)
 * 
 * Safely inspects Meta Graph API (Facebook Pages & Instagram) when a scheduled
 * post has been stuck in 'publishing' for > 5 minutes.
 * 
 * Strict Multi-Metadata Matching:
 * - Text Caption / Message
 * - Created Time / Timestamp window (lower bound based on scheduled_at/claim_time, upper bound based on current reconciliation time)
 * - Media type and slide count
 * - Dynamic pagination until candidates are older than lower bound
 * 
 * Outcomes:
 * 1. Strong Match -> Transition to 'published', store postId & permalink (Never republishes!)
 * 2. Strong Not Found -> Transition to 'failed', allowing safe user retry via Retry Failed
 * 3. Ambiguous -> Keep 'publishing', report reason to user (Prevent duplicate publish!)
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';
import { decryptToken } from './crypto.js';

export interface StalePostToReconcile {
  id: string;
  user_id: string;
  connection_id: string;
  platform: string;
  caption?: string | null;
  media_url?: string | null;
  scheduled_at: string;
  updated_at: string;
}

export type ReconciliationOutcome =
  | { outcome: 'strong_match'; postId: string; permalink: string | null; detail: string }
  | { outcome: 'strong_not_found'; reason: string }
  | { outcome: 'ambiguous'; reason: string };

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes heuristic threshold
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes clock skew tolerance
const MAX_PAGINATION_PAGES = 5; // Up to 125 posts scanned per platform

/**
 * Reconciles a stale post by inspecting the target platform
 */
export async function reconcileStalePost(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  post: StalePostToReconcile
): Promise<ReconciliationOutcome> {
  // 1. Verify stale threshold
  const claimTime = new Date(post.updated_at).getTime();
  const elapsed = Date.now() - claimTime;
  if (isNaN(claimTime) || elapsed < STALE_THRESHOLD_MS) {
    return {
      outcome: 'ambiguous',
      reason: 'Postingan baru saja mulai diproses (kurang dari 5 menit). Harap tunggu proses selesai.'
    };
  }

  // 2. Fetch social connection & decrypt token
  const { data: connection, error: connError } = await supabase
    .from('social_connections')
    .select('id, user_id, platform, platform_account_id, encrypted_access_token, status, account_name, account_handle')
    .eq('id', post.connection_id)
    .eq('user_id', post.user_id)
    .single();

  if (connError || !connection || !connection.encrypted_access_token || !connection.platform_account_id) {
    return {
      outcome: 'ambiguous',
      reason: 'Koneksi akun media sosial atau kredensial akses tidak ditemukan di database.'
    };
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(connection.encrypted_access_token);
    if (!accessToken) throw new Error('Token kosong.');
  } catch (err: any) {
    return {
      outcome: 'ambiguous',
      reason: 'Gagal mendekripsi kredensial akses akun media sosial.'
    };
  }

  // 3. Extract expected slide count
  let expectedSlideCount = 1;
  if (post.media_url) {
    const trimmed = post.media_url.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          expectedSlideCount = parsed.length;
        }
      } catch {}
    }
  }

  const normPostCaption = (post.caption || '').trim().replace(/\r\n/g, '\n').replace(/\s+/g, ' ');
  const now = Date.now();
  const scheduledTime = new Date(post.scheduled_at).getTime();
  const effectiveBaseTime = isNaN(scheduledTime) ? claimTime : Math.min(scheduledTime, claimTime);

  // Time window:
  // Lower bound: scheduled_at / claim_time minus clock skew tolerance
  // Upper bound: reconciliation / current time plus clock skew tolerance
  const minTime = effectiveBaseTime - CLOCK_SKEW_TOLERANCE_MS;
  const maxTime = now + CLOCK_SKEW_TOLERANCE_MS;

  // 4. Branch by platform
  if (post.platform === 'facebook') {
    return reconcileFacebook(connection.platform_account_id, accessToken, normPostCaption, expectedSlideCount, minTime, maxTime);
  } else if (post.platform === 'instagram') {
    return reconcileInstagram(connection.platform_account_id, accessToken, normPostCaption, expectedSlideCount, minTime, maxTime);
  } else {
    return {
      outcome: 'ambiguous',
      reason: `Platform "${post.platform}" belum mendukung rekonsiliasi otomatis.`
    };
  }
}

/**
 * Reconcile Facebook Page recent posts with pagination until lower bound
 */
async function reconcileFacebook(
  pageId: string,
  accessToken: string,
  normPostCaption: string,
  expectedSlideCount: number,
  minTime: number,
  maxTime: number
): Promise<ReconciliationOutcome> {
  try {
    let nextUrl: string | null = `https://graph.facebook.com/v21.0/${pageId}/posts?fields=id,message,created_time,permalink_url,attachments{media_type,subattachments}&limit=25&access_token=${encodeURIComponent(accessToken)}`;
    let pagesFetched = 0;
    let reachedLowerBound = false;

    const strongMatches: any[] = [];
    const ambiguousMatches: Array<{ item: any; reason: string }> = [];

    while (nextUrl && pagesFetched < MAX_PAGINATION_PAGES) {
      pagesFetched++;
      const res = await fetch(nextUrl);
      const data = await res.json().catch(() => null);

      if (!res.ok || !data || data.error) {
        const errMsg = data?.error?.message || `HTTP ${res.status}`;
        if (pagesFetched === 1) {
          return {
            outcome: 'ambiguous',
            reason: `Meta Graph API Facebook mengembalikan error: ${errMsg}`
          };
        }
        return {
          outcome: 'ambiguous',
          reason: `Gagal memuat halaman riwayat lanjutan Facebook: ${errMsg}`
        };
      }

      const items: any[] = Array.isArray(data.data) ? data.data : [];
      if (items.length === 0) {
        reachedLowerBound = true;
        break;
      }

      for (const item of items) {
        const createdTime = new Date(item.created_time).getTime();

        // Check if candidate is older than the lower bound
        if (!isNaN(createdTime) && createdTime < minTime) {
          reachedLowerBound = true;
          break;
        }

        const itemMsg = (item.message || '').trim().replace(/\r\n/g, '\n').replace(/\s+/g, ' ');
        const captionMatches = normPostCaption.length > 0 ? (itemMsg === normPostCaption) : (itemMsg.length === 0);

        if (!captionMatches) {
          continue;
        }

        // Caption matches! Check created_time and media metadata
        const isWithinTimeWindow = !isNaN(createdTime) && createdTime >= minTime && createdTime <= maxTime;

        // Attachment inspection
        const firstAttachment = item.attachments?.data?.[0];
        let mediaVerified = false;

        if (expectedSlideCount > 1) {
          const subAttachments = firstAttachment?.subattachments?.data;
          if (Array.isArray(subAttachments) && subAttachments.length === expectedSlideCount) {
            mediaVerified = true;
          } else if (firstAttachment?.media_type === 'album') {
            mediaVerified = true;
          }
        } else {
          // Single image
          if (firstAttachment) {
            mediaVerified = true;
          }
        }

        if (isWithinTimeWindow && mediaVerified) {
          strongMatches.push(item);
        } else {
          const reasons: string[] = [];
          if (!isWithinTimeWindow) reasons.push('waktu postingan di luar estimasi toleransi');
          if (!mediaVerified) reasons.push('struktur media/attachment tidak dapat diverifikasi secara pasti');
          ambiguousMatches.push({ item, reason: reasons.join(' dan ') });
        }
      }

      if (reachedLowerBound) {
        break;
      }

      nextUrl = data.paging?.next || null;
    }

    // If pagination cut off before reaching lower bound and no matches were found, mark as ambiguous
    if (!reachedLowerBound && strongMatches.length === 0 && ambiguousMatches.length === 0) {
      return {
        outcome: 'ambiguous',
        reason: 'Batas penelusuran riwayat postingan tercapai sebelum batas awal waktu (akun sangat aktif). Perlu pemeriksaan manual oleh pengguna.'
      };
    }

    if (strongMatches.length === 1 && ambiguousMatches.length === 0) {
      const match = strongMatches[0];
      const permalink = match.permalink_url || `https://www.facebook.com/${match.id}`;
      return {
        outcome: 'strong_match',
        postId: match.id,
        permalink,
        detail: 'Postingan terverifikasi telah terbit di Halaman Facebook dengan kecocokan teks, media, dan waktu.'
      };
    }

    if (ambiguousMatches.length > 0 || strongMatches.length > 1) {
      const detailReason = ambiguousMatches.length > 0
        ? `Ditemukan postingan serupa di Facebook namun ${ambiguousMatches[0].reason}.`
        : 'Ditemukan lebih dari satu postingan Facebook dengan konten serupa.';
      return {
        outcome: 'ambiguous',
        reason: `${detailReason} Perlu verifikasi manual untuk mencegah duplikasi.`
      };
    }

    // No caption or media match found in recent feed up to lower bound
    return {
      outcome: 'strong_not_found',
      reason: 'Postingan telah diverifikasi ke Halaman Facebook dan tidak ditemukan postingan yang cocok.'
    };
  } catch (err: any) {
    return {
      outcome: 'ambiguous',
      reason: `Exception saat memverifikasi Facebook: ${err?.message || 'Koneksi gagal'}`
    };
  }
}

/**
 * Reconcile Instagram Professional Account recent media with pagination until lower bound
 */
async function reconcileInstagram(
  igUserId: string,
  accessToken: string,
  normPostCaption: string,
  expectedSlideCount: number,
  minTime: number,
  maxTime: number
): Promise<ReconciliationOutcome> {
  try {
    let nextUrl: string | null = `https://graph.instagram.com/v21.0/${igUserId}/media?fields=id,caption,media_type,timestamp,permalink,children{id,media_type}&limit=25&access_token=${encodeURIComponent(accessToken)}`;
    let pagesFetched = 0;
    let reachedLowerBound = false;

    const strongMatches: any[] = [];
    const ambiguousMatches: Array<{ item: any; reason: string }> = [];

    while (nextUrl && pagesFetched < MAX_PAGINATION_PAGES) {
      pagesFetched++;
      const res = await fetch(nextUrl);
      const data = await res.json().catch(() => null);

      if (!res.ok || !data || data.error) {
        const errMsg = data?.error?.message || `HTTP ${res.status}`;
        if (pagesFetched === 1) {
          return {
            outcome: 'ambiguous',
            reason: `Meta Graph API Instagram mengembalikan error: ${errMsg}`
          };
        }
        return {
          outcome: 'ambiguous',
          reason: `Gagal memuat halaman riwayat lanjutan Instagram: ${errMsg}`
        };
      }

      const items: any[] = Array.isArray(data.data) ? data.data : [];
      if (items.length === 0) {
        reachedLowerBound = true;
        break;
      }

      for (const item of items) {
        const createdTime = new Date(item.timestamp).getTime();

        // Check if candidate is older than the lower bound
        if (!isNaN(createdTime) && createdTime < minTime) {
          reachedLowerBound = true;
          break;
        }

        const itemCaption = (item.caption || '').trim().replace(/\r\n/g, '\n').replace(/\s+/g, ' ');
        const captionMatches = normPostCaption.length > 0 ? (itemCaption === normPostCaption) : (itemCaption.length === 0);

        if (!captionMatches) {
          continue;
        }

        // Caption matches! Check timestamp and media metadata
        const isWithinTimeWindow = !isNaN(createdTime) && createdTime >= minTime && createdTime <= maxTime;

        let mediaVerified = false;
        if (expectedSlideCount > 1) {
          if (item.media_type === 'CAROUSEL_ALBUM') {
            const children = item.children?.data;
            if (Array.isArray(children) && children.length === expectedSlideCount) {
              mediaVerified = true;
            } else if (!children || children.length === 0) {
              // Children not returned in field expansion; carousel type matches
              mediaVerified = true;
            }
          }
        } else {
          if (item.media_type === 'IMAGE') {
            mediaVerified = true;
          }
        }

        if (isWithinTimeWindow && mediaVerified) {
          strongMatches.push(item);
        } else {
          const reasons: string[] = [];
          if (!isWithinTimeWindow) reasons.push('waktu postingan di luar rentang estimasi');
          if (!mediaVerified) reasons.push(`tipe media (${item.media_type || 'tidak diketahui'}) tidak sesuai dengan yang diharapkan`);
          ambiguousMatches.push({ item, reason: reasons.join(' dan ') });
        }
      }

      if (reachedLowerBound) {
        break;
      }

      nextUrl = data.paging?.next || null;
    }

    // If pagination cut off before reaching lower bound and no matches were found, mark as ambiguous
    if (!reachedLowerBound && strongMatches.length === 0 && ambiguousMatches.length === 0) {
      return {
        outcome: 'ambiguous',
        reason: 'Batas penelusuran riwayat media tercapai sebelum batas awal waktu (akun sangat aktif). Perlu pemeriksaan manual oleh pengguna.'
      };
    }

    if (strongMatches.length === 1 && ambiguousMatches.length === 0) {
      const match = strongMatches[0];
      return {
        outcome: 'strong_match',
        postId: match.id,
        permalink: match.permalink || null,
        detail: 'Postingan terverifikasi telah terbit di Instagram dengan kecocokan teks, tipe media, dan waktu.'
      };
    }

    if (ambiguousMatches.length > 0 || strongMatches.length > 1) {
      const detailReason = ambiguousMatches.length > 0
        ? `Ditemukan media serupa di Instagram namun ${ambiguousMatches[0].reason}.`
        : 'Ditemukan lebih dari satu media Instagram dengan konten serupa.';
      return {
        outcome: 'ambiguous',
        reason: `${detailReason} Perlu verifikasi manual untuk mencegah duplikasi.`
      };
    }

    return {
      outcome: 'strong_not_found',
      reason: 'Postingan telah diverifikasi ke Instagram dan tidak ditemukan media yang cocok.'
    };
  } catch (err: any) {
    return {
      outcome: 'ambiguous',
      reason: `Exception saat memverifikasi Instagram: ${err?.message || 'Koneksi gagal'}`
    };
  }
}

/**
 * Applies the reconciliation outcome to the database record atomically
 */
export async function applyReconciliationResult(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  post: StalePostToReconcile,
  result: ReconciliationOutcome
): Promise<{ status: string; errorMessage: string | null; updatedPost?: any }> {
  if (result.outcome === 'strong_match') {
    const { data } = await supabase
      .from('scheduled_posts')
      .update({
        status: 'published',
        published_post_id: result.postId,
        published_post_url: result.permalink,
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', post.id)
      .eq('status', 'publishing')
      .select()
      .maybeSingle();

    return { status: 'published', errorMessage: null, updatedPost: data };
  } else if (result.outcome === 'strong_not_found') {
    const msg = `Proses penerbitan sebelumnya mengalami timeout (>5 menit). Sistem telah memverifikasi ke ${post.platform} dan memastikan postingan belum terbit. Anda dapat mencoba mempublikasikannya lagi.`;
    const { data } = await supabase
      .from('scheduled_posts')
      .update({
        status: 'failed',
        error_message: msg,
        updated_at: new Date().toISOString()
      })
      .eq('id', post.id)
      .eq('status', 'publishing')
      .select()
      .maybeSingle();

    return { status: 'failed', errorMessage: msg, updatedPost: data };
  } else {
    // Ambiguous: keep 'publishing', update error_message for UI feedback
    const msg = `Penerbitan terhenti, namun rekonsiliasi ke ${post.platform} belum dapat dipastikan (${result.reason}). Status tetap 'publishing' untuk mencegah duplikasi. Silakan periksa akun Anda secara langsung.`;
    const { data } = await supabase
      .from('scheduled_posts')
      .update({
        error_message: msg,
        updated_at: new Date().toISOString()
      })
      .eq('id', post.id)
      .eq('status', 'publishing')
      .select()
      .maybeSingle();

    return { status: 'publishing', errorMessage: msg, updatedPost: data };
  }
}
