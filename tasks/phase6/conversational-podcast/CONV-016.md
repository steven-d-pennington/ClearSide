# CONV-016: ControlBar Component

**Task ID:** CONV-016
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** S (2-4 hours)
**Dependencies:** CONV-013 (Viewer Base)
**Status:** Done

---

## Context

This task creates the ControlBar component - the bottom control panel for managing conversation flow. It provides controls for advancing turns, changing flow mode, pausing/resuming, and exporting.

**References:**
- [CONV-013](./CONV-013.md) - ConversationViewer integration
- Existing pattern: `frontend/src/components/DebateControls/`

---

## Requirements

### Acceptance Criteria

- [x] Create `ControlBar` component
- [x] "Next" button for manual mode advancement
- [x] Pause/Resume button toggle
- [x] Flow mode selector dropdown
- [x] Pace slider for natural pace mode
- [x] Export button
- [x] Turn counter display
- [x] Disable controls appropriately based on status

---

## Implementation Guide

### Directory Structure

```
frontend/src/components/ConversationalPodcast/
├── ControlBar/
│   ├── ControlBar.tsx
│   ├── ControlBar.module.css
│   └── index.ts
```

### ControlBar Component

Create file: `frontend/src/components/ConversationalPodcast/ControlBar/ControlBar.tsx`

```tsx
import { useState } from 'react';
import styles from './ControlBar.module.css';
import type { SessionStatus, FlowMode } from '../../../types/conversation';

interface ControlBarProps {
  status: SessionStatus;
  flowMode: FlowMode;
  onAdvance: () => void;
  onPause: () => void;
  onResume: () => void;
  onFlowModeChange: (mode: FlowMode, paceDelayMs?: number) => void;
  onExport: () => void;
  turnCount: number;
}

const FLOW_MODE_OPTIONS: Array<{ value: FlowMode; label: string; icon: string }> = [
  { value: 'manual', label: 'Manual', icon: '👆' },
  { value: 'auto_stream', label: 'Auto', icon: '▶️' },
  { value: 'natural_pace', label: 'Natural', icon: '🎙️' },
];

export function ControlBar({
  status,
  flowMode,
  onAdvance,
  onPause,
  onResume,
  onFlowModeChange,
  onExport,
  turnCount,
}: ControlBarProps) {
  const [showPaceSlider, setShowPaceSlider] = useState(false);
  const [paceDelayMs, setPaceDelayMs] = useState(3000);

  const isLive = status === 'live';
  const isPaused = status === 'paused';
  const isCompleted = status === 'completed';
  const canControl = isLive || isPaused;

  const handleFlowModeChange = (mode: FlowMode) => {
    if (mode === 'natural_pace') {
      setShowPaceSlider(true);
    } else {
      setShowPaceSlider(false);
    }
    onFlowModeChange(mode, mode === 'natural_pace' ? paceDelayMs : undefined);
  };

  const handlePaceChange = (delay: number) => {
    setPaceDelayMs(delay);
    if (flowMode === 'natural_pace') {
      onFlowModeChange('natural_pace', delay);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.leftSection}>
        {/* Turn Counter */}
        <div className={styles.turnCounter}>
          <span className={styles.turnLabel}>Turn</span>
          <span className={styles.turnValue}>{turnCount}</span>
        </div>

        {/* Status Indicator */}
        <div className={`${styles.statusIndicator} ${styles[status]}`}>
          {status === 'live' && <span className={styles.liveDot} />}
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </div>
      </div>

      <div className={styles.centerSection}>
        {/* Advance Button (Manual Mode) */}
        {canControl && flowMode === 'manual' && (
          <button
            className={styles.advanceButton}
            onClick={onAdvance}
            disabled={!isLive}
          >
            <span className={styles.advanceIcon}>→</span>
            Next
          </button>
        )}

        {/* Pause/Resume Button */}
        {canControl && (
          <button
            className={`${styles.controlButton} ${isPaused ? styles.resumeButton : styles.pauseButton}`}
            onClick={isPaused ? onResume : onPause}
          >
            {isPaused ? (
              <>
                <span className={styles.icon}>▶</span>
                Resume
              </>
            ) : (
              <>
                <span className={styles.icon}>⏸</span>
                Pause
              </>
            )}
          </button>
        )}

        {/* Flow Mode Selector */}
        {canControl && (
          <div className={styles.flowModeSelector}>
            {FLOW_MODE_OPTIONS.map(option => (
              <button
                key={option.value}
                className={`${styles.flowModeOption} ${flowMode === option.value ? styles.active : ''}`}
                onClick={() => handleFlowModeChange(option.value)}
                title={option.label}
              >
                <span className={styles.flowModeIcon}>{option.icon}</span>
                <span className={styles.flowModeLabel}>{option.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Pace Slider (Natural Pace Mode) */}
        {canControl && flowMode === 'natural_pace' && (
          <div className={styles.paceControl}>
            <label className={styles.paceLabel}>
              Pace: {(paceDelayMs / 1000).toFixed(1)}s
            </label>
            <input
              type="range"
              min={500}
              max={10000}
              step={500}
              value={paceDelayMs}
              onChange={e => handlePaceChange(parseInt(e.target.value))}
              className={styles.paceSlider}
            />
          </div>
        )}
      </div>

      <div className={styles.rightSection}>
        {/* Export Button */}
        <button
          className={styles.exportButton}
          onClick={onExport}
          disabled={turnCount === 0}
        >
          <span className={styles.icon}>📥</span>
          Export
        </button>

        {/* Completed Message */}
        {isCompleted && (
          <div className={styles.completedMessage}>
            Conversation Complete
          </div>
        )}
      </div>
    </div>
  );
}

export default ControlBar;
```

### CSS Module

Create file: `ControlBar.module.css`

```css
.container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  gap: 1rem;
}

/* Sections */
.leftSection,
.rightSection {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 150px;
}

.rightSection {
  justify-content: flex-end;
}

.centerSection {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
  justify-content: center;
}

/* Turn Counter */
.turnCounter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--bg-primary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.turnLabel {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.turnValue {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

/* Status Indicator */
.statusIndicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
}

.statusIndicator.live {
  background: var(--green-100);
  color: var(--green-700);
}

.statusIndicator.paused {
  background: var(--yellow-100);
  color: var(--yellow-700);
}

.statusIndicator.completed {
  background: var(--blue-100);
  color: var(--blue-700);
}

.statusIndicator.configuring {
  background: var(--gray-100);
  color: var(--gray-700);
}

.liveDot {
  width: 8px;
  height: 8px;
  background: var(--green-500);
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Advance Button */
.advanceButton {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}

.advanceButton:hover:not(:disabled) {
  background: var(--primary-600);
}

.advanceButton:active:not(:disabled) {
  transform: scale(0.98);
}

.advanceButton:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.advanceIcon {
  font-size: 1.25rem;
}

/* Control Buttons */
.controlButton {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.pauseButton {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.pauseButton:hover {
  background: var(--gray-100);
}

.resumeButton {
  background: var(--green-50);
  border-color: var(--green-200);
  color: var(--green-700);
}

.resumeButton:hover {
  background: var(--green-100);
}

.icon {
  font-size: 0.875rem;
}

/* Flow Mode Selector */
.flowModeSelector {
  display: flex;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.flowModeOption {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
}

.flowModeOption:not(:last-child) {
  border-right: 1px solid var(--border-color);
}

.flowModeOption:hover {
  background: var(--gray-50);
}

.flowModeOption.active {
  background: var(--primary-50);
}

.flowModeIcon {
  font-size: 1rem;
}

.flowModeLabel {
  font-size: 0.625rem;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.flowModeOption.active .flowModeLabel {
  color: var(--primary-700);
  font-weight: 500;
}

/* Pace Control */
.paceControl {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.paceLabel {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.paceSlider {
  width: 100px;
  cursor: pointer;
}

/* Export Button */
.exportButton {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.exportButton:hover:not(:disabled) {
  background: var(--gray-100);
}

.exportButton:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Completed Message */
.completedMessage {
  padding: 0.5rem 1rem;
  background: var(--blue-50);
  color: var(--blue-700);
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
}

/* Responsive */
@media (max-width: 768px) {
  .container {
    flex-wrap: wrap;
    padding: 0.75rem;
  }

  .centerSection {
    order: -1;
    width: 100%;
    justify-content: center;
    margin-bottom: 0.5rem;
  }

  .flowModeLabel {
    display: none;
  }
}
```

### Export Index

Create file: `index.ts`

```typescript
export { default as ControlBar } from './ControlBar';
```

---

## Validation

### How to Test

1. Render ControlBar with various states:
   ```tsx
   <ControlBar
     status="live"
     flowMode="manual"
     onAdvance={() => console.log('Advance')}
     onPause={() => console.log('Pause')}
     onResume={() => console.log('Resume')}
     onFlowModeChange={(mode) => console.log('Mode:', mode)}
     onExport={() => console.log('Export')}
     turnCount={5}
   />
   ```

2. Verify:
   - Next button appears only in manual mode
   - Pause/Resume toggle works
   - Flow mode selector highlights active mode
   - Pace slider appears in natural pace mode
   - Export button works
   - Controls disabled when appropriate

### Definition of Done

- [x] ControlBar renders all controls
- [x] Next button works in manual mode
- [x] Pause/Resume toggles correctly
- [x] Flow mode selector works
- [x] Pace slider appears in natural pace mode
- [x] Export button triggers callback
- [x] Turn counter displays correctly
- [x] Status indicator shows current state
- [x] Controls disabled based on status
- [x] Responsive layout works
- [x] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-016 COMPLETE</promise>
```

---

**Estimated Time:** 2-4 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
