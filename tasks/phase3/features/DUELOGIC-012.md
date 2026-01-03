# DUELOGIC-012: Web Search Integration

> **Status:** 🟢 TO DO
> **Priority:** P1 (High - Important for quality)
> **Estimate:** L (2-3 days)
> **Dependencies:** DUELOGIC-011 (Allowed Sources)
> **Sprint:** Phase 3 - Post-MVP Enhancement

---

## Overview

Enable LLMs to search the web for current information during debates. This integrates with DUELOGIC-011 (Allowed Sources) to either allow unrestricted web search or constrain searches to approved sources only.

### Current State

The current LLM implementation (`backend/src/services/llm/client.ts`) uses simple chat completion without any tool use or web search capabilities. Arguments are generated purely from the model's training data.

### Goals

1. **Default Mode**: Enable web search for grounding arguments with current information
2. **Restricted Mode**: When DUELOGIC-011 sources are specified, only search/cite those sources
3. **Citation Tracking**: Track and display sources used in arguments

---

## Requirements

### Functional Requirements

- [ ] LLMs can search the web during argument generation
- [ ] Search results are injected as context for the model
- [ ] Citations are extracted and tracked in the transcript
- [ ] Integration with DUELOGIC-011 source restrictions
- [ ] Option to disable web search entirely (pure parametric knowledge)
- [ ] Rate limiting to prevent excessive API calls

### Configuration Options

```typescript
interface WebSearchConfig {
  /** Enable web search for arguments */
  enabled: boolean;

  /** Search provider to use */
  provider: 'tavily' | 'serper' | 'brave' | 'perplexity';

  /** Max searches per argument */
  maxSearchesPerTurn: number;

  /** Max results to include in context */
  maxResultsPerSearch: number;

  /** Integrate with allowed sources (DUELOGIC-011) */
  respectAllowedSources: boolean;
}
```

---

## Implementation Approaches

### Option A: Models with Built-in Search (Simplest)

Use models that have web search built-in via OpenRouter:

**Pros:**
- No additional API keys needed
- No tool calling complexity
- Results are natively integrated

**Cons:**
- Limited to specific models (Perplexity)
- Can't restrict to allowed sources easily
- Less control over search behavior

```typescript
// backend/src/services/llm/openrouter-llm-client.ts

// Models with built-in search
const SEARCH_ENABLED_MODELS = [
  'perplexity/llama-3.1-sonar-small-128k-online',
  'perplexity/llama-3.1-sonar-large-128k-online',
  'perplexity/llama-3.1-sonar-huge-128k-online',
];

export function isSearchEnabledModel(modelId: string): boolean {
  return SEARCH_ENABLED_MODELS.some(m => modelId.includes(m));
}
```

### Option B: Tool-Based Search (Recommended)

Add a web search tool that models can invoke during generation:

**Pros:**
- Works with any model that supports tool use
- Full control over search behavior
- Can integrate with source restrictions
- Citations are structured and trackable

**Cons:**
- Requires search API integration
- More complex implementation
- Additional API costs

```typescript
// backend/src/services/search/search-tool.ts

import type { Tool } from '../../types/llm.js';

export const webSearchTool: Tool = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web for current, factual information to support arguments. Use this when you need recent data, statistics, news, or to verify claims.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query. Be specific and include relevant keywords.',
        },
        site_restriction: {
          type: 'string',
          description: 'Optional: Restrict search to a specific domain (e.g., "arxiv.org")',
        },
      },
      required: ['query'],
    },
  },
};

export const fetchSourceTool: Tool = {
  type: 'function',
  function: {
    name: 'fetch_source',
    description: 'Fetch and read the content of a specific URL to extract detailed information.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch content from',
        },
      },
      required: ['url'],
    },
  },
};
```

### Option C: RAG with Pre-Fetched Sources (Best for DUELOGIC-011)

Pre-fetch allowed sources and inject into context:

**Pros:**
- No tool calling needed
- Works with any model
- Fastest response time (no search latency)
- Full source control

**Cons:**
- Limited to pre-defined sources
- Context window limitations
- Requires source fetching infrastructure

```typescript
// backend/src/services/search/source-fetcher.ts

import * as cheerio from 'cheerio';

interface FetchedSource {
  url: string;
  title: string;
  content: string;
  fetchedAt: Date;
}

export async function fetchSourceContent(url: string): Promise<FetchedSource> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ClearSide Debate Bot/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract text content
  $('script, style, nav, footer, header').remove();
  const content = $('body').text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 15000); // Limit content length

  const title = $('title').text() || url;

  return {
    url,
    title,
    content,
    fetchedAt: new Date(),
  };
}
```

---

## Recommended Implementation

### Phase 1: Search Provider Integration

**File:** `backend/src/services/search/search-provider.ts`

```typescript
import pino from 'pino';

const logger = pino({ name: 'search-provider' });

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  publishedDate?: string;
}

export interface SearchProvider {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

export interface SearchOptions {
  maxResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
}

/**
 * Tavily Search Provider (Recommended for LLM RAG)
 * https://tavily.com
 */
export class TavilySearchProvider implements SearchProvider {
  private apiKey: string;
  private baseUrl = 'https://api.tavily.com';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TAVILY_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('Tavily API key not configured');
    }
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: options.maxResults || 5,
        include_domains: options.includeDomains,
        exclude_domains: options.excludeDomains,
        search_depth: 'advanced',
        include_raw_content: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily search failed: ${response.status}`);
    }

    const data = await response.json();

    return data.results.map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      content: r.raw_content,
      publishedDate: r.published_date,
    }));
  }
}

/**
 * Serper Search Provider (Google Results)
 * https://serper.dev
 */
export class SerperSearchProvider implements SearchProvider {
  private apiKey: string;
  private baseUrl = 'https://google.serper.dev';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SERPER_API_KEY || '';
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    // Apply domain restrictions via query modifiers
    let searchQuery = query;
    if (options.includeDomains?.length) {
      searchQuery += ` site:${options.includeDomains.join(' OR site:')}`;
    }

    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: searchQuery,
        num: options.maxResults || 5,
      }),
    });

    if (!response.ok) {
      throw new Error(`Serper search failed: ${response.status}`);
    }

    const data = await response.json();

    return (data.organic || []).map((r: any) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
    }));
  }
}

/**
 * Factory function to get configured search provider
 */
export function getSearchProvider(): SearchProvider | null {
  if (process.env.TAVILY_API_KEY) {
    return new TavilySearchProvider();
  }
  if (process.env.SERPER_API_KEY) {
    return new SerperSearchProvider();
  }
  logger.warn('No search provider configured');
  return null;
}
```

### Phase 2: Tool Calling in LLM Client

**File:** `backend/src/services/llm/tool-handler.ts`

```typescript
import type { SearchResult } from '../search/search-provider.js';
import { getSearchProvider } from '../search/search-provider.js';
import { fetchSourceContent } from '../search/source-fetcher.js';
import type { AllowedSource } from '../../types/duelogic.js';

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  content: string;
}

export class ToolHandler {
  private searchProvider = getSearchProvider();
  private allowedSources: AllowedSource[] = [];

  setAllowedSources(sources: AllowedSource[]) {
    this.allowedSources = sources;
  }

  async handleToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    return Promise.all(toolCalls.map(tc => this.handleToolCall(tc)));
  }

  private async handleToolCall(toolCall: ToolCall): Promise<ToolResult> {
    const { name, arguments: argsStr } = toolCall.function;
    const args = JSON.parse(argsStr);

    try {
      let result: string;

      switch (name) {
        case 'web_search':
          result = await this.handleWebSearch(args.query, args.site_restriction);
          break;
        case 'fetch_source':
          result = await this.handleFetchSource(args.url);
          break;
        default:
          result = `Unknown tool: ${name}`;
      }

      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        content: result,
      };
    } catch (error) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async handleWebSearch(query: string, siteRestriction?: string): Promise<string> {
    if (!this.searchProvider) {
      return 'Web search is not configured. Using training knowledge only.';
    }

    // Apply source restrictions from DUELOGIC-011
    const includeDomains = this.allowedSources.length > 0
      ? this.allowedSources.map(s => s.pattern.replace('*.', ''))
      : siteRestriction ? [siteRestriction] : undefined;

    const results = await this.searchProvider.search(query, {
      maxResults: 5,
      includeDomains,
    });

    if (results.length === 0) {
      return 'No relevant search results found.';
    }

    return this.formatSearchResults(results);
  }

  private formatSearchResults(results: SearchResult[]): string {
    return results.map((r, i) => `
[${i + 1}] ${r.title}
URL: ${r.url}
${r.snippet}
${r.content ? `\nContent excerpt: ${r.content.slice(0, 1000)}...` : ''}
`).join('\n---\n');
  }

  private async handleFetchSource(url: string): Promise<string> {
    // Check if URL is allowed
    if (this.allowedSources.length > 0) {
      const isAllowed = this.allowedSources.some(s =>
        url.includes(s.pattern.replace('*.', ''))
      );
      if (!isAllowed) {
        return `Source not in allowed list: ${url}`;
      }
    }

    const source = await fetchSourceContent(url);
    return `
Title: ${source.title}
URL: ${source.url}
Content:
${source.content}
`;
  }
}
```

### Phase 3: Integration with Chair Agent

**File:** `backend/src/services/debate/duelogic-orchestrator.ts` (Update)

```typescript
// Add to chair argument generation

import { webSearchTool, fetchSourceTool } from '../search/search-tool.js';
import { ToolHandler } from '../llm/tool-handler.js';

// In the orchestrator:
private toolHandler = new ToolHandler();

// Before generating chair argument:
if (this.config.sources?.sources?.length > 0) {
  this.toolHandler.setAllowedSources(this.config.sources.sources);
}

// When calling LLM for chair:
const tools = this.config.webSearch?.enabled
  ? [webSearchTool, fetchSourceTool]
  : undefined;

const response = await this.llmClient.complete({
  ...request,
  tools,
});

// Handle tool calls if present
if (response.toolCalls?.length) {
  const toolResults = await this.toolHandler.handleToolCalls(response.toolCalls);
  // Continue conversation with tool results...
}
```

---

## API Endpoints

Add to `backend/src/routes/duelogic-routes.ts`:

```typescript
// Test web search
router.post('/search/test', async (req, res) => {
  const { query, includeDomains } = req.body;

  const provider = getSearchProvider();
  if (!provider) {
    return res.status(503).json({
      success: false,
      message: 'No search provider configured',
    });
  }

  try {
    const results = await provider.search(query, {
      maxResults: 5,
      includeDomains,
    });
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Search failed',
    });
  }
});

// Get search provider status
router.get('/search/status', (_req, res) => {
  const provider = getSearchProvider();
  res.json({
    success: true,
    configured: !!provider,
    provider: process.env.TAVILY_API_KEY ? 'tavily' :
              process.env.SERPER_API_KEY ? 'serper' : null,
  });
});
```

---

## Environment Variables

Add to `.env.example`:

```bash
# Web Search Providers (configure ONE)
# Tavily - https://tavily.com (Recommended for RAG)
TAVILY_API_KEY=tvly-xxxx

# Serper - https://serper.dev (Google results)
SERPER_API_KEY=xxxx
```

---

## Frontend Integration

**File:** `frontend/src/components/DuelogicConfig/WebSearchSettings.tsx`

```tsx
import React from 'react';
import styles from './DuelogicConfig.module.css';

interface WebSearchSettingsProps {
  enabled: boolean;
  maxSearchesPerTurn: number;
  onEnabledChange: (enabled: boolean) => void;
  onMaxSearchesChange: (max: number) => void;
  searchAvailable: boolean;
  disabled?: boolean;
}

export const WebSearchSettings: React.FC<WebSearchSettingsProps> = ({
  enabled,
  maxSearchesPerTurn,
  onEnabledChange,
  onMaxSearchesChange,
  searchAvailable,
  disabled = false,
}) => {
  return (
    <div className={styles.webSearchSettings}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Web Search</h3>
        {!searchAvailable && (
          <span className={styles.warningBadge}>Not Configured</span>
        )}
      </div>

      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={enabled && searchAvailable}
          onChange={(e) => onEnabledChange(e.target.checked)}
          disabled={disabled || !searchAvailable}
        />
        <span>Enable web search for arguments</span>
      </label>

      {enabled && searchAvailable && (
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Max searches per turn</label>
          <input
            type="number"
            min="1"
            max="10"
            value={maxSearchesPerTurn}
            onChange={(e) => onMaxSearchesChange(parseInt(e.target.value, 10))}
            disabled={disabled}
            className={styles.input}
          />
          <p className={styles.hint}>
            Higher values may slow down argument generation
          </p>
        </div>
      )}
    </div>
  );
};
```

---

## Acceptance Criteria

- [ ] At least one search provider integrated (Tavily or Serper)
- [ ] Tool calling added to LLM client for search
- [ ] Search respects DUELOGIC-011 allowed sources
- [ ] Citations extracted and stored in transcript
- [ ] API endpoint to check search status
- [ ] Frontend WebSearchSettings component
- [ ] Environment variable documentation
- [ ] Rate limiting for search API calls
- [ ] Unit tests for search provider
- [ ] Integration test with mock search results

---

## Testing

```typescript
describe('Web Search Integration', () => {
  it('should search and return results', async () => {
    const provider = new TavilySearchProvider('test-key');
    const results = await provider.search('AI ethics');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('title');
    expect(results[0]).toHaveProperty('url');
  });

  it('should respect domain restrictions', async () => {
    const handler = new ToolHandler();
    handler.setAllowedSources([{ pattern: 'arxiv.org', name: 'arXiv' }]);

    const result = await handler.handleFetchSource('https://reddit.com');
    expect(result).toContain('not in allowed list');
  });

  it('should format search results for LLM context', () => {
    const results = [
      { title: 'Test', url: 'https://example.com', snippet: 'Content' }
    ];
    const formatted = formatSearchResults(results);
    expect(formatted).toContain('[1] Test');
    expect(formatted).toContain('https://example.com');
  });
});
```

---

## Dependencies

- `cheerio` - HTML parsing for source fetching
- Search API key (Tavily, Serper, or Brave)

## Notes

- Tavily is recommended as it's designed for LLM RAG use cases
- Consider caching search results to reduce API calls
- Monitor search API usage to stay within rate limits
- Future: Add search result quality scoring

---

*Created: 2026-01-03*
*Task ID: DUELOGIC-012*
