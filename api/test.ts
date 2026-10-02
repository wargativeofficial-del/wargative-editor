import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    status: 'ok',
    time: Date.now(),
    env: {
      has_SUPABASE_URL: !!process.env.SUPABASE_URL,
      has_SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      service_key_role: (() => {
        try {
          const parts = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            return payload.role || 'unknown';
          }
          return 'invalid_jwt_format';
        } catch (e: any) {
          return 'parse_error';
        }
      })(),
      has_SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      has_META_APP_ID: !!process.env.META_APP_ID,
      has_META_APP_SECRET: !!process.env.META_APP_SECRET,
      has_TOKEN_ENCRYPTION_KEY: !!process.env.TOKEN_ENCRYPTION_KEY
    }
  });
}
