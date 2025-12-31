/**
 * Test Script: Verify Temperature and MaxTokens Settings
 *
 * Sends identical prompts with different settings to verify
 * that OpenRouter is actually using the parameters.
 */

import OpenAI from 'openai';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'anthropic/claude-3-haiku'; // Fast, cheap model for testing

if (!OPENROUTER_API_KEY) {
  console.error('Error: OPENROUTER_API_KEY not set');
  process.exit(1);
}

const client = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:3001',
    'X-Title': 'ClearSide Settings Test',
  },
});

const TEST_PROMPT = `List 5 benefits of exercise. Be direct and factual.`;

interface TestResult {
  temperature: number;
  maxTokens: number;
  responseLength: number;
  wordCount: number;
  response: string;
  finishReason: string | null;
}

async function runTest(temperature: number, maxTokens: number): Promise<TestResult> {
  console.log(`\n--- Testing: temp=${temperature}, maxTokens=${maxTokens} ---`);

  const startTime = Date.now();

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'user', content: TEST_PROMPT }
    ],
    temperature,
    max_tokens: maxTokens,
    stream: false,
  });

  const response = completion.choices[0]?.message?.content || '';
  const duration = Date.now() - startTime;
  const wordCount = response.split(/\s+/).length;

  console.log(`Duration: ${duration}ms`);
  console.log(`Response length: ${response.length} chars, ${wordCount} words`);
  console.log(`Finish reason: ${completion.choices[0]?.finish_reason}`);
  console.log(`Tokens used: ${completion.usage?.total_tokens}`);
  console.log(`Response preview: ${response.slice(0, 200)}...`);

  return {
    temperature,
    maxTokens,
    responseLength: response.length,
    wordCount,
    response,
    finishReason: completion.choices[0]?.finish_reason || null,
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('OpenRouter Settings Test');
  console.log('='.repeat(60));
  console.log(`Model: ${MODEL}`);
  console.log(`Prompt: "${TEST_PROMPT}"`);

  const results: TestResult[] = [];

  // Test 1: Low temperature, short response
  results.push(await runTest(0.1, 100));

  // Test 2: Low temperature, long response
  results.push(await runTest(0.1, 500));

  // Test 3: High temperature, short response
  results.push(await runTest(1.0, 100));

  // Test 4: High temperature, long response
  results.push(await runTest(1.0, 500));

  // Test 5: Default settings
  results.push(await runTest(0.7, 250));

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log('\nResponse Length Analysis:');
  console.log('(If maxTokens works, shorter limits should produce shorter responses)\n');

  for (const r of results) {
    const truncated = r.finishReason === 'length' ? ' [TRUNCATED]' : '';
    console.log(`temp=${r.temperature}, maxTokens=${r.maxTokens}: ${r.wordCount} words, ${r.responseLength} chars${truncated}`);
  }

  // Check if maxTokens is working
  const short100 = results.filter(r => r.maxTokens === 100);
  const long500 = results.filter(r => r.maxTokens === 500);

  const avgShort = short100.reduce((sum, r) => sum + r.responseLength, 0) / short100.length;
  const avgLong = long500.reduce((sum, r) => sum + r.responseLength, 0) / long500.length;

  console.log(`\nAverage response length with maxTokens=100: ${avgShort.toFixed(0)} chars`);
  console.log(`Average response length with maxTokens=500: ${avgLong.toFixed(0)} chars`);

  if (avgLong > avgShort * 1.5) {
    console.log('\n✅ maxTokens appears to be working (longer limit = longer response)');
  } else {
    console.log('\n⚠️  maxTokens may not be affecting response length significantly');
  }

  // Check truncation
  const truncatedResults = results.filter(r => r.finishReason === 'length');
  if (truncatedResults.length > 0) {
    console.log(`\n✅ ${truncatedResults.length} responses were truncated due to token limit - maxTokens is working!`);
  }

  // Temperature analysis (harder to measure programmatically)
  console.log('\n\nTemperature Analysis:');
  console.log('(Compare responses with same maxTokens but different temperatures)');
  console.log('\nLow temp (0.1) responses should be more consistent/predictable');
  console.log('High temp (1.0) responses should be more creative/varied');

  const lowTemp = results.find(r => r.temperature === 0.1 && r.maxTokens === 500);
  const highTemp = results.find(r => r.temperature === 1.0 && r.maxTokens === 500);

  if (lowTemp && highTemp) {
    console.log('\n--- Low Temperature (0.1) Response: ---');
    console.log(lowTemp.response.slice(0, 400));
    console.log('\n--- High Temperature (1.0) Response: ---');
    console.log(highTemp.response.slice(0, 400));
  }
}

main().catch(console.error);
