-- Schema for RToC Wiki Database (Idempotent Version)
-- Optimized for Supabase SQL Editor

-- 1. Users table (Stores discord authentication data)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    avatar TEXT,
    role TEXT DEFAULT 'user'
);

-- 2. User Profiles table (Stores wiki profile description data)
CREATE TABLE IF NOT EXISTS user_profiles (
    username TEXT PRIMARY KEY,
    rank TEXT DEFAULT 'Outer Disciple',
    title TEXT DEFAULT '',
    about TEXT DEFAULT '',
    join_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add banner column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='banner') THEN
        ALTER TABLE user_profiles ADD COLUMN banner TEXT DEFAULT '';
    END IF;
END $$;

-- 3. Comments table (Stores page comments)
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_pinned BOOLEAN DEFAULT FALSE,
    likes JSONB DEFAULT '[]'::jsonb,
    dislikes JSONB DEFAULT '[]'::jsonb,
    replies JSONB DEFAULT '[]'::jsonb
);

-- Add parent_id column if it doesn't exist (for existing tables)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='parent_id') THEN
        ALTER TABLE comments ADD COLUMN parent_id UUID REFERENCES comments(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Index for faster comment fetching by page
CREATE INDEX IF NOT EXISTS idx_comments_page_id ON comments(page_id);

-- 4. Sessions table (Stores user session IDs for authentication)
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Activity Logs table (Stores recent wiki activity)
CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGSERIAL PRIMARY KEY,
    "user" TEXT NOT NULL,
    action TEXT NOT NULL,
    type TEXT NOT NULL,
    details JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Wiki Pages table (Stores actual HTML content)
CREATE TABLE IF NOT EXISTS wiki_pages (
    path TEXT PRIMARY KEY, -- relative path e.g. 'pages/characters.html'
    content TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for ordering activity logs efficiently
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_pages ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon and service_role (Backend-controlled security)
DO $$ 
BEGIN 
    -- Users Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Allow all operations for anon') THEN
        CREATE POLICY "Allow all operations for anon" ON users FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    -- Profiles Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Allow all operations for anon') THEN
        CREATE POLICY "Allow all operations for anon" ON user_profiles FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    -- Comments Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'Allow all operations for anon') THEN
        CREATE POLICY "Allow all operations for anon" ON comments FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    -- Sessions Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sessions' AND policyname = 'Allow all operations for anon') THEN
        CREATE POLICY "Allow all operations for anon" ON sessions FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    -- Activity Logs Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_logs' AND policyname = 'Allow all operations for anon') THEN
        CREATE POLICY "Allow all operations for anon" ON activity_logs FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    -- Wiki Pages Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wiki_pages' AND policyname = 'Allow all operations for anon') THEN
        CREATE POLICY "Allow all operations for anon" ON wiki_pages FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;

    -- Service Role Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Allow all operations for service_role') THEN
        CREATE POLICY "Allow all operations for service_role" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Allow all operations for service_role') THEN
        CREATE POLICY "Allow all operations for service_role" ON user_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'Allow all operations for service_role') THEN
        CREATE POLICY "Allow all operations for service_role" ON comments FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sessions' AND policyname = 'Allow all operations for service_role') THEN
        CREATE POLICY "Allow all operations for service_role" ON sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_logs' AND policyname = 'Allow all operations for service_role') THEN
        CREATE POLICY "Allow all operations for service_role" ON activity_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wiki_pages' AND policyname = 'Allow all operations for service_role') THEN
        CREATE POLICY "Allow all operations for service_role" ON wiki_pages FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
