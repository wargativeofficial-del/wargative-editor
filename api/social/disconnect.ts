/**
 * Endpoint: POST /api/social/disconnect
 * Disconnects / removes a social connection record for the authenticated user.
 * 
 * Security:
 * - Requires verified Supabase JWT Bearer token
 * - Only deletes connection records where user_id matches authenticated session
 * - Enforces database-level Row Level Security (RLS)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest } from '../_lib/authMiddleware.js';
import { getSupabaseUserClient } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Allow only POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: `Metode ${req.method} tidak diizinkan pada endpoint ini. Gunakan POST.`
    });
  }

  // 2. Authenticate user from session JWT
  const user = await authenticateRequest(req, res);
  if (!user) return; // Response handled by authenticateRequest

  // 3. Parse and validate request body
  const { platform, connectionId } = req.body || {};

  if (!platform && !connectionId) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Parameter "platform" atau "connectionId" wajib disertakan dalam request body.'
    });
  }

  try {
    const supabase = getSupabaseUserClient(user.token);

    // Build scoped delete query
    let query = supabase
      .from('social_connections')
      .delete()
      .eq('user_id', user.id);

    if (connectionId) {
      query = query.eq('id', connectionId);
    } else if (platform) {
      query = query.eq('platform', platform);
    }

    const { data, error, count } = await query.select();

    if (error) {
      console.error('[API /social/disconnect] Database error:', error);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Gagal menghapus koneksi akun dari database.',
        detail: error.message
      });
    }

    return res.status(200).json({
      success: true,
      message: `Koneksi akun ${platform || connectionId} berhasil diputuskan.`,
      deletedCount: data ? data.length : (count || 0),
      platform: platform || (data && data[0] ? data[0].platform : undefined)
    });
  } catch (err: any) {
    console.error('[API /social/disconnect] Server exception:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan pada server saat memutuskan koneksi akun.',
      detail: err?.message
    });
  }
}
