/**
 * Metadata Generator
 *
 * Generates podcast episode metadata (title, description, tags) using LLM.
 * Uses Gemini Flash 1.5 for cost-effective, high-quality metadata generation.
 */

import { createLogger } from '../../utils/logger.js';
import { createOpenRouterClient, type OpenRouterLLMClient } from '../llm/openrouter-adapter.js';
import type { RefinedPodcastScript } from '../../types/podcast-export.js';

const logger = createLogger({ module: 'MetadataGenerator' });

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

    const durationMinutes = Math.max(1, Math.round(script.durationEstimateSeconds / 60));

    const transcriptExcerpt = script.segments
      .slice(0, 5)
      .map((segment) => segment.text)
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

      const metadata = JSON.parse(response.content);

      if (!metadata.title || !metadata.description || !Array.isArray(metadata.tags)) {
        throw new Error('Invalid metadata structure from LLM');
      }

      const result: EpisodeMetadata = {
        title: String(metadata.title).slice(0, 255),
        description: String(metadata.description).slice(0, 2000),
        tags: metadata.tags.map((tag: string) => String(tag).trim()).filter(Boolean).slice(0, 10),
        explicit: Boolean(metadata.explicit),
      };

      logger.info({
        title: result.title,
        tagCount: result.tags.length,
      }, 'Metadata generated successfully');

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, topic }, 'Failed to generate metadata');
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

export function createMetadataGenerator(): MetadataGenerator {
  return new MetadataGenerator();
}
