/**
 * QualitySettingsPanel Component
 *
 * Allows users to configure audio quality settings
 * including ElevenLabs model and output format.
 */

import React from 'react';
import type { PodcastExportConfig } from '../../types/podcast';
import { ELEVENLABS_MODELS, AUDIO_FORMATS } from '../../types/podcast';
import styles from './QualitySettingsPanel.module.css';

interface QualitySettingsPanelProps {
  config: PodcastExportConfig;
  onChange: (updates: Partial<PodcastExportConfig>) => void;
}

export function QualitySettingsPanel({
  config,
  onChange,
}: QualitySettingsPanelProps) {
  return (
    <div className={styles.container}>
      <p className={styles.description}>
        Configure audio quality and processing options.
      </p>

      {/* ElevenLabs Model Selection */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Voice Model</h4>
        <p className={styles.sectionHint}>
          Higher quality models produce more natural speech but cost more
        </p>

        <div className={styles.optionGrid}>
          {ELEVENLABS_MODELS.map((model) => (
            <button
              key={model.id}
              type="button"
              className={`${styles.optionCard} ${
                config.elevenLabsModel === model.id ? styles.selected : ''
              }`}
              onClick={() => onChange({ elevenLabsModel: model.id })}
            >
              <span className={styles.optionName}>{model.name}</span>
              <span className={styles.optionDescription}>{model.description}</span>
              {config.elevenLabsModel === model.id && (
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

      {/* Audio Format Selection */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Audio Format</h4>
        <p className={styles.sectionHint}>
          Choose the output format based on your needs
        </p>

        <div className={styles.formatList}>
          {AUDIO_FORMATS.map((format) => (
            <label
              key={format.id}
              className={`${styles.formatOption} ${
                config.outputFormat === format.id ? styles.selected : ''
              }`}
            >
              <input
                type="radio"
                name="audioFormat"
                value={format.id}
                checked={config.outputFormat === format.id}
                onChange={() => onChange({ outputFormat: format.id })}
              />
              <span className={styles.formatContent}>
                <span className={styles.formatName}>{format.name}</span>
                <span className={styles.formatDescription}>{format.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Processing Options */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Processing Options</h4>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={config.normalizeVolume}
            onChange={(e) => onChange({ normalizeVolume: e.target.checked })}
          />
          <span className={styles.checkboxContent}>
            <span className={styles.checkboxTitle}>Normalize Audio Levels</span>
            <span className={styles.checkboxHint}>
              Ensures consistent volume throughout (-16 LUFS)
            </span>
          </span>
        </label>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={config.useCustomPronunciation}
            onChange={(e) => onChange({ useCustomPronunciation: e.target.checked })}
          />
          <span className={styles.checkboxContent}>
            <span className={styles.checkboxTitle}>Use Custom Pronunciation</span>
            <span className={styles.checkboxHint}>
              Apply pronunciation dictionary for technical terms
            </span>
          </span>
        </label>
      </div>

      {/* Cost Estimate Info */}
      <div className={styles.infoBox}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          ElevenLabs pricing is approximately <strong>$0.15 per 1,000 characters</strong>.
          The exact cost depends on your subscription plan.
        </span>
      </div>
    </div>
  );
}

export default QualitySettingsPanel;
