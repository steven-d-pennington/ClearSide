/**
 * Lively State Management Tests
 *
 * Tests for the lively debate mode state in the Zustand store including:
 * - Initial state
 * - State updates from SSE events
 * - Selectors
 * - Settings management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDebateStore } from '../../stores/debate-store';
import { Speaker } from '../../types/debate';
import type { LivelySettings } from '../../types/lively';
import { initialLivelyState } from '../../types/lively';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Lively State Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the store
    useDebateStore.getState()._reset();
  });

  describe('Initial State', () => {
    it('has correct initial lively state', () => {
      const state = useDebateStore.getState();

      expect(state.lively.isLivelyMode).toBe(false);
      expect(state.lively.settings).toBeNull();
      expect(state.lively.activeSpeaker).toBeNull();
      expect(state.lively.speakerStates.size).toBe(0);
      expect(state.lively.pendingInterrupt).toBeNull();
      expect(state.lively.interruptsThisMinute).toBe(0);
      expect(state.lively.streamingInterjection).toBeNull();
    });

    it('matches initialLivelyState constant', () => {
      const state = useDebateStore.getState();

      expect(state.lively.isLivelyMode).toBe(initialLivelyState.isLivelyMode);
      expect(state.lively.settings).toBe(initialLivelyState.settings);
      expect(state.lively.activeSpeaker).toBe(initialLivelyState.activeSpeaker);
    });
  });

  describe('fetchLivelySettings', () => {
    it('fetches lively settings from API', async () => {
      const mockSettings: LivelySettings = {
        aggressionLevel: 3,
        maxInterruptsPerMinute: 2,
        interruptCooldownMs: 15000,
        minSpeakingTimeMs: 5000,
        relevanceThreshold: 0.7,
        pacingMode: 'medium',
      };

      // API returns { data: settings } format
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSettings }),
      });

      const store = useDebateStore.getState();
      await store.fetchLivelySettings('test-123');

      // Verify fetch was called
      expect(mockFetch).toHaveBeenCalled();
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('/api/debates/test-123/lively-settings');
    });

    it('updates state when settings are fetched successfully', async () => {
      const mockSettings: LivelySettings = {
        aggressionLevel: 3,
        maxInterruptsPerMinute: 2,
        interruptCooldownMs: 15000,
        minSpeakingTimeMs: 5000,
        relevanceThreshold: 0.7,
        pacingMode: 'medium',
      };

      // API returns { data: settings } format
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSettings }),
      });

      const store = useDebateStore.getState();
      await store.fetchLivelySettings('test-123');

      const state = useDebateStore.getState();
      expect(state.lively.settings).toEqual(mockSettings);
      expect(state.lively.isLivelyMode).toBe(true);
    });

    it('sets turn-based mode when 404 returned', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const store = useDebateStore.getState();
      await store.fetchLivelySettings('test-123');

      // Should set turn-based mode (not lively)
      const state = useDebateStore.getState();
      expect(state.lively.isLivelyMode).toBe(false);
      expect(state.lively.settings).toBeNull();
    });
  });

  describe('updateLivelySettings', () => {
    it('sends settings update to API', async () => {
      const newSettings: Partial<LivelySettings> = {
        aggressionLevel: 5,
        pacingMode: 'frantic',
      };

      // API returns { data: settings } format
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            aggressionLevel: 5,
            maxInterruptsPerMinute: 2,
            interruptCooldownMs: 15000,
            minSpeakingTimeMs: 5000,
            relevanceThreshold: 0.7,
            pacingMode: 'frantic',
          },
        }),
      });

      const store = useDebateStore.getState();
      await store.updateLivelySettings('test-123', newSettings);

      // Verify fetch was called with correct method
      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('/api/debates/test-123/lively-settings');
      expect(callArgs[1].method).toBe('PUT');
    });

    it('updates local state after successful API call', async () => {
      const updatedSettings: LivelySettings = {
        aggressionLevel: 5,
        maxInterruptsPerMinute: 4,
        interruptCooldownMs: 10000,
        minSpeakingTimeMs: 3000,
        relevanceThreshold: 0.5,
        pacingMode: 'frantic',
      };

      // API returns { data: settings } format
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: updatedSettings }),
      });

      const store = useDebateStore.getState();
      await store.updateLivelySettings('test-123', { aggressionLevel: 5 });

      const state = useDebateStore.getState();
      expect(state.lively.settings?.aggressionLevel).toBe(5);
    });
  });

  describe('fetchLivelyPresets', () => {
    it('fetches and returns presets', async () => {
      const mockPresets = [
        { id: 'calm', name: 'Calm', description: 'Gentle discussion', settings: {} },
        { id: 'balanced', name: 'Balanced', description: 'Normal pacing', settings: {} },
      ];

      // API returns { data: [...] } format
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockPresets }),
      });

      const store = useDebateStore.getState();

      const presets = await store.fetchLivelyPresets();

      expect(presets).toEqual(mockPresets);
    });

    it('returns empty array on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const store = useDebateStore.getState();

      const presets = await store.fetchLivelyPresets();

      expect(presets).toEqual([]);
    });
  });

  describe('Reset', () => {
    it('resets lively state on _reset', async () => {
      const store = useDebateStore.getState();

      // First set some state via API
      const mockSettings: LivelySettings = {
        aggressionLevel: 5,
        maxInterruptsPerMinute: 4,
        interruptCooldownMs: 10000,
        minSpeakingTimeMs: 3000,
        relevanceThreshold: 0.5,
        pacingMode: 'frantic',
      };

      // API returns { data: settings } format
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSettings }),
      });

      await store.fetchLivelySettings('test-123');

      // Verify state was set
      expect(useDebateStore.getState().lively.isLivelyMode).toBe(true);

      // Reset
      store._reset();

      // Verify reset to initial state
      const state = useDebateStore.getState();
      expect(state.lively.isLivelyMode).toBe(false);
      expect(state.lively.settings).toBeNull();
      expect(state.lively.activeSpeaker).toBeNull();
      expect(state.lively.interruptsThisMinute).toBe(0);
    });
  });
});

describe('Lively Types', () => {
  describe('LivelySettings', () => {
    it('should have all required properties', () => {
      const settings: LivelySettings = {
        aggressionLevel: 3,
        maxInterruptsPerMinute: 2,
        interruptCooldownMs: 15000,
        minSpeakingTimeMs: 5000,
        relevanceThreshold: 0.7,
        pacingMode: 'medium',
      };

      expect(settings.aggressionLevel).toBeDefined();
      expect(settings.maxInterruptsPerMinute).toBeDefined();
      expect(settings.interruptCooldownMs).toBeDefined();
      expect(settings.minSpeakingTimeMs).toBeDefined();
      expect(settings.relevanceThreshold).toBeDefined();
      expect(settings.pacingMode).toBeDefined();
    });

    it('should accept valid pacing modes', () => {
      const validModes = ['slow', 'medium', 'fast', 'frantic'] as const;

      validModes.forEach((mode) => {
        const settings: LivelySettings = {
          aggressionLevel: 3,
          maxInterruptsPerMinute: 2,
          interruptCooldownMs: 15000,
          minSpeakingTimeMs: 5000,
          relevanceThreshold: 0.7,
          pacingMode: mode,
        };

        expect(settings.pacingMode).toBe(mode);
      });
    });
  });

  describe('initialLivelyState', () => {
    it('should have correct default values', () => {
      expect(initialLivelyState.isLivelyMode).toBe(false);
      expect(initialLivelyState.settings).toBeNull();
      expect(initialLivelyState.activeSpeaker).toBeNull();
      expect(initialLivelyState.speakerStates).toBeInstanceOf(Map);
      expect(initialLivelyState.pendingInterrupt).toBeNull();
      expect(initialLivelyState.interruptsThisMinute).toBe(0);
      expect(initialLivelyState.streamingInterjection).toBeNull();
    });

    it('should have empty speaker states map', () => {
      expect(initialLivelyState.speakerStates.size).toBe(0);
    });
  });
});
