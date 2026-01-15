/**
 * JWT Token Utilities
 * 
 * Generates and verifies JSON Web Tokens for stateless authentication.
 * Tokens are stored in httpOnly cookies for XSS protection.
 */

import jwt, { type SignOptions } from 'jsonwebtoken';
import type { JwtPayload, UserRole } from '../types/auth.js';
import { AUTH_CONSTANTS } from '../types/auth.js';

// JWT configuration
const JWT_EXPIRATION_SECONDS = AUTH_CONSTANTS.JWT_EXPIRY_DAYS * 24 * 60 * 60;
const JWT_ISSUER = 'clearside';
const JWT_AUDIENCE = 'clearside-api';
const COOKIE_NAME = 'auth_token';

/**
 * Get JWT secret from environment, with validation
 * Lazily evaluated to avoid startup errors during testing
 */
function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error(
            'JWT_SECRET environment variable is required. ' +
            'Generate one with: openssl rand -base64 32'
        );
    }
    if (secret.length < 32) {
        throw new Error('JWT_SECRET must be at least 32 characters for security');
    }
    return secret;
}

/**
 * Input payload for generating a new token
 */
export interface GenerateTokenPayload {
    userId: string;
    username: string;
    role: UserRole;
    organizationId: string;
}

/**
 * Generate a JWT token for an authenticated user
 * 
 * @param payload - User information to encode in token
 * @returns Signed JWT token string
 */
export function generateToken(payload: GenerateTokenPayload): string {
    const secret = getJwtSecret();

    return jwt.sign(
        {
            userId: payload.userId,
            username: payload.username,
            role: payload.role,
            organizationId: payload.organizationId,
        },
        secret,
        {
            expiresIn: JWT_EXPIRATION_SECONDS,
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
        } as SignOptions
    );
}

/**
 * Verify and decode a JWT token
 * 
 * @param token - JWT token string to verify
 * @returns Decoded payload if valid, null if invalid/expired
 */
export function verifyToken(token: string): JwtPayload | null {
    try {
        const secret = getJwtSecret();

        const decoded = jwt.verify(token, secret, {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
        }) as JwtPayload;

        return decoded;
    } catch (error) {
        // Token is invalid, expired, or tampered with
        // Don't log error details to avoid leaking security info
        return null;
    }
}

/**
 * Decode a token without verification (for debugging/inspection only)
 * 
 * WARNING: This does not verify the token signature!
 * Only use for debugging or extracting claims from expired tokens.
 * 
 * @param token - JWT token string to decode
 * @returns Decoded payload or null if malformed
 */
export function decodeToken(token: string): JwtPayload | null {
    try {
        return jwt.decode(token) as JwtPayload | null;
    } catch (error) {
        return null;
    }
}

/**
 * Cookie options for storing JWT tokens
 * 
 * Security features:
 * - httpOnly: Prevents XSS attacks (JavaScript cannot read the cookie)
 * - secure: HTTPS only in production
 * - sameSite: CSRF protection
 * - path: Cookie sent to all API routes
 */
export interface CookieOptions {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    maxAge: number;
    path: string;
}

/**
 * Get cookie options for JWT authentication
 * 
 * @returns Cookie configuration object for express res.cookie()
 */
export function getCookieOptions(): CookieOptions {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        httpOnly: true, // Prevent XSS - JS cannot access this cookie
        secure: isProduction, // HTTPS only in production
        sameSite: 'strict', // CSRF protection - cookie only sent for same-site requests
        maxAge: AUTH_CONSTANTS.JWT_EXPIRY_DAYS * 24 * 60 * 60 * 1000, // Days to milliseconds
        path: '/', // Cookie valid for all routes
    };
}

/**
 * Get the cookie name used for authentication
 */
export function getAuthCookieName(): string {
    return COOKIE_NAME;
}

/**
 * Check if a JWT token is close to expiration
 * Useful for proactive token refresh
 * 
 * @param token - JWT token to check
 * @param thresholdDays - Number of days before expiration to consider "close"
 * @returns true if token expires within threshold
 */
export function isTokenNearExpiration(token: string, thresholdDays: number = 1): boolean {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) {
        return true; // Invalid token, treat as expired
    }

    const expirationDate = new Date(decoded.exp * 1000);
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = new Date();

    return expirationDate.getTime() - now.getTime() < thresholdMs;
}
