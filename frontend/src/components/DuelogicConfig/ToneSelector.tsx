/**
 * ToneSelector Component
 *
 * Allows selection of debate tone (academic, respectful, spirited, heated).
 */

import React from 'react';
import type { DebateTone } from './duelogic-config.types';
import { TONE_INFO } from './duelogic-config.types';
import styles from './DuelogicConfig.module.css';

interface ToneSelectorProps {
  value: DebateTone;
  onChange: (tone: DebateTone) => void;
  disabled?: boolean;
}

const tones: DebateTone[] = ['academic', 'respectful', 'spirited', 'heated'];

export const ToneSelector: React.FC<ToneSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className={styles.toneSelector}>
      <label className={styles.sectionTitle}>Debate Tone</label>
      <div className={styles.toneGrid}>
        {tones.map((tone) => {
          const info = TONE_INFO[tone];
          const isSelected = value === tone;

          return (
            <button
              key={tone}
              type="button"
              className={`${styles.toneCard} ${isSelected ? styles.selected : ''}`}
              onClick={() => onChange(tone)}
              disabled={disabled}
              aria-pressed={isSelected}
            >
              <span className={styles.toneName}>{info.name}</span>
              <span className={styles.toneDesc}>{info.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ToneSelector;
