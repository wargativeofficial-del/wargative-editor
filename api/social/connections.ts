/**
 * Endpoint: GET /api/social/connections
 * Retrieves connected social media accounts for the authenticated user.
 * 
 * Security:
 * - Requires verified Supabase JWT Bearer token
 * - Derives user_id solely from verified token (ignores query/body inputs)
 * - Never returns access tokens, refresh tokens, or encrypted credentials to client
 * - Enforces database-level Row Level Security (RLS)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest } from '../_lib/authMiddleware.js';
import { getSupabaseUserClient } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Allow only GET requests
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: `Metode ${req.method} tidak diizinkan pada endpoint ini. Gunakan GET.`
    });
  }

  // 2. Authenticate user from session JWT
  const user = await authenticateRequest(req, res);
  if (!user) return; // Response handled by authenticateRequest

  try {
    // 3. Query PostgreSQL using user-scoped client (enforces RLS)
    const supabase = getSupabaseUserClient(user.token);

    // Explicitly select ONLY public non-sensitive columns
    const { data: connections, error } = await supabase
      .from('social_connections')
      .select('id, platform, platform_account_id, account_name, account_handle, avatar_url, status, granted_scopes, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API /social/connections] Database error:', error);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Gagal mengambil data koneksi akun dari database.',
        detail: error.message
      });
    }

    // 4. Return sanitized response
    return res.status(200).json({
      success: true,
      user_id: user.id,
      count: connections ? connections.length : 0,
      connections: (connections || []).map((conn) => ({
        id: conn.id,
        platform: conn.platform,
        platformAccountId: conn.platform_account_id,
        accountName: conn.account_name,
        accountHandle: conn.account_handle,
        avatarUrl: conn.avatar_url,
        status: conn.status,
        grantedScopes: conn.granted_scopes,
        createdAt: conn.created_at,
        updatedAt: conn.updated_at
      }))
    });
  } catch (err: any) {
    console.error('[API /social/connections] Server exception:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan pada server saat memproses koneksi akun.',
      detail: err?.message
    });
  }
}
