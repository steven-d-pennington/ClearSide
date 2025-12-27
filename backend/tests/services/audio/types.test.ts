/**
 * Audio Types Tests
 *
 * Tests for the audio export type definitions and defaults.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_AUDIO_OPTIONS } from '../../../src/services/audio/types.js';

describe('DEFAULT_AUDIO_OPTIONS', () => {
  it('should have format set to mp3', () => {
    expect(DEFAULT_AUDIO_OPTIONS.format).toBe('mp3');
  });

  it('should have background music disabled by default', () => {
    expect(DEFAULT_AUDIO_OPTIONS.includeBackgroundMusic).toBe(false);
  });

  it('should have background music volume set to 0.1', () => {
    expect(DEFAULT_AUDIO_OPTIONS.backgroundMusicVolume).toBe(0.1);
  });

  it('should have voice speed set to 1.0', () => {
    expect(DEFAULT_AUDIO_OPTIONS.voiceSpeed).toBe(1.0);
  });

  it('should have intro/outro enabled by default', () => {
    expect(DEFAULT_AUDIO_OPTIONS.includeIntroOutro).toBe(true);
  });

  it('should have audio normalization enabled by default', () => {
    expect(DEFAULT_AUDIO_OPTIONS.normalizeAudio).toBe(true);
  });

  it('should have empty voice profiles override by default', () => {
    expect(DEFAULT_AUDIO_OPTIONS.voiceProfiles).toEqual({});
  });

  it('should have pause between segments set to 500ms', () => {
    expect(DEFAULT_AUDIO_OPTIONS.pauseBetweenSegments).toBe(500);
  });

  it('should have pause between phases set to 1500ms', () => {
    expect(DEFAULT_AUDIO_OPTIONS.pauseBetweenPhases).toBe(1500);
  });

  it('should be a complete required options object', () => {
    // Verify all required fields are present
    const requiredFields = [
      'format',
      'includeBackgroundMusic',
      'backgroundMusicVolume',
      'voiceSpeed',
      'includeIntroOutro',
      'normalizeAudio',
      'voiceProfiles',
      'pauseBetweenSegments',
      'pauseBetweenPhases',
    ];

    for (const field of requiredFields) {
      expect(DEFAULT_AUDIO_OPTIONS).toHaveProperty(field);
    }
  });
});
