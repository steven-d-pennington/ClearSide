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

## 📝 Implementation Notes from Export System

> Added by agent completing EXPORT-001 on 2025-12-25

### Integration with Export Infrastructure

The text export system (EXPORT-001) provides clean text that can be fed directly to TTS:

**Use MarkdownExporter for Text Extraction:**
```typescript
import { MarkdownExporter } from '../export/markdownExporter.js';

// Get clean text for each speaker
const exporter = new MarkdownExporter();
const proText = exporter.formatProArguments(transcript.phases);
const conText = exporter.formatConArguments(transcript.phases);
const moderatorText = exporter.formatModeratorContent(transcript.phases);
```

**Key Files to Reference:**
- `backend/src/services/export/types.ts` - DebateTranscript, PhaseData interfaces
- `backend/src/services/export/markdownExporter.ts` - Text formatting utilities
- `backend/src/types/debate.ts` - Speaker enum (Pro, Con, Moderator)

### Speaker Mapping

The debate system uses these speaker identifiers:
```typescript
// From backend/src/types/debate.ts
const Speaker = {
  PRO: 'pro',
  CON: 'con',
  MODERATOR: 'moderator',
} as const;

// Map to ElevenLabs voices
const VOICE_MAP: Record<string, string> = {
  [Speaker.PRO]: VOICE_PROFILES.pro.voiceId,
  [Speaker.CON]: VOICE_PROFILES.con.voiceId,
  [Speaker.MODERATOR]: VOICE_PROFILES.moderator.voiceId,
};
```

### Phase-Based Audio Chapters

The 6-phase debate structure maps naturally to audio chapters:
1. Opening Statements
2. Constructive Arguments
3. Cross-Examination
4. Rebuttal
5. Closing Arguments
6. Moderator Synthesis

Each phase can be exported as a separate audio segment and concatenated.

### API Pattern

Follow the existing export route pattern:
```typescript
// Add to backend/src/routes/export-routes.ts
router.get('/exports/:debateId/audio', async (req, res) => {
  // Queue audio generation job (async due to TTS latency)
  // Return job ID for status polling
});

router.get('/exports/:debateId/audio/status/:jobId', async (req, res) => {
  // Check job status, return audio URL when complete
});
```

### Caching Strategy

Consider caching TTS output by:
- Debate ID + Speaker + Phase (most granular)
- Hash of text content (handles debate updates)

### Rate Limiting

ElevenLabs has API rate limits. Use the same rate limiter pattern as the LLM client:
- `backend/src/services/llm/` - Bottleneck rate limiter pattern

---

**Last Updated:** 2025-12-25
