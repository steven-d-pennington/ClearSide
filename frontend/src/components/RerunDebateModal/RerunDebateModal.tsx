/**
 * RerunDebateModal Component
 *
 * Modal for confirming and re-running a debate with its original parameters.
 * Shows the debate configuration and allows starting a new debate.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Button, Alert, Badge } from '../ui';
import styles from './RerunDebateModal.module.css';

interface DebateConfig {
  proposition: string;
  propositionContext?: Record<string, unknown>;
  debateMode: 'turn_based' | 'lively' | 'informal' | 'duelogic';
  flowMode: string;
  presetMode: string;
  brevityLevel: number;
  llmTemperature: number;
  maxTokensPerResponse: number;
  requireCitations: boolean;
  proPersonaId?: string;
  conPersonaId?: string;
  proPersonaName?: string;
  conPersonaName?: string;
  proModelId?: string;
  conModelId?: string;
  moderatorModelId?: string;
  livelySettings?: {
    aggressionLevel: number;
    maxInterruptsPerMinute: number;
    interruptCooldownMs: number;
    minSpeakingTimeMs: number;
    relevanceThreshold: number;
    contradictionBoost: number;
    pacingMode: string;
    interjectionMaxTokens: number;
  };
  informalSettings?: {
    participantNames: string[] | null;
    maxExchanges: number;
    minExchanges: number;
    endDetection: unknown;
    maxTokensPerTurn: number | null;
    temperature: number | null;
  };
  duelogicConfig?: {
    chairs: Array<{
      position: string;
      framework: string;
      modelId: string;
    }>;
    arbiter?: {
      modelId: string;
      accountabilityLevel: string;
    };
    flow?: {
      maxExchanges: number;
      style: string;
    };
    tone?: string;
    interruptions?: {
      enabled: boolean;
      aggressiveness: number;
    };
  };
}

interface RerunDebateModalProps {
  isOpen: boolean;
  onClose: () => void;
  debateId: string;
}

const DEBATE_MODE_LABELS: Record<string, string> = {
  turn_based: 'Turn-Based',
  lively: 'Lively',
  informal: 'Informal Discussion',
  duelogic: 'Duelogic',
};

const FLOW_MODE_LABELS: Record<string, string> = {
  auto: 'Auto',
  step: 'Step-by-Step',
};

export const RerunDebateModal: React.FC<RerunDebateModalProps> = ({
  isOpen,
  onClose,
  debateId,
}) => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<DebateConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  // Fetch debate config when modal opens
  useEffect(() => {
    if (!isOpen || !debateId) return;

    async function fetchConfig() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/debates/${debateId}/config`);
        if (!response.ok) {
          throw new Error('Failed to fetch debate configuration');
        }
        const data = await response.json();
        setConfig(data.config);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        setIsLoading(false);
      }
    }

    fetchConfig();
  }, [isOpen, debateId, API_BASE_URL]);

  const handleRerun = useCallback(async () => {
    if (!config) return;

    setIsSubmitting(true);
    setError(null);

    try {
      let response: Response;
      let newDebateId: string;

      if (config.debateMode === 'duelogic' && config.duelogicConfig) {
        // Re-run Duelogic debate
        response = await fetch(`${API_BASE_URL}/api/debates/duelogic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposition: config.proposition,
            propositionContext: config.propositionContext,
            config: config.duelogicConfig,
          }),
        });
      } else {
        // Re-run standard debate (turn_based, lively, or informal)
        const body: Record<string, unknown> = {
          question: config.proposition,
          context: config.propositionContext,
          flowMode: config.flowMode,
          presetMode: config.presetMode,
          brevityLevel: config.brevityLevel,
          llmTemperature: config.llmTemperature,
          maxTokensPerResponse: config.maxTokensPerResponse,
          requireCitations: config.requireCitations,
          proPersonaId: config.proPersonaId,
          conPersonaId: config.conPersonaId,
          proModelId: config.proModelId,
          conModelId: config.conModelId,
          moderatorModelId: config.moderatorModelId,
        };

        // Add lively settings if present
        if (config.debateMode === 'lively' && config.livelySettings) {
          body.debateMode = 'lively';
          body.livelySettings = config.livelySettings;
        } else if (config.debateMode === 'informal' && config.informalSettings) {
          body.discussionMode = 'informal';
          body.participants = config.informalSettings.participants;
          body.maxExchanges = config.informalSettings.maxExchanges;
          body.discussionStyle = config.informalSettings.discussionStyle;
          body.tone = config.informalSettings.tone;
        }

        response = await fetch(`${API_BASE_URL}/api/debates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start debate');
      }

      const data = await response.json();
      newDebateId = data.debateId || data.id;

      // Close modal and navigate to the new debate
      onClose();
      navigate(`/debates/${newDebateId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start debate');
    } finally {
      setIsSubmitting(false);
    }
  }, [config, API_BASE_URL, navigate, onClose]);

  const renderConfigSection = (title: string, items: [string, string | number | boolean | undefined][]) => {
    const filteredItems = items.filter(([, value]) => value !== undefined && value !== null && value !== '');
    if (filteredItems.length === 0) return null;

    return (
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        <dl className={styles.configList}>
          {filteredItems.map(([label, value]) => (
            <div key={label} className={styles.configItem}>
              <dt className={styles.configLabel}>{label}</dt>
              <dd className={styles.configValue}>
                {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  };

  const footer = (
    <div className={styles.footer}>
      <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={handleRerun}
        loading={isSubmitting}
        disabled={isLoading || !config}
      >
        Re-Run Debate
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Re-Run Debate"
      size="lg"
      footer={footer}
    >
      {isLoading ? (
        <div className={styles.loading}>Loading configuration...</div>
      ) : error ? (
        <Alert variant="error">{error}</Alert>
      ) : config ? (
        <div className={styles.content}>
          <Alert variant="info" className={styles.infoAlert}>
            This will create a <strong>new debate</strong> with the same parameters.
            The original debate will remain unchanged.
          </Alert>

          <div className={styles.propositionSection}>
            <h3 className={styles.propositionLabel}>Proposition</h3>
            <p className={styles.propositionText}>"{config.proposition}"</p>
          </div>

          <div className={styles.modeSection}>
            <Badge variant="primary">
              {DEBATE_MODE_LABELS[config.debateMode] || config.debateMode}
            </Badge>
            <Badge variant="secondary">
              {FLOW_MODE_LABELS[config.flowMode] || config.flowMode}
            </Badge>
          </div>

          {renderConfigSection('Configuration', [
            ['Preset', config.presetMode],
            ['Brevity Level', config.brevityLevel],
            ['Temperature', config.llmTemperature],
            ['Max Tokens', config.maxTokensPerResponse],
            ['Citations Required', config.requireCitations],
          ])}

          {(config.proPersonaName || config.conPersonaName) && renderConfigSection('Personas', [
            ['Pro Persona', config.proPersonaName],
            ['Con Persona', config.conPersonaName],
          ])}

          {(config.proModelId || config.conModelId || config.moderatorModelId) && renderConfigSection('Models', [
            ['Pro Model', config.proModelId],
            ['Con Model', config.conModelId],
            ['Moderator Model', config.moderatorModelId],
          ])}

          {config.livelySettings && renderConfigSection('Lively Mode Settings', [
            ['Aggression Level', config.livelySettings.aggressionLevel],
            ['Max Interrupts/Min', config.livelySettings.maxInterruptsPerMinute],
            ['Cooldown (ms)', config.livelySettings.interruptCooldownMs],
            ['Min Speaking Time (ms)', config.livelySettings.minSpeakingTimeMs],
            ['Relevance Threshold', config.livelySettings.relevanceThreshold],
            ['Pacing Mode', config.livelySettings.pacingMode],
          ])}

          {config.informalSettings && renderConfigSection('Informal Settings', [
            ['Max Exchanges', config.informalSettings.maxExchanges],
            ['Min Exchanges', config.informalSettings.minExchanges],
            ['Participants', config.informalSettings.participantNames?.length || 0],
            ['Max Tokens/Turn', config.informalSettings.maxTokensPerTurn],
          ])}

          {config.duelogicConfig && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Duelogic Configuration</h3>
              <div className={styles.chairsGrid}>
                {config.duelogicConfig.chairs?.map((chair, index) => (
                  <div key={chair.position || index} className={styles.chairCard}>
                    <span className={styles.chairPosition}>{chair.position}</span>
                    <span className={styles.chairFramework}>{chair.framework}</span>
                    <span className={styles.chairModel}>{chair.modelId}</span>
                  </div>
                ))}
              </div>
              {config.duelogicConfig.tone && (
                <p className={styles.duelogicMeta}>
                  <strong>Tone:</strong> {config.duelogicConfig.tone}
                </p>
              )}
              {config.duelogicConfig.flow?.maxExchanges && (
                <p className={styles.duelogicMeta}>
                  <strong>Max Exchanges:</strong> {config.duelogicConfig.flow.maxExchanges}
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
};

export default RerunDebateModal;
