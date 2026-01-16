/**
 * Audio Tag Converter
 *
 * Converts ElevenLabs V3 audio tags to provider-appropriate format.
 * ElevenLabs V3 supports rich emotion tags; Gemini uses natural text.
 */

import type { TTSProviderType } from '../../types/podcast-export.js';

/**
 * ElevenLabs V3 audio tags that need conversion/removal for other providers
 */
const ELEVENLABS_V3_TAGS = {
  // Emotional tags
  emotional: ['[excited]', '[curious]', '[sarcastic]', '[mischievously]', '[cheerfully]'],
  // Reaction tags
  reactions: ['[sigh]', '[sighing]', '[laughs]', '[gasps]', '[clears throat]', '[gulps]', '[breathes]'],
  // Delivery tags
  delivery: ['[whispers]', '[loudly]', '[shouts]', '[deadpan]', '[playfully]', '[flatly]', '[timidly]'],
  // Pacing tags
  pacing: ['[pause]', '[stammers]', '[rushed]', '[slows down]', '[drawn out]'],
  // Other descriptive tags
  other: ['[dramatic tone]', '[serious tone]', '[hesitates]'],
};

/**
 * All V3 tags as a flat list for regex building
 */
const ALL_V3_TAGS = [
  ...ELEVENLABS_V3_TAGS.emotional,
  ...ELEVENLABS_V3_TAGS.reactions,
  ...ELEVENLABS_V3_TAGS.delivery,
  ...ELEVENLABS_V3_TAGS.pacing,
  ...ELEVENLABS_V3_TAGS.other,
];

export class AudioTagConverter {
  private readonly provider: TTSProviderType;

  constructor(provider: TTSProviderType) {
    this.provider = provider;
  }

  /**
   * Convert text with audio tags to provider-appropriate format
   */
  convert(text: string): string {
    if (this.provider === 'elevenlabs') {
      // Keep V3 tags as-is for ElevenLabs
      return text;
    }

    // For Gemini: convert/strip V3 tags
    return this.convertForGemini(text);
  }

  /**
   * Convert ElevenLabs V3 tags to Gemini-compatible format
   *
   * Gemini 2.5 TTS supported bracket tags:
   * - Emotions (prefix): excited, thoughtful, empathetic, sad, soft, firm, angry, curious, nervous, confident
   * - Micro-expressions: sigh, laughing, laughs, clears throat, hmm, uhm, uh, gasps, coughs, chuckles, snickers
   * - Pauses: short pause, medium pause, long pause, pause
   * - Delivery: whispers, loudly, softly, slowly, quickly
   *
   * We preserve supported tags and convert/remove unsupported ones.
   * @see https://ai.google.dev/gemini-api/docs/speech-generation
   */
  private convertForGemini(text: string): string {
    let result = text;

    // Normalize some tag variations to Gemini's expected format
    result = result.replace(/\[sighing\]/gi, '[sigh]');
    result = result.replace(/\[coughing\]/gi, '[coughs]');
    result = result.replace(/\[chuckling\]/gi, '[chuckles]');

    // Convert ElevenLabs-specific tags that don't exist in Gemini
    result = result.replace(/\[stammers\]/gi, '[uhm]');
    result = result.replace(/\[hesitates\]/gi, '[short pause]');
    result = result.replace(/\[gulps\]/gi, '');
    result = result.replace(/\[breathes\]/gi, '');

    // Remove ElevenLabs-only style tags (Gemini handles via director's notes)
    result = result.replace(/\[deadpan\]/gi, '');
    result = result.replace(/\[playfully\]/gi, '');
    result = result.replace(/\[flatly\]/gi, '');
    result = result.replace(/\[timidly\]/gi, '');
    result = result.replace(/\[mischievously\]/gi, '');
    result = result.replace(/\[cheerfully\]/gi, '');
    result = result.replace(/\[sarcastic\]/gi, '');
    result = result.replace(/\[rushed\]/gi, '');
    result = result.replace(/\[slows down\]/gi, '[slowly]');
    result = result.replace(/\[drawn out\]/gi, '[slowly]');
    result = result.replace(/\[dramatic tone\]/gi, '');
    result = result.replace(/\[serious tone\]/gi, '[firm]');
    result = result.replace(/\[shouts\]/gi, '[loudly]');

    // Remove any SSML break tags that might have slipped through
    result = result.replace(/<break[^>]*>/gi, '[short pause]');

    // Clean up multiple consecutive spaces
    result = result.replace(/\s{2,}/g, ' ');

    // Clean up leading/trailing whitespace
    result = result.trim();

    return result;
  }

  /**
   * Check if text contains ElevenLabs V3-specific tags
   */
  hasV3Tags(text: string): boolean {
    const tagPattern = new RegExp(
      ALL_V3_TAGS.map(tag => tag.replace(/[[\]]/g, '\\$&')).join('|'),
      'gi'
    );
    return tagPattern.test(text);
  }

  /**
   * Get the target provider
   */
  getProvider(): TTSProviderType {
    return this.provider;
  }
}

/**
 * Provider-specific guidance for script refinement prompts
 */
export function getProviderRefinementGuidance(provider: TTSProviderType): string {
  if (provider === 'elevenlabs') {
    return `## V3 Audio Tags Available (use naturally where appropriate):
EMOTIONAL: [excited], [curious], [sarcastic], [mischievously], [cheerfully]
REACTIONS: [sigh], [sighing], [laughs], [gasps], [clears throat], [gulps], [breathes]
DELIVERY: [whispers], [loudly], [shouts], [deadpan], [playfully], [flatly], [timidly]
PACING: [pause], [stammers], [rushed], [slows down], [drawn out]
Note: Use [pause] for all pauses. Use ellipsis ... for longer pauses or trailing off.`;
  }

  // Gemini 2.5 TTS supports bracket tags for voice direction
  return `## Gemini TTS Bracket Tags Available:
EMOTIONS (prefix): [excited], [thoughtful], [empathetic], [sad], [soft], [firm], [angry], [curious], [nervous], [confident]
MICRO-ACTIONS (inline): [sigh], [laughing], [clears throat], [hmm], [uhm], [gasps], [coughs], [chuckles]
PAUSES (inline): [short pause], [medium pause], [long pause]
DELIVERY (inline): [whispers], [loudly], [softly], [slowly], [quickly]
Note: Bracket tags guide voice performance. Director's notes provide character context.`;
}
