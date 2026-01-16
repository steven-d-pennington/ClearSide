/**
 * Conversation Script Refiner
 *
 * Prepares conversation transcripts for TTS export without converting to debate format.
 * Preserves the natural talk show format with host introductions, questions, and organic discussion flow.
 *
 * Enhanced for Gemini TTS with:
 * - Proper bracket tag syntax ([sigh], [laughing], [excited], etc.)
 * - Persona-based Director's Notes generation
 * - Context-aware emotion detection
 *
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 */

import pino from 'pino';
import type { Pool } from 'pg';
import { ConversationSessionRepository } from '../../db/repositories/conversation-session-repository.js';
import { ConversationParticipantRepository } from '../../db/repositories/conversation-participant-repository.js';
import { ConversationUtteranceRepository } from '../../db/repositories/conversation-utterance-repository.js';
import { OpenRouterLLMClient } from '../llm/openrouter-adapter.js';
import type {
  ConversationSession,
  ConversationParticipant,
  ConversationUtterance,
  VoiceCharacteristics,
  PodcastPersona,
} from '../../types/conversation.js';
import type {
  GeminiDirectorNotes,
  GeminiSpeakerDirection,
} from '../../types/podcast-export.js';

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
  voiceName?: string;
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
  /** Gemini TTS director's notes for voice performance guidance */
  geminiDirectorNotes?: GeminiDirectorNotes;
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
  private llmClient: OpenRouterLLMClient | null = null;

  constructor(pool: Pool, llmClient?: OpenRouterLLMClient) {
    this.sessionRepo = new ConversationSessionRepository(pool);
    this.participantRepo = new ConversationParticipantRepository(pool);
    this.utteranceRepo = new ConversationUtteranceRepository(pool);
    this.llmClient = llmClient || null;
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

    // Build voice assignments with persona default voices
    const voiceAssignments = this.buildVoiceAssignments(session, participants, provider);

    // Calculate totals
    const totalWords = segments.reduce((sum, s) => sum + s.content.split(/\s+/).length, 0);
    const estimatedDurationMinutes = Math.ceil(totalWords / 150); // ~150 words per minute

    // Generate Gemini Director's Notes if using Gemini provider
    let geminiDirectorNotes: GeminiDirectorNotes | undefined;
    if (provider === 'gemini') {
      geminiDirectorNotes = this.generateGeminiDirectorNotes(
        session,
        participants,
        voiceAssignments
      );
      logger.debug({ sessionId, speakerCount: Object.keys(geminiDirectorNotes.speakerDirections).length },
        'Generated Gemini director\'s notes');
    }

    logger.info({
      sessionId,
      segmentCount: segments.length,
      totalWords,
      estimatedDurationMinutes,
      hasDirectorNotes: !!geminiDirectorNotes,
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
      geminiDirectorNotes,
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
   * Gemini TTS audio cues
   *
   * Uses the proper Gemini bracket tag syntax for:
   * - Emotions: [angry], [excited], [empathetic], [thoughtful], [sad]
   * - Micro-actions: [sigh], [laughing], [clears throat], [uhm], [hmm]
   * - Pauses: [short pause], [medium pause], [long pause]
   *
   * Also detects context to insert appropriate emotional tags.
   *
   * @see https://ai.google.dev/gemini-api/docs/speech-generation
   */
  private addGeminiCues(content: string): string {
    // === MICRO-ACTIONS ===
    // Convert written action words to proper Gemini bracket tags
    content = content.replace(/\b(sigh|sighs)\b/gi, '[sigh]');
    content = content.replace(/\b(laughs?|laughing)\b/gi, '[laughing]');
    content = content.replace(/\b(chuckles?|chuckling)\b/gi, '[laughing]');
    content = content.replace(/\b(clears?\s+throat)\b/gi, '[clears throat]');
    content = content.replace(/\b(coughs?|coughing)\b/gi, '[coughs]');
    content = content.replace(/\b(hmm+)\b/gi, '[hmm]');
    content = content.replace(/\b(uh+m+|um+)\b/gi, '[uhm]');
    content = content.replace(/\b(uh+)\b/gi, '[uh]');

    // === PAUSES ===
    // Add pauses for natural rhythm at key transition points
    // After questions (natural pause for reflection)
    content = content.replace(/\?(\s)(?!\[)/g, '? [short pause]$1');

    // Before transition words at sentence start
    content = content.replace(/\.\s+(But|However|Yet)\b/g, '. [medium pause] $1');
    content = content.replace(/\.\s+(Well|Now|So)\b/g, '. [short pause] $1');

    // Before concluding phrases
    content = content.replace(
      /\.\s+(In conclusion|To summarize|Ultimately|Finally)\b/g,
      '. [long pause] $1'
    );

    // Before direct addresses (podcast persona names)
    content = content.replace(
      /(,\s+)(Professor|Doctor|Dr\.|Mayor|Rabbi|Captain|Priya|Clara|Mike|Sarah|David|Zara|Luna|Marcus|Viktor|James|Yuki|Rosa)\b/g,
      ', [short pause] $2'
    );

    // === CONTEXT-AWARE EMOTION TAGS ===
    // Detect sentiment from content and add appropriate emotional coloring

    // Excited/enthusiastic content (strong positive language)
    if (/\b(amazing|incredible|fantastic|brilliant|wonderful|absolutely|definitely|exciting)\b/i.test(content)) {
      // Add excited tag to the start if heavy positive content
      const positiveCount = (content.match(/\b(amazing|incredible|fantastic|brilliant|wonderful|absolutely|definitely|exciting)\b/gi) || []).length;
      if (positiveCount >= 2 && !content.startsWith('[')) {
        content = '[excited] ' + content;
      }
    }

    // Thoughtful/contemplative content (hedging, uncertainty)
    if (/\b(perhaps|maybe|I wonder|consider|might|could be|it seems|I think)\b/i.test(content)) {
      const thoughtfulCount = (content.match(/\b(perhaps|maybe|I wonder|consider|might|could be|it seems)\b/gi) || []).length;
      if (thoughtfulCount >= 2 && !content.startsWith('[')) {
        content = '[thoughtful] ' + content;
      }
    }

    // Empathetic content (understanding, support)
    if (/\b(understand|I hear you|that makes sense|I can see|valid point|appreciate|fair point)\b/i.test(content)) {
      if (!content.startsWith('[')) {
        content = '[empathetic] ' + content;
      }
    }

    // Disagreement/pushback (but not angry - more assertive)
    if (/\b(disagree|don't think|not sure about|challenge|pushback|but actually|respectfully)\b/i.test(content)) {
      // Don't add angry - that's too strong. Let the natural language convey it.
    }

    // Sad/concerned content
    if (/\b(unfortunately|sadly|concern|worried|troubling|problematic|tragic|devastating)\b/i.test(content)) {
      if (!content.startsWith('[')) {
        content = '[sad] ' + content;
      }
    }

    // === FILLER WORDS (natural speech) ===
    // Add subtle filler variations for more natural delivery
    content = content.replace(/\b(you know)\b/gi, '[short pause] you know');
    content = content.replace(/\b(I mean)\b/gi, '[short pause] I mean');

    // Clean up any double pauses that might have been created
    content = content.replace(/\[short pause\]\s*\[short pause\]/g, '[short pause]');
    content = content.replace(/\[medium pause\]\s*\[short pause\]/g, '[medium pause]');
    content = content.replace(/\[long pause\]\s*\[short pause\]/g, '[long pause]');

    return content;
  }

  /**
   * Generate Gemini Director's Notes from persona voice characteristics
   *
   * Creates the structured prompt sections that guide Gemini TTS:
   * - AUDIO PROFILE: Character identity
   * - THE SCENE: Podcast context
   * - DIRECTOR'S NOTES: Performance guidance
   *
   * @see https://ai.google.dev/gemini-api/docs/speech-generation
   */
  private generateGeminiDirectorNotes(
    session: ConversationSession,
    participants: ConversationParticipant[],
    _voiceAssignments: VoiceAssignment[]
  ): GeminiDirectorNotes {
    // Build speaker directions from persona voice characteristics
    const speakerDirections: Record<string, GeminiSpeakerDirection> = {};

    // Host direction
    speakerDirections[session.hostDisplayName || 'Host'] = {
      speakerId: session.hostDisplayName || 'Host',
      characterProfile: 'Professional podcast host, warm and engaging, guides the conversation with curiosity',
      vocalStyle: 'Warm, inviting tone with measured pacing. Speaks clearly and engagingly.',
      performanceNotes: 'Maintain an interested, encouraging demeanor. Use natural inflection to highlight key questions. Be conversational but professional.',
    };

    // Guest directions from persona data
    for (const participant of participants) {
      const persona = participant.persona;
      if (!persona) continue;

      const speakerName = participant.displayNameOverride || persona.name;
      const voiceChars = persona.voiceCharacteristics || {};

      speakerDirections[speakerName] = {
        speakerId: speakerName,
        characterProfile: this.buildCharacterProfile(persona),
        vocalStyle: this.buildVocalStyle(voiceChars),
        performanceNotes: this.buildPerformanceNotes(persona, voiceChars),
      };
    }

    return {
      showContext: `This is "${this.generateTitle(session.topic)}" - a conversational podcast featuring diverse expert perspectives on "${session.topic}". The format is a relaxed talk show with a host guiding discussion between ${participants.length} guests.`,
      speakerDirections,
      sceneContext: 'A thoughtful, engaging podcast conversation. The atmosphere is intellectual but accessible - think NPR meets TED Talk. Guests share their genuine perspectives while remaining respectful of differing views.',
      pacingNotes: 'Maintain a conversational pace - not rushed, but energetic. Allow natural pauses for emphasis. Vary rhythm based on content: slower for complex ideas, slightly faster for enthusiastic points.',
    };
  }

  /**
   * Build character profile from persona data
   */
  private buildCharacterProfile(persona: PodcastPersona): string {
    const parts: string[] = [];

    parts.push(persona.name);

    // Add key aspect from backstory (first sentence or key phrase)
    if (persona.backstory) {
      const firstSentence = persona.backstory.split('.')[0];
      if (firstSentence && firstSentence.length < 150) {
        parts.push(firstSentence);
      }
    }

    // Add worldview hint
    if (persona.worldview) {
      const worldviewHint = persona.worldview.split('.')[0];
      if (worldviewHint && worldviewHint.length < 100) {
        parts.push(`Perspective: ${worldviewHint}`);
      }
    }

    return parts.join('. ');
  }

  /**
   * Build vocal style description from voice characteristics
   */
  private buildVocalStyle(voiceChars: VoiceCharacteristics): string {
    const descriptors: string[] = [];

    // Pitch
    const pitchMap: Record<string, string> = {
      'low': 'deep, resonant voice',
      'medium-low': 'warm, grounded voice',
      'medium': 'balanced, clear voice',
      'medium-high': 'bright, expressive voice',
      'high': 'light, energetic voice',
    };
    const pitch = voiceChars.pitch;
    if (pitch && pitchMap[pitch]) {
      descriptors.push(pitchMap[pitch]);
    }

    // Pace
    const paceMap: Record<string, string> = {
      'slow': 'speaks deliberately and thoughtfully',
      'measured': 'speaks with careful, measured pacing',
      'steady': 'speaks with consistent, comfortable pacing',
      'quick': 'speaks with energetic, quick pacing',
      'fast': 'speaks rapidly with enthusiasm',
      'variable': 'varies pace based on content - slower for emphasis, faster when excited',
    };
    const pace = voiceChars.pace;
    if (pace && paceMap[pace]) {
      descriptors.push(paceMap[pace]);
    }

    // Energy
    const energyMap: Record<string, string> = {
      'low': 'calm and reserved energy',
      'medium': 'moderate energy level',
      'high': 'high energy and animated',
      'bright': 'bright and upbeat energy',
      'engaging': 'warmly engaging energy',
      'fierce': 'intense, passionate energy',
    };
    const energy = voiceChars.energy;
    if (energy && energyMap[energy]) {
      descriptors.push(energyMap[energy]);
    }

    // Warmth
    const warmthMap: Record<string, string> = {
      'low': 'professional and objective tone',
      'medium': 'balanced warmth',
      'high': 'warm and approachable',
      'very high': 'very warm and personable',
    };
    const warmth = voiceChars.warmth;
    if (warmth && warmthMap[warmth]) {
      descriptors.push(warmthMap[warmth]);
    }

    // Tone
    if (voiceChars.tone) {
      descriptors.push(`${voiceChars.tone} tone`);
    }

    // Accent
    if (voiceChars.accent) {
      descriptors.push(`${voiceChars.accent} accent`);
    }

    return descriptors.length > 0
      ? descriptors.join(', ') + '.'
      : 'Clear, professional speaking voice.';
  }

  /**
   * Build performance notes from persona speaking style and quirks
   */
  private buildPerformanceNotes(persona: PodcastPersona, voiceChars: VoiceCharacteristics): string {
    const notes: string[] = [];

    // Speaking style
    if (persona.speakingStyle) {
      notes.push(persona.speakingStyle);
    }

    // Key quirks (limit to 2 for brevity)
    if (persona.quirks && persona.quirks.length > 0) {
      const topQuirks = persona.quirks.slice(0, 2);
      notes.push(`Character quirks: ${topQuirks.join('; ')}`);
    }

    // Example phrases guidance
    if (persona.examplePhrases && persona.examplePhrases.length > 0) {
      notes.push(`Tends to use phrases like: "${persona.examplePhrases[0]}"`);
    }

    // Add energy-specific guidance
    if (voiceChars.energy === 'fierce' || voiceChars.energy === 'high') {
      notes.push('Can build intensity when making key points.');
    }
    if (voiceChars.pace === 'variable') {
      notes.push('Naturally varies speaking speed based on emotional content.');
    }

    return notes.length > 0
      ? notes.join(' ')
      : 'Deliver lines naturally and authentically to the character.';
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
    // But NOT for ElevenLabs or Gemini which use bracket tags for emotional direction
    // ElevenLabs V3 uses tags like [sigh], [laughing], [excited]
    // Gemini TTS uses natural language bracket tags for voice direction
    if (provider !== 'elevenlabs' && provider !== 'gemini') {
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
   * Uses persona's default voice if it matches the requested provider
   */
  private buildVoiceAssignments(
    session: ConversationSession,
    participants: ConversationParticipant[],
    provider?: TTSProvider
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

    // Add guest assignments with persona default voices
    for (const p of participants) {
      const persona = p.persona;

      // Check if persona has a default voice for the current provider
      let voiceId: string | undefined;
      let voiceName: string | undefined;
      if (persona?.defaultVoiceId && persona?.defaultVoiceProvider) {
        // Map provider names for comparison
        // Frontend uses: 'gemini', 'google-cloud-long', 'elevenlabs'
        // Backend TTSProvider uses: 'gemini', 'google_cloud', 'elevenlabs'
        const providerMatches =
          persona.defaultVoiceProvider === provider ||
          (persona.defaultVoiceProvider === 'gemini' && provider === 'gemini') ||
          (persona.defaultVoiceProvider === 'google-cloud-long' && provider === 'google_cloud');

        if (providerMatches) {
          voiceId = persona.defaultVoiceId;
          // Use the voice ID as the name (Gemini voice IDs are descriptive names like "Sulafat", "Aoede")
          voiceName = persona.defaultVoiceId;
        }

        logger.debug({
          personaName: persona?.name,
          defaultVoiceId: persona.defaultVoiceId,
          defaultVoiceProvider: persona.defaultVoiceProvider,
          requestedProvider: provider,
          providerMatches,
          assignedVoiceId: voiceId,
        }, 'Voice assignment for persona');
      }

      assignments.push({
        speakerName: p.displayNameOverride || persona?.name || 'Guest',
        speakerRole: 'guest',
        personaSlug: persona?.slug || null,
        personaId: p.personaId,
        participantId: p.id,
        voiceId,
        voiceName,
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

  // ============================================================================
  // LLM-Enhanced Voice Direction
  // ============================================================================

  /**
   * Enhance segment content with emotional tags using LLM
   * This provides much better contextual understanding than rule-based injection
   */
  async enhanceWithEmotionalTags(content: string, speakerName: string): Promise<string> {
    if (!this.llmClient) {
      logger.debug('No LLM client available, skipping emotional tag enhancement');
      return content;
    }

    const systemPrompt = `You are a voice direction expert for Gemini TTS. Your job is to inject bracket tags into podcast dialogue to make the audio expressive and natural.

## AVAILABLE GEMINI TTS TAGS

Emotions (prefix - put at start of content when tone matches):
- [excited] - enthusiastic, passionate content
- [thoughtful] - contemplative, analytical content
- [empathetic] - understanding, supportive content
- [sad] - concerned, worried, somber content
- [soft] - gentle, quiet content
- [firm] - assertive, confident content

Micro-expressions (inject inline at natural points):
- [sigh] - before concessions, heavy topics, frustration
- [laughing] - for humor, irony, amusement
- [clears throat] - before important statements
- [coughs] - nervous cough, clearing airway
- [hmm] - thinking, considering
- [uhm] - brief hesitation
- [gasps] - surprise
- [chuckles] - light amusement, wry humor

Pauses (inject inline):
- [short pause] - after questions, before names
- [medium pause] - before "But", "However", pivots
- [long pause] - before conclusions, major transitions

## INJECTION RULES

1. START with emotion tag if content has clear emotional tone (but only ONE prefix tag)
2. Add [sigh] before "To be honest", "Unfortunately", concessions
3. Add [hmm] or [uhm] before "Well...", "I think...", hedging
4. Add [laughing] for genuinely humorous or ironic moments
5. Add [short pause] after rhetorical questions
6. Add [medium pause] before "But", "However", "On the other hand"
7. Add [long pause] before "In conclusion", "Finally", major transitions
8. DON'T over-tag - 2-4 tags per segment is usually enough
9. DON'T add tags that don't fit the content emotionally
10. Keep the original text intact - only add tags

## EXAMPLES

Input: "Well, I think that's a great point. But we should also consider the economic impact."
Output: "[thoughtful] [hmm] Well, I think that's a great point. [medium pause] But we should also consider the economic impact."

Input: "This is absolutely incredible! The data shows a 200% improvement in just six months."
Output: "[excited] This is absolutely incredible! The data shows a 200% improvement in just six months."

Input: "Unfortunately, we've seen these patterns before. The consequences were devastating."
Output: "[sad] [sigh] Unfortunately, we've seen these patterns before. [short pause] The consequences were devastating."

Input: "I hear what you're saying, and that's a valid concern. Let me address that directly."
Output: "[empathetic] I hear what you're saying, and that's a valid concern. [short pause] Let me address that directly."`;

    const userPrompt = `Enhance this dialogue from ${speakerName} with appropriate Gemini TTS bracket tags:

"${content}"

Return ONLY the enhanced text with tags injected. Do not add any explanation.`;

    try {
      const response = await this.llmClient.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        maxTokens: Math.max(500, content.length * 2),
      });

      // Clean up the response - remove any quotes the model might have added
      let enhanced = response.content.trim();
      if (enhanced.startsWith('"') && enhanced.endsWith('"')) {
        enhanced = enhanced.slice(1, -1);
      }

      logger.debug({
        speakerName,
        originalLength: content.length,
        enhancedLength: enhanced.length,
      }, 'Enhanced segment with emotional tags');

      return enhanced;
    } catch (error) {
      logger.error({ error, speakerName }, 'Failed to enhance segment with emotional tags');
      return content; // Fall back to original content
    }
  }

  /**
   * Refine with LLM enhancement for emotional tags
   * This is the premium path that uses LLM for better tag placement
   */
  async refineWithLLMEnhancement(
    sessionId: string,
    provider: TTSProvider = 'gemini'
  ): Promise<RefinedConversationScript> {
    // First do the standard refinement
    const script = await this.refine(sessionId, provider);

    // If no LLM client or not using Gemini, return as-is
    if (!this.llmClient || provider !== 'gemini') {
      return script;
    }

    logger.info({ sessionId, segmentCount: script.segments.length }, 'Enhancing segments with LLM emotional tags');

    // Enhance each segment with LLM
    const enhancedSegments: RefinedSegment[] = [];
    for (const segment of script.segments) {
      const enhancedContent = await this.enhanceWithEmotionalTags(
        segment.content,
        segment.speakerName
      );
      enhancedSegments.push({
        ...segment,
        content: enhancedContent,
      });
    }

    logger.info({ sessionId, enhancedCount: enhancedSegments.length }, 'LLM enhancement complete');

    return {
      ...script,
      segments: enhancedSegments,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new ConversationScriptRefiner instance
 * @param pool - Database connection pool
 * @param llmClient - Optional LLM client for enhanced emotional tag injection
 */
export function createConversationScriptRefiner(
  pool: Pool,
  llmClient?: OpenRouterLLMClient
): ConversationScriptRefiner {
  return new ConversationScriptRefiner(pool, llmClient);
}

export default ConversationScriptRefiner;
