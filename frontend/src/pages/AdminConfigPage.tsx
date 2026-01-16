/**
 * AdminConfigPage
 *
 * Configuration management page for presets, personas, and system settings.
 * Supports editing presets, personas, and model defaults.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button } from '../components/ui';
import styles from './AdminConfigPage.module.css';
import type { ModelDefaults, DebatePreset, Persona, PersonaArchetype, BrevityLevel } from '../types/configuration';
import type { PodcastPersona } from '../types/conversation';

interface TTSProvider {
  id: string;
  name: string;
  available: boolean;
  envVar?: string;
}

// Gemini TTS voice metadata with gender information (30 voices as of Jan 2026)
// Gender info from Google Cloud TTS documentation
interface GeminiVoiceInfo {
  name: string;
  description: string;
  gender: 'male' | 'female' | 'neutral';
}

const GEMINI_VOICES: Record<string, GeminiVoiceInfo> = {
  // Original 8 voices
  'Aoede': { name: 'Aoede', description: 'Breezy', gender: 'female' },
  'Charon': { name: 'Charon', description: 'Informative', gender: 'male' },
  'Fenrir': { name: 'Fenrir', description: 'Excitable', gender: 'male' },
  'Kore': { name: 'Kore', description: 'Firm', gender: 'female' },
  'Leda': { name: 'Leda', description: 'Youthful', gender: 'female' },
  'Orus': { name: 'Orus', description: 'Firm', gender: 'male' },
  'Puck': { name: 'Puck', description: 'Upbeat', gender: 'male' },
  'Zephyr': { name: 'Zephyr', description: 'Bright', gender: 'male' },
  // Additional 22 voices
  'Achernar': { name: 'Achernar', description: 'Soft', gender: 'female' },
  'Achird': { name: 'Achird', description: 'Friendly', gender: 'male' },
  'Algenib': { name: 'Algenib', description: 'Gravelly', gender: 'male' },
  'Algieba': { name: 'Algieba', description: 'Smooth', gender: 'male' },
  'Alnilam': { name: 'Alnilam', description: 'Firm', gender: 'male' },
  'Autonoe': { name: 'Autonoe', description: 'Bright', gender: 'female' },
  'Callirrhoe': { name: 'Callirrhoe', description: 'Easy-going', gender: 'female' },
  'Despina': { name: 'Despina', description: 'Smooth', gender: 'female' },
  'Enceladus': { name: 'Enceladus', description: 'Breathy', gender: 'male' },
  'Erinome': { name: 'Erinome', description: 'Clear', gender: 'female' },
  'Gacrux': { name: 'Gacrux', description: 'Mature', gender: 'male' },
  'Iapetus': { name: 'Iapetus', description: 'Clear', gender: 'male' },
  'Laomedeia': { name: 'Laomedeia', description: 'Upbeat', gender: 'female' },
  'Pulcherrima': { name: 'Pulcherrima', description: 'Forward', gender: 'female' },
  'Rasalgethi': { name: 'Rasalgethi', description: 'Informative', gender: 'male' },
  'Sadachbia': { name: 'Sadachbia', description: 'Lively', gender: 'male' },
  'Sadaltager': { name: 'Sadaltager', description: 'Knowledgeable', gender: 'male' },
  'Schedar': { name: 'Schedar', description: 'Even', gender: 'female' },
  'Sulafat': { name: 'Sulafat', description: 'Warm', gender: 'male' },
  'Umbriel': { name: 'Umbriel', description: 'Easy-going', gender: 'male' },
  'Vindemiatrix': { name: 'Vindemiatrix', description: 'Gentle', gender: 'female' },
  'Zubenelgenubi': { name: 'Zubenelgenubi', description: 'Casual', gender: 'male' },
};

// Helper to format voice display with gender
function formatVoiceDisplay(voiceId: string): string {
  const voice = GEMINI_VOICES[voiceId];
  if (!voice) return voiceId;
  const genderIcon = voice.gender === 'female' ? '♀' : voice.gender === 'male' ? '♂' : '⚥';
  return `${voice.name} - ${voice.description} ${genderIcon}`;
}

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

type TabType = 'presets' | 'personas' | 'podcastPersonas' | 'providers' | 'modelDefaults';

// Reaction status for a voice
interface ReactionStatus {
  hasReactions: boolean;
  totalClips: number;
  clipsByCategory?: {
    agreement: number;
    disagreement: number;
    interest: number;
    acknowledgment: number;
    challenge: number;
    amusement: number;
    surprise: number;
    skepticism: number;
  };
  isGenerating?: boolean;
}

// Reaction clip for preview
interface ReactionClip {
  category: string;
  text: string;
  audioUrl: string;
}

export function AdminConfigPage() {
  const [activeTab, setActiveTab] = useState<TabType>('presets');
  const [presets, setPresets] = useState<DebatePreset[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [podcastPersonas, setPodcastPersonas] = useState<PodcastPersona[]>([]);
  const [providers, setProviders] = useState<TTSProvider[]>([]);
  const [modelDefaults, setModelDefaults] = useState<ModelDefaults>({
    proModelId: null,
    conModelId: null,
    moderatorModelId: null,
  });
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit state
  const [editingPreset, setEditingPreset] = useState<DebatePreset | null>(null);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reaction state
  const [reactionStatus, setReactionStatus] = useState<Record<string, ReactionStatus>>({});
  const [previewingVoice, setPreviewingVoice] = useState<{ voiceId: string; personaName: string } | null>(null);
  const [previewClips, setPreviewClips] = useState<ReactionClip[]>([]);
  const [playingClip, setPlayingClip] = useState<string | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  const fetchPresets = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/presets`);
      if (!response.ok) throw new Error('Failed to fetch presets');
      const data = await response.json();
      setPresets(data.presets || []);
    } catch (err) {
      console.error('Error fetching presets:', err);
    }
  }, [API_BASE_URL]);

  const fetchPersonas = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/personas`);
      if (!response.ok) throw new Error('Failed to fetch personas');
      const data = await response.json();
      setPersonas(data.personas || []);
    } catch (err) {
      console.error('Error fetching personas:', err);
    }
  }, [API_BASE_URL]);

  const fetchPodcastPersonas = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations/personas`);
      if (!response.ok) throw new Error('Failed to fetch podcast personas');
      const data = await response.json();
      setPodcastPersonas(data.personas || []);
    } catch (err) {
      console.error('Error fetching podcast personas:', err);
    }
  }, [API_BASE_URL]);

  const fetchProviders = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/exports/audio/providers`);
      if (!response.ok) throw new Error('Failed to fetch providers');
      const data = await response.json();
      setProviders(data.providers || []);
    } catch (err) {
      console.error('Error fetching providers:', err);
    }
  }, [API_BASE_URL]);

  const fetchModelDefaults = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/settings/models`);
      if (!response.ok) throw new Error('Failed to fetch model defaults');
      const data = await response.json();
      setModelDefaults(data.defaults || { proModelId: null, conModelId: null, moderatorModelId: null });
    } catch (err) {
      console.error('Error fetching model defaults:', err);
    }
  }, [API_BASE_URL]);

  const fetchAvailableModels = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/models`);
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      setAvailableModels(data.models || []);
    } catch (err) {
      console.error('Error fetching models:', err);
    }
  }, [API_BASE_URL]);

  // Fetch reaction status for a single voice
  const fetchReactionStatusForVoice = useCallback(async (voiceId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/reactions/${voiceId}`);
      if (response.ok) {
        const data = await response.json();
        setReactionStatus(prev => ({
          ...prev,
          [voiceId]: {
            hasReactions: data.clips.length > 0,
            totalClips: data.clips.length,
            clipsByCategory: data.clipsByCategory,
          }
        }));
      } else {
        setReactionStatus(prev => ({
          ...prev,
          [voiceId]: { hasReactions: false, totalClips: 0 }
        }));
      }
    } catch (err) {
      console.error('Error fetching reaction status for voice:', voiceId, err);
      setReactionStatus(prev => ({
        ...prev,
        [voiceId]: { hasReactions: false, totalClips: 0 }
      }));
    }
  }, [API_BASE_URL]);

  // Generate reactions for a voice with character context
  const handleGenerateReactions = useCallback(async (persona: PodcastPersona) => {
    const voiceId = persona.defaultVoiceId!;
    setReactionStatus(prev => ({
      ...prev,
      [voiceId]: { ...prev[voiceId], hasReactions: prev[voiceId]?.hasReactions ?? false, totalClips: prev[voiceId]?.totalClips ?? 0, isGenerating: true }
    }));

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/reactions/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId,
          voiceName: persona.name,
          speakingStyle: persona.speakingStyle,
          backstory: persona.backstory,
          accent: persona.voiceCharacteristics?.accent,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate reactions');
      }

      const data = await response.json();
      setActionMessage({ type: 'success', text: `Generated ${data.generatedCount} reaction clips for ${persona.name}` });

      // Refresh status
      await fetchReactionStatusForVoice(voiceId);
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to generate reactions' });
      setReactionStatus(prev => ({
        ...prev,
        [voiceId]: { ...prev[voiceId], hasReactions: prev[voiceId]?.hasReactions ?? false, totalClips: prev[voiceId]?.totalClips ?? 0, isGenerating: false }
      }));
    }
  }, [API_BASE_URL, fetchReactionStatusForVoice]);

  // Preview reactions for a voice
  const handlePreviewReactions = useCallback(async (voiceId: string, personaName: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/reactions/${voiceId}`);
      if (!response.ok) throw new Error('Failed to fetch reaction clips');

      const data = await response.json();
      setPreviewClips(data.clips || []);
      setPreviewingVoice({ voiceId, personaName });
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load reaction clips' });
    }
  }, [API_BASE_URL]);

  // Close preview modal
  const handleClosePreview = useCallback(() => {
    setPreviewingVoice(null);
    setPreviewClips([]);
    setPlayingClip(null);
  }, []);

  // Play a reaction clip
  const handlePlayClip = useCallback((audioUrl: string) => {
    // Stop any currently playing clip
    if (playingClip) {
      const currentAudio = document.getElementById('reactionAudio') as HTMLAudioElement;
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
    }

    if (playingClip === audioUrl) {
      setPlayingClip(null);
      return;
    }

    setPlayingClip(audioUrl);
  }, [playingClip]);

  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          fetchPresets(),
          fetchPersonas(),
          fetchPodcastPersonas(),
          fetchProviders(),
          fetchModelDefaults(),
          fetchAvailableModels(),
        ]);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
  }, [fetchPresets, fetchPersonas, fetchPodcastPersonas, fetchProviders, fetchModelDefaults, fetchAvailableModels]);

  // Fetch reaction status for all podcast personas with voices
  useEffect(() => {
    const voicesWithIds = podcastPersonas
      .filter(p => p.defaultVoiceId)
      .map(p => p.defaultVoiceId as string);

    const uniqueVoices = [...new Set(voicesWithIds)];

    uniqueVoices.forEach(voiceId => {
      if (!reactionStatus[voiceId]) {
        fetchReactionStatusForVoice(voiceId);
      }
    });
  }, [podcastPersonas, reactionStatus, fetchReactionStatusForVoice]);

  const handleSavePreset = async () => {
    if (!editingPreset) return;

    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/presets/${editingPreset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingPreset.name,
          description: editingPreset.description,
          brevityLevel: editingPreset.brevityLevel,
          llmTemperature: editingPreset.llmTemperature,
          maxTokensPerResponse: editingPreset.maxTokensPerResponse,
          requireCitations: editingPreset.requireCitations,
          proModelId: editingPreset.proModelId || null,
          conModelId: editingPreset.conModelId || null,
          moderatorModelId: editingPreset.moderatorModelId || null,
        }),
      });

      if (!response.ok) throw new Error('Failed to save preset');

      setActionMessage({ type: 'success', text: 'Preset saved successfully' });
      setEditingPreset(null);
      await fetchPresets();
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save preset' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePersona = async () => {
    if (!editingPersona) return;

    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/personas/${editingPersona.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingPersona.name,
          description: editingPersona.description,
          archetype: editingPersona.archetype,
          argumentationStyle: editingPersona.argumentationStyle,
          vocabularyHints: editingPersona.vocabularyHints,
          focusAreas: editingPersona.focusAreas,
          rhetoricalPreferences: editingPersona.rhetoricalPreferences,
          systemPromptAddition: editingPersona.systemPromptAddition,
          avatarEmoji: editingPersona.avatarEmoji,
          colorPrimary: editingPersona.colorPrimary,
          colorSecondary: editingPersona.colorSecondary,
        }),
      });

      if (!response.ok) throw new Error('Failed to save persona');

      setActionMessage({ type: 'success', text: 'Persona saved successfully' });
      setEditingPersona(null);
      await fetchPersonas();
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save persona' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveModelDefaults = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/settings/models`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelDefaults),
      });

      if (!response.ok) throw new Error('Failed to save model defaults');

      setActionMessage({ type: 'success', text: 'Model defaults saved successfully' });
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save model defaults' });
    } finally {
      setIsSaving(false);
    }
  };

  // Group models by provider for dropdown
  const modelsByProvider = availableModels.reduce((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = [];
    acc[model.provider].push(model);
    return acc;
  }, {} as Record<string, ModelInfo[]>);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link to="/admin" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>Configuration</h1>
        <p className={styles.subtitle}>Manage presets, personas, and system settings</p>
      </header>

      {actionMessage && (
        <Alert variant={actionMessage.type} className={styles.actionAlert}>
          {actionMessage.text}
          <button onClick={() => setActionMessage(null)} className={styles.dismissButton}>×</button>
        </Alert>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'presets' ? styles.active : ''}`}
          onClick={() => setActiveTab('presets')}
        >
          Presets ({presets.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'personas' ? styles.active : ''}`}
          onClick={() => setActiveTab('personas')}
        >
          Debate Personas ({personas.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'podcastPersonas' ? styles.active : ''}`}
          onClick={() => setActiveTab('podcastPersonas')}
        >
          Podcast Personas ({podcastPersonas.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'modelDefaults' ? styles.active : ''}`}
          onClick={() => setActiveTab('modelDefaults')}
        >
          Model Defaults
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'providers' ? styles.active : ''}`}
          onClick={() => setActiveTab('providers')}
        >
          TTS Providers ({providers.length})
        </button>
      </div>

      {/* Presets Tab */}
      {activeTab === 'presets' && (
        <div className={styles.tabContent}>
          <div className={styles.tabHeader}>
            <h2>Debate Presets</h2>
            <p className={styles.tabDescription}>
              Presets define default configurations for new debates. Click a preset to edit.
            </p>
          </div>

          {presets.length === 0 ? (
            <div className={styles.noData}>No presets configured</div>
          ) : (
            <div className={styles.cardGrid}>
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className={`${styles.presetCard} ${styles.clickable}`}
                  onClick={() => setEditingPreset({ ...preset })}
                >
                  <div className={styles.presetHeader}>
                    <h3 className={styles.presetName}>
                      {preset.name}
                      {preset.isSystemPreset && <span className={styles.systemBadge}>System</span>}
                    </h3>
                    <button className={styles.editButton}>Edit</button>
                  </div>
                  <p className={styles.presetDescription}>{preset.description}</p>
                  <div className={styles.presetDetails}>
                    <div className={styles.presetDetail}>
                      <span className={styles.detailLabel}>Brevity</span>
                      <span className={styles.detailValue}>{preset.brevityLevel}/5</span>
                    </div>
                    <div className={styles.presetDetail}>
                      <span className={styles.detailLabel}>Temperature</span>
                      <span className={styles.detailValue}>{preset.llmTemperature}</span>
                    </div>
                    <div className={styles.presetDetail}>
                      <span className={styles.detailLabel}>Max Tokens</span>
                      <span className={styles.detailValue}>{preset.maxTokensPerResponse}</span>
                    </div>
                    <div className={styles.presetDetail}>
                      <span className={styles.detailLabel}>Citations</span>
                      <span className={styles.detailValue}>
                        {preset.requireCitations ? 'Required' : 'Optional'}
                      </span>
                    </div>
                  </div>
                  {(preset.proModelId || preset.conModelId || preset.moderatorModelId) && (
                    <div className={styles.modelDefaults}>
                      <span className={styles.detailLabel}>Model Overrides:</span>
                      {preset.proModelId && <span className={styles.modelBadge}>Pro</span>}
                      {preset.conModelId && <span className={styles.modelBadge}>Con</span>}
                      {preset.moderatorModelId && <span className={styles.modelBadge}>Mod</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preset Edit Modal */}
      {editingPreset && (
        <div className={styles.modalOverlay} onClick={() => setEditingPreset(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>Edit Preset: {editingPreset.name}</h2>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Name</label>
                <input
                  type="text"
                  value={editingPreset.name}
                  onChange={(e) => setEditingPreset({ ...editingPreset, name: e.target.value })}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea
                  value={editingPreset.description || ''}
                  onChange={(e) => setEditingPreset({ ...editingPreset, description: e.target.value })}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Brevity Level (1-5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={editingPreset.brevityLevel}
                    onChange={(e) => setEditingPreset({ ...editingPreset, brevityLevel: (parseInt(e.target.value) || 3) as BrevityLevel })}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Temperature (0-1)</label>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={editingPreset.llmTemperature}
                    onChange={(e) => setEditingPreset({ ...editingPreset, llmTemperature: parseFloat(e.target.value) || 0.7 })}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Max Tokens</label>
                  <input
                    type="number"
                    min="100"
                    max="8000"
                    value={editingPreset.maxTokensPerResponse}
                    onChange={(e) => setEditingPreset({ ...editingPreset, maxTokensPerResponse: parseInt(e.target.value) || 1024 })}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={editingPreset.requireCitations}
                    onChange={(e) => setEditingPreset({ ...editingPreset, requireCitations: e.target.checked })}
                  />
                  Require Citations
                </label>
              </div>

              <h3 className={styles.sectionTitle}>Model Defaults (for manual mode)</h3>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Pro Model</label>
                  <select
                    value={editingPreset.proModelId || ''}
                    onChange={(e) => setEditingPreset({ ...editingPreset, proModelId: e.target.value || null })}
                  >
                    <option value="">Use system default</option>
                    {Object.entries(modelsByProvider).map(([provider, models]) => (
                      <optgroup key={provider} label={provider}>
                        {models.map((model) => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Con Model</label>
                  <select
                    value={editingPreset.conModelId || ''}
                    onChange={(e) => setEditingPreset({ ...editingPreset, conModelId: e.target.value || null })}
                  >
                    <option value="">Use system default</option>
                    {Object.entries(modelsByProvider).map(([provider, models]) => (
                      <optgroup key={provider} label={provider}>
                        {models.map((model) => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Moderator Model</label>
                  <select
                    value={editingPreset.moderatorModelId || ''}
                    onChange={(e) => setEditingPreset({ ...editingPreset, moderatorModelId: e.target.value || null })}
                  >
                    <option value="">Use system default</option>
                    {Object.entries(modelsByProvider).map(([provider, models]) => (
                      <optgroup key={provider} label={provider}>
                        {models.map((model) => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className={styles.modalActions}>
              <Button variant="ghost" onClick={() => setEditingPreset(null)} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSavePreset} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Personas Tab */}
      {activeTab === 'personas' && (
        <div className={styles.tabContent}>
          <div className={styles.tabHeader}>
            <h2>Debate Personas</h2>
            <p className={styles.tabDescription}>
              Personas define argumentation styles for debate advocates. Click a persona to edit.
            </p>
          </div>

          {personas.length === 0 ? (
            <div className={styles.noData}>No personas configured</div>
          ) : (
            <div className={styles.cardGrid}>
              {personas.map((persona) => (
                <div
                  key={persona.id}
                  className={`${styles.personaCard} ${styles.clickable}`}
                  onClick={() => setEditingPersona({ ...persona })}
                >
                  <div className={styles.personaHeader}>
                    <h3 className={styles.personaName}>
                      {persona.avatarEmoji && <span className={styles.emoji}>{persona.avatarEmoji}</span>}
                      {persona.name}
                      {persona.isSystemPersona && <span className={styles.systemBadge}>System</span>}
                    </h3>
                    <button className={styles.editButton}>Edit</button>
                  </div>
                  <p className={styles.personaDescription}>{persona.description}</p>
                  <div className={styles.personaDetails}>
                    <div className={styles.personaDetail}>
                      <span className={styles.detailLabel}>Archetype</span>
                      <span className={styles.detailValue}>{persona.archetype}</span>
                    </div>
                    <div className={styles.personaDetail}>
                      <span className={styles.detailLabel}>Style</span>
                      <span className={styles.detailValue}>{persona.argumentationStyle}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Persona Edit Modal */}
      {editingPersona && (
        <div className={styles.modalOverlay} onClick={() => setEditingPersona(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>Edit Persona: {editingPersona.name}</h2>

            <div className={styles.formGrid}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Name</label>
                  <input
                    type="text"
                    value={editingPersona.name}
                    onChange={(e) => setEditingPersona({ ...editingPersona, name: e.target.value })}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Avatar Emoji</label>
                  <input
                    type="text"
                    value={editingPersona.avatarEmoji || ''}
                    onChange={(e) => setEditingPersona({ ...editingPersona, avatarEmoji: e.target.value || null })}
                    maxLength={4}
                    placeholder="e.g. 🎓"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Archetype</label>
                  <select
                    value={editingPersona.archetype}
                    onChange={(e) => setEditingPersona({ ...editingPersona, archetype: e.target.value as PersonaArchetype })}
                  >
                    <option value="academic">Academic</option>
                    <option value="pragmatic">Pragmatic</option>
                    <option value="empirical">Empirical</option>
                    <option value="legal">Legal</option>
                    <option value="economic">Economic</option>
                    <option value="moral">Moral</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea
                  value={editingPersona.description || ''}
                  onChange={(e) => setEditingPersona({ ...editingPersona, description: e.target.value })}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Argumentation Style</label>
                <textarea
                  value={editingPersona.argumentationStyle}
                  onChange={(e) => setEditingPersona({ ...editingPersona, argumentationStyle: e.target.value })}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Vocabulary Hints</label>
                <textarea
                  value={editingPersona.vocabularyHints || ''}
                  onChange={(e) => setEditingPersona({ ...editingPersona, vocabularyHints: e.target.value || null })}
                  placeholder="Words and phrases this persona tends to use"
                />
              </div>

              <div className={styles.formGroup}>
                <label>Rhetorical Preferences</label>
                <textarea
                  value={editingPersona.rhetoricalPreferences || ''}
                  onChange={(e) => setEditingPersona({ ...editingPersona, rhetoricalPreferences: e.target.value || null })}
                  placeholder="Preferred rhetorical techniques"
                />
              </div>

              <div className={styles.formGroup}>
                <label>System Prompt Addition</label>
                <textarea
                  value={editingPersona.systemPromptAddition}
                  onChange={(e) => setEditingPersona({ ...editingPersona, systemPromptAddition: e.target.value })}
                  rows={4}
                  placeholder="Additional instructions for the LLM"
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Primary Color</label>
                  <input
                    type="text"
                    value={editingPersona.colorPrimary || ''}
                    onChange={(e) => setEditingPersona({ ...editingPersona, colorPrimary: e.target.value || null })}
                    placeholder="#3b82f6"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Secondary Color</label>
                  <input
                    type="text"
                    value={editingPersona.colorSecondary || ''}
                    onChange={(e) => setEditingPersona({ ...editingPersona, colorSecondary: e.target.value || null })}
                    placeholder="#60a5fa"
                  />
                </div>
              </div>
            </div>

            <div className={styles.modalActions}>
              <Button variant="ghost" onClick={() => setEditingPersona(null)} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSavePersona} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Podcast Personas Tab */}
      {activeTab === 'podcastPersonas' && (
        <div className={styles.tabContent}>
          <div className={styles.tabHeader}>
            <h2>Podcast Personas</h2>
            <p className={styles.tabDescription}>
              Characters for conversational podcasts. Manage their persistent memory (core values, opinions, relationships).
            </p>
          </div>

          {podcastPersonas.length === 0 ? (
            <div className={styles.noData}>No podcast personas configured</div>
          ) : (
            <div className={styles.cardGrid}>
              {podcastPersonas.map((persona) => (
                <div
                  key={persona.id}
                  className={styles.personaCard}
                >
                  <div className={styles.personaHeader}>
                    <h3 className={styles.personaName}>
                      <span className={styles.emoji}>{persona.avatarEmoji}</span>
                      {persona.name}
                    </h3>
                    <Link
                      to={`/admin/personas/${persona.id}/memory`}
                      className={styles.memoryButton}
                      title="Manage persona memory"
                    >
                      🧠 Memory
                    </Link>
                  </div>
                  <p className={styles.personaDescription}>{persona.backstory}</p>
                  <div className={styles.personaDetails}>
                    <div className={styles.personaDetail}>
                      <span className={styles.detailLabel}>Speaking Style</span>
                      <span className={styles.detailValue}>{persona.speakingStyle.substring(0, 50)}...</span>
                    </div>
                    <div className={styles.personaDetail}>
                      <span className={styles.detailLabel}>Worldview</span>
                      <span className={styles.detailValue}>{persona.worldview.substring(0, 50)}...</span>
                    </div>
                  </div>
                  {persona.quirks && persona.quirks.length > 0 && (
                    <div className={styles.quirks}>
                      {persona.quirks.slice(0, 2).map((quirk, i) => (
                        <span key={i} className={styles.quirkBadge}>{quirk}</span>
                      ))}
                      {persona.quirks.length > 2 && (
                        <span className={styles.quirkBadge}>+{persona.quirks.length - 2} more</span>
                      )}
                    </div>
                  )}
                  {/* Voice Assignment Display */}
                  <div className={styles.voiceAssignment}>
                    {persona.defaultVoiceId ? (
                      <span className={styles.voiceBadge}>
                        🎙️ {formatVoiceDisplay(persona.defaultVoiceId)}
                      </span>
                    ) : (
                      <span className={styles.noVoiceBadge}>🔇 No voice assigned</span>
                    )}
                  </div>
                  {/* Reaction Clips Section */}
                  {persona.defaultVoiceId && (
                    <div className={styles.reactionSection}>
                      <div className={styles.reactionStatus}>
                        {reactionStatus[persona.defaultVoiceId]?.isGenerating ? (
                          <span className={styles.generatingBadge}>
                            ⏳ Generating...
                          </span>
                        ) : reactionStatus[persona.defaultVoiceId]?.hasReactions ? (
                          <span className={styles.hasReactionsBadge}>
                            🎵 {reactionStatus[persona.defaultVoiceId]?.totalClips || 0} clips
                          </span>
                        ) : (
                          <span className={styles.noReactionsBadge}>
                            No reaction clips
                          </span>
                        )}
                      </div>
                      <div className={styles.reactionActions}>
                        <button
                          className={styles.reactionButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGenerateReactions(persona);
                          }}
                          disabled={reactionStatus[persona.defaultVoiceId]?.isGenerating}
                          title="Generate reaction clips for cross-talk"
                        >
                          {reactionStatus[persona.defaultVoiceId]?.hasReactions ? '🔄 Regenerate' : '✨ Generate'}
                        </button>
                        {reactionStatus[persona.defaultVoiceId]?.hasReactions && (
                          <button
                            className={styles.previewButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreviewReactions(persona.defaultVoiceId!, persona.name);
                            }}
                            title="Preview reaction clips"
                          >
                            🔊 Preview
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Model Defaults Tab */}
      {activeTab === 'modelDefaults' && (
        <div className={styles.tabContent}>
          <div className={styles.tabHeader}>
            <h2>System Model Defaults</h2>
            <p className={styles.tabDescription}>
              Set default models for manual mode. These are used when no preset-specific models are configured.
            </p>
          </div>

          <div className={styles.modelDefaultsForm}>
            <div className={styles.formGroup}>
              <label>Default Pro Model</label>
              <select
                value={modelDefaults.proModelId || ''}
                onChange={(e) => setModelDefaults({ ...modelDefaults, proModelId: e.target.value || null })}
              >
                <option value="">None (use auto-selection)</option>
                {Object.entries(modelsByProvider).map(([provider, models]) => (
                  <optgroup key={provider} label={provider}>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Default Con Model</label>
              <select
                value={modelDefaults.conModelId || ''}
                onChange={(e) => setModelDefaults({ ...modelDefaults, conModelId: e.target.value || null })}
              >
                <option value="">None (use auto-selection)</option>
                {Object.entries(modelsByProvider).map(([provider, models]) => (
                  <optgroup key={provider} label={provider}>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Default Moderator Model</label>
              <select
                value={modelDefaults.moderatorModelId || ''}
                onChange={(e) => setModelDefaults({ ...modelDefaults, moderatorModelId: e.target.value || null })}
              >
                <option value="">None (use auto-selection)</option>
                {Object.entries(modelsByProvider).map(([provider, models]) => (
                  <optgroup key={provider} label={provider}>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <Button onClick={handleSaveModelDefaults} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Model Defaults'}
            </Button>
          </div>
        </div>
      )}

      {/* Providers Tab */}
      {activeTab === 'providers' && (
        <div className={styles.tabContent}>
          <div className={styles.tabHeader}>
            <h2>TTS Providers</h2>
            <p className={styles.tabDescription}>
              Text-to-speech providers for audio export. Configure API keys in environment variables.
            </p>
          </div>

          {providers.length === 0 ? (
            <div className={styles.noData}>No TTS providers available</div>
          ) : (
            <div className={styles.providerList}>
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className={`${styles.providerCard} ${provider.available ? styles.available : styles.unavailable}`}
                >
                  <div className={styles.providerHeader}>
                    <h3 className={styles.providerName}>{provider.name}</h3>
                    <span className={`${styles.providerStatus} ${provider.available ? styles.statusAvailable : styles.statusUnavailable}`}>
                      {provider.available ? 'Available' : 'Not Configured'}
                    </span>
                  </div>
                  {provider.envVar && !provider.available && (
                    <p className={styles.providerHint}>
                      Set <code>{provider.envVar}</code> environment variable to enable
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reaction Preview Modal */}
      {previewingVoice && (
        <div className={styles.modalOverlay} onClick={handleClosePreview}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>Reaction Clips: {previewingVoice.personaName}</h2>
            <p className={styles.modalSubtitle}>
              Click on a clip to preview. These are used for cross-talk during podcasts.
            </p>

            {previewClips.length === 0 ? (
              <div className={styles.noData}>No reaction clips found</div>
            ) : (
              <div className={styles.clipGrid}>
                {['agreement', 'disagreement', 'interest', 'acknowledgment', 'challenge', 'amusement', 'surprise', 'skepticism'].map(category => {
                  const categoryClips = previewClips.filter(c => c.category === category);
                  if (categoryClips.length === 0) return null;

                  return (
                    <div key={category} className={styles.clipCategory}>
                      <h3 className={styles.categoryTitle}>
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                        <span className={styles.clipCount}>{categoryClips.length}</span>
                      </h3>
                      <div className={styles.clipList}>
                        {categoryClips.map((clip, index) => (
                          <button
                            key={index}
                            className={`${styles.clipButton} ${playingClip === `${API_BASE_URL}${clip.audioUrl}` ? styles.playing : ''}`}
                            onClick={() => handlePlayClip(`${API_BASE_URL}${clip.audioUrl}`)}
                          >
                            <span className={styles.clipIcon}>
                              {playingClip === `${API_BASE_URL}${clip.audioUrl}` ? '⏸️' : '▶️'}
                            </span>
                            <span className={styles.clipText}>{clip.text}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Hidden audio element for playback */}
            {playingClip && (
              <audio
                id="reactionAudio"
                src={playingClip}
                autoPlay
                onEnded={() => setPlayingClip(null)}
                onError={() => {
                  setPlayingClip(null);
                  setActionMessage({ type: 'error', text: 'Failed to play audio clip' });
                }}
              />
            )}

            <div className={styles.modalActions}>
              <Button variant="ghost" onClick={handleClosePreview}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminConfigPage;
