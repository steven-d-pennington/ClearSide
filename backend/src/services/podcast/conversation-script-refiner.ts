/**
 * Conversation Script Refiner
 *
 * Prepares conversation transcripts for TTS export without converting to debate format.
 * Preserves the natural talk show format with host introductions, questions, and organic discussion flow.
 */

import pino from 'pino';
import type { Pool } from 'pg';
import { ConversationSessionRepository } from '../../db/repositories/conversation-session-repository.js';
import { ConversationParticipantRepository } from '../../db/repositories/conversation-participant-repository.js';
import { ConversationUtteranceRepository } from '../../db/repositories/conversation-utterance-repository.js';
import type {
  ConversationSession,
  ConversationParticipant,
  ConversationUtterance,
  VoiceCharacteristics,
} from '../../types/conversation.js';

const logger = pino({
  name: 'conversation-script-refiner',
  level: process.env.LOG_LEVEL || 'info',
});

// ============================================================================
// Types
// ============================================================================

/**
 * TTS Provider types
 */
export type TTSProvider = 'elevenlabs' | 'gemini' | 'google_cloud';

/**
 * Refined script segment
 */
export interface RefinedSegment {
  speakerName: string;
  speakerRole: 'host' | 'guest';
  personaSlug: string | null;
  content: string;
  order: number;
  originalUtteranceId?: number;
  isKeyPoint: boolean;
  /** Flag indicating the segment appears truncated (ends mid-sentence) */
  isTruncated?: boolean;
}

/**
 * Detect if content appears truncated (ends mid-sentence)
 * Useful for flagging segments that may need regeneration
 */
export function detectTruncatedContent(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return false;

  // Check if ends with valid sentence terminators
  const lastChar = trimmed.slice(-1);
  const validEndings = ['.', '!', '?', '"', "'", ')', ']', '*', '—'];

  // If ends with a valid ending, likely not truncated
  if (validEndings.includes(lastChar)) {
    return false;
  }

  // Check for mid-word truncation (ends with a letter)
  const endsWithLetter = /[a-zA-Z]$/.test(trimmed);
  const endsWithComma = trimmed.endsWith(',');
  const endsWithColon = trimmed.endsWith(':');

  // These patterns suggest truncation
  if (endsWithLetter || endsWithComma || endsWithColon) {
    return true;
  }

  return false;
}

/**
 * Voice assignment for export
 */
export interface VoiceAssignment {
  speakerName: string;
  speakerRole: 'host' | 'guest';
  personaSlug: string | null;
  personaId?: string;
  participantId?: string;
  voiceId?: string;
  voiceSettings?: VoiceCharacteristics;
}

/**
 * Refined conversation script ready for TTS
 */
export interface RefinedConversationScript {
  sessionId: string;
  title: string;
  topic: string;
  segments: RefinedSegment[];
  voiceAssignments: VoiceAssignment[];
  totalSegments: number;
  totalWords: number;
  estimatedDurationMinutes: number;
  provider: TTSProvider;
  refinedAt: Date;
}

// ============================================================================
// Conversation Script Refiner
// ============================================================================

/**
 * Prepares conversation transcripts for TTS without converting to debate format.
 * Preserves the natural talk show format with host and guests.
 */
export class ConversationScriptRefiner {
  private sessionRepo: ConversationSessionRepository;
  private participantRepo: ConversationParticipantRepository;
  private utteranceRepo: ConversationUtteranceRepository;

  constructor(pool: Pool) {
    this.sessionRepo = new ConversationSessionRepository(pool);
    this.participantRepo = new ConversationParticipantRepository(pool);
    this.utteranceRepo = new ConversationUtteranceRepository(pool);
  }

  /**
   * Refine a conversation session for TTS export
   */
  async refine(
    sessionId: string,
    provider: TTSProvider = 'elevenlabs'
  ): Promise<RefinedConversationScript> {
    logger.info({ sessionId, provider }, 'Refining conversation for export');

    // Load session data
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Load participants with persona data already populated
    const participants = await this.participantRepo.findBySessionId(sessionId);

    // Build participant lookup
    const participantMap = new Map<string, ConversationParticipant>();
    for (const p of participants) {
      participantMap.set(p.id, p);
    }

    // Load utterances
    const utterances = await this.utteranceRepo.findBySessionId(sessionId);

    // Refine each utterance
    const segments: RefinedSegment[] = [];
    for (let i = 0; i < utterances.length; i++) {
      const utterance = utterances[i];
      if (!utterance) continue;

      const segment = this.refineUtterance(utterance, participantMap, provider, i);
      segments.push(segment);
    }

    // Build voice assignments
    const voiceAssignments = this.buildVoiceAssignments(session, participants);

    // Calculate totals
    const totalWords = segments.reduce((sum, s) => sum + s.content.split(/\s+/).length, 0);
    const estimatedDurationMinutes = Math.ceil(totalWords / 150); // ~150 words per minute

    logger.info({
      sessionId,
      segmentCount: segments.length,
      totalWords,
      estimatedDurationMinutes,
    }, 'Conversation refined successfully');

    return {
      sessionId,
      title: this.generateTitle(session.topic),
      topic: session.topic,
      segments,
      voiceAssignments,
      totalSegments: segments.length,
      totalWords,
      estimatedDurationMinutes,
      provider,
      refinedAt: new Date(),
    };
  }

  /**
   * Refine a single utterance for TTS
   */
  private refineUtterance(
    utterance: ConversationUtterance,
    participantMap: Map<string, ConversationParticipant>,
    provider: TTSProvider,
    order: number
  ): RefinedSegment {
    const isHost = utterance.isHostUtterance;
    let speakerName = 'Host';
    let personaSlug: string | null = null;

    if (!isHost && utterance.participantId) {
      const participant = participantMap.get(utterance.participantId);
      speakerName = participant?.displayNameOverride || participant?.persona?.name || 'Guest';
      personaSlug = participant?.persona?.slug || null;
    }

    // Apply provider-specific refinements
    let content = utterance.content;
    content = this.cleanForTTS(content, provider);
    content = this.addAudioCues(content, provider);

    // Detect truncation (ends mid-sentence)
    const isTruncated = detectTruncatedContent(content);
    if (isTruncated) {
      logger.warn({
        utteranceId: utterance.id,
        speakerName,
        order,
        contentLength: content.length,
        lastChars: content.slice(-30),
      }, 'Detected potentially truncated utterance');
    }

    return {
      speakerName,
      speakerRole: isHost ? 'host' : 'guest',
      personaSlug,
      content,
      order,
      originalUtteranceId: utterance.id,
      isKeyPoint: utterance.isKeyPoint,
      isTruncated,
    };
  }

  /**
   * Add provider-appropriate audio cues
   */
  private addAudioCues(content: string, provider: TTSProvider): string {
    switch (provider) {
      case 'elevenlabs':
        return this.addElevenLabsCues(content);
      case 'gemini':
        return this.addGeminiCues(content);
      case 'google_cloud':
        return this.addGoogleCloudCues(content);
      default:
        return content;
    }
  }

  /**
   * ElevenLabs V3 audio cues
   * Uses documented tags: [pause], [loudly], [sigh], [stammers], [whispers], [deadpan], [flatly]
   */
  private addElevenLabsCues(content: string): string {
    // Add pauses after questions
    content = content.replace(/\?(?=\s)/g, '? [pause]');

    // Add emphasis on key transition words
    content = content.replace(/\b(importantly|crucially|however|nevertheless)\b/gi, '[pause] $1');

    // Add thoughtful pause before "but" or "however" at sentence boundary
    content = content.replace(/\.\s+(But|However|Yet)/g, '. [pause] $1');

    // Add pause before direct addresses
    content = content.replace(/(,\s+)(Professor|Doctor|Dr\.|Mayor|Rabbi|Captain)/g, ', [pause] $2');

    return content;
  }

  /**
   * Gemini audio cues (uses natural punctuation and text markers)
   */
  private addGeminiCues(content: string): string {
    // Gemini uses natural speech patterns
    // Add ellipses for thoughtful pauses
    content = content.replace(/\.\s+(But|However|Well|Now)/g, '... $1');

    // Add commas for natural breathing at filler phrases
    content = content.replace(/\b(you know|I think|actually|honestly)\b/gi, ', $1,');

    // Use asterisks for expression markers (Gemini interprets these)
    content = content.replace(/\b(sigh|sighs)\b/gi, '*sigh*');
    content = content.replace(/\b(laughs?)\b/gi, '*laughs*');

    return content;
  }

  /**
   * Google Cloud TTS SSML cues
   * Uses proper SSML markup for pauses, emphasis, and prosody.
   * Each segment will be wrapped in <speak> tags when sent to TTS.
   */
  private addGoogleCloudCues(content: string): string {
    // Add medium pause after questions for natural rhythm
    content = content.replace(/\?(\s)/g, '?<break time="400ms"/>$1');

    // Add pause before transition words (But, However, Yet, Now, Well)
    content = content.replace(/\.\s+(But|However|Yet|Now|Well)\b/g, '.<break time="500ms"/> $1');

    // Add pause before direct addresses
    content = content.replace(/(,\s+)(Professor|Doctor|Dr\.|Mayor|Rabbi|Captain)/g, ',<break time="300ms"/> $2');

    // Add emphasis on key words
    content = content.replace(
      /\b(crucially|importantly|fundamentally|critically|absolutely|definitely)\b/gi,
      '<emphasis level="moderate">$1</emphasis>'
    );

    // Add strong emphasis for very emphatic words
    content = content.replace(
      /\b(never|always|must|cannot|impossible)\b/gi,
      '<emphasis level="strong">$1</emphasis>'
    );

    // Add pause before "because" and "therefore" for clarity
    content = content.replace(/\b(because|therefore|thus|hence)\b/gi, '<break time="200ms"/>$1');

    // Add slight pause for parenthetical phrases (commas around phrases)
    content = content.replace(/,\s+([^,]+),/g, ',<break time="150ms"/> $1,');

    // Add pause before concluding phrases
    content = content.replace(
      /\.\s+(In conclusion|To summarize|Ultimately|Finally|In the end)\b/g,
      '.<break time="600ms"/> $1'
    );

    return content;
  }

  /**
   * Clean content for TTS
   * Removes markdown, stage directions, and normalizes text for speech.
   * Preserves SSML tags for Google Cloud provider.
   */
  private cleanForTTS(content: string, provider: TTSProvider): string {
    // FIRST: Remove action tags like *nods slowly*, *sighs*, *leans forward*, etc.
    // These are stage directions that should not be spoken
    content = content.replace(/\*[^*]+\*/g, '');

    // Remove markdown bold formatting (double asterisks)
    content = content.replace(/\*\*/g, '');

    // Remove any remaining single asterisks
    content = content.replace(/\*/g, '');

    // Remove backticks (code formatting)
    content = content.replace(/`/g, '');

    // Remove markdown headers
    content = content.replace(/#{1,6}\s*/g, '');

    // Remove bullet points and numbered lists
    content = content.replace(/^\s*[-*+]\s+/gm, '');
    content = content.replace(/^\s*\d+\.\s+/gm, '');

    // Remove parenthetical stage directions like (pauses), (sighs), (laughs)
    content = content.replace(/\([^)]*(?:pause|sigh|laugh|nod|smile|lean|gesture|adjust|clear|look|turn|shake)[^)]*\)/gi, '');

    // Remove square bracket stage directions like [pauses], [sighs]
    // But NOT ElevenLabs tags like [pause], [loudly] which are intentional
    if (provider !== 'elevenlabs') {
      content = content.replace(/\[[^\]]*(?:pause|sigh|laugh|nod|smile|lean|gesture|adjust|clear|look|turn|shake)[^\]]*\]/gi, '');
    }

    // Clean up URLs FIRST (before colon replacement damages them)
    content = content.replace(/https?:\/\/[^\s]+/g, '');

    // Clean up colons that might be read as "colon" - replace speaker labels at start
    // e.g., "Host: Welcome" -> "Welcome"
    content = content.replace(/^[A-Z][a-zA-Z\s]+:\s*/gm, '');

    // Replace standalone colons with natural pauses
    content = content.replace(/\s*:\s*/g, ', ');

    // Expand common abbreviations for natural speech
    content = content.replace(/\bAI\b/g, 'A.I.');
    content = content.replace(/\bML\b/g, 'M.L.');
    content = content.replace(/\be\.g\./g, 'for example');
    content = content.replace(/\bi\.e\./g, 'that is');
    content = content.replace(/\betc\./g, 'et cetera');
    content = content.replace(/\bvs\./g, 'versus');
    content = content.replace(/\bw\/\b/g, 'with');
    content = content.replace(/\bw\/o\b/g, 'without');

    // Remove SSML-like tags ONLY for non-Google Cloud providers
    // Google Cloud uses SSML for pauses and emphasis
    if (provider !== 'google_cloud') {
      content = content.replace(/<[^>]+>/g, '');
    }

    // Normalize quotation marks for TTS
    content = content.replace(/[""]/g, '"');
    content = content.replace(/['']/g, "'");

    // Clean up multiple spaces and normalize whitespace (preserve SSML tags)
    if (provider === 'google_cloud') {
      // For Google Cloud, be careful not to break SSML tags
      content = content.replace(/(?<![<>])\s+(?![<>])/g, ' ').trim();
    } else {
      content = content.replace(/\s+/g, ' ').trim();
    }

    // Clean up orphaned punctuation from removals
    content = content.replace(/\s+([,.])/g, '$1');
    content = content.replace(/([,.])\s*\1+/g, '$1'); // Remove duplicate punctuation
    content = content.replace(/^\s*[,.]\s*/g, ''); // Remove leading punctuation

    return content;
  }

  /**
   * Build voice assignments for export
   */
  private buildVoiceAssignments(
    session: ConversationSession,
    participants: ConversationParticipant[]
  ): VoiceAssignment[] {
    const assignments: VoiceAssignment[] = [];

    // Add host assignment
    assignments.push({
      speakerName: session.hostDisplayName || 'Host',
      speakerRole: 'host',
      personaSlug: null,
      voiceSettings: {
        // Default host voice characteristics
        pitch: 'medium',
        pace: 'steady',
        warmth: 'high',
        energy: 'engaging',
      },
    });

    // Add guest assignments
    for (const p of participants) {
      const persona = p.persona;
      assignments.push({
        speakerName: p.displayNameOverride || persona?.name || 'Guest',
        speakerRole: 'guest',
        personaSlug: persona?.slug || null,
        personaId: p.personaId,
        participantId: p.id,
        voiceSettings: persona?.voiceCharacteristics || {},
      });
    }

    return assignments;
  }

  /**
   * Generate a clean title from the topic
   */
  private generateTitle(topic: string): string {
    // Remove common prefixes
    let title = topic
      .replace(/^(Should|Do|Does|Is|Are|Can|Will|Would)\s+/i, '')
      .replace(/\?$/, '');

    // Truncate if too long
    if (title.length > 100) {
      title = title.substring(0, 97) + '...';
    }

    // Capitalize first letter
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  /**
   * Get segments for a specific speaker
   */
  getSegmentsBySpeaker(script: RefinedConversationScript, speakerName: string): RefinedSegment[] {
    return script.segments.filter(s => s.speakerName === speakerName);
  }

  /**
   * Get key point segments only
   */
  getKeyPointSegments(script: RefinedConversationScript): RefinedSegment[] {
    return script.segments.filter(s => s.isKeyPoint);
  }

  /**
   * Split script into chunks for parallel TTS processing
   */
  splitForParallelProcessing(
    script: RefinedConversationScript,
    maxSegmentsPerChunk: number = 10
  ): RefinedSegment[][] {
    const chunks: RefinedSegment[][] = [];

    for (let i = 0; i < script.segments.length; i += maxSegmentsPerChunk) {
      chunks.push(script.segments.slice(i, i + maxSegmentsPerChunk));
    }

    return chunks;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new ConversationScriptRefiner instance
 */
export function createConversationScriptRefiner(pool: Pool): ConversationScriptRefiner {
  return new ConversationScriptRefiner(pool);
}

export default ConversationScriptRefiner;
