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
   * Convert ElevenLabs V3 tags to Gemini-compatible text
   *
   * Gemini doesn't support inline emotion tags - it uses voice selection
   * and natural text pacing instead.
   */
  private convertForGemini(text: string): string {
    let result = text;

    // Convert [pause] to ellipsis (natural pause in speech)
    result = result.replace(/\[pause\]/gi, '...');

    // Convert [long pause] to longer ellipsis
    result = result.replace(/\[long pause\]/gi, '... ...');

    // Convert [short pause] to single ellipsis
    result = result.replace(/\[short pause\]/gi, '...');

    // Convert reaction sounds to text descriptions (Gemini reads these naturally)
    result = result.replace(/\[sigh\]/gi, '*sigh*');
    result = result.replace(/\[sighing\]/gi, '*sighing*');
    result = result.replace(/\[laughs\]/gi, '*laughs*');
    result = result.replace(/\[gasps\]/gi, '*gasps*');
    result = result.replace(/\[clears throat\]/gi, '*clears throat*');
    result = result.replace(/\[stammers\]/gi, '');  // Just remove, natural hesitation from text
    result = result.replace(/\[hesitates\]/gi, '...');

    // Remove delivery style tags (Gemini handles via voice)
    result = result.replace(/\[whispers\]/gi, '');
    result = result.replace(/\[loudly\]/gi, '');
    result = result.replace(/\[shouts\]/gi, '');
    result = result.replace(/\[deadpan\]/gi, '');
    result = result.replace(/\[playfully\]/gi, '');
    result = result.replace(/\[flatly\]/gi, '');
    result = result.replace(/\[timidly\]/gi, '');

    // Remove emotional tags (Gemini handles via voice selection)
    result = result.replace(/\[excited\]/gi, '');
    result = result.replace(/\[curious\]/gi, '');
    result = result.replace(/\[sarcastic\]/gi, '');
    result = result.replace(/\[mischievously\]/gi, '');
    result = result.replace(/\[cheerfully\]/gi, '');

    // Remove pacing tags (except pauses handled above)
    result = result.replace(/\[rushed\]/gi, '');
    result = result.replace(/\[slows down\]/gi, '');
    result = result.replace(/\[drawn out\]/gi, '');

    // Remove descriptive tone tags
    result = result.replace(/\[dramatic tone\]/gi, '');
    result = result.replace(/\[serious tone\]/gi, '');

    // Remove any other unrecognized bracket tags
    result = result.replace(/\[[\w\s]+\]/gi, '');

    // Remove any SSML break tags that might have slipped through
    result = result.replace(/<break[^>]*>/gi, '...');

    // Clean up multiple consecutive ellipses
    result = result.replace(/\.{4,}/g, '...');

    // Clean up multiple consecutive spaces
    result = result.replace(/\s{2,}/g, ' ');

    // Clean up ellipsis spacing
    result = result.replace(/\s*\.\.\.\s*/g, '... ');

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

  // Gemini guidance - focus on natural text
  return `## Audio Delivery Guidelines for Gemini TTS:
- Do NOT use any bracket tags like [pause], [sigh], [loudly], etc.
- Use ellipsis (...) for natural pauses and trailing off
- Use *asterisks* for actions like *sigh* or *laughs* (will be read naturally)
- Write in a natural, conversational style
- Gemini TTS selects tone from the voice itself, not inline tags
- Focus on clear, expressive text without markup`;
}
