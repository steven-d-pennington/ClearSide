
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpisodeGenerator } from '../src/services/research/episode-generator.js';
import { OpenRouterLLMClient } from '../src/services/llm/openrouter-adapter.js';
import { EpisodeProposalRepository } from '../src/db/repositories/episode-proposal-repository.js';
import { ResearchResult, EpisodeProposal } from '../src/types/duelogic-research.js';

describe('EpisodeGenerator', () => {
    let generator: EpisodeGenerator;
    let mockLLMClient: any;
    let mockRepo: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockLLMClient = {
            generate: vi.fn(),
        };

        mockRepo = {
            create: vi.fn().mockResolvedValue({ id: 'prop-1' }),
            findByStatus: vi.fn().mockResolvedValue([]),
        };

        generator = new EpisodeGenerator(
            mockLLMClient as unknown as OpenRouterLLMClient,
            mockRepo as unknown as EpisodeProposalRepository,
            { similarityThreshold: 0.5 } as any
        );
    });

    describe('validateEpisodeStructure', () => {
        it('should reject episodes with missing chairs', () => {
            const episode: any = {
                title: 'Valid Title',
                subtitle: 'Valid Subtitle Is Long Enough',
                description: 'Valid description that is long enough to pass the validation check which likely requires around 50 characters or so.',
                proposition: 'Valid proposition that is long enough',
                keyTensions: ['1', '2', '3'],
                chairs: []
            };
            expect(generator.validateEpisodeStructure(episode)).toBe(false);
        });

        it('should reject chairs without mustAcknowledge', () => {
            const episode: any = {
                title: 'Valid Title',
                subtitle: 'Valid Subtitle Is Long Enough',
                description: 'Valid description that is long enough to pass the validation check which likely requires around 50 characters or so.',
                proposition: 'Valid proposition that is long enough',
                keyTensions: ['1', '2', '3'],
                chairs: [
                    { name: 'Chair 1', position: 'Position', mustAcknowledge: '' },
                    { name: 'Chair 2', position: 'Position', mustAcknowledge: 'Ack' }
                ]
            };
            expect(generator.validateEpisodeStructure(episode)).toBe(false);
        });

        it('should accept well-formed episodes', () => {
            const episode: any = {
                title: 'Valid Title',
                subtitle: 'Valid Subtitle Is Long Enough',
                description: 'Valid description that is long enough to pass the validation check which likely requires around 50 characters or so.',
                proposition: 'Valid proposition that is long enough',
                contextForPanel: 'Context',
                chairs: [
                    { name: 'Chair 1', position: 'Position', mustAcknowledge: 'Ack 1' },
                    { name: 'Chair 2', position: 'Position', mustAcknowledge: 'Ack 2' }
                ],
                keyTensions: ['Tension 1', 'Tension 2', 'Tension 3'],
                qualityScore: 0.9
            };
            expect(generator.validateEpisodeStructure(episode)).toBe(true);
        });
    });

    describe('isTooSimilar', () => {
        it('should detect similar topics', async () => {
            const existing: EpisodeProposal[] = [
                { title: 'AI Hiring Ethics', proposition: 'Should AI be used in hiring?', id: '1' } as any
            ];

            // Mock generator config if needed, or rely on defaults
            const isSimilar = await generator.isTooSimilar(
                'AI Hiring Ethics Debate',
                existing
            );

            expect(isSimilar).toBe(true);
        });

        it('should allow dissimilar topics', async () => {
            const existing: EpisodeProposal[] = [
                { title: 'Climate Policy', proposition: 'Carbon taxes are effective', id: '1' } as any
            ];

            const isSimilar = await generator.isTooSimilar(
                'AI in healthcare diagnosis',
                existing
            );

            expect(isSimilar).toBe(false);
        });
    });

    describe('generateProposal', () => {
        it('should generate a proposal if not similar', async () => {
            const research: ResearchResult = {
                id: 'res-1',
                topic: 'New Topic',
                controversyScore: 0.9,
                depth: 0.9,
                timeliness: 0.9,
                sources: [] as any,
                category: 'ai_automation',
                summary: 'Summary',
                rawPerplexityResponse: '',
                createdAt: new Date()
            } as any;

            mockLLMClient.generate.mockResolvedValue({
                content: JSON.stringify({
                    title: 'New Topic Title',
                    subtitle: 'Subtitle Is Long Enough For Validation',
                    description: 'Description Is Long Enough For Validation Description Is Long Enough For Validation',
                    proposition: 'Proposition Is Long Enough For Validation',
                    contextForPanel: 'Context',
                    chairs: [
                        { name: 'Chair 1', position: 'Pos 1', mustAcknowledge: 'Ack 1' },
                        { name: 'Chair 2', position: 'Pos 2', mustAcknowledge: 'Ack 2' }
                    ],
                    keyTensions: ['T1', 'T2', 'T3'],
                    qualityScore: 0.9
                }),
                usage: { totalTokens: 100 }
            });

            const result = await generator.generateProposal(research);

            expect(result).not.toBeNull();
            expect(mockRepo.create).toHaveBeenCalled();
        });
    });
});
