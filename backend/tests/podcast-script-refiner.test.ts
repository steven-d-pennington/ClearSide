import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PodcastScriptRefiner } from '../src/services/podcast/script-refiner.js';
import { PodcastExportConfig } from '../src/types/podcast-export.js';
import { DebateTranscript } from '../src/services/transcript/transcript-recorder.js';

// Mock OpenRouterLLMClient
const mockComplete = vi.fn();
vi.mock('../src/services/llm/openrouter-adapter.js', () => ({
    OpenRouterLLMClient: vi.fn().mockImplementation(() => ({
        complete: mockComplete,
    })),
}));

describe('PodcastScriptRefiner', () => {
    let refiner: PodcastScriptRefiner;
    let mockConfig: PodcastExportConfig;
    let mockLlmClient: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockConfig = {
            refinementModel: 'gpt-4o',
            includeIntro: true,
            includeOutro: true,
            addTransitions: true,
            elevenLabsModel: 'eleven_multilingual_v2',
            outputFormat: 'mp3_44100_128',
            voiceAssignments: {},
            useCustomPronunciation: false,
            normalizeVolume: true,
        };
        mockLlmClient = {
            complete: mockComplete,
        };
        refiner = new PodcastScriptRefiner(mockLlmClient as any, mockConfig);
    });

    const mockTranscript: DebateTranscript = {
        meta: {
            schema_version: '2.0.0',
            debate_id: 'debate-123',
            generated_at: new Date().toISOString(),
            debate_format: 'live_theater',
            total_duration_seconds: 300,
            status: 'completed',
        },
        proposition: {
            raw_input: 'Should AI be regulated?',
            normalized_question: 'Should Artificial Intelligence be regulated?',
        },
        transcript: [
            {
                id: '1',
                timestamp_ms: 0,
                phase: 'phase_1_opening',
                speaker: 'pro',
                content: 'AI is dangerous and needs broad regulation.',
            },
            {
                id: '2',
                timestamp_ms: 10000,
                phase: 'phase_1_opening',
                speaker: 'con',
                content: 'Regulation stifles innovation.',
            }
        ],
        structured_analysis: {} as any,
        user_interventions: [],
    };

    it('should strip markdown formatting', () => {
        // Accessing private method for testing or use cleanText directly if it were public
        // For now, I'll test it via refineTranscript mock
        const textWithMarkdown = '**Bold** and *italic* with # header and [link](http://example.com)';
        const cleaned = (refiner as any).cleanText(textWithMarkdown);
        expect(cleaned).toBe('Bold and italic with header and link');
    });

    it('should split long text into segments', () => {
        const longText = 'A'.repeat(5000);
        const segments = (refiner as any).splitIntoSegments(longText, 'pro_advocate');
        expect(segments.length).toBeGreaterThan(1);
        expect(segments[0].text.length).toBeLessThanOrEqual(4500);
    });

    it('should map speaker roles correctly', () => {
        expect((refiner as any).mapSpeakerRole('pro')).toBe('pro_advocate');
        expect((refiner as any).mapSpeakerRole('con')).toBe('con_advocate');
        expect((refiner as any).mapSpeakerRole('moderator')).toBe('moderator');
        expect((refiner as any).mapSpeakerRole('unknown')).toBe('narrator');
    });

    it('should populate context fields in segments', () => {
        const segments = [
            { index: 0, speaker: 'pro', voiceId: 'v1', text: 'First segment text.', voiceSettings: {} as any },
            { index: 1, speaker: 'con', voiceId: 'v2', text: 'Second segment text.', voiceSettings: {} as any },
        ];
        (refiner as any).addContextFields(segments);
        expect(segments[0].nextText).toBe('Second segment text.');
        expect(segments[1].previousText).toBe('First segment text.');
    });

    it('should generate a full refined script', async () => {
        mockComplete.mockResolvedValue({
            content: 'Refined content response',
            model: 'gpt-4o',
            usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
            finishReason: 'stop',
            provider: 'openrouter',
        });

        const result = await refiner.refineTranscript(mockTranscript);

        expect(result.title).toBe('Artificial Intelligence be regulated');
        expect(result.segments.length).toBeGreaterThan(0);
        expect(result.intro).toBeDefined();
        expect(result.outro).toBeDefined();
        // 1 intro + 1 transition + 2 turns + 1 transition + 1 outro
        // Wait, my groupUtterancesByPhase will group the two turns into one phase
        // So: intro (1 LLM call), 1 phase transition, 2 turns (2 LLM calls), 1 outro (1 LLM call)
        // Total LLM calls should be 4
        expect(mockComplete).toHaveBeenCalledTimes(4);
    });

    it('should handle missing intro/outro according to config', async () => {
        mockConfig.includeIntro = false;
        mockConfig.includeOutro = false;
        mockComplete.mockResolvedValue({ content: 'Refined' });

        const result = await refiner.refineTranscript(mockTranscript);
        expect(result.intro).toBeUndefined();
        expect(result.outro).toBeUndefined();
        expect(mockComplete).toHaveBeenCalledTimes(2); // Just the 2 turns
    });
});
