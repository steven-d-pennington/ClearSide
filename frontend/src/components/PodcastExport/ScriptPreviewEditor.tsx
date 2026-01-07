/**
 * ScriptPreviewEditor Component
 *
 * Displays the refined podcast script with editing capabilities.
 * Users can edit segment text and request regeneration.
 */

import { useState, useMemo } from 'react';
import { Button, Badge, Textarea } from '../ui';
import type {
  RefinedPodcastScript,
  PodcastSegment,
  VoiceAssignment,
  GeminiDirectorNotes,
} from '../../types/podcast';
import styles from './ScriptPreviewEditor.module.css';

interface ScriptPreviewEditorProps {
  script: RefinedPodcastScript;
  voiceAssignments: Record<string, VoiceAssignment>;
  onUpdate: (update: { segments?: PodcastSegment[]; intro?: PodcastSegment; outro?: PodcastSegment }) => void;
  onRegenerate: (index: number, instructions?: string) => Promise<void>;
}

interface DisplaySegment extends PodcastSegment {
  type: 'intro' | 'content' | 'outro';
  displayIndex: number;
}

export function ScriptPreviewEditor({
  script,
  voiceAssignments,
  onUpdate,
  onRegenerate,
}: ScriptPreviewEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [showDirectorNotes, setShowDirectorNotes] = useState(false);

  // Check if director's notes are available
  const hasDirectorNotes = !!script.geminiDirectorNotes;

  // Combine all segments into a single list for display
  const allSegments = useMemo<DisplaySegment[]>(() => {
    const segments: DisplaySegment[] = [];
    let displayIndex = 0;

    if (script.intro) {
      segments.push({ ...script.intro, type: 'intro', displayIndex: displayIndex++ });
    }

    script.segments.forEach((segment) => {
      segments.push({ ...segment, type: 'content', displayIndex: displayIndex++ });
    });

    if (script.outro) {
      segments.push({ ...script.outro, type: 'outro', displayIndex: displayIndex++ });
    }

    return segments;
  }, [script]);

  // Get speaker color for badges
  const getSpeakerColor = (speaker: string): string => {
    const colors: Record<string, string> = {
      moderator: styles.moderator,
      pro_advocate: styles.proAdvocate,
      con_advocate: styles.conAdvocate,
      narrator: styles.narrator,
    };
    return colors[speaker] || styles.defaultSpeaker;
  };

  // Get voice name for display
  const getVoiceName = (speaker: string): string => {
    return voiceAssignments[speaker]?.voiceName || speaker;
  };

  // Get speaker label
  const getSpeakerLabel = (speaker: string): string => {
    const labels: Record<string, string> = {
      moderator: 'Moderator',
      pro_advocate: 'Pro',
      con_advocate: 'Con',
      narrator: 'Narrator',
    };
    return labels[speaker] || speaker;
  };

  // Start editing a segment
  const startEdit = (displayIndex: number, text: string) => {
    setEditingIndex(displayIndex);
    setEditText(text);
  };

  // Save edited segment
  const saveEdit = () => {
    if (editingIndex === null) return;

    const segment = allSegments[editingIndex];
    if (!segment) return;

    // Create updated segment with new text
    const { type: segmentType, displayIndex: _, ...segmentWithoutMeta } = segment;
    const updatedSegment: PodcastSegment = { ...segmentWithoutMeta, text: editText };

    // Send update based on segment type
    if (segmentType === 'intro') {
      onUpdate({ intro: updatedSegment });
    } else if (segmentType === 'outro') {
      onUpdate({ outro: updatedSegment });
    } else {
      // For content segments, we need to update the full array
      const updatedSegments = allSegments
        .filter((s) => s.type === 'content')
        .map((s) => {
          const { type: __, displayIndex: ___, ...rest } = s;
          if (s.displayIndex === editingIndex) {
            return { ...rest, text: editText };
          }
          return rest;
        });
      onUpdate({ segments: updatedSegments });
    }

    setEditingIndex(null);
    setEditText('');
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingIndex(null);
    setEditText('');
  };

  // Handle regenerate request
  const handleRegenerate = async (displayIndex: number) => {
    setRegeneratingIndex(displayIndex);
    try {
      await onRegenerate(displayIndex);
    } finally {
      setRegeneratingIndex(null);
    }
  };

  // Render director's notes panel
  const renderDirectorNotes = (notes: GeminiDirectorNotes) => (
    <div className={styles.directorNotesPanel}>
      <div className={styles.directorNotesSection}>
        <h4 className={styles.directorNotesSectionTitle}>Show Context</h4>
        <p className={styles.directorNotesText}>{notes.showContext}</p>
      </div>

      <div className={styles.directorNotesSection}>
        <h4 className={styles.directorNotesSectionTitle}>Scene Context</h4>
        <p className={styles.directorNotesText}>{notes.sceneContext}</p>
      </div>

      <div className={styles.directorNotesSection}>
        <h4 className={styles.directorNotesSectionTitle}>Pacing Notes</h4>
        <p className={styles.directorNotesText}>{notes.pacingNotes}</p>
      </div>

      <div className={styles.directorNotesSection}>
        <h4 className={styles.directorNotesSectionTitle}>Speaker Directions</h4>
        <div className={styles.speakerDirections}>
          {Object.entries(notes.speakerDirections).map(([speaker, direction]) => (
            <div key={speaker} className={styles.speakerDirection}>
              <div className={styles.speakerDirectionHeader}>
                <Badge
                  variant="primary"
                  className={`${styles.speakerBadge} ${getSpeakerColor(speaker)}`}
                >
                  {getSpeakerLabel(speaker)}
                </Badge>
              </div>
              <div className={styles.speakerDirectionContent}>
                <div className={styles.directionItem}>
                  <span className={styles.directionLabel}>Character:</span>
                  <span className={styles.directionValue}>{direction.characterProfile}</span>
                </div>
                <div className={styles.directionItem}>
                  <span className={styles.directionLabel}>Voice Style:</span>
                  <span className={styles.directionValue}>{direction.vocalStyle}</span>
                </div>
                <div className={styles.directionItem}>
                  <span className={styles.directionLabel}>Performance:</span>
                  <span className={styles.directionValue}>{direction.performanceNotes}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Refined Script</h3>
        <span className={styles.stats}>
          {allSegments.length} segments | {script.totalCharacters.toLocaleString()} characters
        </span>
      </div>

      {/* Director's Notes Toggle (only show for Gemini) */}
      {hasDirectorNotes && (
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
            <Badge variant="secondary" className={styles.geminiLabel}>
              TTS Guidance
            </Badge>
          </button>
          {showDirectorNotes && script.geminiDirectorNotes && renderDirectorNotes(script.geminiDirectorNotes)}
        </div>
      )}

      <div className={styles.segmentList}>
        {allSegments.map((segment, index) => (
          <div key={index} className={styles.segment}>
            <div className={styles.segmentHeader}>
              <div className={styles.segmentMeta}>
                {segment.type !== 'content' && (
                  <Badge variant="secondary" className={styles.typeBadge}>
                    {segment.type === 'intro' ? 'Intro' : 'Outro'}
                  </Badge>
                )}
                <Badge
                  variant="primary"
                  className={`${styles.speakerBadge} ${getSpeakerColor(segment.speaker)}`}
                >
                  {getSpeakerLabel(segment.speaker)}
                </Badge>
                <span className={styles.voiceName}>
                  ({getVoiceName(segment.speaker)})
                </span>
                <span className={styles.charCount}>
                  {segment.text.length} chars
                </span>
              </div>

              {editingIndex !== index && (
                <div className={styles.segmentActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(index, segment.text)}
                    title="Edit segment"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRegenerate(index)}
                    disabled={regeneratingIndex === index}
                    title="Regenerate segment"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={regeneratingIndex === index ? styles.spinning : ''}
                    >
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  </Button>
                </div>
              )}
            </div>

            {editingIndex === index ? (
              <div className={styles.editMode}>
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={4}
                  className={styles.editTextarea}
                />
                <div className={styles.editActions}>
                  <Button variant="ghost" size="sm" onClick={cancelEdit}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" onClick={saveEdit}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p className={styles.segmentText}>{segment.text}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ScriptPreviewEditor;
