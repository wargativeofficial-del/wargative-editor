-- ==============================================================================
-- WARGATIVE SAAS: MULTI-USER DATABASE SCHEMA & ROW LEVEL SECURITY (RLS)
-- Phase 1 Migration: Users, Social Connections, OAuth States, Scheduled Posts
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABLE: public.social_connections
-- Menyimpan akun media sosial yang telah diotorisasi oleh masing-masing user.
-- Kredensial token wajib disimpan dalam bentuk terenkripsi.
CREATE TABLE IF NOT EXISTS public.social_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform VARCHAR(32) NOT NULL, -- 'facebook', 'instagram', 'tiktok', 'youtube', 'threads'
    platform_account_id VARCHAR(128) NOT NULL, -- Page ID, IG Business Account ID, Channel ID, etc.
    account_name VARCHAR(255) NOT NULL, -- Nama Halaman / Nama Channel / Nama Bisnis
    account_handle VARCHAR(255) NOT NULL, -- @username atau pengenal akun
    avatar_url TEXT,
    
    -- Kredensial terenkripsi (disimpan oleh backend menggunakan AES-256-GCM)
    encrypted_access_token TEXT NOT NULL,
    encrypted_refresh_token TEXT,
    token_expires_at TIMESTAMPTZ, -- Waktu kedaluwarsa access token (jika ada)
    
    -- Izin / scopes yang disetujui pengguna saat OAuth
    granted_scopes TEXT[] NOT NULL DEFAULT '{}',
    
    -- Metadata fleksibel khusus platform (misal: category, linked_page_id, dll)
    metadata JSONB DEFAULT '{}'::jsonb,
    
    status VARCHAR(32) NOT NULL DEFAULT 'connected', -- 'connected', 'expired', 'revoked'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Mencegah duplikasi: 1 user hanya bisa menghubungkan 1 akun spesifik per platform
    CONSTRAINT uq_user_platform_account UNIQUE (user_id, platform, platform_account_id)
);

-- Index untuk query performa tinggi
CREATE INDEX IF NOT EXISTS idx_social_connections_user_id 
    ON public.social_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_social_connections_user_platform 
    ON public.social_connections(user_id, platform);

-- 3. TABLE: public.oauth_states
-- Menyimpan state token sementara untuk validasi CSRF & pencegahan user swapping saat OAuth
CREATE TABLE IF NOT EXISTS public.oauth_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform VARCHAR(32) NOT NULL,
    state_token VARCHAR(255) NOT NULL UNIQUE,
    code_verifier VARCHAR(255), -- Khusus PKCE flow (TikTok / Twitter)
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_lookup 
    ON public.oauth_states(state_token, expires_at);

-- 4. TABLE: public.scheduled_posts
-- Menyimpan antrean postingan konten yang dijadwalkan oleh masing-masing user
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES public.social_connections(id) ON DELETE SET NULL,
    platform VARCHAR(32) NOT NULL,
    caption TEXT,
    media_url TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'publishing', 'published', 'failed'
    published_post_id VARCHAR(255), -- ID postingan resmi dari platform setelah publish sukses
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_id 
    ON public.scheduled_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due 
    ON public.scheduled_posts(status, scheduled_at);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Menjamin secara mutlak bahwa User A TIDAK BISA membaca atau memodifikasi data User B
-- ==============================================================================

-- Aktifkan RLS pada seluruh tabel
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

-- Policy untuk public.social_connections:
-- 1. Pengguna hanya bisa melihat koneksi miliknya sendiri
DROP POLICY IF EXISTS "Users can view their own social connections" ON public.social_connections;
CREATE POLICY "Users can view their own social connections"
    ON public.social_connections
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 2. Pengguna hanya bisa menghapus koneksi miliknya sendiri
DROP POLICY IF EXISTS "Users can delete their own social connections" ON public.social_connections;
CREATE POLICY "Users can delete their own social connections"
    ON public.social_connections
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- (Catatan: INSERT dan UPDATE access token dilakukan secara aman oleh Backend via Service Role)

-- Policy untuk public.oauth_states:
DROP POLICY IF EXISTS "Users can manage their own oauth states" ON public.oauth_states;
DROP POLICY IF EXISTS "Users can view their own oauth states" ON public.oauth_states;
CREATE POLICY "Users can view their own oauth states"
    ON public.oauth_states
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own oauth states" ON public.oauth_states;
CREATE POLICY "Users can insert their own oauth states"
    ON public.oauth_states
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own oauth states" ON public.oauth_states;
CREATE POLICY "Users can delete their own oauth states"
    ON public.oauth_states
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy untuk public.scheduled_posts:
DROP POLICY IF EXISTS "Users can view their own scheduled posts" ON public.scheduled_posts;
CREATE POLICY "Users can view their own scheduled posts"
    ON public.scheduled_posts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own scheduled posts" ON public.scheduled_posts;
CREATE POLICY "Users can insert their own scheduled posts"
    ON public.scheduled_posts
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own scheduled posts" ON public.scheduled_posts;
CREATE POLICY "Users can update their own scheduled posts"
    ON public.scheduled_posts
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own scheduled posts" ON public.scheduled_posts;
CREATE POLICY "Users can delete their own scheduled posts"
    ON public.scheduled_posts
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- ==============================================================================
-- TRIGGER AUTO-UPDATE `updated_at`
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_connections_updated_at ON public.social_connections;
CREATE TRIGGER trigger_social_connections_updated_at
    BEFORE UPDATE ON public.social_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_scheduled_posts_updated_at ON public.scheduled_posts;
CREATE TRIGGER trigger_scheduled_posts_updated_at
    BEFORE UPDATE ON public.scheduled_posts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
