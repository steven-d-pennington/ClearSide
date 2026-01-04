
export interface PerplexityConfig {
    model: string;
    fallbackModel: string;
    searchRecencyFilter: 'day' | 'week' | 'month' | 'year';
    returnCitations: boolean;
    maxTokens: number;
    temperature: number;
}

export const DEFAULT_PERPLEXITY_CONFIG: PerplexityConfig = {
    model: 'perplexity/sonar-pro',
    fallbackModel: 'perplexity/sonar',
    searchRecencyFilter: 'week',
    returnCitations: true,
    maxTokens: 4000,
    temperature: 0.7,
};

// Perplexity models available via OpenRouter
export const PERPLEXITY_MODELS = {
    'sonar-pro': 'perplexity/sonar-pro',
    'sonar-reasoning-pro': 'perplexity/sonar-reasoning-pro',
    'sonar': 'perplexity/sonar',
    'sonar-reasoning': 'perplexity/sonar-reasoning',
} as const;
