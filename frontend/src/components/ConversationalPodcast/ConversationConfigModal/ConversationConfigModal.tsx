/**
 * ConversationConfigModal
 *
 * Main configuration UI for setting up a new podcast conversation.
 * Users can enter a topic, select 2-6 personas with model assignments,
 * and choose a flow mode.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '../../ui';
import TopicInput from './TopicInput';
import ParticipantSelector from './ParticipantSelector';
import FlowModeSelector from './FlowModeSelector';
import styles from './ConversationConfigModal.module.css';
import type { PodcastPersona, FlowMode } from '../../../types/conversation';
import type { ModelInfo } from '../../../types/configuration';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface ParticipantConfig {
  personaId: string | null;
  modelId: string;
  displayNameOverride?: string;
}

export interface ConversationConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunch: (sessionId: string) => void;
  initialTopic?: string;
  initialContext?: string;
  episodeProposalId?: string;
}

export function ConversationConfigModal({
  isOpen,
  onClose,
  onLaunch,
  initialTopic = '',
  initialContext = '',
  episodeProposalId,
}: ConversationConfigModalProps) {
  // State
  const [topic, setTopic] = useState(initialTopic);
  const [topicContext, setTopicContext] = useState(initialContext);
  const [personas, setPersonas] = useState<PodcastPersona[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [participants, setParticipants] = useState<ParticipantConfig[]>([
    { personaId: null, modelId: '' },
    { personaId: null, modelId: '' },
  ]);
  const [flowMode, setFlowMode] = useState<FlowMode>('manual');
  const [paceDelayMs, setPaceDelayMs] = useState(3000);
  const [rapidFire, setRapidFire] = useState(false);
  const [minimalPersonaMode, setMinimalPersonaMode] = useState(false);

  // Loading/error states
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTopic(initialTopic);
      setTopicContext(initialContext);
      setError(null);
    }
  }, [isOpen, initialTopic, initialContext]);

  // Fetch personas and models on mount
  useEffect(() => {
    if (!isOpen) return;

    async function loadData() {
      setIsLoading(true);
      setError(null);

      try {
        const [personasRes, modelsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/conversations/personas`),
          fetch(`${API_BASE_URL}/api/models`),
        ]);

        if (!personasRes.ok) throw new Error('Failed to load personas');
        if (!modelsRes.ok) throw new Error('Failed to load models');

        const personasData = await personasRes.json();
        const modelsData = await modelsRes.json();

        setPersonas(personasData.personas || []);
        setModels(modelsData.models || []);

        // Set default models for participants
        const defaultModel = modelsData.models?.[0]?.id || '';
        setParticipants(prev =>
          prev.map(p => ({ ...p, modelId: p.modelId || defaultModel }))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [isOpen]);

  // Update participant
  const updateParticipant = useCallback((index: number, updates: Partial<ParticipantConfig>) => {
    setParticipants(prev => {
      const updated = [...prev];
      const current = updated[index];
      if (current) {
        updated[index] = { ...current, ...updates };
      }
      return updated;
    });
  }, []);

  // Add participant (max 6)
  const addParticipant = useCallback(() => {
    if (participants.length >= 6) return;
    const defaultModel = models[0]?.id || '';
    setParticipants(prev => [...prev, { personaId: null, modelId: defaultModel }]);
  }, [participants.length, models]);

  // Remove participant (min 2)
  const removeParticipant = useCallback((index: number) => {
    if (participants.length <= 2) return;
    setParticipants(prev => prev.filter((_, i) => i !== index));
  }, [participants.length]);

  // Validate form
  const isValid = useCallback(() => {
    if (!topic.trim()) return false;
    if (participants.length < 2) return false;

    for (const p of participants) {
      if (!p.personaId || !p.modelId) return false;
    }

    // Check for duplicate personas
    const personaIds = participants.map(p => p.personaId).filter(Boolean);
    if (new Set(personaIds).size !== personaIds.length) return false;

    return true;
  }, [topic, participants]);

  // Create session
  const handleCreate = async () => {
    if (!isValid()) return;

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          topicContext: topicContext.trim() || undefined,
          episodeProposalId,
          flowMode,
          paceDelayMs,
          rapidFire,
          minimalPersonaMode,
          participants: participants.map(p => ({
            personaId: p.personaId,
            modelId: p.modelId,
            displayNameOverride: p.displayNameOverride || undefined,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create session');
      }

      const { session } = await response.json();
      onLaunch(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isCreating) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isCreating, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            <span className={styles.titleIcon}>🎙️</span>
            Start Conversation
          </h2>
          <button className={styles.closeBtn} onClick={onClose} disabled={isCreating}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {isLoading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Loading personas...</span>
          </div>
        ) : (
          <div className={styles.body}>
            <TopicInput
              topic={topic}
              onTopicChange={setTopic}
              topicContext={topicContext}
              onContextChange={setTopicContext}
              disabled={isCreating}
            />

            <div className={styles.divider} />

            <ParticipantSelector
              participants={participants}
              personas={personas}
              models={models}
              onUpdateParticipant={updateParticipant}
              onAddParticipant={addParticipant}
              onRemoveParticipant={removeParticipant}
              disabled={isCreating}
            />

            <div className={styles.divider} />

            <FlowModeSelector
              mode={flowMode}
              onModeChange={setFlowMode}
              paceDelayMs={paceDelayMs}
              onPaceChange={setPaceDelayMs}
              disabled={isCreating}
            />

            <div className={styles.divider} />

            <div className={styles.rapidFireSection}>
              <label className={styles.rapidFireToggle}>
                <input
                  type="checkbox"
                  checked={rapidFire}
                  onChange={(e) => setRapidFire(e.target.checked)}
                  disabled={isCreating}
                  className={styles.rapidFireCheckbox}
                />
                <span className={styles.rapidFireLabel}>Rapid Fire Mode</span>
              </label>
              <p className={styles.rapidFireDescription}>
                Quick back-and-forth with short, punchy responses (2-4 sentences)
              </p>
            </div>

            <div className={styles.rapidFireSection}>
              <label className={styles.rapidFireToggle}>
                <input
                  type="checkbox"
                  checked={minimalPersonaMode}
                  onChange={(e) => setMinimalPersonaMode(e.target.checked)}
                  disabled={isCreating}
                  className={styles.rapidFireCheckbox}
                />
                <span className={styles.rapidFireLabel}>Model Debate Mode</span>
              </label>
              <p className={styles.rapidFireDescription}>
                AI models speak from their own reasoning without character personas
              </p>
            </div>
          </div>
        )}

        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            loading={isCreating}
            disabled={!isValid() || isLoading}
          >
            Start Conversation
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConversationConfigModal;
