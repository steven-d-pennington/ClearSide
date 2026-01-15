/**
 * ConversationPodcastExportModal Component
 *
 * Modal for exporting conversations as podcasts.
 * Handles script refinement and voice assignment for host + guests.
 */

import { useState, useEffect } from 'react';
import { Modal, Button, Alert } from '../../ui';
import { TTS_PROVIDERS } from '../../../types/podcast';
import styles from './ConversationPodcastExportModal.module.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface VoiceAssignment {
  speakerName: string;
  speakerRole: 'host' | 'guest';
  personaSlug: string | null;
  voiceId?: string;
  voiceName?: string;
}

interface RefinedSegment {
  speakerName: string;
  speakerRole: 'host' | 'guest';
  personaSlug: string | null;
  content: string;
  order: number;
  isKeyPoint: boolean;
  isTruncated?: boolean;
}

/**
 * Gemini Director's Notes for TTS voice guidance
 */
interface GeminiSpeakerDirection {
  speakerId: string;
  characterProfile: string;
  vocalStyle: string;
  performanceNotes: string;
}

interface GeminiDirectorNotes {
  showContext: string;
  speakerDirections: Record<string, GeminiSpeakerDirection>;
  sceneContext: string;
  pacingNotes: string;
}

interface RefinedConversationScript {
  sessionId: string;
  title: string;
  topic: string;
  segments: RefinedSegment[];
  voiceAssignments: VoiceAssignment[];
  totalSegments: number;
  totalWords: number;
  estimatedDurationMinutes: number;
  provider: string;
  refinedAt: string;
  geminiDirectorNotes?: GeminiDirectorNotes;
}

interface AvailableVoice {
  voice_id: string;
  name: string;
  category?: string;
  gender?: 'male' | 'female' | 'neutral';
  tier?: 'budget' | 'standard' | 'premium';
  labels?: Record<string, string>;
  ssmlSupported?: boolean;
}

/**
 * Gemini TTS voices
 * Full list of 30 voices from Google Gemini 2.5 TTS API (as of Jan 2026)
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 */
const GEMINI_VOICES: AvailableVoice[] = [
  // Original 8 voices
  { voice_id: 'Aoede', name: 'Aoede (Breezy)', category: 'Gemini', gender: 'female', tier: 'standard' },
  { voice_id: 'Charon', name: 'Charon (Informative)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Fenrir', name: 'Fenrir (Excitable)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Kore', name: 'Kore (Firm)', category: 'Gemini', gender: 'female', tier: 'standard' },
  { voice_id: 'Leda', name: 'Leda (Youthful)', category: 'Gemini', gender: 'female', tier: 'standard' },
  { voice_id: 'Orus', name: 'Orus (Firm)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Puck', name: 'Puck (Upbeat)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Zephyr', name: 'Zephyr (Bright)', category: 'Gemini', gender: 'male', tier: 'standard' },
  // Additional 22 voices (sorted alphabetically)
  { voice_id: 'Achernar', name: 'Achernar (Soft)', category: 'Gemini', gender: 'female', tier: 'standard' },
  { voice_id: 'Achird', name: 'Achird (Friendly)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Algenib', name: 'Algenib (Gravelly)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Algieba', name: 'Algieba (Smooth)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Alnilam', name: 'Alnilam (Firm)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Autonoe', name: 'Autonoe (Bright)', category: 'Gemini', gender: 'female', tier: 'standard' },
  { voice_id: 'Callirrhoe', name: 'Callirrhoe (Easy-going)', category: 'Gemini', gender: 'female', tier: 'standard' },
  { voice_id: 'Despina', name: 'Despina (Smooth)', category: 'Gemini', gender: 'female', tier: 'standard' },
  { voice_id: 'Enceladus', name: 'Enceladus (Breathy)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Erinome', name: 'Erinome (Clear)', category: 'Gemini', gender: 'female', tier: 'standard' },
  { voice_id: 'Gacrux', name: 'Gacrux (Mature)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Iapetus', name: 'Iapetus (Clear)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Laomedeia', name: 'Laomedeia (Upbeat)', category: 'Gemini', gender: 'female', tier: 'standard' },
  { voice_id: 'Pulcherrima', name: 'Pulcherrima (Forward)', category: 'Gemini', gender: 'female', tier: 'standard' },
  { voice_id: 'Rasalgethi', name: 'Rasalgethi (Informative)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Sadachbia', name: 'Sadachbia (Lively)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Sadaltager', name: 'Sadaltager (Knowledgeable)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Schedar', name: 'Schedar (Even)', category: 'Gemini', gender: 'female', tier: 'standard' },
  { voice_id: 'Sulafat', name: 'Sulafat (Warm)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Umbriel', name: 'Umbriel (Easy-going)', category: 'Gemini', gender: 'male', tier: 'standard' },
  { voice_id: 'Vindemiatrix', name: 'Vindemiatrix (Gentle)', category: 'Gemini', gender: 'female', tier: 'standard' },
  { voice_id: 'Zubenelgenubi', name: 'Zubenelgenubi (Casual)', category: 'Gemini', gender: 'male', tier: 'standard' },
];

/**
 * Google Cloud TTS voice options organized by tier
 * Only includes voices that support SSML for pauses and emphasis.
 *
 * Pricing (per 1M characters):
 * - Neural2/Wavenet/News: $16 (budget)
 * - Studio: $160 (premium)
 *
 * Note: Journey and Chirp HD voices are excluded as they don't support SSML.
 */
const GOOGLE_CLOUD_VOICES: AvailableVoice[] = [
  // === NEURAL2 VOICES ($16/1M) - Good quality, SSML supported ===
  { voice_id: 'en-US-Neural2-A', name: 'Neural2 A', category: 'Neural2', gender: 'male', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Neural2-C', name: 'Neural2 C', category: 'Neural2', gender: 'female', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Neural2-D', name: 'Neural2 D', category: 'Neural2', gender: 'male', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Neural2-E', name: 'Neural2 E', category: 'Neural2', gender: 'female', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Neural2-F', name: 'Neural2 F', category: 'Neural2', gender: 'female', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Neural2-G', name: 'Neural2 G', category: 'Neural2', gender: 'female', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Neural2-H', name: 'Neural2 H', category: 'Neural2', gender: 'female', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Neural2-I', name: 'Neural2 I', category: 'Neural2', gender: 'male', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Neural2-J', name: 'Neural2 J', category: 'Neural2', gender: 'male', tier: 'budget', ssmlSupported: true },

  // === STUDIO VOICES ($160/1M) - Premium, broadcast quality, SSML supported ===
  { voice_id: 'en-US-Studio-O', name: 'Studio O', category: 'Studio', gender: 'female', tier: 'premium', ssmlSupported: true },
  { voice_id: 'en-US-Studio-Q', name: 'Studio Q', category: 'Studio', gender: 'male', tier: 'premium', ssmlSupported: true },

  // === NEWS VOICES ($16/1M) - Journalistic delivery, SSML supported ===
  { voice_id: 'en-US-News-K', name: 'News K', category: 'News', gender: 'female', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-News-L', name: 'News L', category: 'News', gender: 'female', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-News-N', name: 'News N', category: 'News', gender: 'male', tier: 'budget', ssmlSupported: true },

  // === WAVENET VOICES ($16/1M) - High quality, SSML supported ===
  { voice_id: 'en-US-Wavenet-A', name: 'Wavenet A', category: 'Wavenet', gender: 'male', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Wavenet-B', name: 'Wavenet B', category: 'Wavenet', gender: 'male', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Wavenet-C', name: 'Wavenet C', category: 'Wavenet', gender: 'female', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Wavenet-D', name: 'Wavenet D', category: 'Wavenet', gender: 'male', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Wavenet-E', name: 'Wavenet E', category: 'Wavenet', gender: 'female', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Wavenet-F', name: 'Wavenet F', category: 'Wavenet', gender: 'female', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Wavenet-G', name: 'Wavenet G', category: 'Wavenet', gender: 'female', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Wavenet-H', name: 'Wavenet H', category: 'Wavenet', gender: 'female', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Wavenet-I', name: 'Wavenet I', category: 'Wavenet', gender: 'male', tier: 'budget', ssmlSupported: true },
  { voice_id: 'en-US-Wavenet-J', name: 'Wavenet J', category: 'Wavenet', gender: 'male', tier: 'budget', ssmlSupported: true },
];

/**
 * Get tier label with pricing hint
 */
const getTierLabel = (tier?: string): string => {
  switch (tier) {
    case 'budget': return '$';
    case 'premium': return '$$$';
    default: return '';
  }
};

/**
 * Get gender label with icon
 */
const getGenderLabel = (gender?: string): string => {
  switch (gender) {
    case 'male': return '♂';
    case 'female': return '♀';
    case 'neutral': return '⚥';
    default: return '';
  }
};

/**
 * Map frontend provider IDs to backend provider IDs
 */
const mapProviderForBackend = (frontendProvider: string): string => {
  const mapping: Record<string, string> = {
    'google-cloud-long': 'google_cloud',
    'elevenlabs': 'elevenlabs',
    'gemini': 'gemini',
  };
  return mapping[frontendProvider] || frontendProvider;
};

interface ConversationPodcastExportModalProps {
  sessionId: string;
  topic: string;
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'configure' | 'script_review' | 'preview' | 'generating' | 'complete';

interface GenerationProgress {
  jobId: string;
  status: string;
  progressPercent: number;
  currentSegment: number;
  totalSegments: number;
  audioUrl?: string;
  errorMessage?: string;
}

export function ConversationPodcastExportModal({
  sessionId,
  topic,
  isOpen,
  onClose,
}: ConversationPodcastExportModalProps) {
  const [step, setStep] = useState<Step>('configure');
  const [selectedProvider, setSelectedProvider] = useState<string>('google-cloud-long');
  const [isRefining, setIsRefining] = useState(false);
  const [refinedScript, setRefinedScript] = useState<RefinedConversationScript | null>(null);
  const [voiceAssignments, setVoiceAssignments] = useState<Record<string, { voiceId: string; voiceName: string }>>({});
  const [availableVoices, setAvailableVoices] = useState<AvailableVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Script review state
  const [editableSegments, setEditableSegments] = useState<RefinedSegment[]>([]);
  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);
  const [isSavingScript, setIsSavingScript] = useState(false);
  const [usedSavedEdits, setUsedSavedEdits] = useState(false);

  // Segment preview state
  const [previewingIndex, setPreviewingIndex] = useState<number | null>(null);
  const [segmentPreviews, setSegmentPreviews] = useState<Record<number, { audioUrl: string; durationMs?: number }>>({});
  const [previewAudioRef, setPreviewAudioRef] = useState<HTMLAudioElement | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Director's notes state
  const [showDirectorNotes, setShowDirectorNotes] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('configure');
      setRefinedScript(null);
      setVoiceAssignments({});
      setError(null);
      setJobId(null);
      setProgress(null);
      setIsGenerating(false);
      // Reset script review state
      setEditableSegments([]);
      setEditingSegmentIndex(null);
      setEditingContent('');
      setConfirmDeleteIndex(null);
      setIsSavingScript(false);
      setUsedSavedEdits(false);
      // Reset preview state
      setPreviewingIndex(null);
      setSegmentPreviews({});
      setPreviewAudioRef(null);
      setPlayingIndex(null);
      setPreviewError(null);
      // Reset director's notes state
      setShowDirectorNotes(false);
    }
  }, [isOpen]);

  // Poll for progress when generating
  useEffect(() => {
    if (!jobId || step !== 'generating') return;

    const pollProgress = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/exports/podcast/${jobId}/progress`);
        if (response.ok) {
          const data = await response.json();
          setProgress(data);

          if (data.status === 'complete') {
            setStep('complete');
            setIsGenerating(false);
          } else if (data.status === 'error') {
            setError(data.errorMessage || 'Generation failed');
            setIsGenerating(false);
          }
        }
      } catch (err) {
        console.error('Failed to poll progress:', err);
      }
    };

    // Initial poll
    pollProgress();

    // Poll every 2 seconds
    const interval = setInterval(pollProgress, 2000);
    return () => clearInterval(interval);
  }, [jobId, step]);

  // Fetch voices when provider changes or when entering preview
  useEffect(() => {
    if (step === 'preview' && selectedProvider === 'elevenlabs') {
      fetchVoices();
    }
  }, [step, selectedProvider]);

  const fetchVoices = async () => {
    setIsLoadingVoices(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/exports/podcast/voices`);
      if (response.ok) {
        const data = await response.json();
        const voices = data.voices?.moderator || [];
        setAvailableVoices(voices);
      }
    } catch (err) {
      console.error('Failed to fetch voices:', err);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  // Refine the script
  const handleRefineScript = async () => {
    setIsRefining(true);
    setError(null);

    try {
      // Map frontend provider ID to backend expected value
      const backendProvider = mapProviderForBackend(selectedProvider);

      const response = await fetch(
        `${API_BASE_URL}/api/conversations/sessions/${sessionId}/export-to-podcast`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: backendProvider }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        // Include validation details if available
        const errorMsg = data.error || 'Failed to refine script';
        const details = data.details
          ? `: ${data.details.map((d: { message?: string }) => d.message).join(', ')}`
          : data.currentStatus
            ? ` (current status: ${data.currentStatus})`
            : '';
        throw new Error(errorMsg + details);
      }

      const data = await response.json();
      setRefinedScript(data.script);
      setUsedSavedEdits(data.usedSavedEdits || false);

      // Initialize editable segments from script
      setEditableSegments([...data.script.segments]);

      // Initialize voice assignments from script
      const initialAssignments: Record<string, { voiceId: string; voiceName: string }> = {};
      for (const va of data.script.voiceAssignments) {
        initialAssignments[va.speakerName] = {
          voiceId: va.voiceId || '',
          voiceName: va.voiceName || '',
        };
      }
      setVoiceAssignments(initialAssignments);

      // Go to voice assignment step first (before script review)
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsRefining(false);
    }
  };

  // Update voice assignment
  const handleVoiceChange = (speakerName: string, voiceId: string, voiceName: string) => {
    setVoiceAssignments(prev => ({
      ...prev,
      [speakerName]: { voiceId, voiceName },
    }));
  };

  // Start audio generation
  const handleGenerateAudio = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const backendProvider = mapProviderForBackend(selectedProvider);

      const response = await fetch(
        `${API_BASE_URL}/api/conversations/sessions/${sessionId}/generate-audio`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: backendProvider,
            voiceAssignments,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start audio generation');
      }

      const data = await response.json();
      setJobId(data.jobId);
      setStep('generating');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsGenerating(false);
    }
  };

  // Check if all voices are assigned
  const allVoicesAssigned = refinedScript?.voiceAssignments.every(
    va => voiceAssignments[va.speakerName]?.voiceId
  );

  // Get voices based on provider
  const getVoicesForProvider = (): AvailableVoice[] => {
    if (selectedProvider === 'google-cloud-long') {
      return GOOGLE_CLOUD_VOICES;
    }
    if (selectedProvider === 'gemini') {
      return GEMINI_VOICES;
    }
    return availableVoices;
  };

  // Group voices by category for better organization
  const getGroupedVoices = () => {
    const voices = getVoicesForProvider();
    const groups: Record<string, AvailableVoice[]> = {};

    for (const voice of voices) {
      const category = voice.category || 'Other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(voice);
    }

    // Sort categories by tier (premium first for visibility, then budget)
    const categoryOrder = ['Studio', 'Neural2', 'Wavenet', 'News', 'Other'];
    const sortedCategories = Object.keys(groups).sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a);
      const bIndex = categoryOrder.indexOf(b);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });

    return { groups, sortedCategories };
  };

  // ============================================================================
  // Script Review Handlers
  // ============================================================================

  // Calculate totals from editable segments
  const calculateTotalWords = (segments: RefinedSegment[]) => {
    return segments.reduce((sum, s) => sum + s.content.split(/\s+/).filter(Boolean).length, 0);
  };

  // Start editing a segment
  const handleStartEdit = (index: number) => {
    setEditingSegmentIndex(index);
    setEditingContent(editableSegments[index]?.content || '');
    setConfirmDeleteIndex(null);
  };

  // Save edited content
  const handleSaveEdit = async (index: number) => {
    const updated = [...editableSegments];
    updated[index] = { ...updated[index], content: editingContent };
    setEditableSegments(updated);
    setEditingSegmentIndex(null);
    setEditingContent('');

    // Auto-save to database
    await saveScriptToDatabase(updated);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingSegmentIndex(null);
    setEditingContent('');
  };

  // Request delete confirmation
  const handleRequestDelete = (index: number) => {
    setConfirmDeleteIndex(index);
    setEditingSegmentIndex(null);
  };

  // Cancel delete
  const handleCancelDelete = () => {
    setConfirmDeleteIndex(null);
  };

  // Delete a segment
  const handleDeleteSegment = async (index: number) => {
    const updated = editableSegments.filter((_, i) => i !== index);
    // Re-number the order field
    const renumbered = updated.map((seg, i) => ({ ...seg, order: i }));
    setEditableSegments(renumbered);
    setConfirmDeleteIndex(null);

    // Auto-save to database
    await saveScriptToDatabase(renumbered);
  };

  // Save script to database
  const saveScriptToDatabase = async (segments: RefinedSegment[]) => {
    if (!refinedScript) return;

    setIsSavingScript(true);
    try {
      const backendProvider = mapProviderForBackend(selectedProvider);
      const response = await fetch(
        `${API_BASE_URL}/api/conversations/sessions/${sessionId}/refined-script`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            segments,
            provider: backendProvider,
            title: refinedScript.title,
            topic: refinedScript.topic,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        console.error('Failed to save script:', data.error);
      }
    } catch (err) {
      console.error('Error saving script:', err);
    } finally {
      setIsSavingScript(false);
    }
  };

  // Reset script to original (delete saved edits)
  const handleResetScript = async () => {
    if (!confirm('Reset script to original? This will discard all your edits.')) {
      return;
    }

    try {
      // Delete saved script
      await fetch(
        `${API_BASE_URL}/api/conversations/sessions/${sessionId}/refined-script`,
        { method: 'DELETE' }
      );

      // Re-fetch original
      setIsRefining(true);
      const backendProvider = mapProviderForBackend(selectedProvider);
      const response = await fetch(
        `${API_BASE_URL}/api/conversations/sessions/${sessionId}/export-to-podcast`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: backendProvider }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRefinedScript(data.script);
        setEditableSegments([...data.script.segments]);
        setUsedSavedEdits(false);
      }
    } catch (err) {
      console.error('Error resetting script:', err);
    } finally {
      setIsRefining(false);
    }
  };

  // Download script as markdown
  const handleDownloadScript = () => {
    if (!refinedScript || editableSegments.length === 0) return;

    const totalWords = calculateTotalWords(editableSegments);
    const estimatedMinutes = Math.ceil(totalWords / 150);

    let markdown = `# ${refinedScript.title}\n\n`;
    markdown += `**Topic:** ${refinedScript.topic}\n`;
    markdown += `**Segments:** ${editableSegments.length}\n`;
    markdown += `**Words:** ${totalWords.toLocaleString()}\n`;
    markdown += `**Estimated Duration:** ~${estimatedMinutes} minutes\n\n`;
    markdown += `---\n\n`;

    for (const segment of editableSegments) {
      const roleLabel = segment.speakerRole === 'host' ? '[Host]' : '[Guest]';
      markdown += `### ${segment.speakerName} ${roleLabel}\n\n`;
      markdown += `${segment.content}\n\n`;
      if (segment.isKeyPoint) {
        markdown += `> *Key Point*\n\n`;
      }
      markdown += `---\n\n`;
    }

    // Create and download file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${refinedScript.title.toLowerCase().replace(/\s+/g, '-')}-script.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Proceed to script review (from voice assignment)
  const handleProceedToScriptReview = () => {
    setStep('script_review');
  };

  // Proceed to generate audio (from script review)
  const handleProceedToGenerate = () => {
    // Update refinedScript with edited segments for audio generation
    if (refinedScript) {
      const totalWords = calculateTotalWords(editableSegments);
      setRefinedScript({
        ...refinedScript,
        segments: editableSegments,
        totalSegments: editableSegments.length,
        totalWords,
        estimatedDurationMinutes: Math.ceil(totalWords / 150),
      });
    }
    // Start audio generation
    handleGenerateAudio();
  };

  // ============================================================================
  // Segment Preview Handlers
  // ============================================================================

  // Generate preview for a segment
  const handleGeneratePreview = async (index: number, voiceId: string) => {
    const segment = editableSegments[index];
    if (!segment) return;

    setPreviewingIndex(index);
    setPreviewError(null);

    try {
      const backendProvider = mapProviderForBackend(selectedProvider);
      const response = await fetch(
        `${API_BASE_URL}/api/conversations/sessions/${sessionId}/segments/${index}/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: segment.content,
            voiceId,
            provider: backendProvider,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate preview');
      }

      const data = await response.json();
      // Add cache buster to prevent stale audio playback
      const cacheBuster = Date.now();
      const audioUrl = `${API_BASE_URL}${data.preview.audioUrl}?t=${cacheBuster}`;

      console.log(`[Preview] Generated audio for segment ${index}, voiceId=${voiceId}, url=${audioUrl}`);

      // Store preview data
      setSegmentPreviews(prev => ({
        ...prev,
        [index]: {
          audioUrl,
          durationMs: data.preview.durationMs,
        },
      }));

      // Auto-play the preview
      handlePlayPreview(index, audioUrl);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setPreviewingIndex(null);
    }
  };

  // Play a preview
  const handlePlayPreview = (index: number, audioUrl?: string) => {
    const url = audioUrl || segmentPreviews[index]?.audioUrl;
    if (!url) return;

    // Stop any currently playing audio
    if (previewAudioRef) {
      previewAudioRef.pause();
      previewAudioRef.currentTime = 0;
    }

    const audio = new Audio(url);
    audio.onended = () => setPlayingIndex(null);
    audio.onerror = () => {
      setPreviewError('Failed to play audio');
      setPlayingIndex(null);
    };

    setPreviewAudioRef(audio);
    setPlayingIndex(index);
    audio.play().catch(() => {
      setPreviewError('Failed to play audio');
      setPlayingIndex(null);
    });
  };

  // Stop playing preview
  const handleStopPreview = () => {
    if (previewAudioRef) {
      previewAudioRef.pause();
      previewAudioRef.currentTime = 0;
    }
    setPlayingIndex(null);
  };

  // Delete a preview
  const handleDeletePreview = async (index: number) => {
    try {
      await fetch(
        `${API_BASE_URL}/api/conversations/sessions/${sessionId}/segments/${index}/preview`,
        { method: 'DELETE' }
      );

      // Remove from local state
      setSegmentPreviews(prev => {
        const updated = { ...prev };
        delete updated[index];
        return updated;
      });

      // Stop if this preview was playing
      if (playingIndex === index) {
        handleStopPreview();
      }
    } catch (err) {
      console.error('Failed to delete preview:', err);
    }
  };

  // Get the assigned voice for a segment's speaker (for preview)
  const getVoiceForSegment = (segmentIndex: number): string => {
    const segment = editableSegments[segmentIndex];
    if (!segment) {
      console.warn(`[Preview] No segment found at index ${segmentIndex}`);
      return '';
    }

    // Use the voice assigned to this segment's speaker
    const assignedVoice = voiceAssignments[segment.speakerName]?.voiceId;
    console.log(`[Preview] Segment ${segmentIndex}: speaker="${segment.speakerName}", assignedVoice="${assignedVoice}"`);

    if (assignedVoice) return assignedVoice;

    // Fallback to default voice if somehow not assigned
    console.warn(`[Preview] No voice assigned for speaker "${segment.speakerName}", using fallback`);
    if (selectedProvider === 'google-cloud-long') {
      return GOOGLE_CLOUD_VOICES.find(v => v.category === 'Neural2')?.voice_id || 'en-US-Neural2-A';
    }
    return availableVoices[0]?.voice_id || '';
  };

  // Render provider selector
  const renderProviderSelector = () => (
    <div className={styles.providerSelector}>
      <label className={styles.label}>TTS Provider</label>
      <div className={styles.providerOptions}>
        {TTS_PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className={`${styles.providerOption} ${
              selectedProvider === provider.id ? styles.selected : ''
            }`}
            onClick={() => setSelectedProvider(provider.id)}
          >
            <span className={styles.providerName}>{provider.name}</span>
            <span className={styles.providerDescription}>{provider.description}</span>
          </button>
        ))}
      </div>
    </div>
  );

  // Render configure step
  const renderConfigureStep = () => (
    <div className={styles.step}>
      <p className={styles.intro}>
        Export this conversation as a podcast. The script will be refined for natural speech
        and you'll be able to assign voices to each speaker.
      </p>

      {renderProviderSelector()}

      {error && (
        <Alert variant="error" className={styles.errorAlert}>
          {error}
        </Alert>
      )}

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleRefineScript}
          disabled={isRefining}
        >
          {isRefining ? (
            <>
              <span className={styles.spinner} />
              Refining Script...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </div>
  );

  // Render script review step
  const renderScriptReviewStep = () => {
    const totalWords = calculateTotalWords(editableSegments);
    const estimatedMinutes = Math.ceil(totalWords / 150);

    return (
      <div className={styles.step}>
        {refinedScript && (
          <>
            {/* Header with stats */}
            <div className={styles.scriptReviewHeader}>
              <div>
                <h3>{refinedScript.title}</h3>
                {usedSavedEdits && (
                  <span className={styles.savedEditsBadge}>Using saved edits</span>
                )}
              </div>
              <div className={styles.stats}>
                <span>{editableSegments.length} segments</span>
                <span>{totalWords.toLocaleString()} words</span>
                <span>~{estimatedMinutes} min</span>
                {isSavingScript && <span className={styles.savingIndicator}>Saving...</span>}
              </div>
            </div>

            {/* Action buttons */}
            <div className={styles.scriptActions}>
              <Button variant="secondary" size="sm" onClick={handleDownloadScript}>
                Download Script
              </Button>
              {usedSavedEdits && (
                <Button variant="secondary" size="sm" onClick={handleResetScript} disabled={isRefining}>
                  Reset to Original
                </Button>
              )}
            </div>

            {/* Director's Notes Toggle (only show for Gemini) */}
            {refinedScript.geminiDirectorNotes && (
              <div className={styles.directorNotesContainer}>
                <button
                  type="button"
                  className={styles.directorNotesToggle}
                  onClick={() => setShowDirectorNotes(!showDirectorNotes)}
                  aria-expanded={showDirectorNotes}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`${styles.toggleIcon} ${showDirectorNotes ? styles.expanded : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span className={styles.toggleLabel}>
                    Gemini Director's Notes
                  </span>
                  <span className={styles.geminiLabel}>TTS Guidance</span>
                </button>
                {showDirectorNotes && (
                  <div className={styles.directorNotesPanel}>
                    {/* Show Context */}
                    <div className={styles.notesSection}>
                      <h5 className={styles.notesSectionTitle}>Show Context</h5>
                      <p className={styles.notesSectionContent}>{refinedScript.geminiDirectorNotes.showContext}</p>
                    </div>

                    {/* Scene Context */}
                    <div className={styles.notesSection}>
                      <h5 className={styles.notesSectionTitle}>Scene Context</h5>
                      <p className={styles.notesSectionContent}>{refinedScript.geminiDirectorNotes.sceneContext}</p>
                    </div>

                    {/* Pacing Notes */}
                    <div className={styles.notesSection}>
                      <h5 className={styles.notesSectionTitle}>Pacing Notes</h5>
                      <p className={styles.notesSectionContent}>{refinedScript.geminiDirectorNotes.pacingNotes}</p>
                    </div>

                    {/* Speaker Directions */}
                    <div className={styles.notesSection}>
                      <h5 className={styles.notesSectionTitle}>Speaker Directions</h5>
                      <div className={styles.speakerDirections}>
                        {Object.entries(refinedScript.geminiDirectorNotes.speakerDirections).map(([speakerId, direction]) => (
                          <div key={speakerId} className={styles.speakerDirection}>
                            <div className={styles.speakerDirectionHeader}>{direction.speakerId}</div>
                            <div className={styles.speakerDirectionItem}>
                              <span className={styles.directionLabel}>Character:</span>
                              <span className={styles.directionValue}>{direction.characterProfile}</span>
                            </div>
                            <div className={styles.speakerDirectionItem}>
                              <span className={styles.directionLabel}>Voice Style:</span>
                              <span className={styles.directionValue}>{direction.vocalStyle}</span>
                            </div>
                            <div className={styles.speakerDirectionItem}>
                              <span className={styles.directionLabel}>Performance:</span>
                              <span className={styles.directionValue}>{direction.performanceNotes}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Preview error */}
            {previewError && (
              <Alert variant="error" className={styles.errorAlert}>
                {previewError}
              </Alert>
            )}

            {/* Segment list */}
            <div className={styles.segmentList}>
              {editableSegments.map((segment, index) => (
                <div
                  key={`${segment.order}-${index}`}
                  className={`${styles.segmentCard} ${segment.isKeyPoint ? styles.keyPoint : ''} ${segment.isTruncated ? styles.truncated : ''} ${playingIndex === index ? styles.playing : ''}`}
                >
                  {/* Segment header */}
                  <div className={styles.segmentHeader}>
                    <div className={styles.segmentMeta}>
                      <span className={`${styles.speakerBadge} ${segment.speakerRole === 'host' ? styles.host : styles.guest}`}>
                        {segment.speakerName}
                      </span>
                      <span className={styles.charCount}>
                        {segment.content.length} chars
                      </span>
                      {segment.isKeyPoint && (
                        <span className={styles.keyPointBadge}>Key Point</span>
                      )}
                      {segment.isTruncated && (
                        <span className={styles.truncatedBadge} title="This segment appears to end mid-sentence">Truncated</span>
                      )}
                      {segmentPreviews[index] && (
                        <span className={styles.previewBadge}>Has Preview</span>
                      )}
                    </div>
                    <div className={styles.segmentActions}>
                      {editingSegmentIndex !== index && confirmDeleteIndex !== index && (
                        <>
                          {/* Preview/Play controls */}
                          {previewingIndex === index ? (
                            <span className={styles.previewSpinner}>Generating...</span>
                          ) : playingIndex === index ? (
                            <button
                              className={`${styles.iconButton} ${styles.stopButton}`}
                              onClick={handleStopPreview}
                              title="Stop"
                            >
                              Stop
                            </button>
                          ) : segmentPreviews[index] ? (
                            <>
                              <button
                                className={`${styles.iconButton} ${styles.playButton}`}
                                onClick={() => handlePlayPreview(index)}
                                title="Play Preview"
                              >
                                Play
                              </button>
                              <button
                                className={styles.iconButton}
                                onClick={() => handleDeletePreview(index)}
                                title="Delete Preview"
                              >
                                X
                              </button>
                            </>
                          ) : (
                            <button
                              className={`${styles.iconButton} ${styles.previewButton}`}
                              onClick={() => handleGeneratePreview(index, getVoiceForSegment(index))}
                              title="Preview Audio"
                            >
                              Preview
                            </button>
                          )}
                          <button
                            className={styles.iconButton}
                            onClick={() => handleStartEdit(index)}
                            title="Edit"
                          >
                            Edit
                          </button>
                          <button
                            className={`${styles.iconButton} ${styles.deleteButton}`}
                            onClick={() => handleRequestDelete(index)}
                            title="Delete"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Content or edit mode */}
                  {editingSegmentIndex === index ? (
                    <div className={styles.editMode}>
                      <textarea
                        className={styles.editTextarea}
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        rows={4}
                        autoFocus
                      />
                      <div className={styles.editActions}>
                        <Button variant="secondary" size="sm" onClick={handleCancelEdit}>
                          Cancel
                        </Button>
                        <Button variant="primary" size="sm" onClick={() => handleSaveEdit(index)}>
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : confirmDeleteIndex === index ? (
                    <div className={styles.confirmDelete}>
                      <span className={styles.confirmText}>Delete this segment?</span>
                      <Button variant="secondary" size="sm" onClick={handleCancelDelete}>
                        Cancel
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => handleDeleteSegment(index)}>
                        Delete
                      </Button>
                    </div>
                  ) : (
                    <p className={styles.segmentContent}>{segment.content}</p>
                  )}
                </div>
              ))}
            </div>

            {editableSegments.length === 0 && (
              <Alert variant="warning">
                No segments remaining. Reset to restore original script.
              </Alert>
            )}

            {error && (
              <Alert variant="error" className={styles.errorAlert}>
                {error}
              </Alert>
            )}

            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setStep('preview')}>
                Back to Voices
              </Button>
              <Button
                variant="primary"
                onClick={handleProceedToGenerate}
                disabled={editableSegments.length === 0 || isGenerating}
              >
                {isGenerating ? (
                  <>
                    <span className={styles.spinner} />
                    Starting...
                  </>
                ) : (
                  'Generate Podcast'
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

  // Render preview step with voice assignments
  const renderPreviewStep = () => {
    const voices = getVoicesForProvider();
    const { groups, sortedCategories } = getGroupedVoices();
    const isGoogleCloud = selectedProvider === 'google-cloud-long';

    return (
      <div className={styles.step}>
        {refinedScript && (
          <>
            <div className={styles.scriptInfo}>
              <h3>{refinedScript.title}</h3>
              <div className={styles.stats}>
                <span>{refinedScript.totalSegments} segments</span>
                <span>{refinedScript.totalWords.toLocaleString()} words</span>
                <span>~{refinedScript.estimatedDurationMinutes} min</span>
              </div>
            </div>

            <div className={styles.voiceSection}>
              <h4>Assign Voices</h4>
              <p className={styles.hint}>
                Assign a voice to each speaker. The host and each guest need their own voice.
              </p>

              {isGoogleCloud && (
                <div className={styles.pricingHint}>
                  <strong>Pricing:</strong> $ = Budget ($16/1M) | $$$ = Premium ($160/1M) — All voices support SSML
                </div>
              )}

              {isLoadingVoices && selectedProvider === 'elevenlabs' ? (
                <div className={styles.loading}>
                  <span className={styles.spinner} />
                  Loading voices...
                </div>
              ) : (
                <div className={styles.voiceList}>
                  {refinedScript.voiceAssignments.map((va) => (
                    <div key={va.speakerName} className={styles.voiceRow}>
                      <div className={styles.speakerInfo}>
                        <span className={styles.speakerName}>{va.speakerName}</span>
                        <span className={styles.speakerRole}>
                          {va.speakerRole === 'host' ? 'Host' : 'Guest'}
                        </span>
                      </div>
                      <select
                        className={styles.voiceSelect}
                        value={voiceAssignments[va.speakerName]?.voiceId || ''}
                        onChange={(e) => {
                          const voice = voices.find(v => v.voice_id === e.target.value);
                          handleVoiceChange(
                            va.speakerName,
                            e.target.value,
                            voice?.name || e.target.value
                          );
                        }}
                      >
                        <option value="">Select a voice...</option>
                        {isGoogleCloud ? (
                          // Grouped options for Google Cloud
                          sortedCategories.map((category) => (
                            <optgroup key={category} label={`${category} (${getTierLabel(groups[category]?.[0]?.tier)})`}>
                              {groups[category]?.map((voice) => (
                                <option key={voice.voice_id} value={voice.voice_id}>
                                  {voice.name} {getGenderLabel(voice.gender)}
                                </option>
                              ))}
                            </optgroup>
                          ))
                        ) : (
                          // Flat list for other providers
                          voices.map((voice) => (
                            <option key={voice.voice_id} value={voice.voice_id}>
                              {voice.name}
                              {voice.gender && ` ${getGenderLabel(voice.gender)}`}
                              {voice.category && ` - ${voice.category}`}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <Alert variant="error" className={styles.errorAlert}>
                {error}
              </Alert>
            )}

            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setStep('configure')}>
                Back
              </Button>
              <Button
                variant="primary"
                onClick={handleProceedToScriptReview}
                disabled={!allVoicesAssigned}
                title={!allVoicesAssigned ? 'Assign voices to all speakers first' : ''}
              >
                Continue to Script Review
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

  // Render generating step with progress
  const renderGeneratingStep = () => (
    <div className={styles.step}>
      <div className={styles.scriptInfo}>
        <h3>Generating Audio</h3>
        <p className={styles.hint}>
          This may take several minutes depending on the conversation length.
        </p>
      </div>

      <div className={styles.progressContainer}>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${progress?.progressPercent || 0}%` }}
          />
        </div>
        <div className={styles.progressText}>
          {progress ? (
            <>
              {progress.progressPercent}% - Segment {progress.currentSegment} of {progress.totalSegments}
            </>
          ) : (
            'Starting generation...'
          )}
        </div>
      </div>

      {error && (
        <Alert variant="error" className={styles.errorAlert}>
          {error}
        </Alert>
      )}

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>
          Close (generation continues)
        </Button>
      </div>
    </div>
  );

  // Render complete step with download
  const renderCompleteStep = () => (
    <div className={styles.step}>
      <div className={styles.successInfo}>
        <div className={styles.successIcon}>✓</div>
        <h3>Podcast Generated!</h3>
        <p className={styles.hint}>
          Your podcast audio is ready for download.
        </p>
      </div>

      {progress && (
        <div className={styles.stats}>
          <span>{progress.totalSegments} segments</span>
          <span>{refinedScript?.totalWords?.toLocaleString()} words</span>
        </div>
      )}

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        {jobId && (
          <Button
            variant="primary"
            onClick={() => {
              window.open(`${API_BASE_URL}/api/exports/podcast/${jobId}/download`, '_blank');
            }}
          >
            Download MP3
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Export Podcast: ${topic}`}
      size="lg"
    >
      <div className={styles.content}>
        {/* Step Indicator: Configure → Voices → Script Review → Generate → Complete */}
        <div className={styles.stepIndicator}>
          <div
            className={`${styles.stepDot} ${step === 'configure' ? styles.active : ''} ${['preview', 'script_review', 'generating', 'complete'].includes(step) ? styles.completed : ''}`}
          >
            1
          </div>
          <div className={styles.stepLine} />
          <div
            className={`${styles.stepDot} ${step === 'preview' ? styles.active : ''} ${['script_review', 'generating', 'complete'].includes(step) ? styles.completed : ''}`}
          >
            2
          </div>
          <div className={styles.stepLine} />
          <div
            className={`${styles.stepDot} ${step === 'script_review' ? styles.active : ''} ${['generating', 'complete'].includes(step) ? styles.completed : ''}`}
          >
            3
          </div>
          <div className={styles.stepLine} />
          <div
            className={`${styles.stepDot} ${step === 'generating' ? styles.active : ''} ${step === 'complete' ? styles.completed : ''}`}
          >
            4
          </div>
          <div className={styles.stepLine} />
          <div
            className={`${styles.stepDot} ${step === 'complete' ? styles.active : ''}`}
          >
            5
          </div>
        </div>

        {/* Step Content */}
        {step === 'configure' && renderConfigureStep()}
        {step === 'script_review' && renderScriptReviewStep()}
        {step === 'preview' && renderPreviewStep()}
        {step === 'generating' && renderGeneratingStep()}
        {step === 'complete' && renderCompleteStep()}
      </div>
    </Modal>
  );
}

export default ConversationPodcastExportModal;
