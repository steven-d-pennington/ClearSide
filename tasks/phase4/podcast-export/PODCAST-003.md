# PODCAST-003: ElevenLabs TTS Client for Podcast Export

**Task ID:** PODCAST-003
**Phase:** Phase 4
**Category:** Podcast Export
**Priority:** P0
**Estimated Effort:** M (4-8 hours)
**Dependencies:** PODCAST-001, AUDIO-001
**Status:** DONE

---

## Context

This task extends the existing ElevenLabs TTS integration (AUDIO-001) with podcast-specific features: per-speaker voice settings, context-aware generation for natural flow, and proper cost tracking. The client must handle long-form content by processing segments sequentially with rate limit awareness.

**References:**
- [FUTURE-FEATURES.md](../../../docs/FUTURE-FEATURES.md) - Section 9: ElevenLabs API Integration
- Existing TTS service in `backend/src/services/audio/`
- ElevenLabs API documentation: https://elevenlabs.io/docs/api-reference

---

## Requirements

### Acceptance Criteria

- [x] Create `PodcastTTSClient` extending base ElevenLabs integration
- [x] Support all ElevenLabs models (eleven_v3, eleven_multilingual_v2, turbo, flash)
- [x] Implement per-segment voice settings (stability, similarity_boost, style, speed)
- [x] Add `previous_text` and `next_text` context for natural transitions
- [x] Track character usage for cost calculation
- [x] Handle rate limiting with exponential backoff
- [x] Support streaming for real-time progress updates
- [x] Implement proper error handling and retries
- [x] Add pronunciation dictionary support
- [x] Return audio as Buffer or stream for concatenation

### Functional Requirements

From FUTURE-FEATURES.md:
- [x] Use model-specific character limits (5K-40K depending on model)
- [x] Apply custom voice settings per speaker role
- [x] Track actual character count for billing
- [x] Handle context continuity between segments

---

## Implementation Guide

### Definition of Done

- [x] TTS client supports all four ElevenLabs models
- [x] Voice settings are correctly applied per segment
- [x] Rate limiting prevents API quota exhaustion
- [x] Retry logic handles transient errors gracefully
- [x] Cost tracking is accurate to within 5%
- [x] Context fields (previous_text, next_text) improve audio flow
- [x] Unit tests pass with >90% coverage
- [x] Voice validation catches invalid configurations

### Podcast TTS Client

```typescript
// backend/src/services/podcast/podcast-tts-client.ts

import axios, { AxiosInstance } from 'axios';
import Bottleneck from 'bottleneck';
import {
  PodcastSegment,
  ElevenLabsModel,
  AudioOutputFormat,
  ElevenLabsVoiceSettings
} from '../../types/podcast-export.js';

interface TTSRequest {
  text: string;
  voiceId: string;
  modelId: ElevenLabsModel;
  voiceSettings: ElevenLabsVoiceSettings;
  outputFormat: AudioOutputFormat;
  previousText?: string;
  nextText?: string;
  pronunciationDictionaryId?: string;
}

interface TTSResponse {
  audio: Buffer;
  characterCount: number;
  durationMs?: number;
}

interface UsageStats {
  totalCharacters: number;
  totalRequests: number;
  estimatedCostCents: number;
}

// Model-specific character limits
const MODEL_CHAR_LIMITS: Record<ElevenLabsModel, number> = {
  'eleven_v3': 5000,
  'eleven_multilingual_v2': 10000,
  'eleven_turbo_v2_5': 40000,
  'eleven_flash_v2_5': 40000,
};

// ElevenLabs pricing per 1000 characters (Creator tier)
const COST_PER_1000_CHARS_CENTS = 15; // $0.15 per 1K chars

export class PodcastTTSClient {
  private client: AxiosInstance;
  private limiter: Bottleneck;
  private usageStats: UsageStats = {
    totalCharacters: 0,
    totalRequests: 0,
    estimatedCostCents: 0,
  };

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: 'https://api.elevenlabs.io/v1',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60s timeout for long segments
    });

    // Rate limiter: ElevenLabs allows ~100 requests/minute on paid plans
    this.limiter = new Bottleneck({
      minTime: 600,    // 600ms between requests
      maxConcurrent: 1, // Sequential processing for podcasts
    });
  }

  /**
   * Generate audio for a single podcast segment
   */
  async generateSegmentAudio(segment: PodcastSegment, config: {
    modelId: ElevenLabsModel;
    outputFormat: AudioOutputFormat;
    pronunciationDictionaryId?: string;
  }): Promise<TTSResponse> {
    return this.limiter.schedule(() => this.callTTSAPI({
      text: segment.text,
      voiceId: segment.voiceId,
      modelId: config.modelId,
      voiceSettings: segment.voiceSettings,
      outputFormat: config.outputFormat,
      previousText: segment.previousText,
      nextText: segment.nextText,
      pronunciationDictionaryId: config.pronunciationDictionaryId,
    }));
  }

  /**
   * Generate audio for all segments in a script
   */
  async generateFullPodcast(
    segments: PodcastSegment[],
    config: {
      modelId: ElevenLabsModel;
      outputFormat: AudioOutputFormat;
      pronunciationDictionaryId?: string;
    },
    onProgress?: (current: number, total: number) => void
  ): Promise<{ audioBuffers: Buffer[]; stats: UsageStats }> {
    const audioBuffers: Buffer[] = [];

    for (let i = 0; i < segments.length; i++) {
      const response = await this.generateSegmentAudio(segments[i], config);
      audioBuffers.push(response.audio);

      if (onProgress) {
        onProgress(i + 1, segments.length);
      }
    }

    return {
      audioBuffers,
      stats: this.getUsageStats(),
    };
  }

  /**
   * Call the ElevenLabs TTS API with retry logic
   */
  private async callTTSAPI(request: TTSRequest, attempt = 1): Promise<TTSResponse> {
    const maxRetries = 3;

    try {
      // Validate segment length
      const charLimit = MODEL_CHAR_LIMITS[request.modelId];
      if (request.text.length > charLimit) {
        throw new Error(`Text exceeds model limit: ${request.text.length} > ${charLimit}`);
      }

      // Build request body
      const body: any = {
        text: request.text,
        model_id: request.modelId,
        voice_settings: {
          stability: request.voiceSettings.stability,
          similarity_boost: request.voiceSettings.similarity_boost,
          style: request.voiceSettings.style,
          speed: request.voiceSettings.speed,
          use_speaker_boost: request.voiceSettings.use_speaker_boost,
        },
      };

      // Add context for natural flow (optional)
      if (request.previousText) {
        body.previous_text = request.previousText;
      }
      if (request.nextText) {
        body.next_text = request.nextText;
      }

      // Add pronunciation dictionary if specified
      if (request.pronunciationDictionaryId) {
        body.pronunciation_dictionary_locators = [{
          pronunciation_dictionary_id: request.pronunciationDictionaryId,
        }];
      }

      // Make API call
      const response = await this.client.post(
        `/text-to-speech/${request.voiceId}`,
        body,
        {
          params: { output_format: request.outputFormat },
          responseType: 'arraybuffer',
        }
      );

      // Track usage
      const characterCount = request.text.length;
      this.usageStats.totalCharacters += characterCount;
      this.usageStats.totalRequests += 1;
      this.usageStats.estimatedCostCents +=
        Math.ceil((characterCount / 1000) * COST_PER_1000_CHARS_CENTS);

      return {
        audio: Buffer.from(response.data),
        characterCount,
      };

    } catch (error: any) {
      // Handle rate limiting
      if (error.response?.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(error.response.headers['retry-after'] || '5', 10);
        console.log(`Rate limited, retrying in ${retryAfter}s (attempt ${attempt}/${maxRetries})`);
        await this.sleep(retryAfter * 1000);
        return this.callTTSAPI(request, attempt + 1);
      }

      // Handle server errors with retry
      if (error.response?.status >= 500 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Server error, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await this.sleep(delay);
        return this.callTTSAPI(request, attempt + 1);
      }

      // Parse error message
      if (error.response?.data) {
        const errorText = Buffer.from(error.response.data).toString();
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(`ElevenLabs API error: ${errorJson.detail?.message || errorJson.message || errorText}`);
        } catch {
          throw new Error(`ElevenLabs API error: ${errorText}`);
        }
      }

      throw error;
    }
  }

  /**
   * Stream audio generation (for real-time playback)
   */
  async streamSegmentAudio(
    segment: PodcastSegment,
    config: {
      modelId: ElevenLabsModel;
      pronunciationDictionaryId?: string;
    }
  ): Promise<AsyncIterable<Buffer>> {
    const body: any = {
      text: segment.text,
      model_id: config.modelId,
      voice_settings: {
        stability: segment.voiceSettings.stability,
        similarity_boost: segment.voiceSettings.similarity_boost,
        style: segment.voiceSettings.style,
        speed: segment.voiceSettings.speed,
        use_speaker_boost: segment.voiceSettings.use_speaker_boost,
      },
    };

    if (segment.previousText) {
      body.previous_text = segment.previousText;
    }
    if (segment.nextText) {
      body.next_text = segment.nextText;
    }

    const response = await this.client.post(
      `/text-to-speech/${segment.voiceId}/stream`,
      body,
      { responseType: 'stream' }
    );

    // Track usage
    this.usageStats.totalCharacters += segment.text.length;
    this.usageStats.totalRequests += 1;
    this.usageStats.estimatedCostCents +=
      Math.ceil((segment.text.length / 1000) * COST_PER_1000_CHARS_CENTS);

    return response.data;
  }

  /**
   * Get available voices from ElevenLabs
   */
  async getVoices(): Promise<Array<{ voice_id: string; name: string; category: string }>> {
    const response = await this.client.get('/voices');
    return response.data.voices;
  }

  /**
   * Estimate cost for a given character count
   */
  static estimateCostCents(characterCount: number): number {
    return Math.ceil((characterCount / 1000) * COST_PER_1000_CHARS_CENTS);
  }

  /**
   * Get model character limit
   */
  static getModelCharLimit(modelId: ElevenLabsModel): number {
    return MODEL_CHAR_LIMITS[modelId];
  }

  /**
   * Get current usage statistics
   */
  getUsageStats(): UsageStats {
    return { ...this.usageStats };
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats(): void {
    this.usageStats = {
      totalCharacters: 0,
      totalRequests: 0,
      estimatedCostCents: 0,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Voice Validation Utility

```typescript
// backend/src/services/podcast/voice-validator.ts

import { PodcastTTSClient } from './podcast-tts-client.js';
import { VoiceAssignment, DEFAULT_VOICE_ASSIGNMENTS } from '../../types/podcast-export.js';

export class VoiceValidator {
  private ttsClient: PodcastTTSClient;
  private cachedVoices: Map<string, { name: string; category: string }> | null = null;

  constructor(ttsClient: PodcastTTSClient) {
    this.ttsClient = ttsClient;
  }

  /**
   * Validate that all voice assignments use valid ElevenLabs voice IDs
   */
  async validateAssignments(
    assignments: Record<string, VoiceAssignment>
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Get available voices
    if (!this.cachedVoices) {
      const voices = await this.ttsClient.getVoices();
      this.cachedVoices = new Map(
        voices.map(v => [v.voice_id, { name: v.name, category: v.category }])
      );
    }

    // Validate each assignment
    for (const [role, assignment] of Object.entries(assignments)) {
      if (!this.cachedVoices.has(assignment.voiceId)) {
        errors.push(`Invalid voice ID for ${role}: ${assignment.voiceId}`);
      }

      // Validate settings ranges
      if (assignment.settings.stability < 0 || assignment.settings.stability > 1) {
        errors.push(`Invalid stability for ${role}: must be 0-1`);
      }
      if (assignment.settings.similarity_boost < 0 || assignment.settings.similarity_boost > 1) {
        errors.push(`Invalid similarity_boost for ${role}: must be 0-1`);
      }
      if (assignment.settings.style < 0 || assignment.settings.style > 1) {
        errors.push(`Invalid style for ${role}: must be 0-1`);
      }
      if (assignment.settings.speed < 0.5 || assignment.settings.speed > 2.0) {
        errors.push(`Invalid speed for ${role}: must be 0.5-2.0`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get list of recommended voices for debate roles
   */
  async getRecommendedVoices(): Promise<Record<string, Array<{
    voiceId: string;
    name: string;
    recommended: boolean;
  }>>> {
    const voices = await this.ttsClient.getVoices();

    // Filter to premade voices (most reliable)
    const premadeVoices = voices.filter(v => v.category === 'premade');

    return {
      moderator: premadeVoices.slice(0, 5).map((v, i) => ({
        voiceId: v.voice_id,
        name: v.name,
        recommended: v.voice_id === DEFAULT_VOICE_ASSIGNMENTS.moderator.voiceId,
      })),
      pro_advocate: premadeVoices.slice(0, 5).map((v, i) => ({
        voiceId: v.voice_id,
        name: v.name,
        recommended: v.voice_id === DEFAULT_VOICE_ASSIGNMENTS.pro_advocate.voiceId,
      })),
      con_advocate: premadeVoices.slice(0, 5).map((v, i) => ({
        voiceId: v.voice_id,
        name: v.name,
        recommended: v.voice_id === DEFAULT_VOICE_ASSIGNMENTS.con_advocate.voiceId,
      })),
      narrator: premadeVoices.slice(0, 5).map((v, i) => ({
        voiceId: v.voice_id,
        name: v.name,
        recommended: v.voice_id === DEFAULT_VOICE_ASSIGNMENTS.narrator.voiceId,
      })),
    };
  }
}
```

---

## Validation

### How to Test

1. Unit tests for `PodcastTTSClient`:
   - Test rate limiting behavior
   - Test retry logic on errors
   - Test usage tracking accuracy
   - Test voice settings validation

2. Integration tests (with mock API):
   - Generate audio for a sample segment
   - Verify context fields are passed correctly
   - Verify cost estimation accuracy

3. Manual testing:
   - Generate audio for a short test phrase
   - Verify audio quality with different voice settings
   - Test with multiple segments in sequence

### Definition of Done

- [x] TTS client supports all four ElevenLabs models
- [x] Voice settings are correctly applied per segment
- [x] Rate limiting prevents API quota exhaustion
- [x] Retry logic handles transient errors gracefully
- [x] Cost tracking is accurate to within 5%
- [x] Context fields (previous_text, next_text) improve audio flow
- [x] Unit tests pass with >90% coverage
- [x] Voice validation catches invalid configurations

---

## Notes

- The `previous_text` and `next_text` parameters help ElevenLabs models produce natural transitions
- Different models have different latency/quality tradeoffs:
  - `eleven_v3`: Best quality, highest latency
  - `eleven_turbo_v2_5`: Good balance for production use
  - `eleven_flash_v2_5`: Fastest, good for previews
- Consider caching audio by segment hash for regeneration efficiency
- Voice IDs in the defaults may need updating based on ElevenLabs voice library

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-03
**Updated:** 2026-01-03
