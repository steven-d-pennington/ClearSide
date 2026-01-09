# CONV-015: ContextBoardPanel

**Task ID:** CONV-015
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P1
**Estimated Effort:** S (2-4 hours)
**Dependencies:** CONV-013 (Viewer Base), CONV-006 (ContextBoardService)
**Status:** Ready

---

## Context

This task creates the ContextBoardPanel - a sidebar component that displays the shared context state including topics discussed, claims made, agreements, disagreements, and key points per participant.

**References:**
- [CONV-006](./CONV-006.md) - ContextBoardService (defines state structure)
- [CONV-013](./CONV-013.md) - ConversationViewer integration

---

## Requirements

### Acceptance Criteria

- [ ] Create `ContextBoardPanel` component
- [ ] Display topics discussed with status badges
- [ ] Show claims made with participant attribution
- [ ] Display agreements and disagreements
- [ ] Show key points per participant
- [ ] Display current conversational thread
- [ ] Collapsible sections for each category

---

## Implementation Guide

### Directory Structure

```
frontend/src/components/ConversationalPodcast/
├── ContextBoardPanel/
│   ├── ContextBoardPanel.tsx
│   ├── ContextBoardPanel.module.css
│   └── index.ts
```

### ContextBoardPanel Component

Create file: `frontend/src/components/ConversationalPodcast/ContextBoardPanel/ContextBoardPanel.tsx`

```tsx
import { useState } from 'react';
import styles from './ContextBoardPanel.module.css';
import type { ContextBoardState } from '../../../types/conversation';

interface ParticipantInfo {
  id: string;
  name: string;
  personaSlug: string;
  avatarEmoji: string;
}

interface ContextBoardPanelProps {
  contextBoard: ContextBoardState | null;
  participants: ParticipantInfo[];
}

export function ContextBoardPanel({
  contextBoard,
  participants,
}: ContextBoardPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['topics', 'keyPoints'])
  );

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const getParticipantName = (id: string): string => {
    const participant = participants.find(p => p.id === id);
    return participant?.name || 'Unknown';
  };

  if (!contextBoard) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <span>📋</span>
          <p>Context board will appear as the conversation progresses</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Context Board</h2>

      {contextBoard.currentThread && (
        <div className={styles.currentThread}>
          <span className={styles.threadLabel}>Current Thread</span>
          <span className={styles.threadValue}>{contextBoard.currentThread}</span>
        </div>
      )}

      {/* Topics Discussed */}
      <Section
        title="Topics Discussed"
        count={contextBoard.topicsDiscussed.length}
        expanded={expandedSections.has('topics')}
        onToggle={() => toggleSection('topics')}
      >
        {contextBoard.topicsDiscussed.length === 0 ? (
          <EmptySection>No topics yet</EmptySection>
        ) : (
          <ul className={styles.list}>
            {contextBoard.topicsDiscussed.map((topic, i) => (
              <li key={i} className={styles.listItem}>
                <span className={styles.topicText}>{topic.topic}</span>
                <StatusBadge status={topic.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Claims Made */}
      <Section
        title="Claims Made"
        count={contextBoard.claims.length}
        expanded={expandedSections.has('claims')}
        onToggle={() => toggleSection('claims')}
      >
        {contextBoard.claims.length === 0 ? (
          <EmptySection>No claims yet</EmptySection>
        ) : (
          <ul className={styles.list}>
            {contextBoard.claims.slice(-5).map((claim, i) => (
              <li key={i} className={styles.claimItem}>
                <span className={styles.claimAuthor}>
                  {getParticipantName(claim.participantId)}:
                </span>
                <span className={styles.claimContent}>{claim.content}</span>
                <StanceBadge stance={claim.stance} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Agreements */}
      <Section
        title="Agreements"
        count={contextBoard.agreements.length}
        expanded={expandedSections.has('agreements')}
        onToggle={() => toggleSection('agreements')}
        variant="positive"
      >
        {contextBoard.agreements.length === 0 ? (
          <EmptySection>No agreements yet</EmptySection>
        ) : (
          <ul className={styles.list}>
            {contextBoard.agreements.map((agreement, i) => (
              <li key={i} className={styles.agreementItem}>
                <span className={styles.agreementParticipants}>
                  {agreement.participants.map(p =>
                    typeof p === 'string' ? p : getParticipantName(p)
                  ).join(' & ')}
                </span>
                <span className={styles.agreementTopic}>on {agreement.topic}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Disagreements */}
      <Section
        title="Disagreements"
        count={contextBoard.disagreements.length}
        expanded={expandedSections.has('disagreements')}
        onToggle={() => toggleSection('disagreements')}
        variant="negative"
      >
        {contextBoard.disagreements.length === 0 ? (
          <EmptySection>No disagreements yet</EmptySection>
        ) : (
          <ul className={styles.list}>
            {contextBoard.disagreements.map((disagreement, i) => (
              <li key={i} className={styles.disagreementItem}>
                <span className={styles.disagreementParticipants}>
                  {disagreement.participants.map(p =>
                    typeof p === 'string' ? p : getParticipantName(p)
                  ).join(' vs ')}
                </span>
                <span className={styles.disagreementTopic}>on {disagreement.topic}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Key Points by Participant */}
      <Section
        title="Key Points"
        count={Object.values(contextBoard.keyPointsByParticipant).flat().length}
        expanded={expandedSections.has('keyPoints')}
        onToggle={() => toggleSection('keyPoints')}
      >
        {Object.keys(contextBoard.keyPointsByParticipant).length === 0 ? (
          <EmptySection>No key points yet</EmptySection>
        ) : (
          <div className={styles.keyPointsContainer}>
            {Object.entries(contextBoard.keyPointsByParticipant).map(([participantId, points]) => {
              const participant = participants.find(p => p.id === participantId);
              if (!points || points.length === 0) return null;

              return (
                <div key={participantId} className={styles.participantKeyPoints}>
                  <div className={styles.participantHeader}>
                    <span className={styles.participantEmoji}>
                      {participant?.avatarEmoji || '👤'}
                    </span>
                    <span className={styles.participantName}>
                      {participant?.name || 'Unknown'}
                    </span>
                  </div>
                  <ul className={styles.keyPointsList}>
                    {points.slice(-3).map((point, i) => (
                      <li key={i} className={styles.keyPoint}>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

// Sub-components
interface SectionProps {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  variant?: 'default' | 'positive' | 'negative';
  children: React.ReactNode;
}

function Section({ title, count, expanded, onToggle, variant = 'default', children }: SectionProps) {
  return (
    <div className={`${styles.section} ${styles[variant]}`}>
      <button className={styles.sectionHeader} onClick={onToggle}>
        <span className={styles.sectionTitle}>{title}</span>
        <span className={styles.sectionCount}>{count}</span>
        <span className={styles.expandIcon}>{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && <div className={styles.sectionContent}>{children}</div>}
    </div>
  );
}

function EmptySection({ children }: { children: React.ReactNode }) {
  return <p className={styles.emptyText}>{children}</p>;
}

function StatusBadge({ status }: { status: string }) {
  const statusClass = {
    active: styles.statusActive,
    resolved: styles.statusResolved,
    tabled: styles.statusTabled,
  }[status] || styles.statusActive;

  return (
    <span className={`${styles.statusBadge} ${statusClass}`}>
      {status}
    </span>
  );
}

function StanceBadge({ stance }: { stance: string }) {
  const stanceClass = {
    supporting: styles.stanceSupporting,
    challenging: styles.stanceChallenging,
    neutral: styles.stanceNeutral,
  }[stance] || styles.stanceNeutral;

  return (
    <span className={`${styles.stanceBadge} ${stanceClass}`}>
      {stance}
    </span>
  );
}

export default ContextBoardPanel;
```

### CSS Module

Create file: `ContextBoardPanel.module.css`

```css
.container {
  width: 320px;
  height: 100%;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  overflow-y: auto;
  padding: 1rem;
}

.title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  color: var(--text-primary);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-secondary);
  text-align: center;
}

.empty span {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

/* Current Thread */
.currentThread {
  padding: 0.75rem;
  background: var(--primary-50);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.threadLabel {
  display: block;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--primary-600);
  margin-bottom: 0.25rem;
}

.threadValue {
  font-size: 0.875rem;
  color: var(--text-primary);
}

/* Sections */
.section {
  margin-bottom: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.section.positive {
  border-color: var(--green-200);
}

.section.negative {
  border-color: var(--red-200);
}

.sectionHeader {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0.75rem;
  background: var(--bg-primary);
  border: none;
  cursor: pointer;
  text-align: left;
}

.sectionTitle {
  flex: 1;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
}

.sectionCount {
  padding: 0.125rem 0.5rem;
  background: var(--gray-100);
  border-radius: 10px;
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-right: 0.5rem;
}

.expandIcon {
  font-size: 0.625rem;
  color: var(--text-secondary);
}

.sectionContent {
  padding: 0.75rem;
  background: var(--bg-secondary);
}

/* Lists */
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.listItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border-color);
}

.listItem:last-child {
  border-bottom: none;
}

.topicText {
  font-size: 0.875rem;
  color: var(--text-primary);
}

/* Status Badges */
.statusBadge {
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-size: 0.625rem;
  text-transform: uppercase;
  font-weight: 500;
}

.statusActive { background: var(--green-100); color: var(--green-700); }
.statusResolved { background: var(--blue-100); color: var(--blue-700); }
.statusTabled { background: var(--gray-100); color: var(--gray-700); }

/* Claims */
.claimItem {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border-color);
}

.claimAuthor {
  font-weight: 500;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.claimContent {
  display: block;
  font-size: 0.875rem;
  color: var(--text-primary);
  margin: 0.25rem 0;
}

.stanceBadge {
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 0.625rem;
}

.stanceSupporting { background: var(--green-100); color: var(--green-700); }
.stanceChallenging { background: var(--red-100); color: var(--red-700); }
.stanceNeutral { background: var(--gray-100); color: var(--gray-700); }

/* Agreements/Disagreements */
.agreementItem,
.disagreementItem {
  padding: 0.5rem 0;
  font-size: 0.875rem;
}

.agreementParticipants,
.disagreementParticipants {
  font-weight: 500;
  color: var(--text-primary);
}

.agreementTopic,
.disagreementTopic {
  color: var(--text-secondary);
  font-size: 0.75rem;
}

/* Key Points */
.keyPointsContainer {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.participantKeyPoints {
  background: var(--bg-primary);
  border-radius: 6px;
  padding: 0.75rem;
}

.participantHeader {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.participantEmoji {
  font-size: 1.25rem;
}

.participantName {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.keyPointsList {
  list-style: disc;
  margin: 0;
  padding-left: 1.25rem;
}

.keyPoint {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}

.emptyText {
  font-size: 0.875rem;
  color: var(--text-secondary);
  font-style: italic;
  margin: 0;
}
```

---

## Validation

### How to Test

1. Render with test context board state:
   ```tsx
   <ContextBoardPanel
     contextBoard={{
       topicsDiscussed: [{ topic: 'AI Ethics', status: 'active', ... }],
       claims: [{ participantId: 'p1', content: 'AI will help healthcare', stance: 'supporting', ... }],
       agreements: [],
       disagreements: [],
       keyPointsByParticipant: { 'p1': ['Important insight...'] },
       currentThread: 'Healthcare applications',
       speakerQueue: [],
     }}
     participants={[{ id: 'p1', name: 'Professor Clara', ... }]}
   />
   ```

2. Verify:
   - Sections are collapsible
   - Topics show with status badges
   - Claims attributed to participants
   - Key points grouped by participant
   - Current thread displayed prominently

### Definition of Done

- [ ] ContextBoardPanel renders all sections
- [ ] Topics display with status badges
- [ ] Claims show participant and stance
- [ ] Agreements/disagreements display correctly
- [ ] Key points grouped by participant
- [ ] Sections collapsible
- [ ] Current thread prominently displayed
- [ ] Empty states for each section
- [ ] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-015 COMPLETE</promise>
```

---

**Estimated Time:** 2-4 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
