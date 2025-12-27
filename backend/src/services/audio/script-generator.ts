/**
 * Audio Script Generator
 *
 * Converts debate transcripts into structured audio scripts with proper
 * voice mapping, SSML formatting, and chapter markers.
 *
 * @see tasks/phase2/audio-export/AUDIO-002.md
 */

import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import type { DebateTranscript } from '../transcript/transcript-recorder.js';
import type {
  AudioScript,
  AudioSegment,
  ChapterMarker,
  VoiceType,
  AudioExportOptions,
} from './types.js';

/**
 * Logger instance
 */
const logger = pino({
  name: 'script-generator',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Phase name mapping for display
 */
const PHASE_NAMES: Record<string, string> = {
  phase_1_opening: 'Opening Statements',
  phase_2_constructive: 'Evidence Presentation',
  phase_3_crossexam: 'Clarifying Questions',
  phase_4_rebuttal: 'Rebuttals',
  phase_5_closing: 'Closing Statements',
  phase_6_synthesis: 'Moderator Synthesis',
};

/**
 * Speaker name mapping for display
 */
const SPEAKER_NAMES: Record<string, string> = {
  pro: 'Pro Advocate',
  con: 'Con Advocate',
  moderator: 'Moderator',
  system: 'Narrator',
};

/**
 * Average words per minute for duration estimation
 */
const WORDS_PER_MINUTE = 150;

/**
 * Script Generator Class
 *
 * Converts debate transcripts to audio scripts with SSML formatting
 */
export class ScriptGenerator {
  private readonly pauseBetweenSegments: number;
  private readonly pauseBetweenPhases: number;

  constructor(options: Partial<AudioExportOptions> = {}) {
    this.pauseBetweenSegments = options.pauseBetweenSegments || 500;
    this.pauseBetweenPhases = options.pauseBetweenPhases || 1500;
  }

  /**
   * Generate a complete audio script from a debate transcript
   *
   * @param transcript - Complete debate transcript
   * @param options - Script generation options
   * @returns Audio script with segments and chapters
   */
  generate(
    transcript: DebateTranscript,
    options: Partial<AudioExportOptions> = {}
  ): AudioScript {
    logger.info(
      { debateId: transcript.meta.debate_id },
      'Generating audio script'
    );

    const segments: AudioSegment[] = [];
    const chapters: ChapterMarker[] = [];
    let currentTimeMs = 0;

    // Include intro if requested
    if (options.includeIntroOutro !== false) {
      const intro = this.generateIntro(transcript);
      segments.push(intro);
      currentTimeMs += intro.metadata.estimatedDuration * 1000;
    }

    // Process each phase in order
    const phases = this.getPhaseOrder();

    for (const phase of phases) {
      const phaseSegments = this.generatePhaseSegments(transcript, phase);

      if (phaseSegments.length > 0) {
        // Add chapter marker for this phase
        const chapterStart = currentTimeMs;

        // Add pause before phase
        if (segments.length > 0) {
          currentTimeMs += this.pauseBetweenPhases;
        }

        // Add phase introduction
        const phaseIntro = this.generatePhaseIntro(phase);
        segments.push(phaseIntro);
        currentTimeMs += phaseIntro.metadata.estimatedDuration * 1000;

        // Add all segments for this phase
        for (const segment of phaseSegments) {
          segments.push(segment);
          currentTimeMs += segment.metadata.estimatedDuration * 1000;
          currentTimeMs += this.pauseBetweenSegments;
        }

        // Record chapter
        chapters.push({
          title: PHASE_NAMES[phase] || phase,
          startTimeMs: chapterStart,
          endTimeMs: currentTimeMs,
          phase,
        });
      }
    }

    // Include outro if requested
    if (options.includeIntroOutro !== false) {
      const outro = this.generateOutro(transcript);
      segments.push(outro);
      currentTimeMs += outro.metadata.estimatedDuration * 1000;
    }

    // Calculate total duration
    const totalDuration = currentTimeMs / 1000;

    logger.info(
      {
        debateId: transcript.meta.debate_id,
        segmentCount: segments.length,
        chapterCount: chapters.length,
        totalDuration,
      },
      'Audio script generated'
    );

    return {
      segments,
      totalDuration,
      chapters,
      metadata: {
        debateId: transcript.meta.debate_id,
        proposition: transcript.proposition.normalized_question,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Generate intro segment
   */
  private generateIntro(transcript: DebateTranscript): AudioSegment {
    const proposition = transcript.proposition.normalized_question;

    const text = `Welcome to ClearSide Debate. Today we examine the proposition: ${proposition}.
    You will hear arguments from both sides, followed by a moderator's synthesis.
    Let's begin.`;

    return this.createSegment(text, 'narrator', 'intro', 'Introduction', 0);
  }

  /**
   * Generate outro segment
   */
  private generateOutro(_transcript: DebateTranscript): AudioSegment {
    const text = `This concludes our analysis of the proposition.
    Remember: the goal is not to tell you what to think, but to help you think more clearly.
    Thank you for listening to ClearSide Debate.`;

    return this.createSegment(text, 'narrator', 'outro', 'Conclusion', 0);
  }

  /**
   * Generate phase introduction
   */
  private generatePhaseIntro(phase: string): AudioSegment {
    const phaseName = PHASE_NAMES[phase] || phase;
    const text = `${phaseName}.`;

    return this.createSegment(
      text,
      'narrator',
      phase,
      `${phaseName} Introduction`,
      0
    );
  }

  /**
   * Generate segments for a specific phase
   */
  private generatePhaseSegments(
    transcript: DebateTranscript,
    phase: string
  ): AudioSegment[] {
    const segments: AudioSegment[] = [];

    // Get utterances for this phase
    const phaseUtterances = transcript.transcript?.filter(
      (u) => u.phase === phase
    ) || [];

    // Sort by timestamp
    phaseUtterances.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

    // Convert each utterance to an audio segment
    for (let i = 0; i < phaseUtterances.length; i++) {
      const utterance = phaseUtterances[i]!;
      const voiceType = this.mapSpeakerToVoice(utterance.speaker);
      const speakerName = SPEAKER_NAMES[utterance.speaker] || utterance.speaker;

      const segment = this.createSegment(
        utterance.content,
        voiceType,
        phase,
        speakerName,
        i
      );

      segments.push(segment);
    }

    // If no utterances but we have structured analysis, use that
    if (segments.length === 0) {
      const analysisSegments = this.generateFromStructuredAnalysis(
        transcript,
        phase
      );
      segments.push(...analysisSegments);
    }

    return segments;
  }

  /**
   * Generate segments from structured analysis (fallback)
   */
  private generateFromStructuredAnalysis(
    transcript: DebateTranscript,
    phase: string
  ): AudioSegment[] {
    const segments: AudioSegment[] = [];
    const analysis = transcript.structured_analysis;

    if (!analysis) {
      return segments;
    }

    switch (phase) {
      case 'phase_1_opening':
        // Use executive summaries for opening
        if (analysis.pro?.executive_summary) {
          segments.push(
            this.createSegment(
              `The case in favor: ${analysis.pro.executive_summary}`,
              'pro',
              phase,
              'Pro Advocate',
              0
            )
          );
        }
        if (analysis.con?.executive_summary) {
          segments.push(
            this.createSegment(
              `The case against: ${analysis.con.executive_summary}`,
              'con',
              phase,
              'Con Advocate',
              1
            )
          );
        }
        break;

      case 'phase_2_constructive':
        // Use arguments for constructive phase
        let argIndex = 0;
        if (analysis.pro?.arguments) {
          for (const arg of analysis.pro.arguments) {
            segments.push(
              this.createSegment(
                `Pro argument ${argIndex + 1}: ${arg.content}`,
                'pro',
                phase,
                'Pro Advocate',
                argIndex++
              )
            );
          }
        }
        if (analysis.con?.arguments) {
          for (const arg of analysis.con.arguments) {
            segments.push(
              this.createSegment(
                `Con argument ${argIndex + 1}: ${arg.content}`,
                'con',
                phase,
                'Con Advocate',
                argIndex++
              )
            );
          }
        }
        break;

      case 'phase_6_synthesis':
        // Use moderator synthesis
        if (analysis.moderator) {
          const mod = analysis.moderator;

          if (mod.areas_of_agreement?.length > 0) {
            const agreements = mod.areas_of_agreement
              .map((a) => a.description)
              .join('. ');
            segments.push(
              this.createSegment(
                `Areas of agreement: ${agreements}`,
                'moderator',
                phase,
                'Moderator',
                0
              )
            );
          }

          if (mod.core_disagreements?.length > 0) {
            const disagreements = mod.core_disagreements
              .map((d) => d.description)
              .join('. ');
            segments.push(
              this.createSegment(
                `Core disagreements: ${disagreements}`,
                'moderator',
                phase,
                'Moderator',
                1
              )
            );
          }

          if (mod.decision_hinges?.length > 0) {
            const hinges = mod.decision_hinges.join('. ');
            segments.push(
              this.createSegment(
                `Key decision points: ${hinges}`,
                'moderator',
                phase,
                'Moderator',
                2
              )
            );
          }
        }
        break;
    }

    return segments;
  }

  /**
   * Create an audio segment with SSML formatting
   */
  private createSegment(
    text: string,
    voiceType: VoiceType,
    phase: string,
    speakerName: string,
    index: number
  ): AudioSegment {
    // Clean and prepare text
    const cleanText = this.cleanText(text);

    // Generate SSML with natural prosody
    const ssml = this.generateSSML(cleanText, voiceType);

    // Estimate duration
    const estimatedDuration = this.estimateDuration(cleanText);

    return {
      id: uuidv4(),
      text: cleanText,
      ssml,
      voiceType,
      metadata: {
        phase,
        phaseName: PHASE_NAMES[phase] || phase,
        index,
        speakerName,
        estimatedDuration,
      },
    };
  }

  /**
   * Generate SSML for natural speech
   */
  private generateSSML(text: string, voiceType: VoiceType): string {
    // Add appropriate prosody based on voice type
    const prosodySettings = this.getProsodySettings(voiceType);

    // Split into sentences for better pacing
    const sentences = text.split(/(?<=[.!?])\s+/);

    const ssmlContent = sentences
      .map((sentence) => {
        // Add emphasis to key phrases
        const emphasized = this.addEmphasis(sentence.trim());
        return emphasized;
      })
      .join('<break time="300ms"/>');

    return `<speak>
  <prosody rate="${prosodySettings.rate}" pitch="${prosodySettings.pitch}">
    ${ssmlContent}
  </prosody>
</speak>`;
  }

  /**
   * Get prosody settings for voice type
   */
  private getProsodySettings(
    voiceType: VoiceType
  ): { rate: string; pitch: string } {
    switch (voiceType) {
      case 'pro':
        return { rate: 'medium', pitch: '+0%' };
      case 'con':
        return { rate: 'medium', pitch: '+0%' };
      case 'moderator':
        return { rate: 'slow', pitch: '-5%' };
      case 'narrator':
        return { rate: 'medium', pitch: '+0%' };
      default:
        return { rate: 'medium', pitch: '+0%' };
    }
  }

  /**
   * Add SSML emphasis to key phrases
   */
  private addEmphasis(text: string): string {
    // Emphasize phrases in quotes
    let result = text.replace(
      /"([^"]+)"/g,
      '<emphasis level="moderate">"$1"</emphasis>'
    );

    // Add breaks after colons
    result = result.replace(/:\s*/g, ':<break time="200ms"/> ');

    // Emphasize numbers and statistics
    result = result.replace(
      /(\d+(?:\.\d+)?%?)/g,
      '<emphasis level="moderate">$1</emphasis>'
    );

    return result;
  }

  /**
   * Clean text for TTS
   */
  private cleanText(text: string): string {
    return (
      text
        // Remove markdown formatting
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        // Remove URLs
        .replace(/https?:\/\/[^\s]+/g, '')
        // Remove multiple spaces
        .replace(/\s+/g, ' ')
        // Trim
        .trim()
    );
  }

  /**
   * Estimate duration in seconds based on word count
   */
  private estimateDuration(text: string): number {
    const wordCount = text.split(/\s+/).length;
    return (wordCount / WORDS_PER_MINUTE) * 60;
  }

  /**
   * Map speaker to voice type
   */
  private mapSpeakerToVoice(speaker: string): VoiceType {
    switch (speaker) {
      case 'pro':
      case 'pro_advocate':
        return 'pro';
      case 'con':
      case 'con_advocate':
        return 'con';
      case 'moderator':
        return 'moderator';
      default:
        return 'narrator';
    }
  }

  /**
   * Get ordered list of phases
   */
  private getPhaseOrder(): string[] {
    return [
      'phase_1_opening',
      'phase_2_constructive',
      'phase_3_crossexam',
      'phase_4_rebuttal',
      'phase_5_closing',
      'phase_6_synthesis',
    ];
  }
}

/**
 * Create a new ScriptGenerator instance
 */
export function createScriptGenerator(
  options?: Partial<AudioExportOptions>
): ScriptGenerator {
  return new ScriptGenerator(options);
}
