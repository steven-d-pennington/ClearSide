# PODCAST-002: Script Refinement Service

**Task ID:** PODCAST-002
**Phase:** Phase 4
**Category:** Podcast Export
**Priority:** P0
**Estimated Effort:** L (1-2 days)
**Dependencies:** PODCAST-001
**Status:** TO DO

---

## Context

Debate transcripts contain markdown formatting, abrupt transitions, and lack the conversational polish that listeners expect from podcasts. This task implements an LLM-powered script refinement service that transforms raw debate content into natural spoken dialogue optimized for text-to-speech.

**References:**
- [FUTURE-FEATURES.md](../../../docs/FUTURE-FEATURES.md) - Section 9: Script Refinement Pipeline
- Existing LLM client in `backend/src/services/llm/`
- Debate transcript format in `backend/src/services/export/types.ts`

---

## Requirements

### Acceptance Criteria

- [ ] Create `PodcastScriptRefiner` class for LLM-based script polish
- [ ] Remove markdown formatting (**, *, #, bullet points)
- [ ] Add natural spoken transitions between speakers
- [ ] Generate podcast intro and outro segments
- [ ] Segment output for TTS character limits (max 5,000 chars per segment)
- [ ] Handle all debate modes (turn-based, lively, duelogic, informal)
- [ ] Preserve speaker attribution for voice mapping
- [ ] Expand abbreviations (AI -> "A.I.", etc.)
- [ ] Add pause markers [pause] for dramatic effect
- [ ] Include context fields (previousText, nextText) for natural flow
- [ ] Estimate total duration based on word count

### Functional Requirements

From FUTURE-FEATURES.md:
- Transform raw debate transcripts into TTS-ready dialogue
- Add intro/outro for professional podcast feel
- Keep segments under 5,000 characters for ElevenLabs
- Preserve intellectual content while improving delivery

---

## Implementation Guide

### Script Refiner Service

```typescript
// backend/src/services/podcast/script-refiner.ts

import { OpenRouterLLMClient } from '../llm/openrouter-client.js';
import {
  RefinedPodcastScript,
  PodcastSegment,
  PodcastExportConfig,
  ElevenLabsVoiceSettings,
  DEFAULT_VOICE_ASSIGNMENTS
} from '../../types/podcast-export.js';
import { DebateTranscript, PhaseData } from '../export/types.js';

const MAX_SEGMENT_CHARS = 4500; // Leave buffer under 5000 limit
const WORDS_PER_MINUTE = 150;   // Average speaking rate

interface RefinementPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export class PodcastScriptRefiner {
  private llmClient: OpenRouterLLMClient;
  private config: PodcastExportConfig;

  constructor(llmClient: OpenRouterLLMClient, config: PodcastExportConfig) {
    this.llmClient = llmClient;
    this.config = config;
  }

  /**
   * Transform a debate transcript into a refined podcast script
   */
  async refineTranscript(transcript: DebateTranscript): Promise<RefinedPodcastScript> {
    const segments: PodcastSegment[] = [];
    let intro: PodcastSegment | undefined;
    let outro: PodcastSegment | undefined;

    // Generate intro if configured
    if (this.config.includeIntro) {
      intro = await this.generateIntro(transcript);
    }

    // Process each phase of the debate
    for (const phase of transcript.phases) {
      const phaseSegments = await this.refinePhase(phase, transcript.proposition);
      segments.push(...phaseSegments);
    }

    // Generate outro if configured
    if (this.config.includeOutro) {
      outro = await this.generateOutro(transcript);
    }

    // Add context for natural flow
    this.addContextFields(segments, intro, outro);

    // Calculate totals
    const allSegments = [intro, ...segments, outro].filter(Boolean) as PodcastSegment[];
    const totalCharacters = allSegments.reduce((sum, s) => sum + s.text.length, 0);
    const wordCount = allSegments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
    const durationEstimateSeconds = Math.round((wordCount / WORDS_PER_MINUTE) * 60);

    return {
      title: this.generateTitle(transcript.proposition),
      totalCharacters,
      durationEstimateSeconds,
      segments,
      intro,
      outro,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Generate podcast intro segment
   */
  private async generateIntro(transcript: DebateTranscript): Promise<PodcastSegment> {
    const prompt = this.buildIntroPrompt(transcript);

    const response = await this.llmClient.complete({
      model: this.config.refinementModel,
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt }
      ],
      temperature: 0.7,
      maxTokens: 500,
    });

    return {
      index: 0,
      speaker: 'narrator',
      voiceId: this.getVoiceId('narrator'),
      text: this.cleanText(response.content),
      voiceSettings: this.getVoiceSettings('narrator'),
    };
  }

  /**
   * Generate podcast outro segment
   */
  private async generateOutro(transcript: DebateTranscript): Promise<PodcastSegment> {
    const prompt = this.buildOutroPrompt(transcript);

    const response = await this.llmClient.complete({
      model: this.config.refinementModel,
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt }
      ],
      temperature: 0.7,
      maxTokens: 300,
    });

    return {
      index: -1, // Will be renumbered
      speaker: 'narrator',
      voiceId: this.getVoiceId('narrator'),
      text: this.cleanText(response.content),
      voiceSettings: this.getVoiceSettings('narrator'),
    };
  }

  /**
   * Refine a single debate phase into podcast segments
   */
  private async refinePhase(
    phase: PhaseData,
    proposition: string
  ): Promise<PodcastSegment[]> {
    const segments: PodcastSegment[] = [];

    // Add phase transition if configured
    if (this.config.addTransitions) {
      const transition = this.generatePhaseTransition(phase.phaseName);
      if (transition) {
        segments.push({
          index: segments.length,
          speaker: 'moderator',
          voiceId: this.getVoiceId('moderator'),
          text: transition,
          voiceSettings: this.getVoiceSettings('moderator'),
        });
      }
    }

    // Process each turn in the phase
    for (const turn of phase.turns) {
      const refinedText = await this.refineTurn(turn.content, turn.speaker, proposition);

      // Split into segments if too long
      const turnSegments = this.splitIntoSegments(
        refinedText,
        this.mapSpeakerRole(turn.speaker)
      );

      segments.push(...turnSegments);
    }

    return segments;
  }

  /**
   * Refine a single turn's content for spoken delivery
   */
  private async refineTurn(
    content: string,
    speaker: string,
    proposition: string
  ): Promise<string> {
    const prompt = this.buildRefinementPrompt(content, speaker, proposition);

    const response = await this.llmClient.complete({
      model: this.config.refinementModel,
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt }
      ],
      temperature: 0.4, // Lower temp for more faithful transformation
      maxTokens: 2000,
    });

    return this.cleanText(response.content);
  }

  /**
   * Build the refinement prompt for polishing debate content
   */
  private buildRefinementPrompt(
    content: string,
    speaker: string,
    proposition: string
  ): RefinementPrompt {
    return {
      systemPrompt: `You are a podcast script editor. Transform debate transcripts into natural spoken dialogue suitable for text-to-speech synthesis.

Guidelines:
- Remove ALL markdown formatting (**, *, #, bullet points, numbered lists)
- Convert structured arguments into flowing conversational prose
- Expand abbreviations naturally (AI -> "A.I.", US -> "the United States")
- Add natural verbal pauses using [pause] markers sparingly
- Keep the intellectual content and arguments intact
- Use contractions where natural (it's, we're, that's)
- Break long sentences into shorter, more natural phrases
- Remove citations and footnote markers
- Don't add new arguments or opinions - just polish the delivery

Output ONLY the refined spoken text. No explanations or meta-commentary.`,

      userPrompt: `Speaker: ${speaker}
Topic: ${proposition}

Original text to refine:
${content}

Refined spoken version:`,
    };
  }

  /**
   * Build prompt for generating podcast intro
   */
  private buildIntroPrompt(transcript: DebateTranscript): RefinementPrompt {
    return {
      systemPrompt: `You are a podcast intro writer. Create welcoming, engaging introductions for debate podcasts.

Guidelines:
- Keep it under 100 words
- Welcome listeners warmly
- Introduce the topic clearly
- Mention it's a structured debate format
- Set expectations for what they'll hear
- Sound professional but approachable
- NO markdown formatting

Output ONLY the intro text.`,

      userPrompt: `Create a podcast intro for a debate on this topic:

"${transcript.proposition}"

The debate has ${transcript.phases.length} phases and features advocates on both sides with a moderator.`,
    };
  }

  /**
   * Build prompt for generating podcast outro
   */
  private buildOutroPrompt(transcript: DebateTranscript): RefinementPrompt {
    return {
      systemPrompt: `You are a podcast outro writer. Create brief, thoughtful closings for debate podcasts.

Guidelines:
- Keep it under 60 words
- Thank listeners for joining
- Encourage reflection on both perspectives
- Remind them the goal is clarity, not persuasion
- Optional: mention ClearSide platform
- Sound warm and genuine
- NO markdown formatting

Output ONLY the outro text.`,

      userPrompt: `Create a podcast outro for a debate on:

"${transcript.proposition}"`,
    };
  }

  /**
   * Generate a natural transition phrase for a debate phase
   */
  private generatePhaseTransition(phaseName: string): string | null {
    const transitions: Record<string, string> = {
      'Opening Statements': '[pause] Let us begin with opening statements from each side.',
      'Constructive Arguments': '[pause] Moving now to constructive arguments.',
      'Cross-Examination': '[pause] We now enter cross-examination, where each side may challenge the other.',
      'Rebuttal': '[pause] Time for rebuttals.',
      'Closing Arguments': '[pause] We conclude with closing arguments.',
      'Synthesis': '[pause] Finally, our moderator offers a balanced synthesis of the debate.',
    };

    return transitions[phaseName] || null;
  }

  /**
   * Split long text into segments under the character limit
   */
  private splitIntoSegments(text: string, speaker: string): PodcastSegment[] {
    const segments: PodcastSegment[] = [];

    if (text.length <= MAX_SEGMENT_CHARS) {
      segments.push({
        index: 0,
        speaker,
        voiceId: this.getVoiceId(speaker),
        text,
        voiceSettings: this.getVoiceSettings(speaker),
      });
      return segments;
    }

    // Split by sentences, keeping under limit
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentSegment = '';

    for (const sentence of sentences) {
      if ((currentSegment + sentence).length > MAX_SEGMENT_CHARS) {
        if (currentSegment) {
          segments.push({
            index: segments.length,
            speaker,
            voiceId: this.getVoiceId(speaker),
            text: currentSegment.trim(),
            voiceSettings: this.getVoiceSettings(speaker),
          });
        }
        currentSegment = sentence;
      } else {
        currentSegment += sentence;
      }
    }

    // Add final segment
    if (currentSegment.trim()) {
      segments.push({
        index: segments.length,
        speaker,
        voiceId: this.getVoiceId(speaker),
        text: currentSegment.trim(),
        voiceSettings: this.getVoiceSettings(speaker),
      });
    }

    return segments;
  }

  /**
   * Add previousText and nextText context for natural TTS flow
   */
  private addContextFields(
    segments: PodcastSegment[],
    intro?: PodcastSegment,
    outro?: PodcastSegment
  ): void {
    const allSegments = [intro, ...segments, outro].filter(Boolean) as PodcastSegment[];

    for (let i = 0; i < allSegments.length; i++) {
      // Get last 200 chars of previous segment
      if (i > 0) {
        const prevText = allSegments[i - 1].text;
        allSegments[i].previousText = prevText.slice(-200);
      }

      // Get first 200 chars of next segment
      if (i < allSegments.length - 1) {
        const nextText = allSegments[i + 1].text;
        allSegments[i].nextText = nextText.slice(0, 200);
      }

      // Renumber indexes
      allSegments[i].index = i;
    }
  }

  /**
   * Map debate speaker to voice assignment role
   */
  private mapSpeakerRole(speaker: string): string {
    const mapping: Record<string, string> = {
      'Pro': 'pro_advocate',
      'pro': 'pro_advocate',
      'Pro Advocate': 'pro_advocate',
      'Con': 'con_advocate',
      'con': 'con_advocate',
      'Con Advocate': 'con_advocate',
      'Moderator': 'moderator',
      'moderator': 'moderator',
      'Chair': 'moderator',
    };

    return mapping[speaker] || 'narrator';
  }

  /**
   * Get ElevenLabs voice ID for a speaker role
   */
  private getVoiceId(speakerRole: string): string {
    const assignment = this.config.voiceAssignments[speakerRole]
      || DEFAULT_VOICE_ASSIGNMENTS[speakerRole]
      || DEFAULT_VOICE_ASSIGNMENTS.narrator;

    return assignment.voiceId;
  }

  /**
   * Get voice settings for a speaker role
   */
  private getVoiceSettings(speakerRole: string): ElevenLabsVoiceSettings {
    const assignment = this.config.voiceAssignments[speakerRole]
      || DEFAULT_VOICE_ASSIGNMENTS[speakerRole]
      || DEFAULT_VOICE_ASSIGNMENTS.narrator;

    return assignment.settings;
  }

  /**
   * Clean text of any remaining formatting issues
   */
  private cleanText(text: string): string {
    return text
      .replace(/\*\*/g, '')           // Remove bold
      .replace(/\*/g, '')             // Remove italic
      .replace(/#{1,6}\s*/g, '')      // Remove headers
      .replace(/`[^`]+`/g, '')        // Remove inline code
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links to text
      .replace(/^\s*[-*+]\s+/gm, '')  // Remove bullet points
      .replace(/^\s*\d+\.\s+/gm, '')  // Remove numbered lists
      .replace(/\n{3,}/g, '\n\n')     // Normalize line breaks
      .trim();
  }

  /**
   * Generate a clean title from the proposition
   */
  private generateTitle(proposition: string): string {
    // Remove common prefixes
    let title = proposition
      .replace(/^(Should|Do|Does|Is|Are|Can|Will|Would)\s+/i, '')
      .replace(/\?$/, '');

    // Capitalize first letter
    return title.charAt(0).toUpperCase() + title.slice(1);
  }
}
```

### Integration Example

```typescript
// Example usage in podcast export pipeline

import { PodcastScriptRefiner } from './script-refiner.js';
import { OpenRouterLLMClient } from '../llm/openrouter-client.js';
import { DebateRepository } from '../../db/repositories/debate-repository.js';
import { MarkdownExporter } from '../export/markdownExporter.js';

async function refineDebateForPodcast(debateId: string, config: PodcastExportConfig) {
  // Get debate transcript
  const debateRepo = new DebateRepository(pool);
  const debate = await debateRepo.findById(debateId);

  const exporter = new MarkdownExporter();
  const transcript = await exporter.buildTranscript(debate);

  // Refine for podcast
  const llmClient = new OpenRouterLLMClient(process.env.OPENROUTER_API_KEY!);
  const refiner = new PodcastScriptRefiner(llmClient, config);

  const refinedScript = await refiner.refineTranscript(transcript);

  console.log(`Refined script: ${refinedScript.totalCharacters} chars`);
  console.log(`Estimated duration: ${Math.round(refinedScript.durationEstimateSeconds / 60)} minutes`);
  console.log(`Segments: ${refinedScript.segments.length}`);

  return refinedScript;
}
```

---

## Validation

### How to Test

1. Create unit tests for the `PodcastScriptRefiner` class:
   - Test markdown stripping
   - Test segment splitting at character limit
   - Test speaker role mapping
   - Test context field population
   - Test intro/outro generation (mock LLM)

2. Integration test with a real debate:
   - Export a completed debate
   - Refine the transcript
   - Verify all speakers are mapped correctly
   - Verify no markdown remains in output
   - Verify segments are under 5,000 chars

3. Test edge cases:
   - Very short debates
   - Very long individual turns
   - Informal discussion mode (no pro/con)
   - Missing phases

### Definition of Done

- [ ] Script refiner removes all markdown formatting
- [ ] Segments respect 5,000 character limit
- [ ] Intro and outro are generated when configured
- [ ] Phase transitions are natural and professional
- [ ] Speaker roles map to correct voice assignments
- [ ] Context fields populated for natural TTS flow
- [ ] Duration estimates are reasonably accurate
- [ ] Unit tests pass with >85% coverage
- [ ] Works with all debate modes

---

## Notes

- Use a fast, cost-effective model for refinement (e.g., GPT-4o-mini, Claude Haiku)
- LLM temperature should be low (0.3-0.5) to preserve original meaning
- Consider adding a "preview" mode that skips LLM calls and just cleans formatting
- The script is stored in the database so users can edit before TTS generation
- Abbreviation expansion should be configurable (some users may prefer "AI" over "A.I.")

---

**Estimated Time:** 1-2 days
**Assigned To:** _Unassigned_
**Created:** 2026-01-03
**Updated:** 2026-01-03
