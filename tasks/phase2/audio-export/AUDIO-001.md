# AUDIO-001: ElevenLabs TTS Integration

**Task ID:** AUDIO-001
**Phase:** Phase 2
**Category:** Audio Export
**Priority:** P2
**Estimated Effort:** 3 days
**Dependencies:** QUEUE-001
**Status:** TO DO

---

## Overview

Integrate ElevenLabs Text-to-Speech API for high-quality debate narration. Implement voice selection, audio generation, and caching for efficient processing.

---

## Objectives

1. ElevenLabs API integration
2. Voice selection (Pro, Con, Moderator personas)
3. Audio chunk generation
4. Streaming and caching
5. Error handling and retries

---

## Technical Specification

```typescript
// src/services/audio/elevenLabsService.ts

import axios from 'axios';

interface VoiceConfig {
  voiceId: string;
  stability: number;
  similarityBoost: number;
}

const VOICE_PROFILES: Record<string, VoiceConfig> = {
  pro: {
    voiceId: 'EXAVITQu4vr4xnSDxMaL', // Professional male
    stability: 0.5,
    similarityBoost: 0.75,
  },
  con: {
    voiceId: 'ErXwobaYiN019PkySvjV', // Professional female
    stability: 0.5,
    similarityBoost: 0.75,
  },
  moderator: {
    voiceId: '21m00Tcm4TlvDq8ikWAM', // Neutral voice
    stability: 0.7,
    similarityBoost: 0.8,
  },
};

export class ElevenLabsService {
  private apiKey: string;
  private baseURL = 'https://api.elevenlabs.io/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateSpeech(
    text: string,
    voiceType: 'pro' | 'con' | 'moderator'
  ): Promise<Buffer> {
    const voice = VOICE_PROFILES[voiceType];

    const response = await axios.post(
      `${this.baseURL}/text-to-speech/${voice.voiceId}`,
      {
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: voice.stability,
          similarity_boost: voice.similarityBoost,
        },
      },
      {
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );

    return Buffer.from(response.data);
  }

  async streamSpeech(
    text: string,
    voiceType: 'pro' | 'con' | 'moderator'
  ): AsyncIterable<Buffer> {
    // Streaming implementation
    const voice = VOICE_PROFILES[voiceType];

    const response = await axios.post(
      `${this.baseURL}/text-to-speech/${voice.voiceId}/stream`,
      {
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: voice.stability,
          similarity_boost: voice.similarityBoost,
        },
      },
      {
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
      }
    );

    async function* streamGenerator() {
      for await (const chunk of response.data) {
        yield Buffer.from(chunk);
      }
    }

    return streamGenerator();
  }
}
```

---

## Validation Steps

- [ ] API integration works
- [ ] Voice profiles sound distinct
- [ ] Streaming works
- [ ] Error handling robust
- [ ] Tests pass

---

**Last Updated:** 2025-12-23
