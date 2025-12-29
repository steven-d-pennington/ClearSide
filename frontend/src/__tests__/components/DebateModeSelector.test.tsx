/**
 * DebateModeSelector Component Tests
 *
 * Tests for the debate mode selection UI including:
 * - Mode selection (turn-based vs lively)
 * - Preset selection
 * - Advanced settings controls
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DebateModeSelector } from '../../components/InputForm/DebateModeSelector';
import { useDebateStore } from '../../stores/debate-store';
import type { DebateMode, LivelySettingsInput, LivelyPreset } from '../../types/lively';

// Mock CSS modules
vi.mock('../../components/InputForm/DebateModeSelector.module.css', () => ({
  default: {
    container: 'container',
    sectionLabel: 'sectionLabel',
    modeSelector: 'modeSelector',
    modeOptions: 'modeOptions',
    modeOption: 'modeOption',
    modeContent: 'modeContent',
    modeIcon: 'modeIcon',
    modeText: 'modeText',
    betaBadge: 'betaBadge',
    active: 'active',
    livelySettings: 'livelySettings',
    settingsHeader: 'settingsHeader',
    advancedToggle: 'advancedToggle',
    presets: 'presets',
    presetBtn: 'presetBtn',
    presetActive: 'presetActive',
    presetName: 'presetName',
    presetDesc: 'presetDesc',
    advancedSettings: 'advancedSettings',
    settingRow: 'settingRow',
    settingLabel: 'settingLabel',
    settingHint: 'settingHint',
    sliderContainer: 'sliderContainer',
    slider: 'slider',
    sliderValue: 'sliderValue',
    select: 'select',
    numberInput: 'numberInput',
    livelyInfo: 'livelyInfo',
  },
}));

// Mock the debate store
vi.mock('../../stores/debate-store', () => ({
  useDebateStore: vi.fn(() => ({
    fetchLivelyPresets: vi.fn().mockResolvedValue([
      {
        id: 'calm',
        name: 'Calm',
        description: 'Gentle, thoughtful discussion',
        settings: { pacingMode: 'slow', aggressionLevel: 1 },
      },
      {
        id: 'balanced',
        name: 'Balanced',
        description: 'Normal debate pacing',
        settings: { pacingMode: 'medium', aggressionLevel: 3 },
      },
      {
        id: 'heated',
        name: 'Heated',
        description: 'Intense rapid-fire exchange',
        settings: { pacingMode: 'fast', aggressionLevel: 4 },
      },
      {
        id: 'chaotic',
        name: 'Chaotic',
        description: 'Maximum interruptions',
        settings: { pacingMode: 'frantic', aggressionLevel: 5 },
      },
    ]),
  })),
}));

describe('DebateModeSelector', () => {
  const defaultSettings: LivelySettingsInput = {
    pacingMode: 'medium',
    aggressionLevel: 3,
    maxInterruptsPerMinute: 2,
    interruptCooldownMs: 15000,
  };

  const mockOnModeChange = vi.fn();
  const mockOnSettingsChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Mode Selection', () => {
    it('renders both mode options', () => {
      render(
        <DebateModeSelector
          mode="turn_based"
          settings={defaultSettings}
          onModeChange={mockOnModeChange}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      expect(screen.getByText('Turn-Based')).toBeInTheDocument();
      expect(screen.getByText('Lively Arena')).toBeInTheDocument();
    });

    it('shows turn-based as selected when mode is turn_based', () => {
      render(
        <DebateModeSelector
          mode="turn_based"
          settings={defaultSettings}
          onModeChange={mockOnModeChange}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      const turnBasedRadio = screen.getByRole('radio', { name: /Turn-Based/i });
      expect(turnBasedRadio).toBeChecked();
    });

    it('shows lively as selected when mode is lively', () => {
      render(
        <DebateModeSelector
          mode="lively"
          settings={defaultSettings}
          onModeChange={mockOnModeChange}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      const livelyRadio = screen.getByRole('radio', { name: /Lively Arena/i });
      expect(livelyRadio).toBeChecked();
    });

    it('calls onModeChange when switching modes', async () => {
      const user = userEvent.setup();

      render(
        <DebateModeSelector
          mode="turn_based"
          settings={defaultSettings}
          onModeChange={mockOnModeChange}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      const livelyRadio = screen.getByRole('radio', { name: /Lively Arena/i });
      await user.click(livelyRadio);

      expect(mockOnModeChange).toHaveBeenCalledWith('lively');
    });

    it('shows beta badge on lively mode', () => {
      render(
        <DebateModeSelector
          mode="turn_based"
          settings={defaultSettings}
          onModeChange={mockOnModeChange}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      expect(screen.getByText('Beta')).toBeInTheDocument();
    });
  });

  describe('Lively Settings Panel', () => {
    it('shows settings panel only when lively mode is selected', () => {
      const { rerender } = render(
        <DebateModeSelector
          mode="turn_based"
          settings={defaultSettings}
          onModeChange={mockOnModeChange}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      expect(screen.queryByText('Arena Style:')).not.toBeInTheDocument();

      rerender(
        <DebateModeSelector
          mode="lively"
          settings={defaultSettings}
          onModeChange={mockOnModeChange}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      expect(screen.getByText('Arena Style:')).toBeInTheDocument();
    });

    it('shows lively mode info box', () => {
      render(
        <DebateModeSelector
          mode="lively"
          settings={defaultSettings}
          onModeChange={mockOnModeChange}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      expect(screen.getByText('What is Lively Arena?')).toBeInTheDocument();
    });
  });

  describe('Presets', () => {
    it('loads and displays presets', async () => {
      render(
        <DebateModeSelector
          mode="lively"
          settings={defaultSettings}
          onModeChange={mockOnModeChange}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Calm')).toBeInTheDocument();
        expect(screen.getByText('Balanced')).toBeInTheDocument();
        expect(screen.getByText('Heated')).toBeInTheDocument();
        expect(screen.getByText('Chaotic')).toBeInTheDocument();
      });
    });

    it('calls onSettingsChange when preset is selected', async () => {
      const user = userEvent.setup();

      render(
        <DebateModeSelector
          mode="lively"
          settings={defaultSettings}
          onModeChange={mockOnModeChange}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Calm')).toBeInTheDocument();
      });

      const calmButton = screen.getByText('Calm').closest('button');
      await user.click(calmButton!);

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          pacingMode: 'slow',
          aggressionLevel: 1,
        })
      );
    });
  });

  describe('Advanced Settings', () => {
    it('toggles advanced settings visibility', async () => {
      const user = userEvent.setup();

      render(
        <DebateModeSelector
          mode="lively"
          settings={defaultSettings}
          onModeChange={mockOnModeChange}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      // Advanced settings should be hidden initially
      expect(screen.queryByText('Aggression Level')).not.toBeInTheDocument();

      // Click to show advanced
      const toggleButton = screen.getByText('Show Advanced');
      await user.click(toggleButton);

      // Should now show advanced settings
      expect(screen.getByText('Aggression Level')).toBeInTheDocument();
      expect(screen.getByText('Pacing Mode')).toBeInTheDocument();
      expect(screen.getByText('Max Interrupts/Minute')).toBeInTheDocument();

      // Button text should change
      expect(screen.getByText('Hide Advanced')).toBeInTheDocument();
    });

    it('updates aggression level via slider', async () => {
      const user = userEvent.setup();

      render(
        <DebateModeSelector
          mode="lively"
          settings={defaultSettings}
          onModeChange={mockOnModeChange}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      // Show advanced settings
      await user.click(screen.getByText('Show Advanced'));

      // Find the aggression slider
      const slider = screen.getByRole('slider');

      // Change the value
      fireEvent.change(slider, { target: { value: '4' } });

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          aggressionLevel: 4,
        })
      );
    });

    it('updates pacing mode via select', async () => {
      const user = userEvent.setup();

      render(
        <DebateModeSelector
          mode="lively"
          settings={defaultSettings}
          onModeChange={mockOnModeChange}
          onSettingsChange={mockOnSettingsChange}
        />
      );

      // Show advanced settings
      await user.click(screen.getByText('Show Advanced'));

      // Find the pacing select
      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'fast');

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          pacingMode: 'fast',
        })
      );
    });
  });

  describe('Disabled State', () => {
    it('disables all controls when disabled', () => {
      render(
        <DebateModeSelector
          mode="lively"
          settings={defaultSettings}
          onModeChange={mockOnModeChange}
          onSettingsChange={mockOnSettingsChange}
          disabled={true}
        />
      );

      // Radio buttons should be disabled
      const radios = screen.getAllByRole('radio');
      radios.forEach((radio) => {
        expect(radio).toBeDisabled();
      });

      // Advanced toggle should be disabled
      expect(screen.getByText('Show Advanced')).toBeDisabled();
    });
  });
});
