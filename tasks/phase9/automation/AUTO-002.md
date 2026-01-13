# AUTO-002: Metadata Generation Service

**Task ID:** AUTO-002
**Phase:** Phase 9
**Category:** Podcast Automation
**Priority:** P0
**Estimated Effort:** S (2-3 hours)
**Dependencies:** None
**Status:** Ready

---

## Context

When conversations complete, the automation pipeline needs to generate podcast episode metadata (title, description, tags) using an LLM. This ensures every episode has professional, SEO-optimized metadata without manual input.

**References:**
- Existing LLM client: `backend/src/services/llm/openrouter-adapter.ts`
- OpenRouter documentation for Gemini Flash
- Conversation types: Normal, Rapid Fire, Model Debate

---

## Requirements

### Acceptance Criteria

- [ ] Create `MetadataGenerator` service class
- [ ] Uses existing `OpenRouterLLMClient` with Gemini Flash 1.5
- [ ] Generates episode title (5-10 words, engaging)
- [ ] Generates episode description (2-3 sentences)
- [ ] Generates 5-7 relevant tags
- [ ] Includes conversation mode context in metadata
- [ ] Cost: ~$0.01 per episode
- [ ] Test with all three conversation modes

### Functional Requirements

**Metadata Quality:**
- Title: Engaging but not clickbait, includes topic
- Description: Summarizes key discussion points, mentions participants
- Tags: Relevant to topic and debate format
- Mode awareness: "Rapid Fire", "Model Debate", or omit for normal

**LLM Configuration:**
- Model: `google/gemini-flash-1.5` (fast, cheap)
- Temperature: 0.7 (balanced creativity)
- Max tokens: 500 (sufficient for metadata)
- Response format: JSON

---

## Implementation

### 1. Metadata Generator Service

**File:** `backend/src/services/podcast/metadata-generator.ts` (new)

```typescript
/**
 * Metadata Generator
 *
 * Generates podcast episode metadata (title, description, tags) using LLM.
 * Uses Gemini Flash 1.5 for cost-effective, high-quality metadata generation.
 */

import pino from 'pino';
import { createOpenRouterClient, OpenRouterLLMClient } from '../llm/openrouter-adapter.js';
import type { RefinedPodcastScript } from '../../types/podcast-export.js';

const logger = pino({
  name: 'metadata-generator',
  level: process.env.LOG_LEVEL || 'info',
});

export interface EpisodeMetadata {
  title: string;
  description: string;
  tags: string[];
  explicit: boolean;
}

export interface GenerateMetadataOptions {
  topic: string;
  participants: string[];
  mode: 'normal' | 'rapid_fire' | 'model_debate';
  script: RefinedPodcastScript;
}

export class MetadataGenerator {
  private llm: OpenRouterLLMClient;

  constructor() {
    this.llm = createOpenRouterClient('google/gemini-flash-1.5');
  }

  /**
   * Generate episode metadata from conversation script
   */
  async generateMetadata(options: GenerateMetadataOptions): Promise<EpisodeMetadata> {
    const { topic, participants, mode, script } = options;

    const modeLabel = {
      normal: 'in-depth exploration',
      rapid_fire: 'quick-fire discussion',
      model_debate: 'AI model comparison',
    }[mode];

    const durationMinutes = Math.round(script.durationEstimateSeconds / 60);

    // Extract transcript excerpt (first 3 segments for context)
    const transcriptExcerpt = script.segments
      .slice(0, 5)
      .map(s => s.text)
      .join(' ')
      .slice(0, 800);

    const prompt = `Generate podcast episode metadata for an AI-powered conversational podcast.

**Episode Details:**
- Topic: ${topic}
- Participants: ${participants.join(', ')}
- Format: ${modeLabel}
- Duration: ~${durationMinutes} minutes

**Transcript Excerpt:**
${transcriptExcerpt}...

**Instructions:**
Generate professional podcast metadata in JSON format with:

1. **title**: Engaging episode title (5-10 words)
   - Include the main topic
   - Make it interesting but not clickbait
   - Example: "The Future of AI Regulation: A Heated Debate"

2. **description**: Episode summary (2-3 sentences, 150-200 characters)
   - Summarize key discussion points
   - Mention participants if notable
   - Include conversation format if relevant (${modeLabel})

3. **tags**: Array of 5-7 relevant keywords
   - Topics discussed
   - Relevant categories (e.g., "technology", "politics", "ethics")
   - Format type (e.g., "debate", "AI", "podcast")

4. **explicit**: Boolean (true if contains profanity or mature content)

Output ONLY valid JSON in this exact format:
{
  "title": "Episode Title Here",
  "description": "Episode description here.",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "explicit": false
}`;

    try {
      logger.info({ topic, mode }, 'Generating episode metadata');

      const response = await this.llm.complete({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        maxTokens: 500,
      });

      // Parse JSON response
      const metadata = JSON.parse(response.content);

      // Validate structure
      if (!metadata.title || !metadata.description || !Array.isArray(metadata.tags)) {
        throw new Error('Invalid metadata structure from LLM');
      }

      // Sanitize and validate
      const result: EpisodeMetadata = {
        title: metadata.title.slice(0, 255), // Max length for DB
        description: metadata.description.slice(0, 2000),
        tags: metadata.tags.slice(0, 10), // Max 10 tags
        explicit: Boolean(metadata.explicit),
      };

      logger.info({
        title: result.title,
        tagCount: result.tags.length,
      }, 'Metadata generated successfully');

      return result;

    } catch (error: any) {
      logger.error({ error: error.message, topic }, 'Failed to generate metadata');

      // Fallback to template-based metadata
      return this.generateFallbackMetadata(options);
    }
  }

  /**
   * Generate fallback metadata if LLM fails
   */
  private generateFallbackMetadata(options: GenerateMetadataOptions): EpisodeMetadata {
    const { topic, participants, mode } = options;

    const modeLabel = {
      normal: '',
      rapid_fire: ' - Rapid Fire',
      model_debate: ' - AI Model Debate',
    }[mode];

    return {
      title: `${topic}${modeLabel}`,
      description: `A conversational podcast exploring ${topic} with ${participants.join(' and ')}.`,
      tags: ['podcast', 'debate', 'AI', 'conversation'],
      explicit: false,
    };
  }
}

/**
 * Factory function
 */
export function createMetadataGenerator(): MetadataGenerator {
  return new MetadataGenerator();
}
```

---

## Testing

### Test 1: Normal Conversation

```typescript
import { createMetadataGenerator } from './metadata-generator.js';

const generator = createMetadataGenerator();

const metadata = await generator.generateMetadata({
  topic: 'Should AI be regulated at the state or federal level?',
  participants: ['James "JB" Buchanan', 'Luna Nakamura'],
  mode: 'normal',
  script: mockScript, // RefinedPodcastScript
});

console.log('Title:', metadata.title);
console.log('Description:', metadata.description);
console.log('Tags:', metadata.tags);
console.log('Explicit:', metadata.explicit);
```

**Expected Output:**
```
Title: State vs Federal AI Regulation: A Constitutional Debate
Description: Judge James Buchanan and artist Luna Nakamura explore the tension between state innovation and federal coherence in AI regulation, examining constitutional frameworks and real-world impact.
Tags: ["AI regulation", "federalism", "technology policy", "debate", "law"]
Explicit: false
```

### Test 2: Rapid Fire Mode

```typescript
const metadata = await generator.generateMetadata({
  topic: 'The Regulatory Rebellion',
  participants: ['JB', 'Luna'],
  mode: 'rapid_fire',
  script: mockScript,
});

// Should include "Rapid Fire" or "Quick Discussion" in title or description
```

### Test 3: Model Debate Mode

```typescript
const metadata = await generator.generateMetadata({
  topic: 'Climate Change Solutions',
  participants: ['Claude Sonnet 4.5', 'GPT-4o'],
  mode: 'model_debate',
  script: mockScript,
});

// Should indicate it's an AI model comparison
```

### Test 4: Fallback on LLM Failure

```typescript
// Mock LLM failure
jest.spyOn(llm, 'complete').mockRejectedValue(new Error('API Error'));

const metadata = await generator.generateMetadata(options);

// Should return fallback metadata, not throw error
expect(metadata.title).toBe('Should AI be regulated at the state or federal level?');
```

---

## Definition of Done

- [ ] `MetadataGenerator` class implemented
- [ ] Uses Gemini Flash 1.5 via OpenRouter
- [ ] Generates title, description, tags, explicit flag
- [ ] Handles all three conversation modes
- [ ] Fallback metadata on LLM failure
- [ ] JSON parsing with validation
- [ ] Unit tests for all modes
- [ ] Cost: ~$0.01 per generation (verified)
- [ ] Documentation with examples

---

## Notes

**Prompt Engineering:**
- Requesting JSON output for easy parsing
- Providing transcript excerpt for context
- Specifying desired format and length
- Temperature 0.7 balances creativity and consistency

**Cost Analysis:**
- Gemini Flash 1.5: $0.000001/token input, $0.0000002/token output
- Typical request: ~500 input tokens, ~200 output tokens
- Cost per episode: ~$0.0005 + $0.00004 = **$0.00054** (~$0.01 with overhead)
