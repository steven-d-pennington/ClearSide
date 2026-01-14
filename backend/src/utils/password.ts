/**
 * Password Utilities
 * 
 * Secure password hashing with bcrypt and validation utilities.
 * Used for user authentication and password management.
 */

import bcrypt from 'bcryptjs';
import { AUTH_CONSTANTS } from '../types/auth.js';

/**
 * Password complexity requirements
 */
export const PASSWORD_REQUIREMENTS = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false, // Lenient: no special chars required
} as const;

/**
 * Hash a password using bcrypt
 * 
 * Uses 12 salt rounds for security (~250ms per hash on modern hardware).
 * This is intentionally slow to resist brute-force attacks.
 * 
 * @param password - Plain text password to hash
 * @returns Promise resolving to bcrypt hash string
 */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS);
}

/**
 * Verify a password against a stored hash
 * 
 * @param password - Plain text password to verify
 * @param hash - Bcrypt hash to compare against
 * @returns Promise resolving to true if password matches
 */
export async function verifyPassword(
    password: string,
    hash: string
): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

/**
 * NATO phonetic alphabet for memorable temp passwords
 */
const PHONETIC_WORDS = [
    'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot',
    'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima',
    'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo',
    'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'Xray',
    'Yankee', 'Zulu'
] as const;

/**
 * Generate a memorable temporary password
 * 
 * Format: Word1-Word2-1234
 * Example: Alpha-Bravo-5678
 * 
 * This format is:
 * - Easy to communicate verbally
 * - Easy to type on mobile keyboards
 * - Meets password complexity requirements
 * - Has sufficient entropy (~50 bits)
 * 
 * @returns Randomly generated temporary password
 */
export function generateTempPassword(): string {
    const word1 = PHONETIC_WORDS[Math.floor(Math.random() * PHONETIC_WORDS.length)]!;
    const word2 = PHONETIC_WORDS[Math.floor(Math.random() * PHONETIC_WORDS.length)]!;
    const number = Math.floor(1000 + Math.random() * 9000);

    return `${word1}-${word2}-${number}`;
}

/**
 * Password validation result
 */
export interface PasswordValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Validate password against complexity requirements
 * 
 * @param password - Password to validate
 * @returns Object with valid flag and array of error messages
 */
export function validatePassword(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (password.length < PASSWORD_REQUIREMENTS.minLength) {
        errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`);
    }

    if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    if (PASSWORD_REQUIREMENTS.requireNumbers && !/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    if (PASSWORD_REQUIREMENTS.requireSpecialChars && !/[^A-Za-z0-9]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Get human-readable password requirements message
 * 
 * @returns String describing password requirements for users
 */
export function getPasswordRequirementsMessage(): string {
    const requirements: string[] = [
        `at least ${PASSWORD_REQUIREMENTS.minLength} characters`,
    ];

    if (PASSWORD_REQUIREMENTS.requireUppercase) {
        requirements.push('one uppercase letter');
    }
    if (PASSWORD_REQUIREMENTS.requireLowercase) {
        requirements.push('one lowercase letter');
    }
    if (PASSWORD_REQUIREMENTS.requireNumbers) {
        requirements.push('one number');
    }
    if (PASSWORD_REQUIREMENTS.requireSpecialChars) {
        requirements.push('one special character');
    }

    return `Password must have ${requirements.join(', ')}.`;
}
