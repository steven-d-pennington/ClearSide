/**
 * FlowModeSelector Component
 *
 * Selects the conversation flow mode and pace settings.
 */

import styles from './ConversationConfigModal.module.css';
import type { FlowMode } from '../../../types/conversation';

interface FlowModeSelectorProps {
  mode: FlowMode;
  onModeChange: (mode: FlowMode) => void;
  paceDelayMs: number;
  onPaceChange: (delay: number) => void;
  disabled?: boolean;
}

const FLOW_MODES = [
  {
    id: 'manual' as FlowMode,
    name: 'Manual',
    description: 'Click "Next" to advance each turn',
    icon: '👆',
  },
  {
    id: 'auto_stream' as FlowMode,
    name: 'Auto Stream',
    description: 'Conversation flows automatically',
    icon: '▶️',
  },
  {
    id: 'natural_pace' as FlowMode,
    name: 'Natural Pace',
    description: 'Automatic with realistic pauses',
    icon: '🎙️',
  },
];

export default function FlowModeSelector({
  mode,
  onModeChange,
  paceDelayMs,
  onPaceChange,
  disabled,
}: FlowModeSelectorProps) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Flow Mode</h3>

      <div className={styles.flowModeGrid}>
        {FLOW_MODES.map(flowMode => (
          <button
            key={flowMode.id}
            className={`${styles.flowModeCard} ${mode === flowMode.id ? styles.selected : ''}`}
            onClick={() => onModeChange(flowMode.id)}
            disabled={disabled}
            type="button"
          >
            <span className={styles.flowModeIcon}>{flowMode.icon}</span>
            <span className={styles.flowModeName}>{flowMode.name}</span>
            <span className={styles.flowModeDesc}>{flowMode.description}</span>
          </button>
        ))}
      </div>

      {mode === 'natural_pace' && (
        <div className={styles.paceControl}>
          <label className={styles.label}>
            Pause between turns: {(paceDelayMs / 1000).toFixed(1)}s
          </label>
          <input
            type="range"
            min={500}
            max={10000}
            step={500}
            value={paceDelayMs}
            onChange={e => onPaceChange(parseInt(e.target.value))}
            disabled={disabled}
            className={styles.slider}
          />
        </div>
      )}
    </div>
  );
}
