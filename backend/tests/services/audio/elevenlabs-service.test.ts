/**
 * ElevenLabs Service Tests
 *
 * Tests for the ElevenLabs TTS integration.
 * Uses mocked HTTP responses for API calls.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ElevenLabsService,
  createElevenLabsService,
  DEFAULT_VOICE_PROFILES,
} from '../../../src/services/audio/elevenlabs-service.js';

// Mock axios
vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn(() => ({
        post: vi.fn(),
        get: vi.fn(),
      })),
    },
  };
});

describe('ElevenLabsService', () => {
  let service: ElevenLabsService;

  beforeEach(() => {
    service = new ElevenLabsService({
      apiKey: 'test-api-key',
    });
  });

  describe('constructor', () => {
    it('should create service with required config', () => {
      const svc = new ElevenLabsService({ apiKey: 'test-key' });
      expect(svc).toBeInstanceOf(ElevenLabsService);
    });

    it('should use default model ID', () => {
      const svc = new ElevenLabsService({ apiKey: 'test-key' });
      expect(svc).toBeDefined();
    });

    it('should accept custom model ID', () => {
      const svc = new ElevenLabsService({
        apiKey: 'test-key',
        modelId: 'eleven_monolingual_v1',
      });
      expect(svc).toBeDefined();
    });
  });

  describe('getVoiceConfig', () => {
    it('should return config for pro voice', () => {
      const config = service.getVoiceConfig('pro');
      expect(config).toBeDefined();
      expect(config.voiceId).toBe(DEFAULT_VOICE_PROFILES.pro.voiceId);
      expect(config.name).toBe('Pro Advocate');
    });

    it('should return config for con voice', () => {
      const config = service.getVoiceConfig('con');
      expect(config).toBeDefined();
      expect(config.voiceId).toBe(DEFAULT_VOICE_PROFILES.con.voiceId);
      expect(config.name).toBe('Con Advocate');
    });

    it('should return config for moderator voice', () => {
      const config = service.getVoiceConfig('moderator');
      expect(config).toBeDefined();
      expect(config.voiceId).toBe(DEFAULT_VOICE_PROFILES.moderator.voiceId);
      expect(config.name).toBe('Moderator');
    });

    it('should return config for narrator voice', () => {
      const config = service.getVoiceConfig('narrator');
      expect(config).toBeDefined();
      expect(config.voiceId).toBe(DEFAULT_VOICE_PROFILES.narrator.voiceId);
      expect(config.name).toBe('Narrator');
    });
  });

  describe('custom voice profiles', () => {
    it('should use custom voice profiles when provided', () => {
      const customService = new ElevenLabsService({
        apiKey: 'test-key',
        voiceProfiles: {
          pro: {
            voiceId: 'custom-voice-id',
            name: 'Custom Pro',
            stability: 0.6,
            similarityBoost: 0.8,
          },
        },
      });

      const config = customService.getVoiceConfig('pro');
      expect(config.voiceId).toBe('custom-voice-id');
      expect(config.name).toBe('Custom Pro');
    });

    it('should preserve default profiles for uncustomized voices', () => {
      const customService = new ElevenLabsService({
        apiKey: 'test-key',
        voiceProfiles: {
          pro: {
            voiceId: 'custom-voice-id',
            name: 'Custom Pro',
            stability: 0.6,
            similarityBoost: 0.8,
          },
        },
      });

      const conConfig = customService.getVoiceConfig('con');
      expect(conConfig.voiceId).toBe(DEFAULT_VOICE_PROFILES.con.voiceId);
    });
  });
});

describe('DEFAULT_VOICE_PROFILES', () => {
  it('should have all required voice types', () => {
    expect(DEFAULT_VOICE_PROFILES.pro).toBeDefined();
    expect(DEFAULT_VOICE_PROFILES.con).toBeDefined();
    expect(DEFAULT_VOICE_PROFILES.moderator).toBeDefined();
    expect(DEFAULT_VOICE_PROFILES.narrator).toBeDefined();
  });

  it('should have valid voice IDs', () => {
    expect(DEFAULT_VOICE_PROFILES.pro.voiceId).toBeTruthy();
    expect(DEFAULT_VOICE_PROFILES.con.voiceId).toBeTruthy();
    expect(DEFAULT_VOICE_PROFILES.moderator.voiceId).toBeTruthy();
    expect(DEFAULT_VOICE_PROFILES.narrator.voiceId).toBeTruthy();
  });

  it('should have stability values between 0 and 1', () => {
    const voices = Object.values(DEFAULT_VOICE_PROFILES);
    for (const voice of voices) {
      expect(voice.stability).toBeGreaterThanOrEqual(0);
      expect(voice.stability).toBeLessThanOrEqual(1);
    }
  });

  it('should have similarity boost values between 0 and 1', () => {
    const voices = Object.values(DEFAULT_VOICE_PROFILES);
    for (const voice of voices) {
      expect(voice.similarityBoost).toBeGreaterThanOrEqual(0);
      expect(voice.similarityBoost).toBeLessThanOrEqual(1);
    }
  });
});

describe('createElevenLabsService', () => {
  it('should throw error if API key is not provided', () => {
    // Clear the env var
    const originalKey = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;

    expect(() => createElevenLabsService()).toThrow('ELEVENLABS_API_KEY');

    // Restore
    if (originalKey) {
      process.env.ELEVENLABS_API_KEY = originalKey;
    }
  });

  it('should create service with config API key', () => {
    const service = createElevenLabsService({ apiKey: 'test-key' });
    expect(service).toBeInstanceOf(ElevenLabsService);
  });
});
