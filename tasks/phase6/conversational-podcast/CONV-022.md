# CONV-022: Testing and Refinement

**Task ID:** CONV-022
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P1
**Estimated Effort:** L (8-16 hours)
**Dependencies:** All CONV-001 through CONV-021
**Status:** Ready

---

## Context

This task covers end-to-end testing of the conversational podcast feature, integration testing, bug fixes, and refinements based on testing results.

**References:**
- All CONV-* task files
- Existing test patterns in `backend/src/**/__tests__/`

---

## Requirements

### Acceptance Criteria

- [ ] End-to-end workflow tested manually
- [ ] Unit tests for all services with >80% coverage
- [ ] Integration tests for API routes
- [ ] SSE streaming tested across browsers
- [ ] Performance tested with 6 participants
- [ ] Edge cases handled (disconnections, errors)
- [ ] Documentation updated

---

## Implementation Guide

### End-to-End Test Scenarios

#### Scenario 1: Basic Conversation Flow

1. Create conversation from homepage
2. Select 3 personas with different models
3. Enter topic and launch
4. Verify host introduces all guests
5. Advance through 10 turns manually
6. Verify each persona responds in character
7. Change to auto-stream mode
8. Let conversation complete
9. Export transcript
10. Verify markdown is correct

#### Scenario 2: Proposal-Linked Conversation

1. Create approved episode proposal
2. Ensure research is indexed
3. Launch conversation from proposal
4. Verify topic pre-filled
5. Verify RAG citations appear in responses
6. Complete conversation
7. Export to podcast
8. Verify voice assignments include host

#### Scenario 3: Flow Mode Changes

1. Start in manual mode
2. Advance 5 turns
3. Switch to natural pace (5s delay)
4. Verify delays between turns
5. Switch to auto-stream
6. Verify rapid progression
7. Pause conversation
8. Resume conversation
9. Complete successfully

#### Scenario 4: Error Handling

1. Start conversation
2. Disconnect SSE (close browser)
3. Reconnect
4. Verify conversation state preserved
5. Simulate model error
6. Verify graceful handling
7. Verify conversation can continue

### Unit Test Files

#### PersonaAgent Tests

Create `backend/src/services/conversation/__tests__/persona-agent.test.ts`:

```typescript
import { PersonaAgent } from '../persona-agent';

describe('PersonaAgent', () => {
  describe('constructor', () => {
    it('should initialize with persona data', () => {
      // Test persona initialization
    });

    it('should build system prompt from persona', () => {
      // Test prompt building
    });
  });

  describe('generateResponse', () => {
    it('should generate character-consistent response', async () => {
      // Mock LLM client, verify prompt structure
    });

    it('should include direct addressing when specified', async () => {
      // Test addressing other participants
    });
  });

  describe('evaluateSpeakingDesire', () => {
    it('should return signal when persona wants to speak', async () => {
      // Test signal generation
    });

    it('should return null when no desire to speak', async () => {
      // Test null case
    });
  });

  describe('RAG integration', () => {
    it('should enable RAG when called', () => {
      // Test RAG enable
    });

    it('should inject citations into prompts', async () => {
      // Test citation injection
    });
  });
});
```

#### ContextBoardService Tests

Create `backend/src/services/conversation/__tests__/context-board-service.test.ts`:

```typescript
import { ContextBoardService } from '../context-board-service';

describe('ContextBoardService', () => {
  describe('processUtterance', () => {
    it('should extract topics from utterances', async () => {
      // Test topic extraction
    });

    it('should extract claims with stance', async () => {
      // Test claim extraction
    });

    it('should track agreements', async () => {
      // Test agreement tracking
    });
  });

  describe('signal queue', () => {
    it('should add signals to queue', () => {
      // Test signal adding
    });

    it('should prioritize by urgency', () => {
      // Test priority ordering
    });

    it('should consume signals correctly', () => {
      // Test signal consumption
    });
  });
});
```

#### Orchestrator Tests

Create `backend/src/services/conversation/__tests__/conversational-orchestrator.test.ts`:

```typescript
import { ConversationalOrchestrator } from '../conversational-orchestrator';

describe('ConversationalOrchestrator', () => {
  describe('initialization', () => {
    it('should load session and participants', async () => {
      // Test initialization
    });

    it('should create all agents', async () => {
      // Test agent creation
    });
  });

  describe('flow control', () => {
    it('should wait for advance in manual mode', async () => {
      // Test manual mode
    });

    it('should auto-progress in auto-stream mode', async () => {
      // Test auto-stream
    });

    it('should pause and resume correctly', async () => {
      // Test pause/resume
    });
  });

  describe('conversation phases', () => {
    it('should run opening phase', async () => {
      // Test opening
    });

    it('should run main loop', async () => {
      // Test main loop
    });

    it('should run closing phase', async () => {
      // Test closing
    });
  });
});
```

### Integration Tests

Create `backend/src/routes/__tests__/conversation-routes.test.ts`:

```typescript
import request from 'supertest';
import { app } from '../../app';

describe('Conversation Routes', () => {
  describe('GET /api/conversations/personas', () => {
    it('should return all 12 personas', async () => {
      const res = await request(app).get('/api/conversations/personas');
      expect(res.status).toBe(200);
      expect(res.body.personas).toHaveLength(12);
    });
  });

  describe('POST /api/conversations/sessions', () => {
    it('should create session with valid data', async () => {
      const res = await request(app)
        .post('/api/conversations/sessions')
        .send({
          topic: 'Test topic',
          flowMode: 'manual',
          participants: [
            { personaId: '...', modelId: 'anthropic/claude-sonnet-4' },
            { personaId: '...', modelId: 'openai/gpt-4o' },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.session.id).toBeDefined();
    });

    it('should reject less than 2 participants', async () => {
      const res = await request(app)
        .post('/api/conversations/sessions')
        .send({
          topic: 'Test',
          participants: [{ personaId: '...', modelId: '...' }],
        });
      expect(res.status).toBe(400);
    });
  });

  describe('SSE streaming', () => {
    it('should establish SSE connection', async () => {
      // Test SSE connection establishment
    });

    it('should receive events during conversation', async () => {
      // Test event reception
    });
  });
});
```

### Performance Testing

```typescript
// Test with 6 participants
describe('Performance', () => {
  it('should handle 6 participants without timeout', async () => {
    // Create session with 6 participants
    // Launch and verify all respond
    // Check response times are acceptable (<30s per turn)
  });

  it('should handle rapid auto-stream mode', async () => {
    // Run in auto-stream with 500ms delays
    // Complete 20 turns
    // Verify no memory leaks or errors
  });
});
```

### Browser Testing Checklist

- [ ] Chrome: SSE, controls, transcript
- [ ] Firefox: SSE reconnection
- [ ] Safari: SSE compatibility
- [ ] Mobile Chrome: responsive layout
- [ ] Mobile Safari: controls work

### Documentation Updates

1. Update `docs/FUTURE-FEATURES.md` with completed feature
2. Add user guide section for conversations
3. Update API documentation with new endpoints

---

## Validation

### How to Test

1. Run all unit tests:
   ```bash
   cd backend && npm test -- --grep "Conversation"
   ```

2. Run integration tests:
   ```bash
   cd backend && npm run test:integration
   ```

3. Manual end-to-end testing following scenarios above

4. Performance testing with 6 participants

### Definition of Done

- [ ] All E2E scenarios pass
- [ ] Unit test coverage >80%
- [ ] Integration tests pass
- [ ] SSE works across browsers
- [ ] 6-participant conversations work
- [ ] Error handling verified
- [ ] Documentation updated
- [ ] No critical bugs remaining
- [ ] Performance acceptable

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-022 COMPLETE</promise>
```

---

**Estimated Time:** 8-16 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
