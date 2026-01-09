# CONV-020: RAG Integration

**Task ID:** CONV-020
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P2
**Estimated Effort:** M (4-8 hours)
**Dependencies:** CONV-005 (PersonaAgent), CONV-007 (HostAgent), DUELOGIC-005 (RAG Service)
**Status:** Ready

---

## Context

This task integrates the existing RAG retrieval service with conversation agents, allowing personas to cite research during discussions. When a conversation is started from a Duelogic proposal, agents can access relevant research citations.

**References:**
- Existing: `backend/src/services/research/rag-retrieval-service.ts`
- [CONV-005](./CONV-005.md) - PersonaAgent (has RAG hooks)
- [CONV-008](./CONV-008.md) - ConversationalOrchestrator

---

## Requirements

### Acceptance Criteria

- [ ] Enable RAG for conversations linked to proposals
- [ ] Inject citations into persona agent prompts
- [ ] Host agent can reference research in questions
- [ ] Citations appear in context board
- [ ] Handle RAG failures gracefully

---

## Implementation Guide

### Update ConversationalOrchestrator

Modify `backend/src/services/conversation/conversational-orchestrator.ts`:

```typescript
import { RAGRetrievalService } from '../research/rag-retrieval-service.js';

// Add to constructor options
interface OrchestratorOptions {
  // ... existing options ...
  enableRAG?: boolean;
}

// In initialize():
async initialize(): Promise<void> {
  // ... existing initialization ...

  // Enable RAG if session is linked to a proposal
  if (this.session.episodeProposalId) {
    await this.enableRAGForAgents();
  }
}

private async enableRAGForAgents(): Promise<void> {
  if (!this.session?.episodeProposalId) return;

  try {
    const ragService = new RAGRetrievalService(this.pool);
    const episodeId = this.session.episodeProposalId;

    // Enable RAG for host
    if (this.hostAgent) {
      // Host doesn't use RAG directly, but can reference research context
    }

    // Enable RAG for all persona agents
    for (const agent of this.personaAgents.values()) {
      agent.enableRAG(ragService, episodeId);
    }

    logger.info({
      sessionId: this.sessionId,
      episodeId,
      agentCount: this.personaAgents.size,
    }, 'RAG enabled for conversation agents');
  } catch (error) {
    logger.warn({ error }, 'Failed to enable RAG, continuing without citations');
  }
}
```

### Update PersonaAgent Prompt with Citations

Modify `backend/src/services/conversation/persona-agent.ts`:

```typescript
/**
 * Build prompt with RAG citations if available
 */
private async buildPromptWithRAG(basePrompt: string): Promise<string> {
  if (!this.isRAGEnabled()) {
    return basePrompt;
  }

  try {
    const ragContext = await this.getRAGContext(basePrompt);
    if (!ragContext) {
      return basePrompt;
    }

    return `RELEVANT RESEARCH CITATIONS:
${ragContext}

You may reference these citations in your response if relevant. Cite sources naturally in conversation (e.g., "Recent research from MIT found...").

---

${basePrompt}`;
  } catch (error) {
    logger.warn({ error }, 'Failed to get RAG context');
    return basePrompt;
  }
}

// Update generateResponse to use RAG:
async generateResponse(
  conversationContext: string,
  addressedTo?: string,
  previousSpeaker?: string
): Promise<string> {
  const basePrompt = buildResponsePrompt(
    this.persona,
    conversationContext,
    addressedTo,
    previousSpeaker,
    this.otherParticipants.map(p => p.name)
  );

  // Enhance with RAG if available
  const prompt = await this.buildPromptWithRAG(basePrompt);

  // ... rest of method ...
}
```

### Track Citations in Context Board

Update `backend/src/services/conversation/context-board-service.ts`:

```typescript
// Add to ExtractionResult interface
interface ExtractionResult {
  // ... existing fields ...
  citationsUsed: string[];
}

// Update processUtterance:
async processUtterance(utterance: ConversationUtterance): Promise<void> {
  // ... existing processing ...

  // Extract citations if present
  const citations = this.extractCitations(utterance.content);
  if (citations.length > 0) {
    this.state.citationsUsed = [
      ...(this.state.citationsUsed || []),
      ...citations,
    ];
  }
}

private extractCitations(content: string): string[] {
  // Look for common citation patterns
  const patterns = [
    /according to (.+?)[,\.]/gi,
    /research (?:from|by) (.+?)[,\.]/gi,
    /study (?:from|by|at) (.+?)[,\.]/gi,
  ];

  const citations: string[] = [];
  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        citations.push(match[1].trim());
      }
    }
  }

  return citations;
}
```

### Add Citations to Context Board State Type

Update `backend/src/types/conversation.ts`:

```typescript
export interface ContextBoardState {
  // ... existing fields ...
  citationsUsed?: string[];
}
```

---

## Validation

### How to Test

1. Create a conversation from a proposal that has research indexed

2. Verify RAG is enabled:
   ```typescript
   // In orchestrator logs
   'RAG enabled for conversation agents'
   ```

3. Check that persona responses include citations when relevant

4. Verify context board tracks citations used

### Definition of Done

- [ ] RAG enabled for proposal-linked conversations
- [ ] PersonaAgent prompts enhanced with citations
- [ ] Citations appear naturally in responses
- [ ] Context board tracks citations used
- [ ] RAG failures handled gracefully
- [ ] Logging shows RAG status
- [ ] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-020 COMPLETE</promise>
```

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
