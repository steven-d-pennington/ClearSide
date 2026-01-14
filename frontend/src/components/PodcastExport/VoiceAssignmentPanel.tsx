/**
 * VoiceAssignmentPanel Component
 *
 * Allows users to assign voices to each speaker role.
 * For ElevenLabs: Full voice selection with advanced settings.
 * For Gemini: Shows fixed voice assignments (read-only).
 */

import { useState, useEffect } from 'react';
import { Button } from '../ui';
import { VoicePreviewPlayer } from './VoicePreviewPlayer';
import type {
  VoiceAssignment,
  AvailableVoice,
  ElevenLabsVoiceSettings,
  TTSProviderType,
} from '../../types/podcast';
import { SPEAKER_ROLES, DEFAULT_VOICE_SETTINGS } from '../../types/podcast';
import styles from './VoiceAssignmentPanel.module.css';

/**
 * Voice gender type
 */
type VoiceGender = 'male' | 'female' | 'neutral';

/**
 * Available Gemini TTS voices with descriptions and gender
 * Full list of 30 voices (as of Jan 2026)
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 */
const GEMINI_VOICES_LIST: Array<{ id: string; name: string; description: string; gender: VoiceGender }> = [
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

/**
 * Get gender icon for display
 */
function getGenderIcon(gender: VoiceGender): string {
  return gender === 'female' ? '♀' : gender === 'male' ? '♂' : '⚥';
}

/**
 * Default Gemini voice assignments per role
 */
const GEMINI_VOICE_DEFAULTS: Record<string, { voiceId: string; voiceName: string; description: string }> = {
  moderator: { voiceId: 'Aoede', voiceName: 'Aoede', description: 'Neutral, calm voice' },
  pro_advocate: { voiceId: 'Kore', voiceName: 'Kore', description: 'Firm, clear female voice' },
  con_advocate: { voiceId: 'Charon', voiceName: 'Charon', description: 'Thoughtful male voice' },
  narrator: { voiceId: 'Puck', voiceName: 'Puck', description: 'Clear narrator voice' },
};

/**
 * Google Cloud Long Audio (Journey) voice options
 * Journey voices are optimized for long-form content like podcasts
 */
const GOOGLE_CLOUD_LONG_VOICES: Array<{ id: string; name: string; description: string }> = [
  { id: 'en-US-Journey-F', name: 'Journey F', description: 'Female - expressive, warm' },
  { id: 'en-US-Journey-D', name: 'Journey D', description: 'Male - clear, engaging' },
  { id: 'en-US-Journey-O', name: 'Journey O', description: 'Neutral - balanced, authoritative' },
];

/**
 * Default voice assignments for Google Cloud Long Audio
 */
const GOOGLE_CLOUD_LONG_DEFAULTS: Record<string, { voiceId: string; voiceName: string; description: string }> = {
  moderator: { voiceId: 'en-US-Journey-O', voiceName: 'Journey O', description: 'Neutral, authoritative' },
  pro_advocate: { voiceId: 'en-US-Journey-F', voiceName: 'Journey F', description: 'Female, expressive' },
  con_advocate: { voiceId: 'en-US-Journey-D', voiceName: 'Journey D', description: 'Male, engaging' },
  narrator: { voiceId: 'en-US-Journey-D', voiceName: 'Journey D', description: 'Male, warm narrator' },
};

interface VoiceAssignmentPanelProps {
  assignments: Record<string, VoiceAssignment>;
  onChange: (assignments: Record<string, VoiceAssignment>) => void;
  /** TTS provider - determines which voice options to show */
  provider?: TTSProviderType;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function VoiceAssignmentPanel({
  assignments,
  onChange,
  provider = 'elevenlabs',
}: VoiceAssignmentPanelProps) {
  const [availableVoices, setAvailableVoices] = useState<AvailableVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  const isGemini = provider === 'gemini';
  const isGoogleCloudLong = provider === 'google-cloud-long';

  // Fetch available voices on mount (only for ElevenLabs)
  useEffect(() => {
    if (!isGemini && !isGoogleCloudLong) {
      fetchVoices();
    } else {
      setIsLoadingVoices(false);
    }
  }, [isGemini, isGoogleCloudLong]);

  const fetchVoices = async () => {
    setIsLoadingVoices(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/exports/podcast/voices`);
      if (response.ok) {
        const data = await response.json();
        // Combine all role voices into a single list (they're usually the same)
        const voices = data.voices?.moderator || [];
        setAvailableVoices(voices);
      }
    } catch (error) {
      console.error('Failed to fetch voices:', error);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  const updateAssignment = (
    roleId: string,
    updates: Partial<VoiceAssignment>
  ) => {
    const currentAssignment = assignments[roleId] || {
      speakerId: roleId,
      voiceId: '',
      voiceName: '',
      settings: { ...DEFAULT_VOICE_SETTINGS },
    };

    onChange({
      ...assignments,
      [roleId]: {
        ...currentAssignment,
        ...updates,
      },
    });
  };

  const updateSettings = (
    roleId: string,
    settingKey: keyof ElevenLabsVoiceSettings,
    value: number | boolean
  ) => {
    const currentAssignment = assignments[roleId];
    if (!currentAssignment) return;

    onChange({
      ...assignments,
      [roleId]: {
        ...currentAssignment,
        settings: {
          ...currentAssignment.settings,
          [settingKey]: value,
        },
      },
    });
  };

  // Render Gemini voices (selectable from available Gemini voices)
  const renderGeminiVoices = () => (
    <div className={styles.roleList}>
      {SPEAKER_ROLES.map((role) => {
        const defaultVoice = GEMINI_VOICE_DEFAULTS[role.id];
        const currentVoiceId = assignments[role.id]?.voiceId || defaultVoice?.voiceId || '';
        const currentVoice = GEMINI_VOICES_LIST.find(v => v.id === currentVoiceId) ||
          GEMINI_VOICES_LIST.find(v => v.id === defaultVoice?.voiceId);

        return (
          <div key={role.id} className={styles.roleCard}>
            <div className={styles.roleHeader}>
              <div className={styles.roleInfo}>
                <label className={styles.roleLabel}>{role.label}</label>
                <p className={styles.roleDescription}>{role.description}</p>
              </div>

              <div className={styles.voiceControls}>
                <select
                  className={styles.voiceSelect}
                  value={currentVoiceId}
                  onChange={(e) => {
                    const voice = GEMINI_VOICES_LIST.find(v => v.id === e.target.value);
                    updateAssignment(role.id, {
                      voiceId: e.target.value,
                      voiceName: voice?.name || e.target.value,
                    });
                  }}
                >
                  {GEMINI_VOICES_LIST.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name} - {voice.description} {getGenderIcon(voice.gender)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className={styles.voiceHint}>
              {currentVoice?.description || defaultVoice?.description}
            </p>
          </div>
        );
      })}
    </div>
  );

  // Render Google Cloud Long Audio voices (selectable Journey voices)
  const renderGoogleCloudLongVoices = () => (
    <div className={styles.roleList}>
      {SPEAKER_ROLES.map((role) => {
        const defaultVoice = GOOGLE_CLOUD_LONG_DEFAULTS[role.id];
        const currentVoiceId = assignments[role.id]?.voiceId || defaultVoice?.voiceId || '';
        const currentVoice = GOOGLE_CLOUD_LONG_VOICES.find(v => v.id === currentVoiceId) ||
          GOOGLE_CLOUD_LONG_VOICES.find(v => v.id === defaultVoice?.voiceId);

        return (
          <div key={role.id} className={styles.roleCard}>
            <div className={styles.roleHeader}>
              <div className={styles.roleInfo}>
                <label className={styles.roleLabel}>{role.label}</label>
                <p className={styles.roleDescription}>{role.description}</p>
              </div>

              <div className={styles.voiceControls}>
                <select
                  className={styles.voiceSelect}
                  value={currentVoiceId}
                  onChange={(e) => {
                    const voice = GOOGLE_CLOUD_LONG_VOICES.find(v => v.id === e.target.value);
                    updateAssignment(role.id, {
                      voiceId: e.target.value,
                      voiceName: voice?.name || e.target.value,
                    });
                  }}
                >
                  {GOOGLE_CLOUD_LONG_VOICES.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name} - {voice.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className={styles.voiceHint}>
              {currentVoice?.description || defaultVoice?.description}
            </p>
          </div>
        );
      })}
    </div>
  );

  // Render ElevenLabs voices (full selection with settings)
  const renderElevenLabsVoices = () => (
    <div className={styles.roleList}>
      {SPEAKER_ROLES.map((role) => (
        <div key={role.id} className={styles.roleCard}>
          <div className={styles.roleHeader}>
            <div className={styles.roleInfo}>
              <label className={styles.roleLabel}>{role.label}</label>
              <p className={styles.roleDescription}>{role.description}</p>
            </div>

            <div className={styles.voiceControls}>
              <select
                className={styles.voiceSelect}
                value={assignments[role.id]?.voiceId || ''}
                onChange={(e) => {
                  const voice = availableVoices.find(
                    (v) => v.voiceId === e.target.value
                  );
                  updateAssignment(role.id, {
                    voiceId: e.target.value,
                    voiceName: voice?.name || e.target.value,
                  });
                }}
              >
                <option value="">Select voice...</option>
                {availableVoices.map((voice) => (
                  <option key={voice.voiceId} value={voice.voiceId}>
                    {voice.name}
                    {voice.recommended ? ' (Recommended)' : ''}
                  </option>
                ))}
              </select>

              <VoicePreviewPlayer
                voiceId={assignments[role.id]?.voiceId}
                isPlaying={previewingVoice === role.id}
                onPlay={() => setPreviewingVoice(role.id)}
                onStop={() => setPreviewingVoice(null)}
              />
            </div>
          </div>

          {/* Advanced Settings Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setExpandedRole(expandedRole === role.id ? null : role.id)
            }
            className={styles.advancedToggle}
          >
            {expandedRole === role.id ? 'Hide' : 'Show'} Advanced Settings
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`${styles.chevron} ${expandedRole === role.id ? styles.expanded : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </Button>

          {/* Advanced Settings Panel */}
          {expandedRole === role.id && assignments[role.id] && (
            <div className={styles.advancedSettings}>
              {/* Stability Slider */}
              <div className={styles.settingRow}>
                <div className={styles.settingHeader}>
                  <label className={styles.settingLabel}>Stability</label>
                  <span className={styles.settingValue}>
                    {assignments[role.id].settings.stability.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={assignments[role.id].settings.stability}
                  onChange={(e) =>
                    updateSettings(role.id, 'stability', parseFloat(e.target.value))
                  }
                  className={styles.slider}
                />
                <p className={styles.settingHint}>
                  Lower = more expressive, Higher = more consistent
                </p>
              </div>

              {/* Similarity Boost Slider */}
              <div className={styles.settingRow}>
                <div className={styles.settingHeader}>
                  <label className={styles.settingLabel}>Similarity Boost</label>
                  <span className={styles.settingValue}>
                    {assignments[role.id].settings.similarity_boost.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={assignments[role.id].settings.similarity_boost}
                  onChange={(e) =>
                    updateSettings(role.id, 'similarity_boost', parseFloat(e.target.value))
                  }
                  className={styles.slider}
                />
                <p className={styles.settingHint}>
                  Higher values make the voice sound more like the original
                </p>
              </div>

              {/* Speed Slider */}
              <div className={styles.settingRow}>
                <div className={styles.settingHeader}>
                  <label className={styles.settingLabel}>Speaking Speed</label>
                  <span className={styles.settingValue}>
                    {assignments[role.id].settings.speed.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={assignments[role.id].settings.speed}
                  onChange={(e) =>
                    updateSettings(role.id, 'speed', parseFloat(e.target.value))
                  }
                  className={styles.slider}
                />
                <p className={styles.settingHint}>
                  Adjust the speaking pace (0.5x to 2.0x)
                </p>
              </div>

              {/* Style Slider */}
              <div className={styles.settingRow}>
                <div className={styles.settingHeader}>
                  <label className={styles.settingLabel}>Style</label>
                  <span className={styles.settingValue}>
                    {assignments[role.id].settings.style.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={assignments[role.id].settings.style}
                  onChange={(e) =>
                    updateSettings(role.id, 'style', parseFloat(e.target.value))
                  }
                  className={styles.slider}
                />
                <p className={styles.settingHint}>
                  Higher = more stylistic variation
                </p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const getDescription = () => {
    if (isGemini) {
      return 'Select from Gemini voices for each speaker role. Defaults are optimized for debates.';
    }
    if (isGoogleCloudLong) {
      return 'Select from Journey voices optimized for long-form podcast content.';
    }
    return 'Assign distinct voices to each speaker role for a natural-sounding podcast.';
  };

  return (
    <div className={styles.container}>
      <p className={styles.description}>{getDescription()}</p>

      {isLoadingVoices ? (
        <div className={styles.loading}>
          <span className={styles.spinner} />
          Loading voices...
        </div>
      ) : isGemini ? (
        renderGeminiVoices()
      ) : isGoogleCloudLong ? (
        renderGoogleCloudLongVoices()
      ) : (
        renderElevenLabsVoices()
      )}
    </div>
  );
}

export default VoiceAssignmentPanel;
