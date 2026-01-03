/**
 * DuelogicConfigPanel Component
 *
 * Main configuration panel for creating Duelogic debates.
 * Integrates all sub-components for chair selection, tone, flow, and interruptions.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { ChairSelector } from './ChairSelector';
import { PresetSelector } from './PresetSelector';
import { ToneSelector } from './ToneSelector';
import { InterruptionSettings } from './InterruptionSettings';
import { FlowSettings } from './FlowSettings';
import {
  useDuelogicChairs,
  useDuelogicModels,
  useDuelogicPresets,
  useDuelogicDefaults,
  createDuelogicDebate,
} from './useDuelogicData';
import type {
  DuelogicConfig,
  DuelogicChair,
  DebateTone,
  AggressivenessLevel,
  PhilosophicalFramework,
  PresetInfo,
} from './duelogic-config.types';
import styles from './DuelogicConfig.module.css';

interface DuelogicConfigPanelProps {
  onDebateCreated?: (debateId: string) => void;
  disabled?: boolean;
}

const DEFAULT_CHAIRS: DuelogicChair[] = [
  { position: 'chair_1', framework: 'utilitarian', modelId: '' },
  { position: 'chair_2', framework: 'deontological', modelId: '' },
];

export const DuelogicConfigPanel: React.FC<DuelogicConfigPanelProps> = ({
  onDebateCreated,
  disabled = false,
}) => {
  // Fetch data from API
  const { chairs: availableChairs, loading: chairsLoading, error: chairsError } = useDuelogicChairs();
  const { models: availableModels, loading: modelsLoading } = useDuelogicModels();
  const { presets, loading: presetsLoading } = useDuelogicPresets();
  const { constraints, loading: defaultsLoading } = useDuelogicDefaults();

  // Form state
  const [proposition, setProposition] = useState('');
  const [propositionContext, setPropositionContext] = useState('');
  const [chairs, setChairs] = useState<DuelogicChair[]>(DEFAULT_CHAIRS);
  const [tone, setTone] = useState<DebateTone>('spirited');
  const [maxExchanges, setMaxExchanges] = useState(4);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [interruptionsEnabled, setInterruptionsEnabled] = useState(true);
  const [allowChairInterruptions, setAllowChairInterruptions] = useState(true);
  const [aggressiveness, setAggressiveness] = useState<AggressivenessLevel>(3);
  const [cooldownSeconds, setCooldownSeconds] = useState(30);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isLoading = chairsLoading || modelsLoading || presetsLoading || defaultsLoading;

  // Populate default model when models load
  React.useEffect(() => {
    if (availableModels.length > 0 && chairs.some((c) => !c.modelId)) {
      const defaultModel = availableModels[0].id;
      setChairs((prev) =>
        prev.map((c) => (c.modelId ? c : { ...c, modelId: defaultModel }))
      );
    }
  }, [availableModels, chairs]);

  // Handle preset selection
  const handlePresetSelect = useCallback(
    (_presetId: string, preset: PresetInfo) => {
      // Map preset chairs to DuelogicChair format
      const defaultModel = availableModels[0]?.id || '';
      const presetChairs: DuelogicChair[] = preset.chairs.map((framework, index) => ({
        position: `chair_${index + 1}`,
        framework: framework as PhilosophicalFramework,
        modelId: defaultModel,
      }));
      setChairs(presetChairs);
    },
    [availableModels]
  );

  // Build config object
  const buildConfig = useCallback((): DuelogicConfig => {
    return {
      chairs,
      tone,
      flow: {
        maxExchanges,
        autoAdvance,
      },
      interruptions: {
        enabled: interruptionsEnabled,
        allowChairInterruptions,
        aggressiveness,
        cooldownSeconds,
      },
      mandates: {
        steelManningRequired: true,
        selfCritiqueRequired: true,
        arbiterCanInterject: true,
      },
    };
  }, [chairs, tone, maxExchanges, autoAdvance, interruptionsEnabled, allowChairInterruptions, aggressiveness, cooldownSeconds]);

  // Validate form
  const validationError = useMemo(() => {
    if (proposition.trim().length < 10) {
      return 'Proposition must be at least 10 characters';
    }
    if (chairs.length < constraints.minChairs) {
      return `At least ${constraints.minChairs} chairs are required`;
    }
    if (chairs.some((c) => !c.modelId)) {
      return 'Please select a model for each chair';
    }
    return null;
  }, [proposition, chairs, constraints.minChairs]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (validationError) {
        setSubmitError(validationError);
        return;
      }

      setIsSubmitting(true);
      setSubmitError(null);

      try {
        const config = buildConfig();
        const { debateId } = await createDuelogicDebate(
          proposition.trim(),
          config,
          propositionContext.trim() || undefined
        );

        if (onDebateCreated) {
          onDebateCreated(debateId);
        }
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to create debate');
      } finally {
        setIsSubmitting(false);
      }
    },
    [proposition, propositionContext, buildConfig, validationError, onDebateCreated]
  );

  if (isLoading) {
    return (
      <div className={styles.configPanel}>
        <div className={styles.loading}>Loading configuration options...</div>
      </div>
    );
  }

  if (chairsError) {
    return (
      <div className={styles.configPanel}>
        <div className={styles.error}>{chairsError}</div>
      </div>
    );
  }

  return (
    <form
      className={`${styles.configPanel} ${disabled ? styles.disabled : ''}`}
      onSubmit={handleSubmit}
    >
      <h2 className={styles.sectionTitle}>Create Duelogic Debate</h2>

      {/* Proposition Input */}
      <div className={styles.propositionSection}>
        <label className={styles.sectionTitle}>Proposition</label>
        <textarea
          value={proposition}
          onChange={(e) => setProposition(e.target.value)}
          placeholder="Enter a proposition for philosophical debate..."
          className={styles.textarea}
          disabled={disabled || isSubmitting}
          required
        />
        <div className={styles.charCount}>
          {proposition.length} / 500 characters
        </div>
      </div>

      {/* Optional Context */}
      <details className={styles.advancedSection}>
        <summary className={styles.advancedToggle}>Add context (optional)</summary>
        <textarea
          value={propositionContext}
          onChange={(e) => setPropositionContext(e.target.value)}
          placeholder="Provide additional context or background for the debate..."
          className={styles.textarea}
          disabled={disabled || isSubmitting}
        />
      </details>

      {/* Preset Selector */}
      <PresetSelector
        presets={presets}
        onPresetSelect={handlePresetSelect}
        disabled={disabled || isSubmitting}
      />

      {/* Chair Selector */}
      <ChairSelector
        chairs={chairs}
        onChairsChange={setChairs}
        availableChairs={availableChairs}
        availableModels={availableModels}
        minChairs={constraints.minChairs}
        maxChairs={constraints.maxChairs}
        disabled={disabled || isSubmitting}
      />

      {/* Tone Selector */}
      <ToneSelector
        value={tone}
        onChange={setTone}
        disabled={disabled || isSubmitting}
      />

      {/* Advanced Settings Toggle */}
      <div className={styles.advancedSection}>
        <button
          type="button"
          className={styles.advancedToggle}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? '▼' : '▶'} Advanced Settings
        </button>

        {showAdvanced && (
          <>
            {/* Flow Settings */}
            <FlowSettings
              maxExchanges={maxExchanges}
              autoAdvance={autoAdvance}
              minExchanges={constraints.minExchanges}
              maxExchangesLimit={constraints.maxExchanges}
              onMaxExchangesChange={setMaxExchanges}
              onAutoAdvanceChange={setAutoAdvance}
              disabled={disabled || isSubmitting}
            />

            {/* Interruption Settings */}
            <InterruptionSettings
              enabled={interruptionsEnabled}
              allowChairInterruptions={allowChairInterruptions}
              aggressiveness={aggressiveness}
              cooldownSeconds={cooldownSeconds}
              onEnabledChange={setInterruptionsEnabled}
              onChairInterruptionsChange={setAllowChairInterruptions}
              onAggressivenessChange={setAggressiveness}
              onCooldownChange={setCooldownSeconds}
              disabled={disabled || isSubmitting}
            />
          </>
        )}
      </div>

      {/* Error Message */}
      {submitError && (
        <div className={styles.errorMessage}>
          {submitError}
        </div>
      )}

      {/* Submit Button */}
      <div className={styles.submitSection}>
        <button
          type="submit"
          className={`${styles.submitButton} ${isSubmitting ? styles.loading : ''}`}
          disabled={disabled || isSubmitting || !!validationError}
        >
          {isSubmitting ? 'Creating Debate...' : 'Start Duelogic Debate'}
        </button>
      </div>
    </form>
  );
};

export default DuelogicConfigPanel;
