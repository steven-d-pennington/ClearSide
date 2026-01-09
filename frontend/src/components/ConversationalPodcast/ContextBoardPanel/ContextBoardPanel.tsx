/**
 * ContextBoardPanel - Displays shared context state
 * Shows topics, claims, agreements, disagreements, and key points
 */

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
        count={contextBoard.topicsDiscussed?.length || 0}
        expanded={expandedSections.has('topics')}
        onToggle={() => toggleSection('topics')}
      >
        {!contextBoard.topicsDiscussed || contextBoard.topicsDiscussed.length === 0 ? (
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
        count={contextBoard.claims?.length || 0}
        expanded={expandedSections.has('claims')}
        onToggle={() => toggleSection('claims')}
      >
        {!contextBoard.claims || contextBoard.claims.length === 0 ? (
          <EmptySection>No claims yet</EmptySection>
        ) : (
          <ul className={styles.list}>
            {contextBoard.claims.slice(-5).map((claim, i) => (
              <li key={i} className={styles.claimItem}>
                <span className={styles.claimAuthor}>
                  {getParticipantName(claim.participantId)}:
                </span>
                <span className={styles.claimContent}>{claim.claim}</span>
                <StanceBadge stance={claim.stance} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Agreements */}
      <Section
        title="Agreements"
        count={contextBoard.agreements?.length || 0}
        expanded={expandedSections.has('agreements')}
        onToggle={() => toggleSection('agreements')}
        variant="positive"
      >
        {!contextBoard.agreements || contextBoard.agreements.length === 0 ? (
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
                <span className={styles.agreementTopic}> on {agreement.topic}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Disagreements */}
      <Section
        title="Disagreements"
        count={contextBoard.disagreements?.length || 0}
        expanded={expandedSections.has('disagreements')}
        onToggle={() => toggleSection('disagreements')}
        variant="negative"
      >
        {!contextBoard.disagreements || contextBoard.disagreements.length === 0 ? (
          <EmptySection>No disagreements yet</EmptySection>
        ) : (
          <ul className={styles.list}>
            {contextBoard.disagreements.map((disagreement, i) => {
              const sideANames = (disagreement.sideA || []).map(id => getParticipantName(id));
              const sideBNames = (disagreement.sideB || []).map(id => getParticipantName(id));
              return (
                <li key={i} className={styles.disagreementItem}>
                  <span className={styles.disagreementParticipants}>
                    {sideANames.join(', ')} vs {sideBNames.join(', ')}
                  </span>
                  <span className={styles.disagreementTopic}> on {disagreement.topic}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Key Points by Participant */}
      <Section
        title="Key Points"
        count={Object.values(contextBoard.keyPointsByParticipant || {}).flat().length}
        expanded={expandedSections.has('keyPoints')}
        onToggle={() => toggleSection('keyPoints')}
      >
        {!contextBoard.keyPointsByParticipant || Object.keys(contextBoard.keyPointsByParticipant).length === 0 ? (
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
