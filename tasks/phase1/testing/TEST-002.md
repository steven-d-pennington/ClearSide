# TEST-002: Integration Testing

**Task ID:** TEST-002
**Phase:** Phase 1 - MVP
**Category:** Testing
**Priority:** P0 (Critical - Quality Assurance)
**Estimated Effort:** 3 days
**Dependencies:** TEST-001, AGENT-001 through AGENT-005, UI-001, UI-002
**Status:** TO DO

---

## Overview

Implement integration tests that verify the complete debate generation flow from user input through agent processing to results display. Test the interaction between components, API calls, SSE streaming, and state management.

### Related Documentation
- **Requirements:** `docs/REQUIREMENTS.md` - Integration testing requirements
- **Kanban:** `docs/KANBAN.md` - Task TEST-002

---

## Objectives

1. **End-to-end flow testing** (Input → Analysis → Results)
2. **API integration tests** with MSW (Mock Service Worker)
3. **SSE streaming tests** for real-time updates
4. **State management tests** with Zustand
5. **Error scenario testing** (network failures, timeouts)
6. **Challenge flow testing** (user challenges arguments)

---

## Acceptance Criteria

- [ ] Complete debate flow tested from input to output
- [ ] API calls mocked with MSW
- [ ] SSE streaming tested with mock events
- [ ] State updates verified throughout flow
- [ ] Error scenarios handled correctly
- [ ] Challenge flow works end-to-end
- [ ] All integration tests pass
- [ ] Test coverage > 70% for integration paths

---

## Technical Specification

### MSW Setup

```typescript
// src/test-utils/mswServer.ts

import { setupServer } from 'msw/node';
import { rest } from 'msw';
import { debateHandlers } from './mswHandlers';

// Create MSW server
export const server = setupServer(...debateHandlers);

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

// Reset handlers after each test
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());
```

```typescript
// src/test-utils/mswHandlers.ts

import { rest } from 'msw';

const API_BASE = 'http://localhost:3001/api';

export const debateHandlers = [
  // POST /api/analyze - Start analysis
  rest.post(`${API_BASE}/analyze`, async (req, res, ctx) => {
    const { question, context } = await req.json();

    return res(
      ctx.delay(100),
      ctx.status(200),
      ctx.json({
        sessionId: 'test-session-123',
        proposition: {
          normalized: question,
          original: question,
        },
      })
    );
  }),

  // GET /api/analyze/:sessionId/stream - SSE endpoint
  rest.get(`${API_BASE}/analyze/:sessionId/stream`, (req, res, ctx) => {
    // MSW doesn't support SSE natively, use EventSource mock instead
    return res(ctx.status(200));
  }),

  // POST /api/challenge - Submit challenge
  rest.post(`${API_BASE}/challenge`, async (req, res, ctx) => {
    const { challengeType, challengeText } = await req.json();

    return res(
      ctx.delay(100),
      ctx.status(200),
      ctx.json({
        challengeId: 'challenge-123',
        response: 'Mock challenge response',
        additionalEvidence: ['Evidence 1', 'Evidence 2'],
        limitations: ['Limitation 1'],
      })
    );
  }),
];

// Error handlers for testing error scenarios
export const errorHandlers = [
  rest.post(`${API_BASE}/analyze`, (req, res, ctx) => {
    return res(
      ctx.delay(100),
      ctx.status(500),
      ctx.json({ error: 'Internal server error' })
    );
  }),
];

// Timeout handlers
export const timeoutHandlers = [
  rest.post(`${API_BASE}/analyze`, (req, res, ctx) => {
    return res(ctx.delay(31000)); // Exceed 30s timeout
  }),
];
```

### Complete Flow Integration Test

```typescript
// src/__tests__/integration/debateFlow.test.tsx

import { render, screen, waitFor, within } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { server } from '@/test-utils/mswServer';
import { setupSSEMock } from '@/test-utils/sseMock';

describe('Debate Flow Integration', () => {
  const sseMock = setupSSEMock();

  afterEach(() => {
    sseMock.cleanup();
  });

  it('completes full debate generation flow', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Step 1: User enters question
    const questionInput = screen.getByLabelText(/your question/i);
    await user.type(
      questionInput,
      'Should we implement a moratorium on AI data centers?'
    );

    // Step 2: User submits form
    const submitButton = screen.getByRole('button', { name: /analyze/i });
    await user.click(submitButton);

    // Step 3: Loading state appears
    await waitFor(() => {
      expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
    });

    // Step 4: Proposition streams in
    sseMock.emitSSE('proposition', {
      normalized: 'Should we implement a moratorium on AI data centers?',
      original: 'Should we implement a moratorium on AI data centers?',
    });

    await waitFor(() => {
      expect(
        screen.getByText('Should we implement a moratorium on AI data centers?')
      ).toBeInTheDocument();
    });

    // Step 5: Pro arguments stream in
    sseMock.emitSSE('pro', {
      summary: 'Arguments in favor of the moratorium',
      arguments: [
        {
          id: 'pro-1',
          title: 'Environmental Protection',
          description: 'Reduces carbon emissions',
          category: 'environmental',
          evidence: [],
        },
      ],
      assumptions: ['Energy costs will rise'],
      uncertainties: ['Timeline for renewable energy'],
    });

    await waitFor(() => {
      expect(screen.getByText('Environmental Protection')).toBeInTheDocument();
    });

    // Step 6: Con arguments stream in
    sseMock.emitSSE('con', {
      summary: 'Arguments against the moratorium',
      arguments: [
        {
          id: 'con-1',
          title: 'Economic Impact',
          description: 'Could slow technological progress',
          category: 'economic',
          evidence: [],
        },
      ],
      assumptions: ['AI development is critical'],
      uncertainties: ['Economic forecasts'],
    });

    await waitFor(() => {
      expect(screen.getByText('Economic Impact')).toBeInTheDocument();
    });

    // Step 7: Moderator synthesis streams in
    sseMock.emitSSE('moderator', {
      summary: 'Balanced synthesis of both sides',
      agreements: ['Both sides value long-term sustainability'],
      disagreements: ['Timeframe for action'],
      hinges: ['Cost of renewable energy transition'],
    });

    await waitFor(() => {
      expect(screen.getByText('Balanced synthesis')).toBeInTheDocument();
    });

    // Step 8: Complete event
    sseMock.emitComplete({
      proposition: {},
      pro: {},
      con: {},
      moderator: {},
    });

    await waitFor(() => {
      expect(screen.getByText(/analysis complete/i)).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    const user = userEvent.setup();

    // Override with error handler
    server.use(
      rest.post('http://localhost:3001/api/analyze', (req, res, ctx) => {
        return res(ctx.status(500), ctx.json({ error: 'Server error' }));
      })
    );

    render(<App />);

    const questionInput = screen.getByLabelText(/your question/i);
    await user.type(questionInput, 'Test question for error handling?');

    const submitButton = screen.getByRole('button', { name: /analyze/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/analysis failed/i)).toBeInTheDocument();
    });
  });

  it('handles SSE connection errors', async () => {
    const user = userEvent.setup();
    render(<App />);

    const questionInput = screen.getByLabelText(/your question/i);
    await user.type(questionInput, 'Test question?');

    const submitButton = screen.getByRole('button', { name: /analyze/i });
    await user.click(submitButton);

    // Trigger SSE error
    sseMock.triggerError(new Error('Connection failed'));

    await waitFor(() => {
      expect(screen.getByText(/connection lost/i)).toBeInTheDocument();
    });
  });
});
```

### Challenge Flow Integration Test

```typescript
// src/__tests__/integration/challengeFlow.test.tsx

import { render, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { ResultsDisplay } from '@/components/ResultsDisplay';
import { setupSSEMock } from '@/test-utils/sseMock';

describe('Challenge Flow Integration', () => {
  const sseMock = setupSSEMock();

  const mockDebateOutput = {
    proposition: {
      normalized: 'Should we implement a moratorium?',
      original: 'Should we implement a moratorium?',
    },
    pro: {
      arguments: [
        {
          id: 'pro-1',
          title: 'Environmental Protection',
          description: 'Reduces emissions',
          category: 'environmental',
        },
      ],
    },
    con: { arguments: [] },
    moderator: {},
  };

  beforeEach(() => {
    sseMock.emitSSE('proposition', mockDebateOutput.proposition);
    sseMock.emitSSE('pro', mockDebateOutput.pro);
  });

  afterEach(() => {
    sseMock.cleanup();
  });

  it('allows user to challenge an argument', async () => {
    const user = userEvent.setup();
    render(<ResultsDisplay sessionId="test-session" />);

    // Wait for argument to appear
    await waitFor(() => {
      expect(screen.getByText('Environmental Protection')).toBeInTheDocument();
    });

    // Click challenge button
    const challengeButton = screen.getByRole('button', { name: /challenge/i });
    await user.click(challengeButton);

    // Modal should open
    await waitFor(() => {
      expect(screen.getByText(/challenge argument/i)).toBeInTheDocument();
    });

    // Select challenge type
    const evidenceOption = screen.getByLabelText(/request more evidence/i);
    await user.click(evidenceOption);

    // Enter challenge text
    const textarea = screen.getByPlaceholderText(/what specific evidence/i);
    await user.type(textarea, 'What data supports the emissions claim?');

    // Submit challenge
    const submitButton = screen.getByRole('button', { name: /submit challenge/i });
    await user.click(submitButton);

    // Verify challenge response appears
    await waitFor(() => {
      expect(screen.getByText(/mock challenge response/i)).toBeInTheDocument();
    });
  });
});
```

### State Management Integration Test

```typescript
// src/__tests__/integration/stateManagement.test.tsx

import { renderHook, act, waitFor } from '@testing-library/react';
import { useDebateStore } from '@/stores/debateStore';

describe('State Management Integration', () => {
  beforeEach(() => {
    // Clear store before each test
    useDebateStore.getState().clearSession();
  });

  it('manages debate session state correctly', () => {
    const { result } = renderHook(() => useDebateStore());

    // Initial state
    expect(result.current.currentSessionId).toBeNull();
    expect(result.current.currentProposition).toBeNull();

    // Set session
    act(() => {
      result.current.setCurrentSession('session-123', {
        normalized: 'Test proposition',
        original: 'Test proposition',
      });
    });

    expect(result.current.currentSessionId).toBe('session-123');
    expect(result.current.currentProposition).toEqual({
      normalized: 'Test proposition',
      original: 'Test proposition',
    });

    // Clear session
    act(() => {
      result.current.clearSession();
    });

    expect(result.current.currentSessionId).toBeNull();
    expect(result.current.currentProposition).toBeNull();
  });
});
```

---

## Implementation Steps

1. **Day 1:** Set up MSW, create API mock handlers
2. **Day 2:** Write complete debate flow integration tests
3. **Day 3:** Test error scenarios, challenge flow, state management

---

## Validation Steps

- [ ] All integration tests pass
- [ ] API mocks work correctly
- [ ] SSE streaming tested
- [ ] Error scenarios covered
- [ ] State management verified
- [ ] Coverage > 70% for integration paths

---

**Last Updated:** 2025-12-23
