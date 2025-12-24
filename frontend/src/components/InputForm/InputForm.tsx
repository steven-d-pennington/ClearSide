import React, { useState, useCallback, useEffect } from 'react';
import { useDebateStore } from '../../stores/debate-store';
import { validateQuestion, validateContext, VALIDATION_LIMITS } from '../../utils/validation';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Alert } from '../ui/Alert';
import { CharacterCount } from './CharacterCount';
import styles from './InputForm.module.css';

interface InputFormProps {
  onSuccess?: (debateId: string) => void;
  onError?: (error: Error) => void;
  className?: string;
}

interface FormState {
  question: string;
  context: string;
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

      // Mark all fields as touched
      setTouched(new Set(['question', 'context']));

      // Validate
      const validationErrors = validate();
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }

      try {
        // Combine question and context into proposition
        const proposition = formState.context
          ? `${formState.question.trim()}\n\nContext: ${formState.context.trim()}`
          : formState.question.trim();

        await startDebate(proposition);

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
  const isSubmitDisabled =
    isLoading || !formState.question.trim() || Object.keys(errors).length > 0;

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
          Start Debate
        </Button>
      </div>

      {/* Loading State Message */}
      {isLoading && (
        <div className={styles.loadingMessage} role="status" aria-live="polite">
          <p>Initializing debate and connecting to AI agents...</p>
          <p className={styles.loadingSubtext}>This may take a few seconds.</p>
        </div>
      )}
    </form>
  );
};

export default InputForm;
