/**
 * InterventionForm - Form for submitting user interventions
 *
 * Allows users to select intervention type, target speaker,
 * and provide their question/challenge content.
 */

import React, { useState, useCallback, useId } from 'react';
import { Button, Textarea, Badge } from '../ui';
import type { Intervention, DebateTurn, Speaker } from '../../types/debate';
import { SPEAKER_INFO } from '../../types/debate';
import styles from './InterventionForm.module.css';

/**
 * Intervention type options with metadata
 */
export const InterventionType = {
  question: 'question',
  challenge: 'challenge',
  evidence: 'evidence',
  clarification: 'clarification',
} as const;

interface InterventionOption {
  type: Intervention['type'];
  label: string;
  description: string;
  placeholder: string;
  icon: string;
}

const INTERVENTION_OPTIONS: InterventionOption[] = [
  {
    type: 'question',
    label: 'Ask a Question',
    description: 'Request more information or explanation',
    placeholder: 'What would you like to know more about?',
    icon: '?',
  },
  {
    type: 'challenge',
    label: 'Challenge Argument',
    description: 'Question an assumption or claim',
    placeholder: 'What aspect of the argument do you want to challenge?',
    icon: '!',
  },
  {
    type: 'evidence',
    label: 'Submit Evidence',
    description: 'Provide additional facts or data',
    placeholder: 'What evidence would you like to introduce?',
    icon: '+',
  },
  {
    type: 'clarification',
    label: 'Request Clarification',
    description: 'Ask for a clearer explanation',
    placeholder: 'What needs to be clarified?',
    icon: 'i',
  },
];

interface InterventionFormProps {
  /** Pre-selected turn for targeted intervention */
  selectedTurn?: DebateTurn | null;
  /** Callback when form is submitted */
  onSubmit: (data: {
    type: Intervention['type'];
    content: string;
    targetTurnId?: string;
    targetSpeaker?: Speaker;
  }) => void;
  /** Callback when form is cancelled */
  onCancel: () => void;
  /** Whether form is currently submitting */
  isSubmitting?: boolean;
}

export const InterventionForm: React.FC<InterventionFormProps> = ({
  selectedTurn,
  onSubmit,
  onCancel,
  isSubmitting = false,
}) => {
  const formId = useId();
  const [selectedType, setSelectedType] = useState<Intervention['type']>('question');
  const [content, setContent] = useState('');
  const [targetSpeaker, setTargetSpeaker] = useState<Speaker | undefined>(
    selectedTurn?.speaker
  );

  const currentOption = INTERVENTION_OPTIONS.find((opt) => opt.type === selectedType);
  const isValid = content.trim().length >= 10;
  const charCount = content.length;
  const maxChars = 1000;

  /**
   * Handle type selection
   */
  const handleTypeSelect = useCallback((type: Intervention['type']) => {
    setSelectedType(type);
  }, []);

  /**
   * Handle content change
   */
  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      if (value.length <= maxChars) {
        setContent(value);
      }
    },
    []
  );

  /**
   * Handle speaker target selection
   */
  const handleSpeakerSelect = useCallback((speaker: Speaker | undefined) => {
    setTargetSpeaker(speaker);
  }, []);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!isValid || isSubmitting) return;

      onSubmit({
        type: selectedType,
        content: content.trim(),
        targetTurnId: selectedTurn?.id,
        targetSpeaker,
      });
    },
    [selectedType, content, selectedTurn, targetSpeaker, isValid, isSubmitting, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {/* Target Context (if turn selected) */}
      {selectedTurn && (
        <div className={styles.targetContext}>
          <span className={styles.contextLabel}>Responding to:</span>
          <blockquote className={styles.contextQuote}>
            <Badge
              variant={selectedTurn.speaker === 'PRO' ? 'success' : 'error'}
              size="sm"
            >
              {SPEAKER_INFO[selectedTurn.speaker].shortName}
            </Badge>
            <p>{selectedTurn.content.slice(0, 150)}...</p>
          </blockquote>
        </div>
      )}

      {/* Intervention Type Selection */}
      <fieldset className={styles.typeField}>
        <legend className={styles.fieldLabel}>Intervention Type</legend>
        <div className={styles.typeOptions}>
          {INTERVENTION_OPTIONS.map((option) => (
            <label
              key={option.type}
              className={`${styles.typeOption} ${
                selectedType === option.type ? styles.selected : ''
              }`}
            >
              <input
                type="radio"
                name={`${formId}-type`}
                value={option.type}
                checked={selectedType === option.type}
                onChange={() => handleTypeSelect(option.type)}
                className={styles.radioInput}
              />
              <span className={styles.typeIcon}>{option.icon}</span>
              <span className={styles.typeContent}>
                <span className={styles.typeLabel}>{option.label}</span>
                <span className={styles.typeDesc}>{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Target Speaker (optional) */}
      <fieldset className={styles.speakerField}>
        <legend className={styles.fieldLabel}>
          Direct to <span className={styles.optional}>(optional)</span>
        </legend>
        <div className={styles.speakerOptions}>
          <label
            className={`${styles.speakerOption} ${
              targetSpeaker === undefined ? styles.selected : ''
            }`}
          >
            <input
              type="radio"
              name={`${formId}-speaker`}
              value=""
              checked={targetSpeaker === undefined}
              onChange={() => handleSpeakerSelect(undefined)}
              className={styles.radioInput}
            />
            <span>Either side</span>
          </label>
          <label
            className={`${styles.speakerOption} ${styles.pro} ${
              targetSpeaker === 'PRO' ? styles.selected : ''
            }`}
          >
            <input
              type="radio"
              name={`${formId}-speaker`}
              value="PRO"
              checked={targetSpeaker === 'PRO'}
              onChange={() => handleSpeakerSelect('PRO')}
              className={styles.radioInput}
            />
            <span>Pro</span>
          </label>
          <label
            className={`${styles.speakerOption} ${styles.con} ${
              targetSpeaker === 'CON' ? styles.selected : ''
            }`}
          >
            <input
              type="radio"
              name={`${formId}-speaker`}
              value="CON"
              checked={targetSpeaker === 'CON'}
              onChange={() => handleSpeakerSelect('CON')}
              className={styles.radioInput}
            />
            <span>Con</span>
          </label>
        </div>
      </fieldset>

      {/* Content Input */}
      <div className={styles.contentField}>
        <Textarea
          label="Your Intervention"
          placeholder={currentOption?.placeholder}
          value={content}
          onChange={handleContentChange}
          rows={4}
          fullWidth
          disabled={isSubmitting}
          required
          helperText={`Minimum 10 characters required`}
        />
        <div className={styles.charCount}>
          <span className={charCount < 10 ? styles.charCountWarn : ''}>
            {charCount}
          </span>
          <span> / {maxChars}</span>
        </div>
      </div>

      {/* Form Actions */}
      <div className={styles.actions}>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!isValid || isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Intervention'}
        </Button>
      </div>
    </form>
  );
};

export default InterventionForm;
