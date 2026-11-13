-- Migration: 0001_init_auth_and_core.sql
-- Purpose: Initialize unified SSO, RBAC + Entitlements, Sessions, NetBOM projects, and Teacher Workspaces in Cloudflare D1.

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', -- guest / user / admin
  status TEXT NOT NULL DEFAULT 'active', -- active / disabled
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_entitlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  scope TEXT NOT NULL, -- e.g. 'labs:golden_goose', 'app:teacher', 'netbom:cost_view', 'netbom:publish', 'ambient:vip', 'slidecraft:pro'
  expires_at INTEGER, -- NULL means permanent
  granted_by TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(uid, scope)
);

CREATE TABLE IF NOT EXISTS sessions (
  jti TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE IF NOT EXISTS bom_projects (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  summary_json TEXT NOT NULL DEFAULT '{}',
  data_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teacher_workspaces (
  uid TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_entitlements_uid ON user_entitlements(uid);
CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);
CREATE INDEX IF NOT EXISTS idx_sessions_uid_revoked ON sessions(uid, revoked_at);
CREATE INDEX IF NOT EXISTS idx_bom_projects_uid_updated ON bom_projects(uid, updated_at DESC);
