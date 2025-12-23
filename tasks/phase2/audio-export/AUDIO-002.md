# AUDIO-002: Voice Mapping & Script Generation

**Task ID:** AUDIO-002
**Phase:** Phase 2
**Category:** Audio Export
**Priority:** P2
**Estimated Effort:** 2 days
**Dependencies:** AUDIO-001
**Status:** TO DO

---

## Overview

Create voice mapping system that assigns different voices to Pro, Con, and Moderator sections. Generate structured scripts with proper pacing, pauses, and emphasis.

---

## Objectives

1. Voice mapping configuration
2. Script generation from debate JSON
3. SSML formatting for natural speech
4. Pacing and pause insertion
5. Section transitions

---

## Technical Specification

```typescript
// src/services/audio/scriptGenerator.ts

import { DebateOutput } from '@/types/debate';

export interface AudioScript {
  segments: AudioSegment[];
  totalDuration: number; // estimated
}

export interface AudioSegment {
  text: string;
  voiceType: 'pro' | 'con' | 'moderator' | 'narrator';
  ssml: string;
  metadata: {
    section: string;
    index: number;
  };
}

export class ScriptGenerator {
  generate(output: DebateOutput): AudioScript {
    const segments: AudioSegment[] = [];

    // Introduction
    segments.push({
      text: `Analyzing the proposition: ${output.proposition.normalized}`,
      voiceType: 'narrator',
      ssml: `<speak><prosody rate="medium">Analyzing the proposition: <break time="500ms"/> ${output.proposition.normalized}</prosody></speak>`,
      metadata: { section: 'intro', index: 0 },
    });

    // Pro arguments
    output.pro.arguments.forEach((arg, i) => {
      segments.push({
        text: `Argument ${i + 1} in favor: ${arg.title}. ${arg.description}`,
        voiceType: 'pro',
        ssml: `<speak><prosody rate="medium"><emphasis level="moderate">Argument ${i + 1} in favor:</emphasis> ${arg.title}. <break time="500ms"/> ${arg.description}</prosody></speak>`,
        metadata: { section: 'pro', index: i },
      });
    });

    // Con arguments
    output.con.arguments.forEach((arg, i) => {
      segments.push({
        text: `Argument ${i + 1} against: ${arg.title}. ${arg.description}`,
        voiceType: 'con',
        ssml: `<speak><prosody rate="medium"><emphasis level="moderate">Argument ${i + 1} against:</emphasis> ${arg.title}. <break time="500ms"/> ${arg.description}</prosody></speak>`,
        metadata: { section: 'con', index: i },
      });
    });

    // Moderator synthesis
    segments.push({
      text: output.moderator.summary,
      voiceType: 'moderator',
      ssml: `<speak><prosody rate="slow">${output.moderator.summary}</prosody></speak>`,
      metadata: { section: 'moderator', index: 0 },
    });

    return {
      segments,
      totalDuration: this.estimateDuration(segments),
    };
  }

  private estimateDuration(segments: AudioSegment[]): number {
    // Rough estimate: ~150 words per minute
    const totalWords = segments.reduce(
      (sum, seg) => sum + seg.text.split(' ').length,
      0
    );
    return (totalWords / 150) * 60; // seconds
  }
}
```

---

**Last Updated:** 2025-12-23
