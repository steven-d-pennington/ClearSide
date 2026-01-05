
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DuelogicResearchService } from '../src/services/research/duelogic-research-service.js';
import { OpenRouterLLMClient } from '../src/services/llm/openrouter-adapter.js';
import { ResearchRepository } from '../src/db/repositories/research-repository.js';
import { DEFAULT_RESEARCH_CONFIG } from '../src/types/duelogic-research.js';

describe('DuelogicResearchService', () => {
    let service: DuelogicResearchService;
    let mockLLMClient: any;
    let mockRepo: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockLLMClient = {
            generate: vi.fn(),
        };

        mockRepo = {
            createResult: vi.fn().mockResolvedValue({ id: 'result-1' }),
        };

        service = new DuelogicResearchService(
            mockLLMClient as unknown as OpenRouterLLMClient,
            mockRepo as unknown as ResearchRepository
        );
    });

    describe('parseTopicsResponse', () => {
        it('should parse valid JSON response', () => {
            const response = `{
        "topics": [{
          "topic": "Should AI be used in hiring?",
          "summary": "Growing debate about algorithmic bias in recruitment",
          "sources": [{"url": "https://example.com", "title": "AI Hiring Study"}],
          "controversyScore": 0.85,
          "timeliness": 0.9,
          "depth": 0.75
        }]
      }`;

            const topics = service.parseTopicsResponse(response, 'ai_automation');

            expect(topics).toHaveLength(1);
            expect(topics[0].topic).toBe('Should AI be used in hiring?');
            expect(topics[0].controversyScore).toBe(0.85);
            expect(topics[0].sources[0].url).toBe('https://example.com');
        });

        it('should extract JSON from markdown code blocks', () => {
            const response = '```json\n{"topics": []}\n```';
            const topics = service.parseTopicsResponse(response, 'ai_automation');
            expect(topics).toEqual([]);
        });

        it('should handle malformed responses gracefully', () => {
            const response = 'Not valid JSON at all';
            const topics = service.parseTopicsResponse(response, 'ai_automation');
            expect(topics).toEqual([]);
        });

        it('should handle raw array response (legacy format)', () => {
            const response = `[{
        "topic": "Test Topic",
        "controversyScore": 0.8,
        "timeliness": 0.8,
        "depth": 0.8
      }]`;
            const topics = service.parseTopicsResponse(response, 'ai_automation');
            expect(topics).toHaveLength(1);
            expect(topics[0].topic).toBe('Test Topic');
        });
    });

    describe('discoverTopics', () => {
        it('should filter topics by quality thresholds', async () => {
            // Mock Perplexity response with mixed quality topics
            mockLLMClient.generate.mockResolvedValue({
                content: JSON.stringify({
                    topics: [
                        { topic: 'High quality', controversyScore: 0.9, timeliness: 0.8, depth: 0.85 },
                        { topic: 'Low quality', controversyScore: 0.3, timeliness: 0.2, depth: 0.4 },
                    ]
                }),
                usage: { totalTokens: 1500, promptTokens: 500, completionTokens: 1000 }
            });

            const config = {
                ...DEFAULT_RESEARCH_CONFIG,
                categories: ['ai_automation'], // Only run ONE category to keep test simple
                minControversyScore: 0.6,
                // ensure arrays are defined
                searchQueries: [],
                excludeTopics: []
            } as any; // Cast to bypass Partial<ResearchConfig> issues if any, we want full config usually but service accepts ResearchConfig

            // We need config to respect ResearchConfig interface which has mandatory fields usually?
            // ResearchConfig has all fields mandatory.
            const fullConfig = {
                id: 'test',
                name: 'test',
                schedule: 'cron',
                enabled: true,
                categories: ['ai_automation'],
                perplexityModel: 'sonar',
                maxTopicsPerRun: 10,
                minControversyScore: 0.6,
                searchQueries: [],
                excludeTopics: [],
                createdAt: new Date(),
                updatedAt: new Date()
            } as any;

            const results = await service.discoverTopics(fullConfig, 'job-123');

            expect(results).toHaveLength(1);
            expect(mockRepo.createResult).toHaveBeenCalledTimes(1);
            expect(mockRepo.createResult).toHaveBeenCalledWith(expect.objectContaining({
                topic: 'High quality'
            }));
        });

        it('should handle errors in broad discovery gracefully', async () => {
            mockLLMClient.generate.mockRejectedValue(new Error('API failure'));

            const fullConfig = {
                id: 'test',
                name: 'test',
                schedule: 'cron',
                enabled: true,
                categories: ['ai_automation'],
                perplexityModel: 'sonar',
                maxTopicsPerRun: 10,
                minControversyScore: 0.6,
                searchQueries: [],
                excludeTopics: [],
                createdAt: new Date(),
                updatedAt: new Date()
            } as any;

            const results = await service.discoverTopics(fullConfig, 'job-123');

            expect(results).toEqual([]);
            // Should not throw
        });
    });
});
