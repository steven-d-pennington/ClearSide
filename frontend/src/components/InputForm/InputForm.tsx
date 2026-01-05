import React, { useState, useCallback, useEffect } from 'react';
import { useDebateStore } from '../../stores/debate-store';
import { validateQuestion, validateContext, VALIDATION_LIMITS } from '../../utils/validation';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Alert } from '../ui/Alert';
import { CharacterCount } from './CharacterCount';
import { ConfigPanel } from '../ConfigPanel/ConfigPanel';
import { ModelSelector } from '../ConfigPanel/ModelSelector';
import { PersonaSelector } from './PersonaSelector';
import { DebateModeSelector } from './DebateModeSelector';
import { InformalSettings } from './InformalSettings';
import { DuelogicConfigPanel } from '../DuelogicConfig';
import type { FlowMode, HumanParticipation, HumanSide } from '../../types/debate';
import type { DebateConfiguration, PersonaSelection, ModelSelection } from '../../types/configuration';
import { DEFAULT_CONFIGURATION, DEFAULT_PERSONA_SELECTION, DEFAULT_MODEL_SELECTION } from '../../types/configuration';
import type { DebateMode, LivelySettingsInput } from '../../types/lively';
import { DEFAULT_LIVELY_SETTINGS } from '../../types/lively';
import type { InformalSettingsInput } from '../../types/informal';
import { DEFAULT_INFORMAL_SETTINGS } from '../../types/informal';
import styles from './InputForm.module.css';

interface InputFormProps {
  onSuccess?: (debateId: string) => void;
  onError?: (error: Error) => void;
  className?: string;
}

/**
 * Participation mode - who takes part in the debate
 */
type ParticipationMode = 'watch' | 'pro' | 'con';

interface FormState {
  question: string;
  context: string;
  flowMode: FlowMode;
  configuration: DebateConfiguration;
  personaSelection: PersonaSelection;
  modelSelection: ModelSelection;
  debateMode: DebateMode;
  livelySettings: LivelySettingsInput;
  informalSettings: InformalSettingsInput;
  participationMode: ParticipationMode;
}

interface ValidationErrors {
  question?: string;
  context?: string;
}

export const InputForm: React.FC<InputFormProps> = ({
  onSuccess,
  onError,
  className = '',
}) => {
  // Local form state
  const [formState, setFormState] = useState<FormState>({
    question: '',
    context: '',
    flowMode: 'auto',
    configuration: DEFAULT_CONFIGURATION,
    personaSelection: DEFAULT_PERSONA_SELECTION,
    modelSelection: DEFAULT_MODEL_SELECTION,
    debateMode: 'turn_based',
    livelySettings: DEFAULT_LIVELY_SETTINGS,
    informalSettings: DEFAULT_INFORMAL_SETTINGS,
    participationMode: 'watch',
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showContext, setShowContext] = useState(false);

  // Global state from Zustand store
  const { startDebate, isLoading, error: apiError, _setError } = useDebateStore();

  /**
   * Validate form fields
   */
  const validate = useCallback((): ValidationErrors => {
    const newErrors: ValidationErrors = {};

    const questionError = validateQuestion(formState.question);
    if (questionError) {
      newErrors.question = questionError;
    }

    if (formState.context) {
      const contextError = validateContext(formState.context);
      if (contextError) {
        newErrors.context = contextError;
      }
    }

    return newErrors;
  }, [formState]);

  /**
   * Update validation errors on form change
   */
  useEffect(() => {
    const newErrors = validate();
    setErrors(newErrors);
  }, [formState, validate]);

  /**
   * Handle question input change
   */
  const handleQuestionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setFormState((prev) => ({ ...prev, question: value }));
      setTouched((prev) => new Set(prev).add('question'));

      // Clear API error on change
      if (apiError) {
        _setError(null);
      }
    },
    [apiError, _setError]
  );

  /**
   * Handle context input change
   */
  const handleContextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setFormState((prev) => ({ ...prev, context: value }));
      setTouched((prev) => new Set(prev).add('context'));
    },
    []
  );

  /**
   * Handle configuration change
   */
  const handleConfigChange = useCallback((config: DebateConfiguration) => {
    setFormState((prev) => ({ ...prev, configuration: config }));
  }, []);

  /**
   * Handle persona selection change
   */
  const handlePersonaChange = useCallback((selection: PersonaSelection) => {
    setFormState((prev) => ({ ...prev, personaSelection: selection }));
  }, []);

  /**
   * Handle model selection change
   */
  const handleModelSelectionChange = useCallback((selection: ModelSelection) => {
    setFormState((prev) => ({ ...prev, modelSelection: selection }));
  }, []);

  /**
   * Handle debate mode change
   */
  const handleDebateModeChange = useCallback((mode: DebateMode) => {
    setFormState((prev) => ({ ...prev, debateMode: mode }));
  }, []);

  /**
   * Handle lively settings change
   */
  const handleLivelySettingsChange = useCallback((settings: LivelySettingsInput) => {
    setFormState((prev) => ({ ...prev, livelySettings: settings }));
  }, []);

  /**
   * Handle informal settings change
   */
  const handleInformalSettingsChange = useCallback((settings: InformalSettingsInput) => {
    setFormState((prev) => ({ ...prev, informalSettings: settings }));
  }, []);

  /**
   * Handle paste event - suggest context field for long pastes
   */
  const handleQuestionPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pastedText = e.clipboardData.getData('text');

      if (pastedText.length > 200 && !formState.context && !showContext) {
        e.preventDefault();

        const confirmed = window.confirm(
          'This looks like a longer text. Would you like to add it as context instead?'
        );

        if (confirmed) {
          setShowContext(true);
          setFormState((prev) => ({
            ...prev,
            context: pastedText,
          }));
        } else {
          const truncated = pastedText.slice(0, VALIDATION_LIMITS.QUESTION_MAX_LENGTH);
          setFormState((prev) => ({
            ...prev,
            question: prev.question + truncated,
          }));
        }
      }
    },
    [formState.context, showContext]
  );

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      console.log('🔵 Form submitted');
      console.log('🔵 Form state:', formState);

      // Mark all fields as touched
      setTouched(new Set(['question', 'context']));

      // Validate
      const validationErrors = validate();
      console.log('🔵 Validation errors:', validationErrors);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        console.log('🔴 Validation failed, stopping');
        return;
      }

      try {
        // Combine question and context into proposition
        const proposition = formState.context
          ? `${formState.question.trim()}\n\nContext: ${formState.context.trim()}`
          : formState.question.trim();

        console.log('🔵 Starting debate with proposition:', proposition, 'flowMode:', formState.flowMode);
        console.log('🔵 Configuration:', formState.configuration);

        // Build start options including configuration, personas, model selection, and debate mode
        const { configuration, personaSelection, modelSelection, debateMode, livelySettings, informalSettings, participationMode } = formState;

        // Build human participation config
        const humanParticipation: HumanParticipation | undefined =
          participationMode !== 'watch'
            ? {
                enabled: true,
                humanSide: participationMode as HumanSide,
                timeLimitSeconds: null, // No time limit for now
              }
            : undefined;

        console.log('🔵 Participation mode:', participationMode);
        console.log('🔵 Human participation config:', humanParticipation);

        await startDebate(proposition, {
          flowMode: formState.flowMode,
          presetMode: configuration.presetMode,
          brevityLevel: configuration.brevityLevel,
          llmTemperature: configuration.llmSettings.temperature,
          maxTokensPerResponse: configuration.llmSettings.maxTokensPerResponse,
          requireCitations: configuration.requireCitations,
          proPersonaId: personaSelection.proPersonaId,
          conPersonaId: personaSelection.conPersonaId,
          // Model selection
          modelSelectionMode: modelSelection.mode,
          costThreshold: modelSelection.costThreshold,
          proModelId: modelSelection.proModelId,
          conModelId: modelSelection.conModelId,
          moderatorModelId: modelSelection.moderatorModelId,
          // Extended thinking/reasoning
          reasoningEffort: modelSelection.reasoningEffort,
          debateMode,
          livelySettings: debateMode === 'lively' ? livelySettings : undefined,
          informalSettings: debateMode === 'informal' ? informalSettings : undefined,
          // Human participation
          humanParticipation,
        });
        console.log('🔵 startDebate returned');

        const debate = useDebateStore.getState().debate;
        if (debate) {
          onSuccess?.(debate.id);
        }
      } catch (err) {
        console.error('Failed to start debate:', err);
        onError?.(err instanceof Error ? err : new Error('Failed to start debate'));
      }
    },
    [formState, validate, startDebate, onSuccess, onError]
  );

  /**
   * Determine if submit button should be disabled
   */
  const isInformalInvalid = formState.debateMode === 'informal' &&
    formState.informalSettings.participants.some((p) => !p.modelId);

  const isSubmitDisabled =
    isLoading || !formState.question.trim() || Object.keys(errors).length > 0 || isInformalInvalid;

  // Duelogic mode uses its own form inside DuelogicConfigPanel
  // Render as div wrapper to avoid nested forms
  if (formState.debateMode === 'duelogic') {
    return (
      <div className={`${styles.inputForm} ${className}`}>
        <div className={styles.header}>
          <h1 className={styles.title}>Think both sides. Decide with clarity.</h1>
          <p className={styles.description}>
            Explore propositions through philosophical debate with multiple frameworks.
          </p>
        </div>

        {/* Debate Mode Selector */}
        <DebateModeSelector
          mode={formState.debateMode}
          settings={formState.livelySettings}
          informalSettings={formState.informalSettings}
          onModeChange={handleDebateModeChange}
          onSettingsChange={handleLivelySettingsChange}
          onInformalSettingsChange={handleInformalSettingsChange}
          disabled={isLoading}
        />

        {/* Duelogic Configuration Panel - has its own form */}
        <DuelogicConfigPanel
          onDebateCreated={onSuccess}
          disabled={isLoading}
        />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`${styles.inputForm} ${className}`}
      noValidate
    >
      <div className={styles.header}>
        <h1 className={styles.title}>Think both sides. Decide with clarity.</h1>
        <p className={styles.description}>
          Enter a proposition to explore through structured adversarial debate.
        </p>
      </div>

      {/* Question Field */}
      <div className={styles.field}>
        <label htmlFor="question" className={styles.label}>
          Your Proposition <span className={styles.required}>*</span>
        </label>
        <Textarea
          id="question"
          name="question"
          value={formState.question}
          onChange={handleQuestionChange}
          onPaste={handleQuestionPaste}
          placeholder="e.g., The United States should implement a temporary moratorium on new AI data centers"
          rows={3}
          disabled={isLoading}
          error={touched.has('question') ? errors.question : undefined}
          fullWidth
        />
        <div className={styles.fieldMeta}>
          <CharacterCount
            current={formState.question.length}
            max={VALIDATION_LIMITS.QUESTION_MAX_LENGTH}
          />
          {!showContext && (
            <button
              type="button"
              className={styles.addContextButton}
              onClick={() => setShowContext(true)}
            >
              + Add context
            </button>
          )}
        </div>
      </div>

      {/* Context Field (Optional) */}
      {showContext && (
        <div className={styles.field}>
          <label htmlFor="context" className={styles.label}>
            Additional Context <span className={styles.optional}>(optional)</span>
          </label>
          <Textarea
            id="context"
            name="context"
            value={formState.context}
            onChange={handleContextChange}
            placeholder="Provide background information, constraints, or specific scenarios to consider..."
            rows={5}
            disabled={isLoading}
            error={touched.has('context') ? errors.context : undefined}
            fullWidth
          />
          <div className={styles.fieldMeta}>
            <CharacterCount
              current={formState.context.length}
              max={VALIDATION_LIMITS.CONTEXT_MAX_LENGTH}
            />
            <button
              type="button"
              className={styles.removeContextButton}
              onClick={() => {
                setShowContext(false);
                setFormState((prev) => ({ ...prev, context: '' }));
              }}
            >
              Remove context
            </button>
          </div>
        </div>
      )}

      {/* Debate Mode Selector */}
      <DebateModeSelector
        mode={formState.debateMode}
        settings={formState.livelySettings}
        informalSettings={formState.informalSettings}
        onModeChange={handleDebateModeChange}
        onSettingsChange={handleLivelySettingsChange}
        onInformalSettingsChange={handleInformalSettingsChange}
        disabled={isLoading}
      />

      {/* Informal Settings (participant configuration) */}
      {formState.debateMode === 'informal' && (
        <InformalSettings
          settings={formState.informalSettings}
          onChange={handleInformalSettingsChange}
          disabled={isLoading}
        />
      )}

      {/* Participation Mode Selector (not for informal mode) */}
      {formState.debateMode !== 'informal' && (
        <div className={styles.participationModeSelector}>
          <span className={styles.participationModeLabel}>Participation:</span>
          <div className={styles.participationModeOptions}>
            <label className={`${styles.participationModeOption} ${formState.participationMode === 'watch' ? styles.participationModeActive : ''}`}>
              <input
                type="radio"
                name="participationMode"
                value="watch"
                checked={formState.participationMode === 'watch'}
                onChange={() => setFormState((prev) => ({ ...prev, participationMode: 'watch' }))}
                disabled={isLoading}
              />
              <span className={styles.participationModeText}>
                <strong>Watch</strong>
                <small>Watch AI debate both sides</small>
              </span>
            </label>
            <label className={`${styles.participationModeOption} ${formState.participationMode === 'pro' ? styles.participationModeActive : ''}`}>
              <input
                type="radio"
                name="participationMode"
                value="pro"
                checked={formState.participationMode === 'pro'}
                onChange={() => setFormState((prev) => ({ ...prev, participationMode: 'pro' }))}
                disabled={isLoading}
              />
              <span className={styles.participationModeText}>
                <strong>Argue Pro</strong>
                <small>Argue for the proposition</small>
              </span>
            </label>
            <label className={`${styles.participationModeOption} ${formState.participationMode === 'con' ? styles.participationModeActive : ''}`}>
              <input
                type="radio"
                name="participationMode"
                value="con"
                checked={formState.participationMode === 'con'}
                onChange={() => setFormState((prev) => ({ ...prev, participationMode: 'con' }))}
                disabled={isLoading}
              />
              <span className={styles.participationModeText}>
                <strong>Argue Con</strong>
                <small>Argue against the proposition</small>
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Flow Mode Selector (only for turn-based mode) */}
      {formState.debateMode === 'turn_based' && (
      <div className={styles.flowModeSelector}>
        <span className={styles.flowModeLabel}>Debate Flow:</span>
        <div className={styles.flowModeOptions}>
          <label className={`${styles.flowModeOption} ${formState.flowMode === 'auto' ? styles.flowModeActive : ''}`}>
            <input
              type="radio"
              name="flowMode"
              value="auto"
              checked={formState.flowMode === 'auto'}
              onChange={() => setFormState((prev) => ({ ...prev, flowMode: 'auto' }))}
              disabled={isLoading}
            />
            <span className={styles.flowModeText}>
              <strong>Automatic</strong>
              <small>Debate flows continuously</small>
            </span>
          </label>
          <label className={`${styles.flowModeOption} ${formState.flowMode === 'step' ? styles.flowModeActive : ''}`}>
            <input
              type="radio"
              name="flowMode"
              value="step"
              checked={formState.flowMode === 'step'}
              onChange={() => setFormState((prev) => ({ ...prev, flowMode: 'step' }))}
              disabled={isLoading}
            />
            <span className={styles.flowModeText}>
              <strong>Step-by-Step</strong>
              <small>Pause after each turn to review</small>
            </span>
          </label>
        </div>
      </div>
      )}

      {/* Configuration Panel */}
      <ConfigPanel
        configuration={formState.configuration}
        onChange={handleConfigChange}
        disabled={isLoading}
      />

      {/* Model Selector (OpenRouter Integration) - not for informal mode */}
      {formState.debateMode !== 'informal' && (
        <ModelSelector
          selection={formState.modelSelection}
          onChange={handleModelSelectionChange}
          disabled={isLoading}
          presetId={formState.configuration.presetMode}
          humanSide={formState.participationMode !== 'watch' ? formState.participationMode : undefined}
        />
      )}

      {/* Persona Selector - not for informal mode */}
      {formState.debateMode !== 'informal' && (
        <PersonaSelector
          selection={formState.personaSelection}
          onChange={handlePersonaChange}
          disabled={isLoading}
        />
      )}

      {/* API Error Display */}
      {apiError && (
        <Alert variant="error" className={styles.apiError}>
          <strong>Failed to start debate:</strong> {apiError}
        </Alert>
      )}

      {/* Submit Button */}
      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={isSubmitDisabled}
          loading={isLoading}
          className={styles.submitButton}
        >
          {formState.debateMode === 'informal' ? 'Start Discussion' : 'Start Debate'}
        </Button>
      </div>

      {/* Loading State Message */}
      {isLoading && (
        <div className={styles.loadingMessage} role="status" aria-live="polite">
          <p>
            {formState.debateMode === 'informal'
              ? 'Initializing discussion and connecting to AI participants...'
              : 'Initializing debate and connecting to AI agents...'}
          </p>
          <p className={styles.loadingSubtext}>This may take a few seconds.</p>
        </div>
      )}
    </form>
  );
};

export default InputForm;
