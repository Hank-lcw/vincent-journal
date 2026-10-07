import type { Env } from './types';
import { HttpError } from './http';
import { base64, decodeBase64 } from './utils';

async function tokenKey(env: Env): Promise<CryptoKey> {
  if (!env.TOKEN_ENCRYPTION_KEY_B64) throw new HttpError(503, 'TOKEN_ENCRYPTION_KEY_B64 尚未設定');
  const raw = decodeBase64(env.TOKEN_ENCRYPTION_KEY_B64);
  if (raw.byteLength !== 32) throw new HttpError(503, 'TOKEN_ENCRYPTION_KEY_B64 必須是 32 bytes 的 Base64 金鑰');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt','decrypt']);
}

export async function encryptSecret(env: Env, plaintext: string): Promise<{ciphertext:string; nonce:string}> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await tokenKey(env);
  const out = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { ciphertext: base64(new Uint8Array(out)), nonce: base64(iv) };
}

export async function decryptSecret(env: Env, ciphertext: string | null, nonce: string | null): Promise<string | null> {
  if (!ciphertext || !nonce) return null;
  const key = await tokenKey(env);
  try {
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeBase64(nonce) }, key, decodeBase64(ciphertext));
    return new TextDecoder().decode(out);
  } catch {
    throw new HttpError(500, '整合權杖解密失敗');
  }
}
