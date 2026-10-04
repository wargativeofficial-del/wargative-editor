-- Migration: Add published_post_url to public.scheduled_posts (Phase 4B)
-- Stores the official permalink / live public URL from Meta Graph API (Facebook / Instagram)
-- Non-destructive: adds a nullable column without modifying existing data.

ALTER TABLE public.scheduled_posts
ADD COLUMN IF NOT EXISTS published_post_url TEXT;
