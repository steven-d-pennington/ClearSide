/**
 * ScriptOptionsPanel Component
 *
 * Allows users to configure script refinement options
 * including intro/outro, transitions, and refinement model.
 */

import React from 'react';
import type { PodcastExportConfig } from '../../types/podcast';
import styles from './ScriptOptionsPanel.module.css';

interface ScriptOptionsPanelProps {
  config: PodcastExportConfig;
  onChange: (updates: Partial<PodcastExportConfig>) => void;
}

const REFINEMENT_MODELS = [
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast and cost-effective',
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    description: 'Best quality refinement',
  },
  {
    id: 'anthropic/claude-3-5-haiku',
    name: 'Claude 3.5 Haiku',
    description: 'Fast with good quality',
  },
  {
    id: 'anthropic/claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'High quality refinement',
  },
];

export function ScriptOptionsPanel({
  config,
  onChange,
}: ScriptOptionsPanelProps) {
  return (
    <div className={styles.container}>
      <p className={styles.description}>
        Configure how the debate transcript is refined into a podcast script.
      </p>

      {/* Content Options */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Content Options</h4>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={config.includeIntro}
            onChange={(e) => onChange({ includeIntro: e.target.checked })}
          />
          <span className={styles.checkboxContent}>
            <span className={styles.checkboxTitle}>Include Introduction</span>
            <span className={styles.checkboxHint}>
              Add a narrator introduction with topic overview
            </span>
          </span>
        </label>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={config.includeOutro}
            onChange={(e) => onChange({ includeOutro: e.target.checked })}
          />
          <span className={styles.checkboxContent}>
            <span className={styles.checkboxTitle}>Include Conclusion</span>
            <span className={styles.checkboxHint}>
              Add a narrator wrap-up summarizing key points
            </span>
          </span>
        </label>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={config.addTransitions}
            onChange={(e) => onChange({ addTransitions: e.target.checked })}
          />
          <span className={styles.checkboxContent}>
            <span className={styles.checkboxTitle}>Add Transitions</span>
            <span className={styles.checkboxHint}>
              Include smooth transitions between major points
            </span>
          </span>
        </label>
      </div>

      {/* Refinement Model Selection */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Refinement Model</h4>
        <p className={styles.sectionHint}>
          The AI model used to polish the transcript for natural speech
        </p>

        <div className={styles.modelGrid}>
          {REFINEMENT_MODELS.map((model) => (
            <button
              key={model.id}
              type="button"
              className={`${styles.modelCard} ${
                config.refinementModel === model.id ? styles.selected : ''
              }`}
              onClick={() => onChange({ refinementModel: model.id })}
            >
              <span className={styles.modelName}>{model.name}</span>
              <span className={styles.modelDescription}>{model.description}</span>
              {config.refinementModel === model.id && (
                <svg
                  className={styles.checkIcon}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ScriptOptionsPanel;
