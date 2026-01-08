/**
 * Google Cloud Auth Helpers
 *
 * Shared helpers for parsing service account credentials and generating
 * OAuth2 access tokens for Google Cloud APIs.
 */

import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';

export interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

const BASE64_PREFIX = 'base64:';

function base64UrlEncode(input: string | Buffer): string {
  const base64 = Buffer.isBuffer(input)
    ? input.toString('base64')
    : Buffer.from(input).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildServiceAccountJwt(credentials: ServiceAccountCredentials): string {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: credentials.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(credentials.private_key);
  const encodedSignature = base64UrlEncode(signature);

  return `${signatureInput}.${encodedSignature}`;
}

export function parseServiceAccountJson(input: string): ServiceAccountCredentials {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error('Service account input is empty');
  }

  if (trimmed.startsWith(BASE64_PREFIX)) {
    const decoded = Buffer.from(trimmed.slice(BASE64_PREFIX.length), 'base64').toString('utf-8');
    return JSON.parse(decoded) as ServiceAccountCredentials;
  }

  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as ServiceAccountCredentials;
  }

  if (fs.existsSync(trimmed)) {
    const fileContents = fs.readFileSync(trimmed, 'utf-8');
    return JSON.parse(fileContents) as ServiceAccountCredentials;
  }

  throw new Error(
    'Service account must be JSON, base64:JSON, or a valid file path.'
  );
}

export async function createAccessToken(
  credentials: ServiceAccountCredentials
): Promise<{ accessToken: string; expiresIn: number }> {
  const jwt = buildServiceAccountJwt(credentials);
  const response = await axios.post(
    credentials.token_uri,
    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return {
    accessToken: response.data.access_token,
    expiresIn: response.data.expires_in,
  };
}
