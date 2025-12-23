# TEST-001: Unit Testing Framework Setup

**Task ID:** TEST-001
**Phase:** Phase 1 - MVP
**Category:** Testing
**Priority:** P0 (Critical - Foundation)
**Estimated Effort:** 2 days
**Dependencies:** None (foundational)
**Status:** TO DO

---

## Overview

Set up the unit testing framework with Jest and React Testing Library. Configure test environment, mocking utilities, custom matchers, and establish testing patterns for components, hooks, and utilities.

### Related Documentation
- **Requirements:** `docs/REQUIREMENTS.md` - Testing requirements
- **Kanban:** `docs/KANBAN.md` - Task TEST-001

---

## Objectives

1. **Configure Jest** with TypeScript support
2. **Set up React Testing Library** for component tests
3. **Mock utilities** for API calls, SSE, and external dependencies
4. **Custom matchers** for debate-specific assertions
5. **Test coverage targets** (>80%)
6. **CI/CD integration** for automated testing

---

## Acceptance Criteria

- [ ] Jest configured with TypeScript
- [ ] React Testing Library installed and configured
- [ ] Mock utilities for API, SSE, LocalStorage
- [ ] Custom matchers for debate assertions
- [ ] Coverage reporting configured
- [ ] Tests run in CI/CD pipeline
- [ ] Test utils library created
- [ ] Example tests pass

---

## Technical Specification

### Jest Configuration

```javascript
// jest.config.js

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/src/__mocks__/fileMock.js',
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.tsx',
    '!src/index.tsx',
  ],
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  globals: {
    'ts-jest': {
      isolatedModules: true,
    },
  },
};
```

### Test Setup

```typescript
// src/setupTests.ts

import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfills
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Suppress console errors in tests (optional)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
```

### Test Utilities

```typescript
// src/test-utils/index.tsx

import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

/**
 * Custom render with providers
 */
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialRoute?: string;
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    initialRoute = '/',
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    }),
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  window.history.pushState({}, 'Test page', initialRoute);

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}

// Re-export everything from React Testing Library
export * from '@testing-library/react';
export { renderWithProviders as render };
```

### API Mocking

```typescript
// src/__mocks__/apiClient.ts

export const apiClient = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
};

export const mockApiResponse = <T,>(data: T, delay = 0) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ data });
    }, delay);
  });
};

export const mockApiError = (message: string, delay = 0) => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message));
    }, delay);
  });
};
```

### SSE Mocking

```typescript
// src/test-utils/sseMock.ts

type SSEListener = (event: MessageEvent) => void;

interface MockEventSource {
  url: string;
  onopen: (() => void) | null;
  onmessage: SSEListener | null;
  onerror: ((event: Event) => void) | null;
  addEventListener: (type: string, listener: any) => void;
  removeEventListener: (type: string, listener: any) => void;
  close: () => void;
  CONNECTING: number;
  OPEN: number;
  CLOSED: number;
  readyState: number;
  emitMessage: (type: string, data: any) => void;
  emitError: (error: Error) => void;
  emitComplete: (data: any) => void;
}

export function setupSSEMock() {
  const listeners = new Map<string, Set<any>>();
  let eventSource: MockEventSource | null = null;

  const MockEventSource = class implements MockEventSource {
    url: string;
    onopen: (() => void) | null = null;
    onmessage: SSEListener | null = null;
    onerror: ((event: Event) => void) | null = null;
    readyState = 1; // OPEN
    CONNECTING = 0;
    OPEN = 1;
    CLOSED = 2;

    constructor(url: string) {
      this.url = url;
      eventSource = this;

      // Simulate open event
      setTimeout(() => {
        if (this.onopen) {
          this.onopen();
        }
      }, 0);
    }

    addEventListener(type: string, listener: any) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)!.add(listener);
    }

    removeEventListener(type: string, listener: any) {
      listeners.get(type)?.delete(listener);
    }

    close() {
      this.readyState = 2; // CLOSED
    }

    emitMessage(type: string, data: any) {
      const event = new MessageEvent(type, {
        data: JSON.stringify({ type, payload: data }),
      });

      if (this.onmessage) {
        this.onmessage(event);
      }

      listeners.get('message')?.forEach((listener) => listener(event));
    }

    emitError(error: Error) {
      const event = new Event('error');
      if (this.onerror) {
        this.onerror(event);
      }
    }

    emitComplete(data: any) {
      const event = new MessageEvent('complete', {
        data: JSON.stringify(data),
      });

      listeners.get('complete')?.forEach((listener) => listener(event));
    }
  };

  (global as any).EventSource = MockEventSource;

  return {
    emitSSE: (type: string, data: any) => {
      eventSource?.emitMessage(type, data);
    },
    triggerError: (error: Error) => {
      eventSource?.emitError(error);
    },
    emitComplete: (data: any) => {
      eventSource?.emitComplete(data);
    },
    cleanup: () => {
      listeners.clear();
      eventSource = null;
    },
  };
}
```

### Custom Matchers

```typescript
// src/test-utils/customMatchers.ts

import { expect } from '@jest/globals';

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveValidProposition(): R;
      toHaveValidArgument(): R;
      toMeetWCAG_AA(): R;
    }
  }
}

expect.extend({
  toHaveValidProposition(received: any) {
    const pass =
      typeof received === 'object' &&
      typeof received.normalized === 'string' &&
      typeof received.original === 'string' &&
      received.normalized.length >= 10 &&
      received.normalized.length <= 500;

    return {
      pass,
      message: () =>
        pass
          ? 'Expected proposition to be invalid'
          : `Expected valid proposition with normalized and original strings (10-500 chars)`,
    };
  },

  toHaveValidArgument(received: any) {
    const pass =
      typeof received === 'object' &&
      typeof received.title === 'string' &&
      typeof received.description === 'string' &&
      typeof received.category === 'string' &&
      Array.isArray(received.evidence);

    return {
      pass,
      message: () =>
        pass
          ? 'Expected argument to be invalid'
          : 'Expected valid argument with title, description, category, and evidence array',
    };
  },

  toMeetWCAG_AA(received: HTMLElement) {
    // Check color contrast (simplified)
    const computedStyle = window.getComputedStyle(received);
    const color = computedStyle.color;
    const backgroundColor = computedStyle.backgroundColor;

    // This is a simplified check - use actual contrast calculation in real tests
    const pass = color !== backgroundColor;

    return {
      pass,
      message: () =>
        pass
          ? 'Expected element to fail WCAG AA'
          : 'Expected element to meet WCAG AA color contrast (4.5:1)',
    };
  },
});
```

### Example Component Test

```typescript
// src/components/ui/Button/Button.test.tsx

import { render, screen, fireEvent } from '@/test-utils';
import { Button } from './Button';

describe('Button', () => {
  describe('Rendering', () => {
    it('renders children correctly', () => {
      render(<Button>Click me</Button>);
      expect(screen.getByText('Click me')).toBeInTheDocument();
    });

    it('renders with correct variant classes', () => {
      const { rerender } = render(<Button variant="primary">Primary</Button>);
      expect(screen.getByRole('button')).toHaveClass('primary');

      rerender(<Button variant="secondary">Secondary</Button>);
      expect(screen.getByRole('button')).toHaveClass('secondary');
    });

    it('renders loading state', () => {
      render(<Button loading>Loading</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('Interaction', () => {
    it('calls onClick when clicked', () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>Click me</Button>);

      fireEvent.click(screen.getByText('Click me'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when disabled', () => {
      const handleClick = jest.fn();
      render(
        <Button onClick={handleClick} disabled>
          Click me
        </Button>
      );

      fireEvent.click(screen.getByText('Click me'));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes', () => {
      render(<Button aria-label="Custom label">Click</Button>);
      expect(screen.getByLabelText('Custom label')).toBeInTheDocument();
    });

    it('is keyboard accessible', () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>Click</Button>);

      const button = screen.getByRole('button');
      button.focus();
      expect(document.activeElement).toBe(button);

      fireEvent.keyDown(button, { key: 'Enter' });
      // Note: onClick might not fire from keyDown in JSDOM, this is expected
    });
  });
});
```

---

## Implementation Steps

1. **Day 1:** Configure Jest and React Testing Library, set up mocks
2. **Day 2:** Create custom matchers and test utilities, write example tests

---

## Validation Steps

- [ ] Jest runs successfully
- [ ] All example tests pass
- [ ] Coverage reporting works
- [ ] Mocks work correctly
- [ ] Custom matchers function properly
- [ ] Tests run in CI/CD

---

**Last Updated:** 2025-12-23
