/**
 * Prompt Testing Framework
 *
 * Infrastructure for testing prompt templates, validating outputs,
 * and tracking quality metrics over time.
 */

import type { LLMClient } from '../../llm/client.js';
import type {
  PromptTemplate,
  PromptTestCase,
  PromptTestResult,
  TestCaseResult,
  QualityCheckResult,
} from './types.js';

/**
 * Test configuration options
 */
export interface PromptTesterConfig {
  /** LLM model to use for testing */
  model?: string;

  /** Temperature for LLM calls */
  temperature?: number;

  /** Max tokens for responses */
  maxTokens?: number;

  /** Timeout per test in milliseconds */
  timeoutMs?: number;

  /** Number of retries on failure */
  retries?: number;

  /** Whether to save test results */
  saveResults?: boolean;

  /** Results storage path */
  resultsPath?: string;
}

/**
 * Default test configuration
 */
const DEFAULT_CONFIG: Required<PromptTesterConfig> = {
  model: 'claude-sonnet-4-5',
  temperature: 0.7,
  maxTokens: 2000,
  timeoutMs: 30000,
  retries: 1,
  saveResults: false,
  resultsPath: './test-results',
};

/**
 * Prompt Tester Class
 *
 * Tests prompts against LLM and validates outputs using quality checks.
 */
export class PromptTester {
  private config: Required<PromptTesterConfig>;
  private testHistory: PromptTestResult[] = [];

  constructor(config: PromptTesterConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Test a single prompt with multiple test cases
   */
  async testPrompt(
    prompt: PromptTemplate,
    llmClient: LLMClient,
    testCases: PromptTestCase[]
  ): Promise<PromptTestResult> {
    const results: TestCaseResult[] = [];

    for (const testCase of testCases) {
      const result = await this.runTestCase(prompt, llmClient, testCase);
      results.push(result);
    }

    const passedCount = results.filter((r) => r.passed).length;
    const passRate = testCases.length > 0 ? passedCount / testCases.length : 0;

    const testResult: PromptTestResult = {
      promptId: prompt.id,
      totalTests: testCases.length,
      passed: passedCount,
      failed: testCases.length - passedCount,
      passRate,
      averageLatencyMs:
        results.length > 0
          ? results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length
          : 0,
      totalTokensUsed: results.reduce((sum, r) => sum + r.tokensUsed, 0),
      results,
      timestamp: new Date().toISOString(),
    };

    this.testHistory.push(testResult);

    return testResult;
  }

  /**
   * Run a single test case
   */
  private async runTestCase(
    prompt: PromptTemplate,
    llmClient: LLMClient,
    testCase: PromptTestCase
  ): Promise<TestCaseResult> {
    const startTime = Date.now();

    try {
      // Build the prompt with variable substitution
      let processedTemplate = prompt.template;
      if (testCase.variables) {
        for (const [key, value] of Object.entries(testCase.variables)) {
          processedTemplate = processedTemplate.replace(
            new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
            value
          );
        }
      }

      // Call LLM
      const response = await llmClient.complete({
        provider: { name: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY || '' },
        model: this.config.model,
        messages: [
          { role: 'system', content: processedTemplate },
          { role: 'user', content: testCase.input },
        ],
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      });

      const latencyMs = Date.now() - startTime;
      const output = response.content;

      // Run quality checks
      const qualityCheckResults = this.runQualityChecks(prompt, output, testCase);

      // Check expected patterns
      let patternsPassed = true;
      if (testCase.expectedPatterns) {
        for (const pattern of testCase.expectedPatterns) {
          if (!pattern.test(output)) {
            patternsPassed = false;
            break;
          }
        }
      }

      // Check forbidden patterns
      let forbiddenPassed = true;
      if (testCase.forbiddenPatterns) {
        for (const pattern of testCase.forbiddenPatterns) {
          if (pattern.test(output)) {
            forbiddenPassed = false;
            break;
          }
        }
      }

      // Determine overall pass status
      const allQualityPassed = qualityCheckResults.every((qc) => {
        // Only errors fail the test, warnings don't
        const check = prompt.qualityChecks.find((c) => c.name === qc.name);
        return qc.result.passed || check?.severity === 'warning';
      });

      const passed = allQualityPassed && patternsPassed && forbiddenPassed;

      return {
        testCase: testCase.name,
        passed,
        output,
        qualityChecks: qualityCheckResults,
        latencyMs,
        tokensUsed: response.usage?.totalTokens || 0,
      };
    } catch (error) {
      return {
        testCase: testCase.name,
        passed: false,
        output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        qualityChecks: [],
        latencyMs: Date.now() - startTime,
        tokensUsed: 0,
      };
    }
  }

  /**
   * Run quality checks on output
   */
  private runQualityChecks(
    prompt: PromptTemplate,
    output: string,
    testCase: PromptTestCase
  ): Array<{ name: string; result: QualityCheckResult }> {
    const results: Array<{ name: string; result: QualityCheckResult }> = [];

    for (const check of prompt.qualityChecks) {
      // Only run checks that are expected to pass
      if (testCase.expectedQualities.length === 0 ||
          testCase.expectedQualities.includes(check.name)) {
        const result = check.validator(output);
        results.push({ name: check.name, result });
      }
    }

    return results;
  }

  /**
   * Run regression tests for all prompts
   */
  async runRegressionSuite(
    prompts: PromptTemplate[],
    llmClient: LLMClient,
    testCasesMap: Map<string, PromptTestCase[]>
  ): Promise<{
    totalPrompts: number;
    passed: number;
    failed: number;
    results: PromptTestResult[];
  }> {
    const results: PromptTestResult[] = [];
    let passedPrompts = 0;
    let failedPrompts = 0;

    for (const prompt of prompts) {
      const testCases = testCasesMap.get(prompt.id);
      if (!testCases || testCases.length === 0) {
        continue;
      }

      const result = await this.testPrompt(prompt, llmClient, testCases);
      results.push(result);

      if (result.passRate >= 0.8) {
        passedPrompts++;
      } else {
        failedPrompts++;
      }
    }

    return {
      totalPrompts: results.length,
      passed: passedPrompts,
      failed: failedPrompts,
      results,
    };
  }

  /**
   * Get test history
   */
  getTestHistory(): PromptTestResult[] {
    return [...this.testHistory];
  }

  /**
   * Clear test history
   */
  clearHistory(): void {
    this.testHistory = [];
  }

  /**
   * Generate test report
   */
  generateReport(result: PromptTestResult): string {
    const lines: string[] = [
      `# Prompt Test Report: ${result.promptId}`,
      ``,
      `**Timestamp:** ${result.timestamp}`,
      `**Total Tests:** ${result.totalTests}`,
      `**Passed:** ${result.passed}`,
      `**Failed:** ${result.failed}`,
      `**Pass Rate:** ${(result.passRate * 100).toFixed(1)}%`,
      `**Avg Latency:** ${result.averageLatencyMs.toFixed(0)}ms`,
      `**Total Tokens:** ${result.totalTokensUsed}`,
      ``,
      `## Individual Test Results`,
      ``,
    ];

    for (const testResult of result.results) {
      lines.push(`### ${testResult.testCase}`);
      lines.push(`**Status:** ${testResult.passed ? '✅ PASSED' : '❌ FAILED'}`);
      lines.push(`**Latency:** ${testResult.latencyMs}ms`);
      lines.push(`**Tokens:** ${testResult.tokensUsed}`);
      lines.push(``);

      if (testResult.qualityChecks.length > 0) {
        lines.push(`**Quality Checks:**`);
        for (const qc of testResult.qualityChecks) {
          const status = qc.result.passed ? '✅' : '❌';
          const message = qc.result.message ? ` - ${qc.result.message}` : '';
          lines.push(`- ${status} ${qc.name}${message}`);
        }
        lines.push(``);
      }

      lines.push(`**Output Preview:**`);
      lines.push('```');
      lines.push(testResult.output.slice(0, 500) + (testResult.output.length > 500 ? '...' : ''));
      lines.push('```');
      lines.push(``);
    }

    return lines.join('\n');
  }
}

/**
 * Mock LLM Client for testing without API calls
 */
export class MockLLMClient {
  private responses: Map<string, string> = new Map();

  /**
   * Set a mock response for a given input pattern
   */
  setResponse(inputPattern: string, response: string): void {
    this.responses.set(inputPattern, response);
  }

  /**
   * Complete - mock implementation
   */
  async complete(options: {
    provider: { name: string; apiKey: string };
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature: number;
    maxTokens: number;
  }): Promise<{ content: string; usage: { totalTokens: number } }> {
    const userMessage = options.messages.find((m) => m.role === 'user')?.content || '';

    // Find matching response
    for (const [pattern, response] of this.responses) {
      if (userMessage.includes(pattern)) {
        return {
          content: response,
          usage: { totalTokens: Math.floor(response.length / 4) },
        };
      }
    }

    // Default response
    return {
      content: 'Mock response for testing',
      usage: { totalTokens: 10 },
    };
  }
}

/**
 * Pre-defined test cases for common scenarios
 */
export const COMMON_TEST_CASES = {
  orchestrator: {
    normalization: [
      {
        name: 'statement_to_question',
        input: 'AI data centers use too much energy',
        variables: {},
        expectedQualities: ['json_valid', 'neutral_language'],
        expectedPatterns: [/normalized_question/],
      },
      {
        name: 'vague_to_specific',
        input: 'Remote work',
        variables: {},
        expectedQualities: ['json_valid', 'neutral_language'],
        expectedPatterns: [/normalized_question/, /stakeholders/],
      },
      {
        name: 'biased_to_neutral',
        input: 'Obviously AI is dangerous and should be banned',
        variables: {},
        expectedQualities: ['json_valid', 'neutral_language'],
        forbiddenPatterns: [/obviously/i, /dangerous/],
      },
    ] as PromptTestCase[],
  },

  pro: {
    opening: [
      {
        name: 'clear_position',
        input: 'Deliver your opening statement on AI data center moratorium',
        variables: { proposition: 'Should there be a moratorium on new AI data centers?' },
        expectedQualities: ['no_strawman', 'has_assumptions', 'professional_tone'],
        expectedPatterns: [/FOR|support|favor/i],
        forbiddenPatterns: [/opponent|they argue/i],
      },
    ] as PromptTestCase[],
  },

  con: {
    opening: [
      {
        name: 'clear_opposition',
        input: 'Deliver your opening statement on AI data center moratorium',
        variables: { proposition: 'Should there be a moratorium on new AI data centers?' },
        expectedQualities: ['no_strawman', 'has_assumptions', 'professional_tone'],
        expectedPatterns: [/AGAINST|oppose|should not/i],
        forbiddenPatterns: [/opponent|they argue/i],
      },
    ] as PromptTestCase[],
  },

  moderator: {
    synthesis: [
      {
        name: 'neutral_synthesis',
        input: 'Synthesize this debate about AI data centers',
        variables: {},
        expectedQualities: ['no_winner_picking', 'neutral_language', 'professional_tone'],
        forbiddenPatterns: [/winner|stronger|better|should|recommend/i],
        expectedPatterns: [/agree|disagree|decision hinge/i],
      },
    ] as PromptTestCase[],
  },
};

/**
 * Create a configured prompt tester
 */
export function createPromptTester(config?: PromptTesterConfig): PromptTester {
  return new PromptTester(config);
}
