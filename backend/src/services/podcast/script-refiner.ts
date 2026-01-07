import { OpenRouterLLMClient } from '../llm/openrouter-adapter.js';
import {
    RefinedPodcastScript,
    PodcastSegment,
    PodcastExportConfig,
    ElevenLabsVoiceSettings,
    ElevenLabsModel,
    DEFAULT_VOICE_ASSIGNMENTS,
    TTSProviderType,
} from '../../types/podcast-export.js';
import { DebateTranscript } from '../transcript/transcript-recorder.js';
import type { DebateTone } from '../../types/duelogic.js';
import { getProviderRefinementGuidance } from './audio-tag-converter.js';

const MAX_SEGMENT_CHARS = 4500; // Leave buffer under 5000 limit
const WORDS_PER_MINUTE = 150;   // Average speaking rate

// ============================================================================
// ElevenLabs V3 Audio Tags and Tone-Aware Phrase Selection
// ============================================================================

/**
 * Phrase intensity levels mapped from debate tones
 */
type PhraseIntensity = 'polite' | 'moderate' | 'aggressive';

/**
 * Interruption phrases categorized by intensity - ElevenLabs V3 version
 * Uses only officially documented ElevenLabs V3 audio tags:
 * [pause], [loudly], [sigh], [stammers], [whispers], [deadpan], [flatly]
 */
const INTERRUPTION_PHRASES_ELEVENLABS: Record<PhraseIntensity, string[]> = {
    polite: [
        '[pause] If I may — ',
        '[pause] May I interject — ',
        'Just a moment — ',
        'I\'d like to add — ',
        'If I could just say — ',
        '[pause] Before we continue — ',
        'One moment, please — ',
    ],
    moderate: [
        'Hold on — ',
        'Wait — ',
        'Actually — ',
        'But — ',
        'I have to stop you there — ',
        'Let me jump in — ',
        '[pause] Hang on — ',
        'Sorry, but — ',
    ],
    aggressive: [
        '[loudly] No, no, no — ',
        'That\'s simply not true — ',
        'Absolutely not — ',
        '[sigh] This is exactly the problem — ',
        'I can\'t let that stand — ',
        '[loudly] Hold on a second — ',
        '[loudly] That completely misses the point — ',
    ],
};

/**
 * Interruption phrases categorized by intensity - Gemini version
 * Uses natural text without V3 tags
 */
const INTERRUPTION_PHRASES_GEMINI: Record<PhraseIntensity, string[]> = {
    polite: [
        '... If I may — ',
        '... May I interject — ',
        'Just a moment — ',
        'I\'d like to add — ',
        'If I could just say — ',
        '... Before we continue — ',
        'One moment, please — ',
    ],
    moderate: [
        'Hold on — ',
        'Wait — ',
        'Actually — ',
        'But — ',
        'I have to stop you there — ',
        'Let me jump in — ',
        '... Hang on — ',
        'Sorry, but — ',
    ],
    aggressive: [
        'No, no, no — ',
        'That\'s simply not true — ',
        'Absolutely not — ',
        '*sigh* This is exactly the problem — ',
        'I can\'t let that stand — ',
        'Hold on a second — ',
        'That completely misses the point — ',
    ],
};

/**
 * Response phrases for acknowledging interruptions - ElevenLabs V3 version
 * Uses only officially documented ElevenLabs V3 audio tags
 */
const RESPONSE_PHRASES_ELEVENLABS: Record<PhraseIntensity, string[]> = {
    polite: [
        'Fair point, but ',
        'I understand, but ',
        'That\'s a reasonable concern, however ',
        '[pause] I hear you, and ',
        'Granted, but ',
        'I appreciate that, but ',
        'Point taken, however ',
    ],
    moderate: [
        '[sigh] Okay, but ',
        'Sure, but here\'s the thing — ',
        'I see what you mean, but ',
        'That\'s true, however ',
        'Right, but consider this — ',
        '[pause] Yes, and — ',
        'I hear you, but ',
    ],
    aggressive: [
        '[sigh] That completely misses my point — ',
        '[sigh] We keep going in circles here — ',
        '[flatly] Look, the evidence is clear — ',
        '[loudly] This is exactly what I\'m talking about — ',
        '[deadpan] I\'ve addressed this three times already — ',
        '[sigh] No, that\'s not what I said — ',
        '[sigh] Once again — ',
    ],
};

/**
 * Response phrases for acknowledging interruptions - Gemini version
 * Uses natural text without V3 tags
 */
const RESPONSE_PHRASES_GEMINI: Record<PhraseIntensity, string[]> = {
    polite: [
        'Fair point, but ',
        'I understand, but ',
        'That\'s a reasonable concern, however ',
        '... I hear you, and ',
        'Granted, but ',
        'I appreciate that, but ',
        'Point taken, however ',
    ],
    moderate: [
        '*sigh* Okay, but ',
        'Sure, but here\'s the thing — ',
        'I see what you mean, but ',
        'That\'s true, however ',
        'Right, but consider this — ',
        '... Yes, and — ',
        'I hear you, but ',
    ],
    aggressive: [
        '*sigh* That completely misses my point — ',
        '*sigh* We keep going in circles here — ',
        'Look, the evidence is clear — ',
        'This is exactly what I\'m talking about — ',
        'I\'ve addressed this three times already — ',
        '*sigh* No, that\'s not what I said — ',
        '*sigh* Once again — ',
    ],
};

/**
 * Map debate tones to phrase intensity
 */
const TONE_TO_INTENSITY: Record<DebateTone, PhraseIntensity> = {
    respectful: 'polite',
    spirited: 'moderate',
    heated: 'aggressive',
};

/**
 * Voice settings adjustments per debate tone
 * Lower stability = more expressive/responsive to V3 audio tags
 */
const TONE_VOICE_ADJUSTMENTS: Record<DebateTone, Partial<ElevenLabsVoiceSettings>> = {
    respectful: {
        stability: 0.5,    // More stable for measured discourse
        style: 0.4,        // Less dramatic
    },
    spirited: {
        stability: 0.35,   // Default V3 expressiveness
        style: 0.6,        // Punchy delivery
    },
    heated: {
        stability: 0.25,   // Maximum expressiveness
        style: 0.75,       // Dramatic emphasis
    },
};

export interface TurnData {
    speaker: string;
    content: string;
}

export interface PhaseData {
    phaseName: string;
    turns: TurnData[];
}

interface RefinementPrompt {
    systemPrompt: string;
    userPrompt: string;
}

export class PodcastScriptRefiner {
    private llmClient: OpenRouterLLMClient;
    private config: PodcastExportConfig;
    private elevenLabsModel: ElevenLabsModel;
    private tone: DebateTone;
    private ttsProvider: TTSProviderType;

    constructor(llmClient: OpenRouterLLMClient, config: PodcastExportConfig) {
        this.llmClient = llmClient;
        this.config = config;
        this.elevenLabsModel = config.elevenLabsModel || 'eleven_v3';
        this.tone = config.tone || 'spirited';  // Default to spirited
        this.ttsProvider = config.ttsProvider || 'elevenlabs';  // Default to ElevenLabs
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

        // Group utterances by phase
        const rawPhases = this.groupUtterancesByPhase(transcript);

        // Merge consecutive same-speaker turns for natural podcast flow
        const phases = this.mergeConsecutiveTurns(rawPhases);

        // Process each phase of the debate
        for (const phase of phases) {
            const phaseSegments = await this.refinePhase(phase, transcript.proposition.normalized_question);
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
            title: this.generateTitle(transcript.proposition.normalized_question),
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
     * Group transcript utterances into phases
     */
    private groupUtterancesByPhase(transcript: DebateTranscript): PhaseData[] {
        const phases: PhaseData[] = [];
        let currentPhase: PhaseData | null = null;

        for (const utterance of transcript.transcript) {
            const phaseName = this.formatPhaseName(utterance.phase);

            if (!currentPhase || currentPhase.phaseName !== phaseName) {
                currentPhase = {
                    phaseName,
                    turns: [],
                };
                phases.push(currentPhase);
            }

            currentPhase.turns.push({
                speaker: utterance.speaker,
                content: utterance.content,
            });
        }

        return phases;
    }

    /**
     * Format schema phase name to human readable
     */
    private formatPhaseName(phase: string): string {
        const phaseMap: Record<string, string> = {
            // Formal debate phases
            phase_1_opening: 'Opening Statements',
            phase_2_constructive: 'Evidence Presentation',
            phase_3_crossexam: 'Clarifying Questions',
            phase_4_rebuttal: 'Rebuttals',
            phase_5_closing: 'Closing Statements',
            phase_6_synthesis: 'Moderator Synthesis',
            // Duelogic segments
            introduction: 'Introduction',
            opening: 'Opening',
            exchange: 'Exchange',
            synthesis: 'Synthesis',
            // Informal discussion
            informal_discussion: 'Informal Discussion',
            informal_wrapup: 'Wrap-up',
        };

        return phaseMap[phase] || phase.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }

    /**
     * Generate podcast intro segment
     */
    private async generateIntro(transcript: DebateTranscript): Promise<PodcastSegment> {
        const prompt = this.buildIntroPrompt(transcript);

        const response = await this.llmClient.complete({
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
        // Clean interruption markers before sending to LLM
        const cleanedContent = this.cleanInterruptionMarkers(content);

        const prompt = this.buildRefinementPrompt(cleanedContent, speaker, proposition);

        const response = await this.llmClient.complete({
            messages: [
                { role: 'system', content: prompt.systemPrompt },
                { role: 'user', content: prompt.userPrompt }
            ],
            temperature: 0.4, // Lower temp for more faithful transformation
            maxTokens: 2000,
        });

        // Apply model-specific pause syntax conversion
        const refinedText = this.cleanText(response.content);
        return this.convertPauseSyntax(refinedText);
    }

    /**
     * Build the refinement prompt for polishing debate content
     * Provider-aware: ElevenLabs uses V3 tags, Gemini uses natural text
     */
    private buildRefinementPrompt(
        content: string,
        speaker: string,
        proposition: string
    ): RefinementPrompt {
        const toneGuidance = this.getToneGuidance();
        const providerGuidance = getProviderRefinementGuidance(this.ttsProvider);
        const providerName = this.ttsProvider === 'elevenlabs' ? 'ElevenLabs V3' : 'Gemini';

        return {
            systemPrompt: `You are a podcast script editor optimizing debate content for ${providerName} text-to-speech.

Transform the debate transcript into expressive, natural spoken dialogue.

${providerGuidance}

## Debate Tone: ${this.tone.toUpperCase()}
${toneGuidance}

## Guidelines:
- Remove ALL markdown formatting (**, *, #, bullets, numbered lists)
- Convert structured arguments into flowing conversational prose
- Expand abbreviations naturally (AI → "A.I.", US → "the United States")
- Use contractions where natural (it's, we're, that's)
- Break long sentences into natural phrases with appropriate pauses
- Remove citations and footnote markers
- Keep intellectual content intact - don't change arguments
- Use CAPITALIZATION sparingly for emphasized words
- Ellipses ... for trailing off or building tension

Output ONLY the refined spoken text. No explanations.`,

            userPrompt: `Speaker: ${speaker}
Topic: ${proposition}

Original text to refine:
${content}

Refined spoken version:`,
        };
    }

    /**
     * Get tone-specific guidance for the refinement prompt
     * Provider-aware: ElevenLabs uses V3 tags, Gemini uses natural text
     */
    private getToneGuidance(): string {
        if (this.ttsProvider === 'gemini') {
            // Gemini guidance - no V3 tags, use natural text
            const geminiGuidance: Record<DebateTone, string> = {
                respectful: `Maintain professional, measured delivery. Use ellipsis (...) for thoughtful pauses.
Write with genuine curiosity when engaging with the other side.
Prefer diplomatic language: "I would suggest..." over "That's wrong..."
Keep a collegial, academic atmosphere.`,

                spirited: `Deliver with energy and conviction. Vary sentence length for natural pacing.
Write *sigh* for moments of concession or frustration.
Write *laughs* for irony or disbelief.
Be direct: "Here's the problem with that..." with emphasis.
Balance passion with respect.`,

                heated: `Maximum intensity and passion. Use expressive punctuation and natural pauses.
Write *sigh* or *sighs* for frustration.
Use strong, assertive language.
Emphasize disagreements: "That is EXACTLY backwards."
Write *laughs dryly* for dry, cutting remarks.
Include natural reactions like *gasps* for authentic moments.
Don't hold back - this is a passionate debate.`,
            };
            return geminiGuidance[this.tone];
        }

        // ElevenLabs guidance with V3 tags
        const elevenLabsGuidance: Record<DebateTone, string> = {
            respectful: `Maintain professional, measured delivery. Use [pause] for thoughtful beats.
Use [curious] when genuinely engaging with the other side.
Avoid aggressive tags like [loudly] or [shouts].
Prefer diplomatic language: "I would suggest..." over "That's wrong..."
Keep a collegial, academic atmosphere.`,

            spirited: `Deliver with energy and conviction. Use varied pacing tags.
Add [sigh] for moments of concession or frustration.
Use [laughs] for irony or disbelief.
Be direct: "Here's the problem with that..." with emphasis.
Balance passion with respect.`,

            heated: `Maximum intensity and passion. Use emotional tags frequently.
Use [sigh], [loudly], [shouts] liberally.
Add [sarcastic] for pointed rejoinders.
Emphasize disagreements: "That is EXACTLY backwards."
Use [deadpan] or [flatly] for dry, cutting remarks.
Include [gasps] and [stammers] for authentic reactions.
Don't hold back - this is a passionate debate.`,
        };

        return elevenLabsGuidance[this.tone];
    }

    /**
     * Build prompt for generating podcast intro
     */
    private buildIntroPrompt(transcript: DebateTranscript): RefinementPrompt {
        return {
            systemPrompt: `You are a podcast intro writer for "Duelogic" - an AI debate podcast where models tackle humanity's toughest questions. Create welcoming, engaging introductions.

Guidelines:
- Keep it under 100 words
- Welcome listeners to "Duelogic" (the podcast name)
- Introduce the topic clearly
- Mention that AI models will debate this topic with nobody walking away with easy answers
- Set expectations for what they'll hear
- Sound professional but approachable
- NO markdown formatting

Output ONLY the intro text.`,

            userPrompt: `Create a Duelogic podcast intro for a debate on this topic:

"${transcript.proposition.normalized_question}"

The debate has ${transcript.transcript.length} utterances and features AI advocates on both sides with a moderator.`,
        };
    }

    /**
     * Build prompt for generating podcast outro
     */
    private buildOutroPrompt(transcript: DebateTranscript): RefinementPrompt {
        return {
            systemPrompt: `You are a podcast outro writer for "Duelogic" - an AI debate podcast. Create brief, thoughtful closings.

Guidelines:
- Keep it under 60 words
- Thank listeners for joining this episode of Duelogic
- Encourage reflection on both perspectives
- Remind them the goal is understanding, not persuasion - nobody walks away with easy answers
- Sound warm and genuine
- NO markdown formatting

Output ONLY the outro text.`,

            userPrompt: `Create a Duelogic podcast outro for a debate on:

"${transcript.proposition.normalized_question}"`,
        };
    }

    /**
     * Generate a natural transition phrase for a debate phase
     * Supports formal debate, Duelogic, and informal discussion modes
     */
    private generatePhaseTransition(phaseName: string): string | null {
        const transitions: Record<string, string> = {
            // Formal debate phases
            'Opening Statements': '[pause] Let us begin with opening statements from each side.',
            'Evidence Presentation': '[pause] Moving now to evidence presentation.',
            'Clarifying Questions': '[pause] We now enter clarifying questions, where each side may challenge the other.',
            'Rebuttals': '[pause] Time for rebuttals.',
            'Closing Statements': '[pause] We conclude with closing statements.',
            'Moderator Synthesis': '[pause] Finally, our moderator offers a balanced synthesis of the debate.',

            // Duelogic segment types
            'Introduction': '[dramatic tone] Welcome to Duelogic. [pause] Let me set the stage for today\'s philosophical exploration.',
            'Opening': '[pause] Each of our chairs will now present their opening perspective.',
            'Exchange': '[pause] We now move into open discussion.',
            'Synthesis': '[pause] [serious tone] Let us now bring together the threads of this debate.',

            // Informal discussion
            'Informal Discussion': '[pause] And so the conversation begins...',
            'Wrap-up': '[pause] As we bring this discussion to a close...',
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

        // 1. First attempt: split by sentences
        const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
        let currentSegment = '';

        for (const sentence of sentences) {
            // If even a single sentence is too long, we need a fallback for it
            if (sentence.length > MAX_SEGMENT_CHARS) {
                // Flush current segment first
                if (currentSegment) {
                    segments.push({
                        index: segments.length,
                        speaker,
                        voiceId: this.getVoiceId(speaker),
                        text: currentSegment.trim(),
                        voiceSettings: this.getVoiceSettings(speaker),
                    });
                    currentSegment = '';
                }

                // Split the long sentence by words or chars
                const sentenceChunks = this.splitByLength(sentence, MAX_SEGMENT_CHARS);
                for (const chunk of sentenceChunks) {
                    segments.push({
                        index: segments.length,
                        speaker,
                        voiceId: this.getVoiceId(speaker),
                        text: chunk.trim(),
                        voiceSettings: this.getVoiceSettings(speaker),
                    });
                }
            } else if ((currentSegment + sentence).length > MAX_SEGMENT_CHARS) {
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
     * Fallback to split text by length (roughly by words) when sentence split fails
     */
    private splitByLength(text: string, maxLength: number): string[] {
        const chunks: string[] = [];
        const words = text.split(/\s+/);
        let currentChunk = '';

        for (const word of words) {
            if ((currentChunk + ' ' + word).length > maxLength) {
                if (currentChunk) {
                    chunks.push(currentChunk);
                    currentChunk = word;
                } else {
                    // Single word is too long (rare), split by chars
                    chunks.push(word.substring(0, maxLength));
                    currentChunk = word.substring(maxLength);
                }
            } else {
                currentChunk = currentChunk ? currentChunk + ' ' + word : word;
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    /**
     * Add previousText and nextText context for natural TTS flow
     */
    private addContextFields(
        segments: PodcastSegment[],
        intro?: PodcastSegment,
        outro?: PodcastSegment
    ): void {
        const allSegments = [intro, ...segments, outro].filter((s): s is PodcastSegment => !!s);

        for (let i = 0; i < allSegments.length; i++) {
            const current = allSegments[i];
            if (!current) continue;

            // Get last 200 chars of previous segment
            if (i > 0) {
                const prev = allSegments[i - 1];
                if (prev) {
                    current.previousText = prev.text.slice(-200);
                }
            }

            // Get first 200 chars of next segment
            if (i < allSegments.length - 1) {
                const next = allSegments[i + 1];
                if (next) {
                    current.nextText = next.text.slice(0, 200);
                }
            }

            // Renumber indexes
            current.index = i;
        }
    }

    /**
     * Map debate speaker to voice assignment role
     * Handles formal, informal, and Duelogic debate mode speakers
     */
    private mapSpeakerRole(speaker: string): string {
        const mapping: Record<string, string> = {
            // Formal debate mode
            'pro': 'pro_advocate',
            'pro_advocate': 'pro_advocate',
            'con': 'con_advocate',
            'con_advocate': 'con_advocate',
            'moderator': 'moderator',

            // Duelogic mode - arbiter and chairs
            'arbiter': 'moderator',
            'chair_1': 'pro_advocate',   // Uses Adam voice
            'chair_2': 'con_advocate',   // Uses Sam voice
            'chair_3': 'chair_3',        // Uses Josh voice
            'chair_4': 'chair_4',        // Uses Arnold voice
            'chair_5': 'chair_5',        // Uses Charlie voice
            'chair_6': 'chair_6',        // Uses Daniel voice

            // Informal discussion participants
            'participant_1': 'participant_1',  // Uses Adam voice
            'participant_2': 'participant_2',  // Uses Sam voice
            'participant_3': 'participant_3',  // Uses Josh voice
            'participant_4': 'participant_4',  // Uses Arnold voice

            // Narrator for intro/outro
            'narrator': 'narrator',
        };

        return mapping[speaker] || 'narrator';
    }

    /**
     * Get ElevenLabs voice ID for a speaker role
     */
    private getVoiceId(speakerRole: string): string {
        const assignment = this.config.voiceAssignments[speakerRole]
            || DEFAULT_VOICE_ASSIGNMENTS[speakerRole]
            || DEFAULT_VOICE_ASSIGNMENTS['narrator'];

        return assignment!.voiceId;
    }

    /**
     * Get voice settings for a speaker role, adjusted for debate tone
     * Lower stability = more expressive/responsive to V3 audio tags
     */
    private getVoiceSettings(speakerRole: string): ElevenLabsVoiceSettings {
        const assignment = this.config.voiceAssignments[speakerRole]
            || DEFAULT_VOICE_ASSIGNMENTS[speakerRole]
            || DEFAULT_VOICE_ASSIGNMENTS['narrator'];

        const baseSettings = assignment!.settings;
        const toneAdjustments = TONE_VOICE_ADJUSTMENTS[this.tone];

        // Apply tone adjustments, keeping other settings from base
        return {
            ...baseSettings,
            stability: toneAdjustments.stability ?? baseSettings.stability,
            style: toneAdjustments.style ?? baseSettings.style,
        };
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

    /**
     * Clean interruption markers and convert to natural speech
     * Transforms lively debate markers into natural spoken phrases
     * Provider-aware: uses V3 audio tags for ElevenLabs, natural text for Gemini
     */
    private cleanInterruptionMarkers(content: string): string {
        // Get phrases based on debate tone intensity and TTS provider
        const intensity = TONE_TO_INTENSITY[this.tone];
        const interruptionPhrases = this.ttsProvider === 'gemini'
            ? INTERRUPTION_PHRASES_GEMINI[intensity]
            : INTERRUPTION_PHRASES_ELEVENLABS[intensity];
        const responsePhrases = this.ttsProvider === 'gemini'
            ? RESPONSE_PHRASES_GEMINI[intensity]
            : RESPONSE_PHRASES_ELEVENLABS[intensity];

        const getRandomPhrase = (phrases: string[]): string => {
            return phrases[Math.floor(Math.random() * phrases.length)] ?? phrases[0]!;
        };

        return content
            // Convert [INTERRUPTION: ...] markers to natural phrases
            // The text inside the marker is a structural placeholder - discard it entirely
            // and replace with varied natural phrases appropriate for the debate tone
            .replace(/\[INTERRUPTION:\s*[^\]]*?\.{3}\]/gi, () =>
                getRandomPhrase(interruptionPhrases)
            )
            .replace(/\[INTERRUPTION:\s*[^\]]*\]/gi, () =>
                getRandomPhrase(interruptionPhrases)
            )
            // Convert [RESPONDING TO INTERRUPTION] to natural transition
            .replace(/\[RESPONDING TO INTERRUPTION\]\s*/gi, () =>
                getRandomPhrase(responsePhrases)
            )
            // Clean any remaining empty brackets
            .replace(/\[\s*\]/g, '')
            .trim();
    }

    /**
     * Merge consecutive same-speaker turns for natural podcast flow
     * Prevents awkward back-to-back segments from the same voice
     * Provider-aware: uses [pause] for ElevenLabs, ellipsis for Gemini
     */
    private mergeConsecutiveTurns(phases: PhaseData[]): PhaseData[] {
        // Use provider-appropriate pause marker
        const pauseMarker = this.ttsProvider === 'gemini' ? ' ... ' : ' [pause] ';

        return phases.map(phase => ({
            ...phase,
            turns: phase.turns.reduce((merged, turn) => {
                const last = merged[merged.length - 1];
                if (last && last.speaker === turn.speaker) {
                    // Merge: add pause between content
                    last.content += pauseMarker + turn.content;
                } else {
                    merged.push({ ...turn });
                }
                return merged;
            }, [] as TurnData[])
        }));
    }

    /**
     * Convert pause syntax based on TTS provider and model
     * ElevenLabs V3 uses [pause], Gemini uses ellipsis
     */
    private convertPauseSyntax(text: string): string {
        // Gemini: Convert all pauses to ellipsis (natural pause in speech)
        if (this.ttsProvider === 'gemini') {
            return text
                .replace(/\[long pause\]/gi, '... ...')
                .replace(/\[pause\]/gi, '...')
                .replace(/\[short pause\]/gi, '...')
                .replace(/\[hesitates\]/gi, '...')
                .replace(/<break[^>]*>/gi, '...');
        }

        // ElevenLabs V3: Normalize all pause variants to documented [pause] tag
        if (this.elevenLabsModel === 'eleven_v3') {
            return text
                .replace(/\[long pause\]/gi, '[pause] ... ')   // Long pause = pause + ellipsis
                .replace(/\[short pause\]/gi, '[pause]')       // Short pause = pause
                .replace(/<break[^>]*>/gi, '[pause]')          // Remove any SSML breaks
                .replace(/\[hesitates\]/gi, '[stammers]');     // Use documented tag
        }

        // Other ElevenLabs models need SSML break tags
        return text
            .replace(/\[long pause\]/gi, '<break time="3s"/>')
            .replace(/\[pause\]/gi, '<break time="2s"/>')
            .replace(/\[short pause\]/gi, '<break time="0.5s"/>')
            .replace(/\[sigh\]/gi, '<break time="0.5s"/>')
            .replace(/\[laughs?\]/gi, '<break time="0.3s"/>')
            .replace(/\[exhales?\]/gi, '<break time="0.3s"/>');
    }

    /**
     * Get the TTS provider being used
     */
    getTtsProvider(): TTSProviderType {
        return this.ttsProvider;
    }
}
