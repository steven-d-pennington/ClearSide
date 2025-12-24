/**
 * Orchestrator Agent Unit Tests
 *
 * Tests for the orchestrator agent that normalizes user propositions
 * into structured, debatable formats.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { OrchestratorAgent } from '../src/services/agents/orchestrator-agent.js';
import type { LLMClient } from '../src/services/llm/client.js';
import type { LLMResponse } from '../src/types/llm.js';

// Mock LLM Client
const createMockLLMClient = (): jest.Mocked<LLMClient> => {
  return {
    complete: jest.fn(),
  } as unknown as jest.Mocked<LLMClient>;
};

describe('OrchestratorAgent', () => {
  let agent: OrchestratorAgent;
  let mockLLMClient: jest.Mocked<LLMClient>;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    agent = new OrchestratorAgent(mockLLMClient);
  });

  describe('normalizeProposition', () => {
    it('should normalize a statement into a question', async () => {
      const rawInput = 'AI data centers consume too much energy';

      const mockResponse: LLMResponse = {
        content: JSON.stringify({
          normalized_question:
            'Should AI data centers be subject to stricter energy consumption regulations?',
          context: {
            category: 'technology policy',
            time_context: '2025-2030',
            geographic_scope: 'Global',
            stakeholders: ['Tech companies', 'Regulators', 'Environmental groups'],
            key_assumptions: [
              'AI data centers consume significant energy',
              'Regulation can reduce consumption',
            ],
            background: 'Growing concerns about AI infrastructure energy demands',
          },
          confidence: 0.9,
        }),
        model: 'claude-3-5-sonnet-20241022',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        provider: 'anthropic',
      };

      mockLLMClient.complete.mockResolvedValue(mockResponse);

      const result = await agent.normalizeProposition(rawInput);

      expect(result.normalized_question).toContain('Should');
      expect(result.context.stakeholders).toBeDefined();
      expect(result.context.stakeholders!.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should extract user-provided context', async () => {
      const rawInput = 'Should remote work be mandatory?';
      const userContext = {
        geography: 'United States',
        timeframe: '2025',
        domain: 'workplace policy',
      };

      const mockResponse: LLMResponse = {
        content: JSON.stringify({
          normalized_question:
            'Should remote work be the default option for knowledge workers in the United States?',
          context: {
            category: 'workplace policy',
            time_context: '2025',
            geographic_scope: 'United States',
            stakeholders: ['Employees', 'Employers', 'Commercial real estate'],
            key_assumptions: ['Remote work is technically feasible'],
            background: 'Post-pandemic workplace evolution',
          },
          confidence: 0.85,
        }),
        model: 'claude-3-5-sonnet-20241022',
        usage: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
        finishReason: 'stop',
        provider: 'anthropic',
      };

      mockLLMClient.complete.mockResolvedValue(mockResponse);

      const result = await agent.normalizeProposition(rawInput, userContext);

      expect(result.context.geographic_scope).toBe('United States');
      expect(result.context.time_context).toBe('2025');
      expect(result.context.category).toBe('workplace policy');
    });

    it('should handle already-clear questions', async () => {
      const rawInput = 'Should the US implement universal healthcare?';

      const mockResponse: LLMResponse = {
        content: JSON.stringify({
          normalized_question:
            'Should the United States implement a universal healthcare system?',
          context: {
            category: 'healthcare policy',
            time_context: 'Current policy debate',
            geographic_scope: 'United States',
            stakeholders: ['Patients', 'Healthcare providers', 'Insurance companies', 'Government'],
            key_assumptions: ['Healthcare access is a priority', 'Government can manage healthcare'],
            background: 'Ongoing debate over healthcare reform',
          },
          confidence: 0.95,
        }),
        model: 'claude-3-5-sonnet-20241022',
        usage: { promptTokens: 110, completionTokens: 55, totalTokens: 165 },
        finishReason: 'stop',
        provider: 'anthropic',
      };

      mockLLMClient.complete.mockResolvedValue(mockResponse);

      const result = await agent.normalizeProposition(rawInput);

      expect(result.normalized_question).toBeTruthy();
      expect(result.normalized_question).toContain('United States');
      expect(result.normalized_question).toContain('healthcare');
    });

    it('should handle JSON in markdown code blocks', async () => {
      const rawInput = 'Test question';

      const mockResponse: LLMResponse = {
        content: '```json\n' + JSON.stringify({
          normalized_question: 'Should X do Y?',
          context: {
            category: 'test',
            stakeholders: ['Group A'],
          },
          confidence: 0.8,
        }) + '\n```',
        model: 'claude-3-5-sonnet-20241022',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        provider: 'anthropic',
      };

      mockLLMClient.complete.mockResolvedValue(mockResponse);

      const result = await agent.normalizeProposition(rawInput);

      expect(result.normalized_question).toBe('Should X do Y?');
    });

    it('should handle JSON in plain markdown code blocks', async () => {
      const rawInput = 'Test question';

      const mockResponse: LLMResponse = {
        content: '```\n' + JSON.stringify({
          normalized_question: 'Should X do Y?',
          context: {
            category: 'test',
          },
          confidence: 0.8,
        }) + '\n```',
        model: 'claude-3-5-sonnet-20241022',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        provider: 'anthropic',
      };

      mockLLMClient.complete.mockResolvedValue(mockResponse);

      const result = await agent.normalizeProposition(rawInput);

      expect(result.normalized_question).toBe('Should X do Y?');
    });

    it('should throw error on empty input', async () => {
      await expect(agent.normalizeProposition('')).rejects.toThrow('cannot be empty');
    });

    it('should throw error on very short input', async () => {
      await expect(agent.normalizeProposition('AI')).rejects.toThrow('too short');
    });

    it('should throw error on invalid JSON response', async () => {
      const rawInput = 'Test question';

      const mockResponse: LLMResponse = {
        content: 'This is not valid JSON',
        model: 'claude-3-5-sonnet-20241022',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        provider: 'anthropic',
      };

      mockLLMClient.complete.mockResolvedValue(mockResponse);

      await expect(agent.normalizeProposition(rawInput)).rejects.toThrow('Failed to parse');
    });

    it('should throw error on missing required field', async () => {
      const rawInput = 'Test question';

      const mockResponse: LLMResponse = {
        content: JSON.stringify({
          context: {
            category: 'test',
          },
          confidence: 0.8,
          // Missing normalized_question
        }),
        model: 'claude-3-5-sonnet-20241022',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        provider: 'anthropic',
      };

      mockLLMClient.complete.mockResolvedValue(mockResponse);

      await expect(agent.normalizeProposition(rawInput)).rejects.toThrow('Missing required field');
    });

    it('should handle LLM errors gracefully', async () => {
      const rawInput = 'Test question';

      mockLLMClient.complete.mockRejectedValue(new Error('LLM API error'));

      await expect(agent.normalizeProposition(rawInput)).rejects.toThrow('LLM API error');
    });

    it('should set default confidence if not provided', async () => {
      const rawInput = 'Test question';

      const mockResponse: LLMResponse = {
        content: JSON.stringify({
          normalized_question: 'Should X do Y?',
          context: {
            category: 'test',
          },
          // No confidence field
        }),
        model: 'claude-3-5-sonnet-20241022',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        provider: 'anthropic',
      };

      mockLLMClient.complete.mockResolvedValue(mockResponse);

      const result = await agent.normalizeProposition(rawInput);

      expect(result.confidence).toBe(0.8); // Default value
    });

    it('should handle missing context gracefully', async () => {
      const rawInput = 'Test question';

      const mockResponse: LLMResponse = {
        content: JSON.stringify({
          normalized_question: 'Should X do Y?',
          // No context field
          confidence: 0.7,
        }),
        model: 'claude-3-5-sonnet-20241022',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
        provider: 'anthropic',
      };

      mockLLMClient.complete.mockResolvedValue(mockResponse);

      const result = await agent.normalizeProposition(rawInput);

      expect(result.context).toBeDefined();
      expect(result.context.stakeholders).toEqual([]);
      expect(result.context.key_assumptions).toEqual([]);
    });
  });

  describe('validateProposition', () => {
    it('should validate a good proposition', async () => {
      const result = await agent.validateProposition('Should we implement universal healthcare?');

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject empty proposition', async () => {
      const result = await agent.validateProposition('');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('too short or empty');
    });

    it('should reject very short proposition', async () => {
      const result = await agent.validateProposition('AI');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('too short or empty');
    });

    it('should accept statements (will be normalized to questions)', async () => {
      const result = await agent.validateProposition('Climate change is a serious problem');

      expect(result.valid).toBe(true);
    });

    it('should accept questions', async () => {
      const result = await agent.validateProposition('Should we ban plastic bags?');

      expect(result.valid).toBe(true);
    });
  });

  describe('getMetadata', () => {
    it('should return agent metadata', () => {
      const metadata = agent.getMetadata();

      expect(metadata.name).toBe('OrchestratorAgent');
      expect(metadata.version).toBeTruthy();
      expect(metadata.model).toBeTruthy();
      expect(metadata.capabilities).toContain('proposition-normalization');
    });
  });

  describe('edge cases', () => {
    it('should handle multiple questions in input', async () => {
      const rawInput = 'Should we ban social media for kids? What about teenagers?';

      const mockResponse: LLMResponse = {
        content: JSON.stringify({
          normalized_question: 'Should social media access be restricted for users under 18 years old?',
          context: {
            category: 'technology regulation',
            time_context: 'Current policy debate',
            geographic_scope: 'United States',
            stakeholders: ['Minors', 'Parents', 'Social media companies'],
            key_assumptions: ['Social media affects youth development'],
            background: 'Debate over age restrictions on social media',
          },
          confidence: 0.8,
        }),
        model: 'claude-3-5-sonnet-20241022',
        usage: { promptTokens: 130, completionTokens: 70, totalTokens: 200 },
        finishReason: 'stop',
        provider: 'anthropic',
      };

      mockLLMClient.complete.mockResolvedValue(mockResponse);

      const result = await agent.normalizeProposition(rawInput);

      expect(result.normalized_question).toBeTruthy();
    });

    it('should handle vague single-word input', async () => {
      const rawInput = 'Healthcare';

      const mockResponse: LLMResponse = {
        content: JSON.stringify({
          normalized_question: 'Should the United States implement a universal healthcare system?',
          context: {
            category: 'healthcare policy',
            time_context: 'Current policy debate',
            geographic_scope: 'United States',
            stakeholders: ['Patients', 'Healthcare providers', 'Insurance companies'],
            key_assumptions: ['Healthcare access is important'],
            background: 'Ongoing healthcare reform debate',
          },
          confidence: 0.6, // Lower confidence for vague input
        }),
        model: 'claude-3-5-sonnet-20241022',
        usage: { promptTokens: 110, completionTokens: 60, totalTokens: 170 },
        finishReason: 'stop',
        provider: 'anthropic',
      };

      mockLLMClient.complete.mockResolvedValue(mockResponse);

      const result = await agent.normalizeProposition(rawInput);

      expect(result.normalized_question).toBeTruthy();
      expect(result.confidence).toBeLessThan(0.8); // Lower confidence expected
    });

    it('should handle biased/polarizing input', async () => {
      const rawInput = 'Obviously AI is dangerous and must be banned immediately';

      const mockResponse: LLMResponse = {
        content: JSON.stringify({
          normalized_question:
            'Should artificial intelligence development be subject to a moratorium or ban?',
          context: {
            category: 'technology regulation',
            time_context: 'Near-term policy consideration',
            geographic_scope: 'Global',
            stakeholders: ['AI researchers', 'Technology companies', 'Regulators'],
            key_assumptions: ['AI poses potential risks'],
            background: 'Debate over AI safety',
          },
          confidence: 0.9,
        }),
        model: 'claude-3-5-sonnet-20241022',
        usage: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
        finishReason: 'stop',
        provider: 'anthropic',
      };

      mockLLMClient.complete.mockResolvedValue(mockResponse);

      const result = await agent.normalizeProposition(rawInput);

      // Should neutralize the biased language
      expect(result.normalized_question).not.toContain('obviously');
      expect(result.normalized_question).not.toContain('must be');
    });
  });
});
