/**
 * Admin Persona Memory Page
 *
 * Manages personality memory for podcast personas:
 * - Core Values: Immutable personality anchors
 * - Opinions: Malleable stances on topics
 * - Relationships: Inter-persona dynamics
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../components/ui';
import type {
  PersonaCoreValue,
  PersonaOpinion,
  PersonaRelationshipWithNames,
  CoreValueType,
  OpinionStance,
  RelationshipDynamicType,
  CreateCoreValueInput,
  CreateOpinionInput,
  CreateRelationshipInput,
  UpdateCoreValueInput,
  UpdateOpinionInput,
  UpdateRelationshipInput,
} from '../types/persona-memory';
import {
  VALUE_TYPE_LABELS,
  VALUE_TYPE_DESCRIPTIONS,
  STANCE_LABELS,
  DYNAMIC_TYPE_LABELS,
} from '../types/persona-memory';
import type { PodcastPersona } from '../types/conversation';
import styles from './AdminPersonaMemoryPage.module.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

type TabType = 'profile' | 'values' | 'opinions' | 'relationships' | 'voice';

// Gemini TTS voices - full list of 30 voices (as of Jan 2026)
// @see https://ai.google.dev/gemini-api/docs/speech-generation
type VoiceGender = 'male' | 'female' | 'neutral';

interface GeminiVoice {
  id: string;
  name: string;
  description: string;
  gender: VoiceGender;
}

const GEMINI_VOICES: GeminiVoice[] = [
  // Original 8 voices
  { id: 'Aoede', name: 'Aoede', description: 'Breezy', gender: 'female' },
  { id: 'Charon', name: 'Charon', description: 'Informative', gender: 'male' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Excitable', gender: 'male' },
  { id: 'Kore', name: 'Kore', description: 'Firm', gender: 'female' },
  { id: 'Leda', name: 'Leda', description: 'Youthful', gender: 'female' },
  { id: 'Orus', name: 'Orus', description: 'Firm', gender: 'male' },
  { id: 'Puck', name: 'Puck', description: 'Upbeat', gender: 'male' },
  { id: 'Zephyr', name: 'Zephyr', description: 'Bright', gender: 'male' },
  // Additional 22 voices
  { id: 'Achernar', name: 'Achernar', description: 'Soft', gender: 'female' },
  { id: 'Achird', name: 'Achird', description: 'Friendly', gender: 'male' },
  { id: 'Algenib', name: 'Algenib', description: 'Gravelly', gender: 'male' },
  { id: 'Algieba', name: 'Algieba', description: 'Smooth', gender: 'male' },
  { id: 'Alnilam', name: 'Alnilam', description: 'Firm', gender: 'male' },
  { id: 'Autonoe', name: 'Autonoe', description: 'Bright', gender: 'female' },
  { id: 'Callirrhoe', name: 'Callirrhoe', description: 'Easy-going', gender: 'female' },
  { id: 'Despina', name: 'Despina', description: 'Smooth', gender: 'female' },
  { id: 'Enceladus', name: 'Enceladus', description: 'Breathy', gender: 'male' },
  { id: 'Erinome', name: 'Erinome', description: 'Clear', gender: 'female' },
  { id: 'Gacrux', name: 'Gacrux', description: 'Mature', gender: 'male' },
  { id: 'Iapetus', name: 'Iapetus', description: 'Clear', gender: 'male' },
  { id: 'Laomedeia', name: 'Laomedeia', description: 'Upbeat', gender: 'female' },
  { id: 'Pulcherrima', name: 'Pulcherrima', description: 'Forward', gender: 'female' },
  { id: 'Rasalgethi', name: 'Rasalgethi', description: 'Informative', gender: 'male' },
  { id: 'Sadachbia', name: 'Sadachbia', description: 'Lively', gender: 'male' },
  { id: 'Sadaltager', name: 'Sadaltager', description: 'Knowledgeable', gender: 'male' },
  { id: 'Schedar', name: 'Schedar', description: 'Even', gender: 'female' },
  { id: 'Sulafat', name: 'Sulafat', description: 'Warm', gender: 'male' },
  { id: 'Umbriel', name: 'Umbriel', description: 'Easy-going', gender: 'male' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', description: 'Gentle', gender: 'female' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', description: 'Casual', gender: 'male' },
];

// Helper to get gender icon
function getGenderIcon(gender: VoiceGender): string {
  return gender === 'female' ? '♀' : gender === 'male' ? '♂' : '⚥';
}

// ============================================================================
// Main Component
// ============================================================================

export function AdminPersonaMemoryPage() {
  const { personaId } = useParams<{ personaId: string }>();
  const [activeTab, setActiveTab] = useState<TabType>('profile');

  // Data state
  const [persona, setPersona] = useState<PodcastPersona | null>(null);
  const [personas, setPersonas] = useState<PodcastPersona[]>([]);
  const [coreValues, setCoreValues] = useState<PersonaCoreValue[]>([]);
  const [opinions, setOpinions] = useState<PersonaOpinion[]>([]);
  const [relationships, setRelationships] = useState<PersonaRelationshipWithNames[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Modal state
  const [editingValue, setEditingValue] = useState<PersonaCoreValue | 'new' | null>(null);
  const [editingOpinion, setEditingOpinion] = useState<PersonaOpinion | 'new' | null>(null);
  const [editingRelationship, setEditingRelationship] = useState<PersonaRelationshipWithNames | 'new' | null>(null);

  // Voice state (Gemini TTS only)
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | undefined>(undefined);

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchPersona = useCallback(async () => {
    if (!personaId) return;
    try {
      // Podcast personas are at /api/conversations/personas/:id
      const res = await fetch(`${API_BASE_URL}/api/conversations/personas/${personaId}`);
      if (!res.ok) throw new Error('Failed to load persona');
      const data = await res.json();
      setPersona(data.persona);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load persona');
    }
  }, [personaId]);

  const fetchPersonas = useCallback(async () => {
    try {
      // Fetch podcast personas for relationship dropdowns
      const res = await fetch(`${API_BASE_URL}/api/conversations/personas`);
      if (!res.ok) throw new Error('Failed to load personas');
      const data = await res.json();
      setPersonas(data.personas || []);
    } catch (err) {
      console.error('Failed to load personas:', err);
    }
  }, []);

  const fetchCoreValues = useCallback(async () => {
    if (!personaId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/personas/${personaId}/memory/core-values`);
      if (!res.ok) throw new Error('Failed to load core values');
      const data = await res.json();
      setCoreValues(data.coreValues || []);
    } catch (err) {
      console.error('Failed to load core values:', err);
    }
  }, [personaId]);

  const fetchOpinions = useCallback(async () => {
    if (!personaId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/personas/${personaId}/memory/opinions`);
      if (!res.ok) throw new Error('Failed to load opinions');
      const data = await res.json();
      setOpinions(data.opinions || []);
    } catch (err) {
      console.error('Failed to load opinions:', err);
    }
  }, [personaId]);

  const fetchRelationships = useCallback(async () => {
    if (!personaId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/personas/${personaId}/memory/relationships`);
      if (!res.ok) throw new Error('Failed to load relationships');
      const data = await res.json();
      setRelationships(data.relationships || []);
    } catch (err) {
      console.error('Failed to load relationships:', err);
    }
  }, [personaId]);

  // Initialize voice state when persona loads
  useEffect(() => {
    if (persona) {
      setSelectedVoiceId(persona.defaultVoiceId);
    }
  }, [persona]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      await Promise.all([
        fetchPersona(),
        fetchPersonas(),
        fetchCoreValues(),
        fetchOpinions(),
        fetchRelationships(),
      ]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchPersona, fetchPersonas, fetchCoreValues, fetchOpinions, fetchRelationships]);

  // ============================================================================
  // Core Values CRUD
  // ============================================================================

  const handleSaveValue = async (input: CreateCoreValueInput | UpdateCoreValueInput, id?: string) => {
    if (!personaId) return;
    setIsSaving(true);
    try {
      const url = id
        ? `${API_BASE_URL}/api/admin/personas/${personaId}/memory/core-values/${id}`
        : `${API_BASE_URL}/api/admin/personas/${personaId}/memory/core-values`;
      const res = await fetch(url, {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to save core value');
      await fetchCoreValues();
      setEditingValue(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteValue = async (id: string) => {
    if (!personaId || !confirm('Delete this core value?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/personas/${personaId}/memory/core-values/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      await fetchCoreValues();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  // ============================================================================
  // Opinions CRUD
  // ============================================================================

  const handleSaveOpinion = async (input: CreateOpinionInput | UpdateOpinionInput, id?: string) => {
    if (!personaId) return;
    setIsSaving(true);
    try {
      const url = id
        ? `${API_BASE_URL}/api/admin/personas/${personaId}/memory/opinions/${id}`
        : `${API_BASE_URL}/api/admin/personas/${personaId}/memory/opinions`;
      const res = await fetch(url, {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to save opinion');
      await fetchOpinions();
      setEditingOpinion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOpinion = async (id: string) => {
    if (!personaId || !confirm('Delete this opinion?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/personas/${personaId}/memory/opinions/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      await fetchOpinions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  // ============================================================================
  // Relationships CRUD
  // ============================================================================

  const handleSaveRelationship = async (input: CreateRelationshipInput | UpdateRelationshipInput, id?: string) => {
    if (!personaId) return;
    setIsSaving(true);
    try {
      const url = id
        ? `${API_BASE_URL}/api/admin/personas/${personaId}/memory/relationships/${id}`
        : `${API_BASE_URL}/api/admin/personas/${personaId}/memory/relationships`;
      const res = await fetch(url, {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to save relationship');
      await fetchRelationships();
      setEditingRelationship(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRelationship = async (id: string) => {
    if (!personaId || !confirm('Delete this relationship?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/personas/${personaId}/memory/relationships/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      await fetchRelationships();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  // ============================================================================
  // Voice Settings (Gemini TTS)
  // ============================================================================

  const handleSaveVoice = async () => {
    if (!personaId || !selectedVoiceId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/conversations/personas/${personaId}/voice`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'gemini',
          voiceId: selectedVoiceId,
          settings: null,
        }),
      });
      if (!res.ok) throw new Error('Failed to save voice settings');
      await fetchPersona();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearVoice = async () => {
    if (!personaId || !confirm('Clear default voice for this persona?')) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/conversations/personas/${personaId}/voice`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: null }),
      });
      if (!res.ok) throw new Error('Failed to clear voice settings');
      setSelectedVoiceId(undefined);
      await fetchPersona();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear');
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading persona memory...</p>
        </div>
      </div>
    );
  }

  if (error && !persona) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>Error</h2>
          <p>{error}</p>
          <Link to="/admin/config">Back to Configuration</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <Link to="/admin/config" className={styles.backLink}>
          ← Back to Configuration
        </Link>
        {persona && (
          <div className={styles.personaInfo}>
            <span className={styles.personaEmoji}>{persona.avatarEmoji || '🎭'}</span>
            <div className={styles.personaDetails}>
              <h1>{persona.name} — Memory</h1>
              <p>Manage core values, opinions, and relationships</p>
            </div>
          </div>
        )}
      </header>

      {error && (
        <div className={styles.error}>
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'profile' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Profile
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'values' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('values')}
        >
          Core Values
          <span className={styles.tabCount}>{coreValues.length}</span>
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'opinions' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('opinions')}
        >
          Opinions
          <span className={styles.tabCount}>{opinions.length}</span>
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'relationships' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('relationships')}
        >
          Relationships
          <span className={styles.tabCount}>{relationships.length}</span>
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'voice' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('voice')}
        >
          Voice
          {persona?.defaultVoiceId && <span className={styles.tabCount}>✓</span>}
        </button>
      </div>

      {/* Tab Content */}
      <div className={styles.tabContent}>
        {activeTab === 'profile' && persona && (
          <ProfileTab
            persona={persona}
            onSave={async (updates) => {
              if (!personaId) return;
              setIsSaving(true);
              try {
                const res = await fetch(`${API_BASE_URL}/api/conversations/personas/${personaId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updates),
                });
                if (!res.ok) throw new Error('Failed to save persona');
                await fetchPersona();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to save');
              } finally {
                setIsSaving(false);
              }
            }}
            isSaving={isSaving}
          />
        )}

        {activeTab === 'values' && (
          <CoreValuesTab
            values={coreValues}
            onAdd={() => setEditingValue('new')}
            onEdit={setEditingValue}
            onDelete={handleDeleteValue}
          />
        )}

        {activeTab === 'opinions' && (
          <OpinionsTab
            opinions={opinions}
            onAdd={() => setEditingOpinion('new')}
            onEdit={setEditingOpinion}
            onDelete={handleDeleteOpinion}
          />
        )}

        {activeTab === 'relationships' && (
          <RelationshipsTab
            relationships={relationships}
            personas={personas}
            currentPersonaId={personaId!}
            onAdd={() => setEditingRelationship('new')}
            onEdit={setEditingRelationship}
            onDelete={handleDeleteRelationship}
          />
        )}

        {activeTab === 'voice' && (
          <VoiceTab
            persona={persona}
            selectedVoiceId={selectedVoiceId}
            onVoiceChange={setSelectedVoiceId}
            onSave={handleSaveVoice}
            onClear={handleClearVoice}
            isSaving={isSaving}
          />
        )}
      </div>

      {/* Modals */}
      {editingValue && (
        <CoreValueModal
          value={editingValue === 'new' ? null : editingValue}
          personaId={personaId!}
          onSave={handleSaveValue}
          onClose={() => setEditingValue(null)}
          isSaving={isSaving}
        />
      )}

      {editingOpinion && (
        <OpinionModal
          opinion={editingOpinion === 'new' ? null : editingOpinion}
          personaId={personaId!}
          onSave={handleSaveOpinion}
          onClose={() => setEditingOpinion(null)}
          isSaving={isSaving}
        />
      )}

      {editingRelationship && (
        <RelationshipModal
          relationship={editingRelationship === 'new' ? null : editingRelationship}
          personaId={personaId!}
          personas={personas}
          existingRelationshipIds={relationships.map((r) => r.otherPersonaId)}
          onSave={handleSaveRelationship}
          onClose={() => setEditingRelationship(null)}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}

// ============================================================================
// Tab Components
// ============================================================================

interface CoreValuesTabProps {
  values: PersonaCoreValue[];
  onAdd: () => void;
  onEdit: (value: PersonaCoreValue) => void;
  onDelete: (id: string) => void;
}

function CoreValuesTab({ values, onAdd, onEdit, onDelete }: CoreValuesTabProps) {
  const sortedValues = [...values].sort((a, b) => a.priority - b.priority);

  return (
    <>
      <div className={styles.tabHeader}>
        <div>
          <h2>Core Values</h2>
          <p className={styles.tabDescription}>
            Immutable personality anchors that define who this persona is. These never auto-change — only you can modify them.
          </p>
        </div>
        <Button onClick={onAdd}>+ Add Value</Button>
      </div>

      {values.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>💎</span>
          <h3>No Core Values Yet</h3>
          <p>Core values define what this persona believes in and will never compromise on.</p>
          <Button onClick={onAdd}>Add First Value</Button>
        </div>
      ) : (
        <div className={styles.cardGrid}>
          {sortedValues.map((value) => (
            <div key={value.id} className={styles.valueCard}>
              <div className={styles.valueCardHeader}>
                <span className={styles.valueType}>{VALUE_TYPE_LABELS[value.valueType]}</span>
                <div className={styles.valueCardActions}>
                  <button className={styles.iconButton} onClick={() => onEdit(value)} title="Edit">
                    ✏️
                  </button>
                  <button
                    className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                    onClick={() => onDelete(value.id)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <p className={styles.valueDescription}>{value.description}</p>
              <div className={styles.valuePriority}>
                <span>Priority: {value.priority}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

interface OpinionsTabProps {
  opinions: PersonaOpinion[];
  onAdd: () => void;
  onEdit: (opinion: PersonaOpinion) => void;
  onDelete: (id: string) => void;
}

function OpinionsTab({ opinions, onAdd, onEdit, onDelete }: OpinionsTabProps) {
  const sortedOpinions = [...opinions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const getStanceClass = (stance: OpinionStance) => {
    const classMap: Record<OpinionStance, string> = {
      supports: styles.stanceSupports,
      opposes: styles.stanceOpposes,
      neutral: styles.stanceNeutral,
      mixed: styles.stanceMixed,
      evolving: styles.stanceEvolving,
    };
    return classMap[stance];
  };

  return (
    <>
      <div className={styles.tabHeader}>
        <div>
          <h2>Opinions</h2>
          <p className={styles.tabDescription}>
            Malleable stances on topics that can evolve over time. Lock opinions to prevent auto-changes, or let them develop naturally through conversations.
          </p>
        </div>
        <Button onClick={onAdd}>+ Add Opinion</Button>
      </div>

      {opinions.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>💭</span>
          <h3>No Opinions Yet</h3>
          <p>Opinions capture this persona's stance on various topics. They can evolve through conversations.</p>
          <Button onClick={onAdd}>Add First Opinion</Button>
        </div>
      ) : (
        <div className={styles.cardGrid}>
          {sortedOpinions.map((opinion) => (
            <div key={opinion.id} className={styles.opinionCard}>
              <div className={styles.opinionCardHeader}>
                <div>
                  <h3 className={styles.opinionTopic}>{opinion.topicDisplay || opinion.topicKey}</h3>
                  {opinion.topicDisplay && (
                    <div className={styles.opinionTopicKey}>{opinion.topicKey}</div>
                  )}
                </div>
                <div className={styles.valueCardActions}>
                  <button className={styles.iconButton} onClick={() => onEdit(opinion)} title="Edit">
                    ✏️
                  </button>
                  <button
                    className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                    onClick={() => onDelete(opinion.id)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <span className={`${styles.opinionStance} ${getStanceClass(opinion.stance)}`}>
                {STANCE_LABELS[opinion.stance]}
              </span>

              <p className={styles.opinionSummary}>{opinion.summary}</p>

              <div className={styles.opinionMeta}>
                <div className={styles.opinionMetaItem}>
                  <span>Strength:</span>
                  <div className={styles.strengthBar}>
                    <div
                      className={styles.strengthFill}
                      style={{ width: `${opinion.stanceStrength * 100}%` }}
                    />
                  </div>
                  <span>{Math.round(opinion.stanceStrength * 100)}%</span>
                </div>
                {!opinion.canEvolve && <span className={styles.lockedBadge}>🔒 Locked</span>}
                {opinion.adminCurated && <span className={styles.curatedBadge}>✨ Curated</span>}
                <span className={styles.opinionMetaItem}>
                  {opinion.discussionCount} discussion{opinion.discussionCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

interface RelationshipsTabProps {
  relationships: PersonaRelationshipWithNames[];
  personas: PodcastPersona[];
  currentPersonaId: string;
  onAdd: () => void;
  onEdit: (relationship: PersonaRelationshipWithNames) => void;
  onDelete: (id: string) => void;
}

function RelationshipsTab({ relationships, personas, onAdd, onEdit, onDelete }: RelationshipsTabProps) {
  const getOtherPersonaEmoji = (otherPersonaId: string) => {
    const persona = personas.find((p) => p.id === otherPersonaId);
    return persona?.avatarEmoji || '🎭';
  };

  return (
    <>
      <div className={styles.tabHeader}>
        <div>
          <h2>Relationships</h2>
          <p className={styles.tabDescription}>
            Dynamics between this persona and others. Track rapport, common ground, and friction points to make conversations more realistic.
          </p>
        </div>
        <Button onClick={onAdd}>+ Add Relationship</Button>
      </div>

      {relationships.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🤝</span>
          <h3>No Relationships Yet</h3>
          <p>Define how this persona interacts with others — allies, rivals, or respectful opponents.</p>
          <Button onClick={onAdd}>Add First Relationship</Button>
        </div>
      ) : (
        <div className={styles.cardGrid}>
          {relationships.map((rel) => (
            <div key={rel.id} className={styles.relationshipCard}>
              <div className={styles.relationshipCardHeader}>
                <div className={styles.relationshipPersonas}>
                  <span className={styles.relationshipEmoji}>{getOtherPersonaEmoji(rel.otherPersonaId)}</span>
                  <div className={styles.relationshipNames}>
                    <h3>{rel.otherPersonaName}</h3>
                    {rel.dynamicType && (
                      <span className={styles.relationshipDynamic}>
                        {DYNAMIC_TYPE_LABELS[rel.dynamicType]}
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.valueCardActions}>
                  <button className={styles.iconButton} onClick={() => onEdit(rel)} title="Edit">
                    ✏️
                  </button>
                  <button
                    className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                    onClick={() => onDelete(rel.id)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div className={styles.rapportScore}>
                <div className={styles.rapportLabel}>Rapport</div>
                <div className={styles.rapportValue}>{Math.round(rel.rapportScore * 100)}%</div>
              </div>

              <div className={styles.relationshipDetails}>
                {rel.commonGround.length > 0 && (
                  <div className={`${styles.relationshipSection} ${styles.commonGround}`}>
                    <h4>Common Ground</h4>
                    <ul>
                      {rel.commonGround.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {rel.frictionPoints.length > 0 && (
                  <div className={`${styles.relationshipSection} ${styles.frictionPoints}`}>
                    <h4>Friction Points</h4>
                    <ul>
                      {rel.frictionPoints.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ============================================================================
// Voice Tab Component
// ============================================================================

interface VoiceAssignment {
  personaId: string;
  personaName: string;
  avatarEmoji: string;
}

interface VoiceTabProps {
  persona: PodcastPersona | null;
  selectedVoiceId: string | undefined;
  onVoiceChange: (voiceId: string | undefined) => void;
  onSave: () => void;
  onClear: () => void;
  isSaving: boolean;
}

function VoiceTab({ persona, selectedVoiceId, onVoiceChange, onSave, onClear, isSaving }: VoiceTabProps) {
  const currentVoice = GEMINI_VOICES.find((v) => v.id === persona?.defaultVoiceId);
  const selectedVoice = GEMINI_VOICES.find((v) => v.id === selectedVoiceId);
  const hasChanges = selectedVoiceId !== persona?.defaultVoiceId;

  // Voice assignments state
  const [voiceAssignments, setVoiceAssignments] = useState<Record<string, VoiceAssignment>>({});
  const [loadingAssignments, setLoadingAssignments] = useState(true);

  // Preview state
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);

  // Fetch voice assignments on mount
  useEffect(() => {
    const fetchVoiceAssignments = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/conversations/personas/voice-assignments`);
        if (res.ok) {
          const data = await res.json();
          setVoiceAssignments(data.voiceAssignments || {});
        }
      } catch (err) {
        console.error('Failed to fetch voice assignments:', err);
      } finally {
        setLoadingAssignments(false);
      }
    };
    fetchVoiceAssignments();
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef) {
        audioRef.pause();
        audioRef.src = '';
      }
    };
  }, [audioRef]);

  const handlePreview = async (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent voice selection

    // If already playing this voice, stop it
    if (previewingVoiceId === voiceId && audioRef) {
      audioRef.pause();
      audioRef.src = '';
      setPreviewingVoiceId(null);
      return;
    }

    // Stop any currently playing audio
    if (audioRef) {
      audioRef.pause();
      audioRef.src = '';
    }

    setPreviewingVoiceId(voiceId);

    try {
      const previewText = `Hi, I'm ${persona?.name || 'your podcast persona'}. Nice to meet you!`;

      const res = await fetch(`${API_BASE_URL}/api/conversations/voice/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId,
          text: previewText,
          provider: 'gemini',
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate preview');
      }

      const data = await res.json();

      // Create audio element and play
      const audio = new Audio(`data:audio/mpeg;base64,${data.audio}`);
      setAudioRef(audio);

      audio.onended = () => {
        setPreviewingVoiceId(null);
      };

      audio.onerror = () => {
        setPreviewingVoiceId(null);
        console.error('Audio playback error');
      };

      await audio.play();
    } catch (err) {
      console.error('Preview failed:', err);
      setPreviewingVoiceId(null);
    }
  };

  const getAssignmentInfo = (voiceId: string): { assignment: VoiceAssignment | null; isSelf: boolean } => {
    const assignment = voiceAssignments[voiceId];
    if (!assignment) return { assignment: null, isSelf: false };
    return {
      assignment,
      isSelf: assignment.personaId === persona?.id,
    };
  };

  return (
    <>
      <div className={styles.tabHeader}>
        <div>
          <h2>Default Voice</h2>
          <p className={styles.tabDescription}>
            Assign a Gemini TTS voice to this persona for consistent podcast generation.
            This voice will be used by default when generating audio for this persona.
            Click the play button to preview each voice.
          </p>
        </div>
      </div>

      <div className={styles.voiceContent}>
        {/* Current Voice Display */}
        {currentVoice && (
          <div className={styles.currentVoice}>
            <h3>Current Voice</h3>
            <div className={styles.voiceCard}>
              <span className={styles.voiceName}>{currentVoice.name}</span>
              <span className={styles.voiceDescription}>{currentVoice.description}</span>
            </div>
          </div>
        )}

        {!currentVoice && (
          <div className={styles.noVoice}>
            <span className={styles.emptyIcon}>🔇</span>
            <h3>No Default Voice Set</h3>
            <p>Select a voice below to assign it to this persona.</p>
          </div>
        )}

        {/* Voice Selection */}
        <div className={styles.voiceSelection}>
          <h3>Select Voice {loadingAssignments && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>(loading...)</span>}</h3>
          <div className={styles.voiceGrid}>
            {GEMINI_VOICES.map((voice) => {
              const { assignment, isSelf } = getAssignmentInfo(voice.id);
              const isAssignedToOther = assignment && !isSelf;

              return (
                <button
                  key={voice.id}
                  type="button"
                  className={`${styles.voiceOption} ${selectedVoiceId === voice.id ? styles.voiceOptionSelected : ''} ${isAssignedToOther ? styles.voiceOptionDisabled : ''}`}
                  onClick={() => !isAssignedToOther && onVoiceChange(voice.id)}
                  disabled={!!isAssignedToOther}
                >
                  <div className={styles.voiceOptionHeader}>
                    <span className={styles.voiceName}>{voice.name}</span>
                    <div className={styles.voiceOptionActions}>
                      <button
                        type="button"
                        className={`${styles.voicePreviewBtn} ${previewingVoiceId === voice.id ? styles.voicePreviewBtnPlaying : ''}`}
                        onClick={(e) => handlePreview(voice.id, e)}
                        disabled={previewingVoiceId !== null && previewingVoiceId !== voice.id}
                        title={previewingVoiceId === voice.id ? 'Stop preview' : 'Preview voice'}
                      >
                        {previewingVoiceId === voice.id ? '⏹' : '▶'}
                      </button>
                      <span className={styles.voiceGender}>{getGenderIcon(voice.gender)}</span>
                    </div>
                  </div>
                  <span className={styles.voiceDescription}>{voice.description}</span>
                  {assignment && (
                    <div className={`${styles.voiceAssignmentBadge} ${isSelf ? styles.voiceAssignmentSelf : ''}`}>
                      <span className={styles.voiceAssignmentEmoji}>{assignment.avatarEmoji}</span>
                      <span>{isSelf ? 'Current persona' : assignment.personaName}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Voice Preview */}
        {selectedVoice && hasChanges && (
          <div className={styles.voicePreview}>
            <h4>Selected: {selectedVoice.name}</h4>
            <p>{selectedVoice.description}</p>
          </div>
        )}

        {/* Actions */}
        <div className={styles.voiceActions}>
          <Button
            onClick={onSave}
            disabled={isSaving || !selectedVoiceId || !hasChanges}
          >
            {isSaving ? 'Saving...' : 'Save Voice'}
          </Button>
          {persona?.defaultVoiceId && (
            <Button
              variant="ghost"
              onClick={onClear}
              disabled={isSaving}
            >
              Clear Voice
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Profile Tab Component
// ============================================================================

interface PersonaProfileUpdates {
  name?: string;
  avatarEmoji?: string;
  backstory?: string;
  speakingStyle?: string;
  worldview?: string;
  quirks?: string[];
  examplePhrases?: string[];
  preferredTopics?: string[];
}

interface ProfileTabProps {
  persona: PodcastPersona;
  onSave: (updates: PersonaProfileUpdates) => Promise<void>;
  isSaving: boolean;
}

function ProfileTab({ persona, onSave, isSaving }: ProfileTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(persona.name);
  const [avatarEmoji, setAvatarEmoji] = useState(persona.avatarEmoji);
  const [backstory, setBackstory] = useState(persona.backstory);
  const [speakingStyle, setSpeakingStyle] = useState(persona.speakingStyle);
  const [worldview, setWorldview] = useState(persona.worldview);
  const [quirks, setQuirks] = useState<string[]>(persona.quirks || []);
  const [examplePhrases, setExamplePhrases] = useState<string[]>(persona.examplePhrases || []);
  const [preferredTopics, setPreferredTopics] = useState<string[]>(persona.preferredTopics || []);

  // Reset form when persona changes
  useEffect(() => {
    setName(persona.name);
    setAvatarEmoji(persona.avatarEmoji);
    setBackstory(persona.backstory);
    setSpeakingStyle(persona.speakingStyle);
    setWorldview(persona.worldview);
    setQuirks(persona.quirks || []);
    setExamplePhrases(persona.examplePhrases || []);
    setPreferredTopics(persona.preferredTopics || []);
  }, [persona]);

  const handleSave = async () => {
    await onSave({
      name,
      avatarEmoji,
      backstory,
      speakingStyle,
      worldview,
      quirks: quirks.filter((q) => q.trim()),
      examplePhrases: examplePhrases.filter((p) => p.trim()),
      preferredTopics: preferredTopics.filter((t) => t.trim()),
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(persona.name);
    setAvatarEmoji(persona.avatarEmoji);
    setBackstory(persona.backstory);
    setSpeakingStyle(persona.speakingStyle);
    setWorldview(persona.worldview);
    setQuirks(persona.quirks || []);
    setExamplePhrases(persona.examplePhrases || []);
    setPreferredTopics(persona.preferredTopics || []);
    setIsEditing(false);
  };

  // Array field helpers
  const updateArrayItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string
  ) => {
    setter((prev) => {
      const newArr = [...prev];
      newArr[index] = value;
      return newArr;
    });
  };

  const addArrayItem = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => [...prev, '']);
  };

  const removeArrayItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number
  ) => {
    setter((prev) => prev.filter((_, i) => i !== index));
  };

  if (!isEditing) {
    // View Mode
    return (
      <>
        <div className={styles.tabHeader}>
          <div>
            <h2>Persona Profile</h2>
            <p className={styles.tabDescription}>
              Core personality traits that define how this persona thinks, speaks, and behaves.
            </p>
          </div>
          <Button onClick={() => setIsEditing(true)}>Edit Profile</Button>
        </div>

        <div className={styles.profileContent}>
          {/* Identity Section */}
          <div className={styles.profileSection}>
            <h3>Identity</h3>
            <div className={styles.profileField}>
              <label>Name</label>
              <p>{persona.name}</p>
            </div>
            <div className={styles.profileField}>
              <label>Avatar</label>
              <p className={styles.avatarDisplay}>{persona.avatarEmoji}</p>
            </div>
          </div>

          {/* Backstory Section */}
          <div className={styles.profileSection}>
            <h3>Backstory</h3>
            <p className={styles.profileText}>{persona.backstory || <em>No backstory defined</em>}</p>
          </div>

          {/* Worldview Section */}
          <div className={styles.profileSection}>
            <h3>Worldview</h3>
            <p className={styles.profileText}>{persona.worldview || <em>No worldview defined</em>}</p>
          </div>

          {/* Speaking Style Section */}
          <div className={styles.profileSection}>
            <h3>Speaking Style</h3>
            <p className={styles.profileText}>{persona.speakingStyle || <em>No speaking style defined</em>}</p>
          </div>

          {/* Quirks Section */}
          <div className={styles.profileSection}>
            <h3>Quirks</h3>
            {persona.quirks && persona.quirks.length > 0 ? (
              <ul className={styles.profileList}>
                {persona.quirks.map((quirk, i) => (
                  <li key={i}>{quirk}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.profileText}><em>No quirks defined</em></p>
            )}
          </div>

          {/* Example Phrases Section */}
          <div className={styles.profileSection}>
            <h3>Example Phrases</h3>
            {persona.examplePhrases && persona.examplePhrases.length > 0 ? (
              <ul className={styles.profileList}>
                {persona.examplePhrases.map((phrase, i) => (
                  <li key={i}>"{phrase}"</li>
                ))}
              </ul>
            ) : (
              <p className={styles.profileText}><em>No example phrases defined</em></p>
            )}
          </div>

          {/* Preferred Topics Section */}
          <div className={styles.profileSection}>
            <h3>Preferred Topics</h3>
            {persona.preferredTopics && persona.preferredTopics.length > 0 ? (
              <div className={styles.topicTags}>
                {persona.preferredTopics.map((topic, i) => (
                  <span key={i} className={styles.topicTag}>{topic}</span>
                ))}
              </div>
            ) : (
              <p className={styles.profileText}><em>No preferred topics defined</em></p>
            )}
          </div>

          {/* Voice Characteristics Section */}
          {persona.voiceCharacteristics && Object.keys(persona.voiceCharacteristics).length > 0 && (
            <div className={styles.profileSection}>
              <h3>Voice Characteristics</h3>
              <div className={styles.voiceCharacteristics}>
                {persona.voiceCharacteristics.pitch && (
                  <div className={styles.voiceCharItem}>
                    <label>Pitch</label>
                    <span>{persona.voiceCharacteristics.pitch}</span>
                  </div>
                )}
                {persona.voiceCharacteristics.pace && (
                  <div className={styles.voiceCharItem}>
                    <label>Pace</label>
                    <span>{persona.voiceCharacteristics.pace}</span>
                  </div>
                )}
                {persona.voiceCharacteristics.warmth && (
                  <div className={styles.voiceCharItem}>
                    <label>Warmth</label>
                    <span>{persona.voiceCharacteristics.warmth}</span>
                  </div>
                )}
                {persona.voiceCharacteristics.energy && (
                  <div className={styles.voiceCharItem}>
                    <label>Energy</label>
                    <span>{persona.voiceCharacteristics.energy}</span>
                  </div>
                )}
                {persona.voiceCharacteristics.tone && (
                  <div className={styles.voiceCharItem}>
                    <label>Tone</label>
                    <span>{persona.voiceCharacteristics.tone}</span>
                  </div>
                )}
                {persona.voiceCharacteristics.accent && (
                  <div className={styles.voiceCharItem}>
                    <label>Accent</label>
                    <span>{persona.voiceCharacteristics.accent}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  // Edit Mode
  return (
    <>
      <div className={styles.tabHeader}>
        <div>
          <h2>Edit Persona Profile</h2>
          <p className={styles.tabDescription}>
            Modify the core personality traits for this persona.
          </p>
        </div>
      </div>

      <div className={styles.profileEditForm}>
        {/* Identity Section */}
        <div className={styles.formSection}>
          <h3>Identity</h3>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Persona name"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Avatar Emoji</label>
              <input
                type="text"
                value={avatarEmoji}
                onChange={(e) => setAvatarEmoji(e.target.value)}
                placeholder="🎭"
                className={styles.emojiInput}
              />
            </div>
          </div>
        </div>

        {/* Backstory Section */}
        <div className={styles.formSection}>
          <h3>Backstory</h3>
          <div className={styles.formGroup}>
            <textarea
              value={backstory}
              onChange={(e) => setBackstory(e.target.value)}
              placeholder="Full character backstory..."
              rows={4}
            />
            <small>The persona's history, background, and formative experiences.</small>
          </div>
        </div>

        {/* Worldview Section */}
        <div className={styles.formSection}>
          <h3>Worldview</h3>
          <div className={styles.formGroup}>
            <textarea
              value={worldview}
              onChange={(e) => setWorldview(e.target.value)}
              placeholder="Their perspective and philosophy..."
              rows={3}
            />
            <small>How they see the world and what they believe to be true.</small>
          </div>
        </div>

        {/* Speaking Style Section */}
        <div className={styles.formSection}>
          <h3>Speaking Style</h3>
          <div className={styles.formGroup}>
            <textarea
              value={speakingStyle}
              onChange={(e) => setSpeakingStyle(e.target.value)}
              placeholder="How they communicate..."
              rows={3}
            />
            <small>Their communication patterns, vocabulary, and tone.</small>
          </div>
        </div>

        {/* Quirks Section */}
        <div className={styles.formSection}>
          <h3>Quirks</h3>
          <div className={styles.arrayEditor}>
            {quirks.map((quirk, index) => (
              <div key={index} className={styles.arrayItem}>
                <input
                  type="text"
                  value={quirk}
                  onChange={(e) => updateArrayItem(setQuirks, index, e.target.value)}
                  placeholder="Character quirk..."
                />
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                  onClick={() => removeArrayItem(setQuirks, index)}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className={styles.addArrayBtn}
              onClick={() => addArrayItem(setQuirks)}
            >
              + Add Quirk
            </button>
          </div>
        </div>

        {/* Example Phrases Section */}
        <div className={styles.formSection}>
          <h3>Example Phrases</h3>
          <div className={styles.arrayEditor}>
            {examplePhrases.map((phrase, index) => (
              <div key={index} className={styles.arrayItem}>
                <input
                  type="text"
                  value={phrase}
                  onChange={(e) => updateArrayItem(setExamplePhrases, index, e.target.value)}
                  placeholder="Example phrase..."
                />
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                  onClick={() => removeArrayItem(setExamplePhrases, index)}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className={styles.addArrayBtn}
              onClick={() => addArrayItem(setExamplePhrases)}
            >
              + Add Phrase
            </button>
          </div>
        </div>

        {/* Preferred Topics Section */}
        <div className={styles.formSection}>
          <h3>Preferred Topics</h3>
          <div className={styles.arrayEditor}>
            {preferredTopics.map((topic, index) => (
              <div key={index} className={styles.arrayItem}>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => updateArrayItem(setPreferredTopics, index, e.target.value)}
                  placeholder="Topic..."
                />
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                  onClick={() => removeArrayItem(setPreferredTopics, index)}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className={styles.addArrayBtn}
              onClick={() => addArrayItem(setPreferredTopics)}
            >
              + Add Topic
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className={styles.profileEditActions}>
          <Button variant="ghost" onClick={handleCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Modal Components
// ============================================================================

interface CoreValueModalProps {
  value: PersonaCoreValue | null;
  personaId: string;
  onSave: (input: CreateCoreValueInput | UpdateCoreValueInput, id?: string) => void;
  onClose: () => void;
  isSaving: boolean;
}

function CoreValueModal({ value, personaId, onSave, onClose, isSaving }: CoreValueModalProps) {
  const [valueType, setValueType] = useState<CoreValueType>(value?.valueType || 'belief');
  const [description, setDescription] = useState(value?.description || '');
  const [priority, setPriority] = useState(value?.priority || 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value) {
      onSave({ valueType, description, priority }, value.id);
    } else {
      onSave({ personaId, valueType, description, priority });
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2>{value ? 'Edit Core Value' : 'Add Core Value'}</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label>Value Type</label>
            <select value={valueType} onChange={(e) => setValueType(e.target.value as CoreValueType)}>
              {Object.entries(VALUE_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <small>{VALUE_TYPE_DESCRIPTIONS[valueType]}</small>
          </div>

          <div className={styles.formGroup}>
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Evidence-based reasoning is non-negotiable"
              required
            />
            <small>What does this persona fundamentally believe or stand for?</small>
          </div>

          <div className={styles.formGroup}>
            <label>Priority</label>
            <input
              type="number"
              min="1"
              max="10"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value) || 1)}
            />
            <small>Lower numbers = higher priority in prompts (1-10)</small>
          </div>

          <div className={styles.modalActions}>
            <Button variant="ghost" type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !description.trim()}>
              {isSaving ? 'Saving...' : value ? 'Save Changes' : 'Add Value'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface OpinionModalProps {
  opinion: PersonaOpinion | null;
  personaId: string;
  onSave: (input: CreateOpinionInput | UpdateOpinionInput, id?: string) => void;
  onClose: () => void;
  isSaving: boolean;
}

function OpinionModal({ opinion, personaId, onSave, onClose, isSaving }: OpinionModalProps) {
  const [topicKey, setTopicKey] = useState(opinion?.topicKey || '');
  const [topicDisplay, setTopicDisplay] = useState(opinion?.topicDisplay || '');
  const [stance, setStance] = useState<OpinionStance>(opinion?.stance || 'neutral');
  const [stanceStrength, setStanceStrength] = useState(opinion?.stanceStrength || 0.5);
  const [summary, setSummary] = useState(opinion?.summary || '');
  const [keyArguments, setKeyArguments] = useState<string[]>(opinion?.keyArguments || ['']);
  const [canEvolve, setCanEvolve] = useState(opinion?.canEvolve ?? true);
  const [adminCurated, setAdminCurated] = useState(opinion?.adminCurated ?? true);

  const handleAddArgument = () => {
    if (keyArguments.length < 5) {
      setKeyArguments([...keyArguments, '']);
    }
  };

  const handleRemoveArgument = (index: number) => {
    setKeyArguments(keyArguments.filter((_, i) => i !== index));
  };

  const handleArgumentChange = (index: number, value: string) => {
    const newArgs = [...keyArguments];
    newArgs[index] = value;
    setKeyArguments(newArgs);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const filteredArgs = keyArguments.filter((arg) => arg.trim());
    if (opinion) {
      onSave(
        { topicDisplay, stance, stanceStrength, summary, keyArguments: filteredArgs, canEvolve, adminCurated },
        opinion.id
      );
    } else {
      onSave({
        personaId,
        topicKey: topicKey.toLowerCase().replace(/\s+/g, '_'),
        topicDisplay: topicDisplay || topicKey,
        stance,
        stanceStrength,
        summary,
        keyArguments: filteredArgs,
        canEvolve,
        adminCurated,
      });
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2>{opinion ? 'Edit Opinion' : 'Add Opinion'}</h2>
        <form onSubmit={handleSubmit}>
          {!opinion && (
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Topic Key</label>
                <input
                  type="text"
                  value={topicKey}
                  onChange={(e) => setTopicKey(e.target.value)}
                  placeholder="ai_regulation"
                  required
                />
                <small>Normalized slug (auto-converted to snake_case)</small>
              </div>
              <div className={styles.formGroup}>
                <label>Display Name</label>
                <input
                  type="text"
                  value={topicDisplay}
                  onChange={(e) => setTopicDisplay(e.target.value)}
                  placeholder="AI Regulation"
                />
                <small>Human-readable topic name</small>
              </div>
            </div>
          )}

          {opinion && (
            <div className={styles.formGroup}>
              <label>Display Name</label>
              <input
                type="text"
                value={topicDisplay}
                onChange={(e) => setTopicDisplay(e.target.value)}
                placeholder={opinion.topicKey}
              />
            </div>
          )}

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Stance</label>
              <select value={stance} onChange={(e) => setStance(e.target.value as OpinionStance)}>
                {Object.entries(STANCE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Strength ({Math.round(stanceStrength * 100)}%)</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={stanceStrength}
                onChange={(e) => setStanceStrength(parseFloat(e.target.value))}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Summary</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Briefly describe their position on this topic..."
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Key Arguments (up to 5)</label>
            <div className={styles.keyArgumentsEditor}>
              {keyArguments.map((arg, index) => (
                <div key={index} className={styles.argumentItem}>
                  <input
                    type="text"
                    value={arg}
                    onChange={(e) => handleArgumentChange(index, e.target.value)}
                    placeholder={`Argument ${index + 1}`}
                  />
                  {keyArguments.length > 1 && (
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                      onClick={() => handleRemoveArgument(index)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {keyArguments.length < 5 && (
                <button type="button" className={styles.addArgumentBtn} onClick={handleAddArgument}>
                  + Add Argument
                </button>
              )}
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={`${styles.formGroup} ${styles.checkboxGroup}`}>
              <input
                type="checkbox"
                id="canEvolve"
                checked={canEvolve}
                onChange={(e) => setCanEvolve(e.target.checked)}
              />
              <label htmlFor="canEvolve">Can Evolve</label>
              <small>Allow this opinion to change through conversations</small>
            </div>
            <div className={`${styles.formGroup} ${styles.checkboxGroup}`}>
              <input
                type="checkbox"
                id="adminCurated"
                checked={adminCurated}
                onChange={(e) => setAdminCurated(e.target.checked)}
              />
              <label htmlFor="adminCurated">Admin Curated</label>
              <small>Mark as manually created/edited</small>
            </div>
          </div>

          {opinion && opinion.evolutionHistory.length > 0 && (
            <div className={styles.evolutionHistory}>
              <h3>Evolution History</h3>
              <div className={styles.evolutionTimeline}>
                {opinion.evolutionHistory.map((entry, index) => (
                  <div key={index} className={styles.evolutionEntry}>
                    <div className={styles.evolutionDate}>
                      {new Date(entry.date).toLocaleDateString()}
                    </div>
                    <div className={styles.evolutionChange}>
                      {STANCE_LABELS[entry.oldStance]} → {STANCE_LABELS[entry.newStance]}
                      <span> ({Math.round(entry.oldStrength * 100)}% → {Math.round(entry.newStrength * 100)}%)</span>
                    </div>
                    <div className={styles.evolutionReason}>{entry.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.modalActions}>
            <Button variant="ghost" type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !summary.trim() || (!opinion && !topicKey.trim())}>
              {isSaving ? 'Saving...' : opinion ? 'Save Changes' : 'Add Opinion'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface RelationshipModalProps {
  relationship: PersonaRelationshipWithNames | null;
  personaId: string;
  personas: PodcastPersona[];
  existingRelationshipIds: string[];
  onSave: (input: CreateRelationshipInput | UpdateRelationshipInput, id?: string) => void;
  onClose: () => void;
  isSaving: boolean;
}

function RelationshipModal({
  relationship,
  personaId,
  personas,
  existingRelationshipIds,
  onSave,
  onClose,
  isSaving,
}: RelationshipModalProps) {
  const [otherPersonaId, setOtherPersonaId] = useState(relationship?.otherPersonaId || '');
  const [rapportScore, setRapportScore] = useState(relationship?.rapportScore || 0.5);
  const [dynamicType, setDynamicType] = useState<RelationshipDynamicType | ''>(relationship?.dynamicType || '');
  const [commonGround, setCommonGround] = useState<string[]>(relationship?.commonGround || ['']);
  const [frictionPoints, setFrictionPoints] = useState<string[]>(relationship?.frictionPoints || ['']);

  // Filter out personas that already have relationships (for new relationships only)
  const availablePersonas = personas.filter(
    (p) => p.id !== personaId && (relationship || !existingRelationshipIds.includes(p.id))
  );

  const handleAddCommonGround = () => setCommonGround([...commonGround, '']);
  const handleRemoveCommonGround = (index: number) => setCommonGround(commonGround.filter((_, i) => i !== index));
  const handleCommonGroundChange = (index: number, value: string) => {
    const newItems = [...commonGround];
    newItems[index] = value;
    setCommonGround(newItems);
  };

  const handleAddFriction = () => setFrictionPoints([...frictionPoints, '']);
  const handleRemoveFriction = (index: number) => setFrictionPoints(frictionPoints.filter((_, i) => i !== index));
  const handleFrictionChange = (index: number, value: string) => {
    const newItems = [...frictionPoints];
    newItems[index] = value;
    setFrictionPoints(newItems);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const filteredCommonGround = commonGround.filter((item) => item.trim());
    const filteredFriction = frictionPoints.filter((item) => item.trim());

    if (relationship) {
      onSave(
        {
          rapportScore,
          dynamicType: dynamicType || undefined,
          commonGround: filteredCommonGround,
          frictionPoints: filteredFriction,
        },
        relationship.id
      );
    } else {
      onSave({
        personaId,
        otherPersonaId,
        rapportScore,
        dynamicType: dynamicType || undefined,
        commonGround: filteredCommonGround,
        frictionPoints: filteredFriction,
      });
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2>{relationship ? 'Edit Relationship' : 'Add Relationship'}</h2>
        <form onSubmit={handleSubmit}>
          {!relationship && (
            <div className={styles.formGroup}>
              <label>Other Persona</label>
              <select
                value={otherPersonaId}
                onChange={(e) => setOtherPersonaId(e.target.value)}
                required
              >
                <option value="">Select a persona...</option>
                {availablePersonas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.avatarEmoji} {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {relationship && (
            <div className={styles.formGroup}>
              <label>With</label>
              <input type="text" value={`${relationship.otherPersonaName}`} disabled />
            </div>
          )}

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Dynamic Type</label>
              <select
                value={dynamicType}
                onChange={(e) => setDynamicType(e.target.value as RelationshipDynamicType | '')}
              >
                <option value="">None specified</option>
                {Object.entries(DYNAMIC_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Rapport Score ({Math.round(rapportScore * 100)}%)</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={rapportScore}
                onChange={(e) => setRapportScore(parseFloat(e.target.value))}
              />
              <small>0% = hostile, 50% = neutral, 100% = close allies</small>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Common Ground</label>
            <div className={styles.keyArgumentsEditor}>
              {commonGround.map((item, index) => (
                <div key={index} className={styles.argumentItem}>
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => handleCommonGroundChange(index, e.target.value)}
                    placeholder="Topics they agree on..."
                  />
                  {commonGround.length > 1 && (
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                      onClick={() => handleRemoveCommonGround(index)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className={styles.addArgumentBtn} onClick={handleAddCommonGround}>
                + Add Common Ground
              </button>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Friction Points</label>
            <div className={styles.keyArgumentsEditor}>
              {frictionPoints.map((item, index) => (
                <div key={index} className={styles.argumentItem}>
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => handleFrictionChange(index, e.target.value)}
                    placeholder="Topics they clash on..."
                  />
                  {frictionPoints.length > 1 && (
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                      onClick={() => handleRemoveFriction(index)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className={styles.addArgumentBtn} onClick={handleAddFriction}>
                + Add Friction Point
              </button>
            </div>
          </div>

          <div className={styles.modalActions}>
            <Button variant="ghost" type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || (!relationship && !otherPersonaId)}>
              {isSaving ? 'Saving...' : relationship ? 'Save Changes' : 'Add Relationship'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminPersonaMemoryPage;
