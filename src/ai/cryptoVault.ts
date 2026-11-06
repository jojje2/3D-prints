import vaultConfig from './vaultConfig.json';

export interface EncryptedVaultPayload {
  hasEncryptedVault: boolean;
  ciphertext: string;
  salt: string;
  iv: string;
  hint?: string;
  updatedAt?: string;
}

const SESSION_KEY_STORAGE = 'agy_cad_unlocked_api_key_v1';
const LOCAL_VAULT_STORAGE = 'agy_cad_encrypted_vault_v1';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 120000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a Gemini API key with AES-256-GCM using a user-chosen password.
 * Safe to commit the resulting ciphertext/salt/iv to a public GitHub repo.
 */
export async function encryptApiKeyWithPassword(
  apiKey: string,
  password: string,
  hint = 'Familjelösenord'
): Promise<EncryptedVaultPayload> {
  const cleanKey = apiKey.trim();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAesKey(password, salt);

  const encoded = new TextEncoder().encode(cleanKey);
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    aesKey,
    encoded
  );

  const payload: EncryptedVaultPayload = {
    hasEncryptedVault: true,
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuf)),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    hint,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(LOCAL_VAULT_STORAGE, JSON.stringify(payload));
  sessionStorage.setItem(SESSION_KEY_STORAGE, cleanKey);

  // Also try saving to src/ai/vaultConfig.json if running on local build station
  try {
    await fetch('/api/antigravity/save-vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Running on github.io (static), localStorage handles it
  }

  return payload;
}

/**
 * Decrypts the stored AES-256-GCM vault using the user's password.
 */
export async function decryptApiKeyWithPassword(
  password: string,
  customVault?: EncryptedVaultPayload
): Promise<string> {
  const vault = customVault || getActiveVaultConfig();
  if (!vault || !vault.hasEncryptedVault || !vault.ciphertext) {
    throw new Error('Inget krypterat kassaskåp hittades.');
  }

  const salt = base64ToBytes(vault.salt);
  const iv = base64ToBytes(vault.iv);
  const ciphertext = base64ToBytes(vault.ciphertext);

  const aesKey = await deriveAesKey(password, salt);
  try {
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      aesKey,
      ciphertext as BufferSource
    );
    const apiKey = new TextDecoder().decode(decryptedBuf).trim();
    if (!apiKey) {
      throw new Error('Tom nyckel');
    }
    sessionStorage.setItem(SESSION_KEY_STORAGE, apiKey);
    return apiKey;
  } catch {
    throw new Error('Fel lösenord! Kunde inte låsa upp kassaskåpet.');
  }
}

export function getActiveVaultConfig(): EncryptedVaultPayload {
  try {
    const localStr = localStorage.getItem(LOCAL_VAULT_STORAGE);
    if (localStr) {
      const parsed = JSON.parse(localStr);
      if (parsed && parsed.hasEncryptedVault && parsed.ciphertext) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return vaultConfig as EncryptedVaultPayload;
}

export function getUnlockedApiKey(): string | null {
  return (
    sessionStorage.getItem(SESSION_KEY_STORAGE) ||
    localStorage.getItem('agy_cad_remembered_key_v1') ||
    null
  );
}

export function setUnlockedApiKey(apiKey: string, rememberInBrowser = true) {
  const clean = apiKey.trim();
  sessionStorage.setItem(SESSION_KEY_STORAGE, clean);
  if (rememberInBrowser) {
    localStorage.setItem('agy_cad_remembered_key_v1', clean);
  }
}

export function lockSessionKey() {
  sessionStorage.removeItem(SESSION_KEY_STORAGE);
  localStorage.removeItem('agy_cad_remembered_key_v1');
}

/**
 * Creates a Magic Link (`#vault=...`) that contains the AES-256 encrypted key
 * so the user can send a link to his wife and she only enters the password (or `#unlock=...`).
 */
export function createShareableMagicLink(
  vault: EncryptedVaultPayload,
  includePassword?: string
): string {
  const baseUrl = window.location.origin + window.location.pathname;
  const params = new URLSearchParams();
  params.set('c', vault.ciphertext);
  params.set('s', vault.salt);
  params.set('i', vault.iv);
  if (vault.hint) params.set('h', vault.hint);
  if (includePassword) {
    params.set('p', btoa(encodeURIComponent(includePassword)));
  }
  return `${baseUrl}#vault=${params.toString()}`;
}

/**
 * Checks URL hash on startup for `#vault=...` magic links and processes them cleanly.
 */
export async function checkUrlMagicLinkOnBoot(): Promise<{
  vaultLoaded: boolean;
  autoUnlocked: boolean;
}> {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#vault=')) {
    return { vaultLoaded: false, autoUnlocked: false };
  }

  try {
    const queryStr = hash.slice('#vault='.length);
    const params = new URLSearchParams(queryStr);
    const ciphertext = params.get('c');
    const salt = params.get('s');
    const iv = params.get('i');
    const hint = params.get('h') || 'Familjelösenord';
    const encodedPass = params.get('p');

    // Clean the URL bar immediately so nothing remains visible
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    if (ciphertext && salt && iv) {
      const payload: EncryptedVaultPayload = {
        hasEncryptedVault: true,
        ciphertext,
        salt,
        iv,
        hint,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(LOCAL_VAULT_STORAGE, JSON.stringify(payload));

      if (encodedPass) {
        const password = decodeURIComponent(atob(encodedPass));
        const key = await decryptApiKeyWithPassword(password, payload);
        setUnlockedApiKey(key, true);
        return { vaultLoaded: true, autoUnlocked: true };
      }
      return { vaultLoaded: true, autoUnlocked: false };
    }
  } catch (e) {
    console.warn('Magic link parse warning:', e);
  }

  return { vaultLoaded: false, autoUnlocked: false };
}
