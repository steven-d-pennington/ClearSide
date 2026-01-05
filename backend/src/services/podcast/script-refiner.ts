import { OpenRouterLLMClient } from '../llm/openrouter-adapter.js';
import {
    RefinedPodcastScript,
    PodcastSegment,
    PodcastExportConfig,
    ElevenLabsVoiceSettings,
    ElevenLabsModel,
    DEFAULT_VOICE_ASSIGNMENTS
} from '../../types/podcast-export.js';
import { DebateTranscript } from '../transcript/transcript-recorder.js';

const MAX_SEGMENT_CHARS = 4500; // Leave buffer under 5000 limit
const WORDS_PER_MINUTE = 150;   // Average speaking rate

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

    constructor(llmClient: OpenRouterLLMClient, config: PodcastExportConfig) {
        this.llmClient = llmClient;
        this.config = config;
        this.elevenLabsModel = config.elevenLabsModel || 'eleven_v3';
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
            phase_1_opening: 'Opening Statements',
            phase_2_constructive: 'Evidence Presentation',
            phase_3_crossexam: 'Clarifying Questions',
            phase_4_rebuttal: 'Rebuttals',
            phase_5_closing: 'Closing Statements',
            phase_6_synthesis: 'Moderator Synthesis',
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
     * Optimized for ElevenLabs V3 expressive TTS
     */
    private buildRefinementPrompt(
        content: string,
        speaker: string,
        proposition: string
    ): RefinementPrompt {
        return {
            systemPrompt: `You are a podcast script editor optimizing debate content for ElevenLabs V3 text-to-speech.

Transform the debate transcript into expressive, natural spoken dialogue.

## V3 Expressive Syntax to Use:
- [pause] or [short pause] for dramatic beats and transitions
- [sigh] when expressing frustration or resignation
- [laughs] for moments of irony or disbelief
- Ellipses ... for trailing off or building tension
- CAPITALIZATION for emphasized words (sparingly)

## Guidelines:
- Remove ALL markdown formatting (**, *, #, bullets, numbered lists)
- Convert structured arguments into flowing conversational prose
- Expand abbreviations naturally (AI → "A.I.", US → "the United States")
- Use contractions where natural (it's, we're, that's)
- Break long sentences into natural phrases
- Remove citations and footnote markers
- Keep intellectual content intact - don't change arguments
- Match speaker personality: Pro should sound confident, Con should sound thoughtful

## For Debate Dynamics:
- When responding to a point, add energy: "Wait — " or "Hold on — "
- When making a strong counterpoint, use emphasis: "But HERE'S the thing..."
- For concessions, soften: "[sigh] Fair point, but..."

Output ONLY the refined spoken text. No explanations.`,

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
     */
    private generatePhaseTransition(phaseName: string): string | null {
        const transitions: Record<string, string> = {
            'Opening Statements': '[pause] Let us begin with opening statements from each side.',
            'Evidence Presentation': '[pause] Moving now to evidence presentation.',
            'Clarifying Questions': '[pause] We now enter clarifying questions, where each side may challenge the other.',
            'Rebuttals': '[pause] Time for rebuttals.',
            'Closing Statements': '[pause] We conclude with closing statements.',
            'Moderator Synthesis': '[pause] Finally, our moderator offers a balanced synthesis of the debate.',
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
     * Handles both formal debate mode and informal/lively debate mode speakers
     */
    private mapSpeakerRole(speaker: string): string {
        const mapping: Record<string, string> = {
            // Formal debate mode
            'pro': 'pro_advocate',
            'pro_advocate': 'pro_advocate',
            'con': 'con_advocate',
            'con_advocate': 'con_advocate',
            'moderator': 'moderator',
            // Informal/lively debate mode
            'arbiter': 'moderator',
            'chair_1': 'pro_advocate',
            'chair_2': 'con_advocate',
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
     * Get voice settings for a speaker role
     */
    private getVoiceSettings(speakerRole: string): ElevenLabsVoiceSettings {
        const assignment = this.config.voiceAssignments[speakerRole]
            || DEFAULT_VOICE_ASSIGNMENTS[speakerRole]
            || DEFAULT_VOICE_ASSIGNMENTS['narrator'];

        return assignment!.settings;
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
     */
    private cleanInterruptionMarkers(content: string): string {
        return content
            // Convert [INTERRUPTION: text...] to natural phrase
            .replace(/\[INTERRUPTION:\s*([^\]]*?)\.{3}\]/gi, 'Hold on — $1')
            .replace(/\[INTERRUPTION:\s*([^\]]*)\]/gi, 'Wait — $1')
            // Convert [RESPONDING TO INTERRUPTION] to natural transition
            .replace(/\[RESPONDING TO INTERRUPTION\]\s*/gi, 'Fair point, but ')
            // Clean any remaining empty brackets
            .replace(/\[\s*\]/g, '')
            .trim();
    }

    /**
     * Merge consecutive same-speaker turns for natural podcast flow
     * Prevents awkward back-to-back segments from the same voice
     */
    private mergeConsecutiveTurns(phases: PhaseData[]): PhaseData[] {
        return phases.map(phase => ({
            ...phase,
            turns: phase.turns.reduce((merged, turn) => {
                const last = merged[merged.length - 1];
                if (last && last.speaker === turn.speaker) {
                    // Merge: add short pause between content
                    last.content += ' [short pause] ' + turn.content;
                } else {
                    merged.push({ ...turn });
                }
                return merged;
            }, [] as TurnData[])
        }));
    }

    /**
     * Convert pause syntax based on ElevenLabs model
     * V3 uses text tags, other models need SSML break tags
     */
    private convertPauseSyntax(text: string): string {
        if (this.elevenLabsModel === 'eleven_v3') {
            // V3 uses text-based tags - already correct, just normalize
            return text;
        }
        // Other models need SSML break tags
        return text
            .replace(/\[long pause\]/gi, '<break time="3s"/>')
            .replace(/\[pause\]/gi, '<break time="2s"/>')
            .replace(/\[short pause\]/gi, '<break time="0.5s"/>')
            .replace(/\[sigh\]/gi, '<break time="0.5s"/>')
            .replace(/\[laughs?\]/gi, '<break time="0.3s"/>')
            .replace(/\[exhales?\]/gi, '<break time="0.3s"/>');
    }
}
