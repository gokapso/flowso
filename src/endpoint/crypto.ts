import {
  constants,
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
} from 'node:crypto';
import type { DataExchangeRequest, EncryptedRequestBody } from './types';

const TAG_LENGTH = 16;

export function flipIv(iv: Buffer): Buffer {
  return Buffer.from(iv.map((byte) => byte ^ 0xff));
}

export function generateKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

export function encryptRequest({ publicKeyPem, payload }: {
  publicKeyPem: string;
  payload: DataExchangeRequest;
}): { body: EncryptedRequestBody; aesKey: Buffer; iv: Buffer } {
  const aesKey = randomBytes(16);
  const iv = randomBytes(16);
  const encryptedKey = publicEncrypt({
    key: publicKeyPem,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  }, aesKey);
  return {
    body: {
      encrypted_flow_data: encryptJson(payload, aesKey, iv),
      encrypted_aes_key: encryptedKey.toString('base64'),
      initial_vector: iv.toString('base64'),
    },
    aesKey,
    iv,
  };
}

/** Decrypts JSON; callers accepting untrusted requests must validate its application shape. */
export function decryptRequest({ privateKeyPem, passphrase, body }: {
  privateKeyPem: string;
  passphrase?: string;
  body: EncryptedRequestBody;
}): { payload: unknown; aesKey: Buffer; iv: Buffer } {
  const aesKey = privateDecrypt({
    key: privateKeyPem,
    passphrase,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  }, decodeBase64(body.encrypted_aes_key));
  const iv = decodeBase64(body.initial_vector);
  return { payload: decryptJson(body.encrypted_flow_data, aesKey, iv), aesKey, iv };
}

export function encryptResponse({ payload, aesKey, iv }: {
  payload: unknown;
  aesKey: Buffer;
  iv: Buffer;
}): string {
  return encryptJson(payload, aesKey, flipIv(iv));
}

export function decryptResponse({ body, aesKey, iv }: {
  body: string;
  aesKey: Buffer;
  iv: Buffer;
}): unknown {
  return decryptJson(body, aesKey, flipIv(iv));
}

function encryptJson(payload: unknown, aesKey: Buffer, iv: Buffer): string {
  const cipher = createCipheriv('aes-128-gcm', aesKey, iv, { authTagLength: TAG_LENGTH });
  return Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64');
}

function decryptJson(body: string, aesKey: Buffer, iv: Buffer): unknown {
  const encrypted = decodeBase64(body);
  if (encrypted.length < TAG_LENGTH) {
    throw new Error('Encrypted payload is missing its authentication tag');
  }
  const decipher = createDecipheriv('aes-128-gcm', aesKey, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(encrypted.subarray(-TAG_LENGTH));
  const plaintext = Buffer.concat([
    decipher.update(encrypted.subarray(0, -TAG_LENGTH)),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8')) as unknown;
}

function decodeBase64(value: string): Buffer {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new Error('Invalid base64 encoding');
  }
  return decoded;
}
