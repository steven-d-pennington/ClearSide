/**
 * InterventionPanel - User intervention/challenge interface
 *
 * Allows users to submit questions, challenges, evidence, and clarification requests
 * during a live debate. Displays pending and addressed interventions.
 */

import React, { useState, useCallback } from 'react';
import { useDebateStore, selectPendingInterventions } from '../../stores/debate-store';
import { Button, Modal, Badge, Alert } from '../ui';
import { InterventionForm } from './InterventionForm';
import { InterventionCard } from './InterventionCard';
import type { Intervention, DebateTurn, Speaker } from '../../types/debate';
import styles from './InterventionPanel.module.css';

export interface InterventionPanelProps {
  /** Currently selected turn for targeted intervention */
  selectedTurn?: DebateTurn | null;
  /** Callback when panel is closed */
  onClose?: () => void;
  /** Additional CSS class */
  className?: string;
}

export const InterventionPanel: React.FC<InterventionPanelProps> = ({
  selectedTurn,
  onClose,
  className = '',
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [expandedInterventions, setExpandedInterventions] = useState<Set<string>>(new Set());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debate = useDebateStore((state) => state.debate);
  const submitIntervention = useDebateStore((state) => state.submitIntervention);
  const pendingInterventions = useDebateStore(selectPendingInterventions);

  // Get all interventions sorted by timestamp (newest first)
  const interventions = debate?.interventions.slice().sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  ) ?? [];

  const pendingCount = pendingInterventions.length;
  const isDebateLive = debate?.status === 'live' || debate?.status === 'paused';

  /**
   * Toggle expansion state of an intervention card
   */
  const toggleExpansion = useCallback((id: string) => {
    setExpandedInterventions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    async (data: {
      type: Intervention['type'];
      content: string;
      targetTurnId?: string;
      targetSpeaker?: Speaker;
    }) => {
      setIsSubmitting(true);
      setSubmitError(null);

      try {
        await submitIntervention(data);
        setIsFormOpen(false);
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : 'Failed to submit intervention'
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [submitIntervention]
  );

  /**
   * Open form with optional pre-selected turn
   */
  const handleOpenForm = useCallback(() => {
    setSubmitError(null);
    setIsFormOpen(true);
  }, []);

  /**
   * Close form and clear errors
   */
  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setSubmitError(null);
  }, []);

  return (
    <aside className={`${styles.panel} ${className}`} aria-label="Intervention panel">
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h2 className={styles.title}>Interventions</h2>
          {pendingCount > 0 && (
            <Badge variant="warning" size="sm">
              {pendingCount} pending
            </Badge>
          )}
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close intervention panel"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </Button>
        )}
      </header>

      {/* Action Button */}
      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={handleOpenForm}
          disabled={!isDebateLive}
          fullWidth
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={styles.buttonIcon}
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Submit Intervention
        </Button>
        {!isDebateLive && (
          <p className={styles.disabledHint}>
            Interventions available during live debate
          </p>
        )}
      </div>

      {/* Interventions List */}
      <div className={styles.list}>
        {interventions.length === 0 ? (
          <div className={styles.empty}>
            <p>No interventions yet</p>
            <p className={styles.emptyHint}>
              Submit questions, challenges, or evidence to participate in the debate
            </p>
          </div>
        ) : (
          interventions.map((intervention) => (
            <InterventionCard
              key={intervention.id}
              intervention={intervention}
              isExpanded={expandedInterventions.has(intervention.id)}
              onToggleExpand={() => toggleExpansion(intervention.id)}
            />
          ))
        )}
      </div>

      {/* Intervention Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        title="Submit Intervention"
        size="lg"
      >
        {submitError && (
          <Alert variant="error" className={styles.formError}>
            {submitError}
          </Alert>
        )}
        <InterventionForm
          selectedTurn={selectedTurn}
          onSubmit={handleSubmit}
          onCancel={handleCloseForm}
          isSubmitting={isSubmitting}
        />
      </Modal>
    </aside>
  );
};

export default InterventionPanel;
