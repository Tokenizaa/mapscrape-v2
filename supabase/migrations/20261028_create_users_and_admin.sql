-- Migration: Create users table and admin profile
-- Run this in Supabase SQL Editor: https://app.supabase.com/project/ifkqrtjhdnolkuucgbpb/sql

-- Habilitar UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossl";

-- Criar tabela users (perfis vinculados ao Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

-- Inserir/atualizar perfil de admin para olfnetto1@gmail.com
-- ID do usuário no Supabase Auth: c34192aa-0521-4486-a84e-d4937403581d
INSERT INTO users (id, email, display_name, role, created_at)
VALUES (
  'c34192aa-0521-4486-a84e-d4937403581d',
  'olfnetto1@gmail.com',
  'Administrador Geral',
  'admin',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  role = 'admin';
