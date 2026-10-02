/**
 * Endpoint: POST /api/media/upload
 * Server-Side Media Upload to Supabase Storage for Instagram Publishing
 * 
 * Security:
 * - Requires verified Supabase JWT Bearer token
 * - Derives user_id solely from verified token
 * - Enforces per-user folder isolation: {user_id}/{timestamp}_{random}.jpg
 * - Strict MIME type validation (image/jpeg, image/png)
 * - Strict size validation (max 8MB)
 * - Zero credential or token leakage
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { authenticateRequest } from '../_lib/authMiddleware.js';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: `Metode ${req.method} tidak diizinkan. Gunakan POST.`
    });
  }

  // 1. Authenticate user strictly from Bearer JWT
  const user = await authenticateRequest(req, res);
  if (!user) return; // 401 already sent

  const { imageBase64, mimeType } = req.body || {};

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Data gambar (imageBase64) wajib disertakan.'
    });
  }

  // 2. Validate MIME Type
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  const normalizedMime = (mimeType || 'image/jpeg').toLowerCase();

  if (!allowedMimeTypes.includes(normalizedMime)) {
    return res.status(400).json({
      error: 'Invalid MIME Type',
      message: `Format gambar tidak didukung: ${normalizedMime}. Gunakan JPEG atau PNG.`
    });
  }

  try {
    // 3. Extract and decode Base64 buffer
    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // 4. Validate File Size (max 8MB for Instagram Publishing)
    const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
    if (buffer.length > MAX_SIZE_BYTES) {
      return res.status(400).json({
        error: 'File Too Large',
        message: `Ukuran gambar melebihi batas maksimum 8MB (Ukuran: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`
      });
    }

    const supabase = getSupabaseAdmin();
    const bucketName = 'wargative-media';

    // 5. Ensure Bucket Exists and is Public for Meta Crawlers
    const { data: buckets, error: listBucketsError } = await supabase.storage.listBuckets();
    if (listBucketsError) {
      console.warn('[API /media/upload] Warning listing buckets:', listBucketsError.message);
    }

    const bucketExists = buckets?.some((b) => b.name === bucketName);
    if (!bucketExists) {
      const { error: createBucketError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 10485760, // 10MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/jpg']
      });

      if (createBucketError && !createBucketError.message.includes('already exists')) {
        console.error('[API /media/upload] Gagal membuat bucket storage:', createBucketError);
        return res.status(500).json({
          error: 'Storage Configuration Error',
          message: 'Gagal menginisialisasi penyimpanan media di Supabase Storage.',
          detail: createBucketError.message
        });
      }
    }

    // 6. Generate Isolated File Path under {user_id}/
    const ext = normalizedMime === 'image/png' ? 'png' : 'jpg';
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const fileName = `${Date.now()}_${randomSuffix}.${ext}`;
    const filePath = `${user.id}/${fileName}`;

    // 7. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: normalizedMime === 'image/png' ? 'image/png' : 'image/jpeg',
        upsert: false
      });

    if (uploadError) {
      console.error('[API /media/upload] Upload error:', uploadError);
      return res.status(500).json({
        error: 'Upload Failed',
        message: 'Gagal mengunggah gambar ke penyimpanan server.',
        detail: uploadError.message
      });
    }

    // 8. Resolve Public HTTPS URL
    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData?.publicUrl;

    if (!publicUrl) {
      return res.status(500).json({
        error: 'URL Generation Error',
        message: 'Gagal membuat URL publik untuk media yang diunggah.'
      });
    }

    return res.status(200).json({
      success: true,
      url: publicUrl,
      path: filePath,
      size: buffer.length,
      mimeType: normalizedMime === 'image/png' ? 'image/png' : 'image/jpeg'
    });
  } catch (err: any) {
    console.error('[API /media/upload] Server exception:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan pada server saat memproses unggahan media.',
      detail: err?.message
    });
  }
}
