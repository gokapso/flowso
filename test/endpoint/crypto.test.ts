import { constants, createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, privateDecrypt, publicEncrypt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptRequest, decryptResponse, encryptRequest, encryptResponse, flipIv, generateKeyPair } from '../../src/endpoint';
import type { DataExchangeRequest } from '../../src/endpoint';

const keys = generateKeyPair();
const payload: DataExchangeRequest = {
  version: '3.0', action: 'data_exchange', screen: 'FORM', flow_token: 'local-token',
  data: { name: 'José 👋', error_key: 'invalid_input', error: 'Try again' },
};

describe('endpoint cryptography', () => {
  it('generates a matching 2048-bit RSA PEM key pair', () => {
    const publicKey = createPublicKey(keys.publicKeyPem);
    const privateKey = createPrivateKey(keys.privateKeyPem);
    expect(publicKey.asymmetricKeyType).toBe('rsa');
    expect(publicKey.asymmetricKeyDetails?.modulusLength).toBe(2048);
    expect(createPublicKey(privateKey).export({ type: 'spki', format: 'pem' })).toBe(keys.publicKeyPem);
  });

  it('flips every IV bit without mutating or sharing the input', () => {
    const iv = Buffer.from([0, 1, 127, 128, 254, 255]);
    const flipped = flipIv(iv);
    expect(flipped).toEqual(Buffer.from([255, 254, 128, 127, 1, 0]));
    expect(flipIv(flipped)).toEqual(iv);
    expect(iv).toEqual(Buffer.from([0, 1, 127, 128, 254, 255]));
    expect(flipped.buffer === iv.buffer && flipped.byteOffset === iv.byteOffset).toBe(false);
  });

  it('round trips requests with fresh 128-bit keys and IVs', () => {
    const encrypted = encryptRequest({ publicKeyPem: keys.publicKeyPem, payload });
    const other = encryptRequest({ publicKeyPem: keys.publicKeyPem, payload });
    expect(encrypted.aesKey).toHaveLength(16);
    expect(encrypted.iv).toHaveLength(16);
    expect(other.aesKey).not.toEqual(encrypted.aesKey);
    expect(other.iv).not.toEqual(encrypted.iv);
    expect(Object.keys(encrypted.body).sort()).toEqual(['encrypted_aes_key', 'encrypted_flow_data', 'initial_vector']);
    expect(decryptRequest({ privateKeyPem: keys.privateKeyPem, body: encrypted.body })).toEqual({
      payload, aesKey: encrypted.aesKey, iv: encrypted.iv,
    });
  });

  it('matches the reference OAEP-SHA256 and ciphertext || 16-byte tag layout independently', () => {
    const { body, aesKey, iv } = encryptRequest({ publicKeyPem: keys.publicKeyPem, payload });
    const recoveredKey = privateDecrypt({
      key: keys.privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256',
    }, Buffer.from(body.encrypted_aes_key, 'base64'));
    expect(recoveredKey).toEqual(aesKey);
    expect(Buffer.from(body.initial_vector, 'base64')).toEqual(iv);
    const bytes = Buffer.from(body.encrypted_flow_data, 'base64');
    expect(bytes.length).toBe(Buffer.byteLength(JSON.stringify(payload)) + 16);
    const decipher = createDecipheriv('aes-128-gcm', recoveredKey, iv);
    decipher.setAuthTag(bytes.subarray(-16));
    expect(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString())).toEqual(payload);
  });

  it('decrypts requests built independently and supports passphrase-protected PEM keys', () => {
    const aesKey = Buffer.alloc(16, 42);
    const iv = Buffer.alloc(16, 99);
    const cipher = createCipheriv('aes-128-gcm', aesKey, iv);
    const body = {
      encrypted_aes_key: publicEncrypt({ key: keys.publicKeyPem, oaepHash: 'sha256' }, aesKey).toString('base64'),
      encrypted_flow_data: Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()]).toString('base64'),
      initial_vector: iv.toString('base64'),
    };
    const privateKeyPem = createPrivateKey(keys.privateKeyPem).export({
      type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'test-passphrase',
    }).toString();
    expect(decryptRequest({ privateKeyPem, passphrase: 'test-passphrase', body }).payload).toEqual(payload);
    expect(() => decryptRequest({ privateKeyPem, passphrase: 'wrong', body })).toThrow();
  });

  it('round trips responses with the same key and inverted IV', () => {
    const { aesKey, iv } = encryptRequest({ publicKeyPem: keys.publicKeyPem, payload });
    const response = { screen: 'SUCCESS', data: { extension_message_response: { params: { result: 'ok' } } } };
    const body = encryptResponse({ payload: response, aesKey, iv });
    expect(decryptResponse({ body, aesKey, iv })).toEqual(response);
    const referenceIv = Buffer.from([...iv].map((byte) => ~byte));
    const cipher = createCipheriv('aes-128-gcm', aesKey, referenceIv);
    const referenceBody = Buffer.concat([
      cipher.update(JSON.stringify(response), 'utf8'), cipher.final(), cipher.getAuthTag(),
    ]).toString('base64');
    expect(body).toBe(referenceBody);
    const decipher = createDecipheriv('aes-128-gcm', aesKey, iv);
    const bytes = Buffer.from(body, 'base64');
    decipher.setAuthTag(bytes.subarray(-16));
    decipher.update(bytes.subarray(0, -16));
    expect(() => decipher.final()).toThrow();
  });

  it('rejects corrupted request authentication tags', () => {
    const encrypted = encryptRequest({ publicKeyPem: keys.publicKeyPem, payload });
    const bytes = Buffer.from(encrypted.body.encrypted_flow_data, 'base64');
    bytes[0] = bytes[0]! ^ 1;
    encrypted.body.encrypted_flow_data = bytes.toString('base64');
    expect(() => decryptRequest({ privateKeyPem: keys.privateKeyPem, body: encrypted.body })).toThrow();
  });

  it.each(['not base64!', 'AAAA'])('rejects malformed encrypted response %s', (body) => {
    expect(() => decryptResponse({ body, aesKey: Buffer.alloc(16), iv: Buffer.alloc(16) })).toThrow();
  });
});
