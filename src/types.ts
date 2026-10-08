export type Role = 'owner' | 'admin' | 'reviewer' | 'editor';

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  BACKUPS: R2Bucket;
  ASSETS: Fetcher;

  PUBLIC_BASE_URL: string;
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
  BOOTSTRAP_ADMIN_EMAIL: string;
  MAIL_FROM: string;
  RESEND_SEGMENT_ID: string;
  META_GRAPH_VERSION: string;

  CANVA_REDIRECT_URI: string;
  FACEBOOK_REDIRECT_URI: string;
  INSTAGRAM_REDIRECT_URI: string;
  THREADS_REDIRECT_URI: string;
  XHS_REDIRECT_URI: string;

  OPENAI_API_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  TOKEN_ENCRYPTION_KEY_B64?: string;
  CANVA_CLIENT_ID?: string;
  CANVA_CLIENT_SECRET?: string;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  INSTAGRAM_APP_ID?: string;
  INSTAGRAM_APP_SECRET?: string;
  THREADS_APP_ID?: string;
  THREADS_APP_SECRET?: string;
  XHS_CLIENT_ID?: string;
  XHS_CLIENT_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
}

export interface RequestContext {
  requestId: string;
  user?: AuthUser;
}
