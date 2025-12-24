/**
 * Logging Service Tests
 * Tests for logger, log helpers, error tracking, and middleware
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  logger,
  createDebateLogger,
  createAgentLogger,
  createLogger,
  loggers,
  startTimer,
  loggedOperation,
  initializeErrorTracking,
  captureError,
  captureMessage,
  setUserContext,
  setDebateContext,
  isErrorTrackingEnabled,
} from '../src/services/logging/index.js';

describe('Logger', () => {
  describe('Core Logger', () => {
    it('should create logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should respect log level from environment', () => {
      expect(logger.level).toBeDefined();
      // Log level should be either from env or default
      expect(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).toContain(logger.level);
    });
  });

  describe('Child Loggers', () => {
    it('should create debate logger with context', () => {
      const debateLogger = createDebateLogger('test-debate-123');
      expect(debateLogger).toBeDefined();
      // Verify it's a child logger (has bindings)
      expect((debateLogger as any).bindings).toBeDefined();
    });

    it('should create agent logger with context', () => {
      const proLogger = createAgentLogger('pro');
      expect(proLogger).toBeDefined();
      expect((proLogger as any).bindings).toBeDefined();

      const conLogger = createAgentLogger('con');
      expect(conLogger).toBeDefined();

      const moderatorLogger = createAgentLogger('moderator');
      expect(moderatorLogger).toBeDefined();

      const orchestratorLogger = createAgentLogger('orchestrator');
      expect(orchestratorLogger).toBeDefined();
    });

    it('should create custom logger with context', () => {
      const customLogger = createLogger({ userId: 'user-123', sessionId: 'session-456' });
      expect(customLogger).toBeDefined();
      expect((customLogger as any).bindings).toBeDefined();
    });
  });
});

describe('Structured Logging Helpers', () => {
  // Spy on logger methods
  let infoSpy: any;
  let errorSpy: any;
  let debugSpy: any;
  let warnSpy: any;

  beforeEach(() => {
    infoSpy = vi.spyOn(logger, 'info');
    errorSpy = vi.spyOn(logger, 'error');
    debugSpy = vi.spyOn(logger, 'debug');
    warnSpy = vi.spyOn(logger, 'warn');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('stateTransition', () => {
    it('should log state transitions', () => {
      loggers.stateTransition('debate-123', 'PHASE_1', 'PHASE_2', 1500);

      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'state_machine',
          debateId: 'debate-123',
          from: 'PHASE_1',
          to: 'PHASE_2',
          duration_ms: 1500,
          event: 'transition',
        }),
        expect.any(String)
      );
    });

    it('should log state transitions without duration', () => {
      loggers.stateTransition('debate-456', 'OPENING', 'REBUTTAL');

      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'state_machine',
          debateId: 'debate-456',
          from: 'OPENING',
          to: 'REBUTTAL',
        }),
        expect.any(String)
      );
    });
  });

  describe('agentCall', () => {
    it('should log successful agent calls', () => {
      loggers.agentCall({
        debateId: 'debate-123',
        agent: 'pro',
        phase: 'phase_1_opening',
        model: 'claude-sonnet-4-5',
        latency_ms: 2500,
        tokens: 1500,
        success: true,
      });

      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'agent_call',
          event: 'llm_request',
          debateId: 'debate-123',
          agent: 'pro',
          phase: 'phase_1_opening',
          model: 'claude-sonnet-4-5',
          latency_ms: 2500,
          tokens: 1500,
          success: true,
        }),
        expect.stringContaining('completed')
      );
    });

    it('should log failed agent calls', () => {
      loggers.agentCall({
        debateId: 'debate-123',
        agent: 'con',
        phase: 'phase_2_rebuttal',
        model: 'gpt-4',
        latency_ms: 500,
        success: false,
        error: 'Rate limit exceeded',
      });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'agent_call',
          success: false,
          error: 'Rate limit exceeded',
        }),
        expect.stringContaining('failed')
      );
    });
  });

  describe('schemaValidation', () => {
    it('should log successful validation', () => {
      loggers.schemaValidation('debate-123', 'opening_argument', true);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'validation',
          event: 'schema_valid',
          debateId: 'debate-123',
          type: 'opening_argument',
        }),
        expect.stringContaining('passed')
      );
    });

    it('should log failed validation with errors', () => {
      loggers.schemaValidation('debate-123', 'rebuttal', false, [
        'Missing required field: claims',
        'Invalid type for evidence',
      ]);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'validation',
          event: 'schema_invalid',
          debateId: 'debate-123',
          type: 'rebuttal',
          errors: expect.arrayContaining(['Missing required field: claims']),
          error_count: 2,
        }),
        expect.stringContaining('failed')
      );
    });
  });

  describe('sseEvent', () => {
    it('should log SSE broadcasts', () => {
      loggers.sseEvent('debate-123', 'turn_started', 3);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'streaming',
          event: 'sse_broadcast',
          debateId: 'debate-123',
          eventType: 'turn_started',
          clientCount: 3,
        }),
        expect.any(String)
      );
    });
  });

  describe('userIntervention', () => {
    it('should log interventions with target', () => {
      loggers.userIntervention('debate-123', 'question', 'pro');

      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'intervention',
          event: 'user_action',
          debateId: 'debate-123',
          type: 'question',
          directedTo: 'pro',
        }),
        expect.any(String)
      );
    });

    it('should log interventions without target', () => {
      loggers.userIntervention('debate-123', 'pause');

      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'intervention',
          type: 'pause',
        }),
        expect.any(String)
      );
    });
  });

  describe('dbOperation', () => {
    it('should log database operations', () => {
      loggers.dbOperation('select', 'debates', 150, true, 5);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'database',
          event: 'db_query',
          operation: 'select',
          table: 'debates',
          latency_ms: 150,
          success: true,
          rowCount: 5,
        }),
        expect.any(String)
      );
    });
  });

  describe('error', () => {
    it('should log errors with context', () => {
      const testError = new Error('Test error');
      loggers.error('Operation failed', testError, {
        debateId: 'debate-123',
        phase: 'opening',
      });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'error',
          event: 'error_occurred',
          error: expect.objectContaining({
            message: 'Test error',
            name: 'Error',
          }),
          debateId: 'debate-123',
          phase: 'opening',
        }),
        'Operation failed'
      );
    });
  });

  describe('debateLifecycle', () => {
    it('should log debate lifecycle events', () => {
      loggers.debateLifecycle('debate-123', 'started', { topic: 'AI Regulation' });

      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'debate_lifecycle',
          event: 'debate_started',
          debateId: 'debate-123',
          topic: 'AI Regulation',
        }),
        expect.any(String)
      );
    });
  });

  describe('metric', () => {
    it('should log metrics', () => {
      loggers.metric('response_time', 250, 'ms', { endpoint: '/api/debates' });

      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'metrics',
          event: 'metric_recorded',
          metric: 'response_time',
          value: 250,
          unit: 'ms',
          tags: { endpoint: '/api/debates' },
        }),
        expect.any(String)
      );
    });
  });

  describe('security', () => {
    it('should log security events', () => {
      loggers.security('unauthorized_access', {
        ip: '192.168.1.1',
        path: '/admin',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'security',
          event: 'security_unauthorized_access',
          ip: '192.168.1.1',
          path: '/admin',
        }),
        expect.any(String)
      );
    });
  });
});

describe('Performance Timing', () => {
  let debugSpy: any;

  beforeEach(() => {
    debugSpy = vi.spyOn(logger, 'debug');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startTimer', () => {
    it('should measure and log operation duration', async () => {
      const endTimer = startTimer();

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 10));

      const duration = endTimer('test_operation', { debateId: 'debate-123' });

      expect(duration).toBeGreaterThanOrEqual(10);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'performance',
          event: 'operation_timed',
          operation: 'test_operation',
          duration_ms: expect.any(Number),
          debateId: 'debate-123',
        }),
        expect.any(String)
      );
    });
  });

  describe('loggedOperation', () => {
    it('should wrap successful async operations', async () => {
      const result = await loggedOperation(
        'fetch_data',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { data: 'test' };
        },
        { debateId: 'debate-123' }
      );

      expect(result).toEqual({ data: 'test' });
      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'performance',
          operation: 'fetch_data',
          success: true,
          debateId: 'debate-123',
        }),
        expect.any(String)
      );
    });

    it('should log and re-throw errors', async () => {
      const errorSpy = vi.spyOn(logger, 'error');
      const testError = new Error('Operation failed');

      await expect(
        loggedOperation(
          'failing_operation',
          async () => {
            throw testError;
          },
          { debateId: 'debate-123' }
        )
      ).rejects.toThrow('Operation failed');

      expect(errorSpy).toHaveBeenCalled();
    });
  });
});

describe('Error Tracking', () => {
  let infoSpy: any;
  let errorSpy: any;
  let debugSpy: any;

  beforeEach(() => {
    infoSpy = vi.spyOn(logger, 'info');
    errorSpy = vi.spyOn(logger, 'error');
    debugSpy = vi.spyOn(logger, 'debug');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initializeErrorTracking', () => {
    it('should initialize error tracking', () => {
      initializeErrorTracking();

      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'error_tracking',
        }),
        expect.any(String)
      );
    });

    it('should report enabled/disabled status', () => {
      const enabled = isErrorTrackingEnabled();
      expect(typeof enabled).toBe('boolean');
    });
  });

  describe('captureError', () => {
    it('should capture errors', () => {
      const testError = new Error('Test error');
      captureError(testError, { debateId: 'debate-123' });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'error_tracking',
          event: 'error_captured',
          error: expect.objectContaining({
            message: 'Test error',
          }),
          debateId: 'debate-123',
        }),
        expect.any(String)
      );
    });
  });

  describe('captureMessage', () => {
    it('should capture messages', () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      captureMessage('Test message', 'warn', { context: 'test' });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'error_tracking',
          event: 'message_captured',
          context: 'test',
        }),
        'Test message'
      );
    });
  });

  describe('setUserContext', () => {
    it('should set user context', () => {
      setUserContext('user-123', { email: 'test@example.com' });

      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'error_tracking',
          event: 'user_context_set',
          userId: 'user-123',
          email: 'test@example.com',
        }),
        expect.any(String)
      );
    });
  });

  describe('setDebateContext', () => {
    it('should set debate context', () => {
      setDebateContext('debate-123', { phase: 'opening' });

      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'error_tracking',
          event: 'debate_context_set',
          debateId: 'debate-123',
          phase: 'opening',
        }),
        expect.any(String)
      );
    });
  });
});
