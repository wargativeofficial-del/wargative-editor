/**
 * Authentication Middleware for Serverless Functions
 * Verifies Supabase Auth JWT and strictly extracts authenticated user_id.
 * NEVER trusts client-supplied user_id in query or body!
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from './supabaseAdmin.js';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  token: string;
}

export interface AuthResult {
  user: AuthenticatedUser | null;
  errorResponse?: {
    status: number;
    message: string;
  };
}

/**
 * Extracts and verifies the user session JWT from request Authorization header
 */
export async function authenticateRequest(
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || typeof authHeader !== 'string') {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Header Authorization (Bearer token) tidak ditemukan. Silakan login ke akun Wargative.'
    });
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Format header Authorization tidak valid. Gunakan format: Bearer <token>'
    });
    return null;
  }

  const token = parts[1];

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token sesi tidak valid atau telah kedaluwarsa. Silakan login ulang.',
        detail: error?.message
      });
      return null;
    }

    return {
      id: data.user.id,
      email: data.user.email,
      token: token
    };
  } catch (err: any) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Gagal memvalidasi sesi autentikasi pada server.',
      detail: err?.message
    });
    return null;
  }
}
