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
  onDelete?: (segmentIndex: number) => Promise<void>;
  onAdd?: (insertAfterIndex: number, speaker: string) => Promise<number | undefined>;
}

const SPEAKER_OPTIONS = [
  { value: 'narrator', label: 'Narrator' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'pro_advocate', label: 'Pro Advocate' },
  { value: 'con_advocate', label: 'Con Advocate' },
];

interface DisplaySegment extends PodcastSegment {
  type: 'intro' | 'content' | 'outro';
  displayIndex: number;
}

export function ScriptPreviewEditor({
  script,
  voiceAssignments,
  onUpdate,
  onRegenerate,
  onDelete,
  onAdd,
}: ScriptPreviewEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [showDirectorNotes, setShowDirectorNotes] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);
  const [addingAfterIndex, setAddingAfterIndex] = useState<number | null>(null);

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

  // Handle delete segment
  const handleDelete = async (displayIndex: number) => {
    if (!onDelete) return;

    // For content segments, we need to map displayIndex to the actual segment index
    const segment = allSegments[displayIndex];
    if (!segment || segment.type !== 'content') {
      // Only allow deleting content segments, not intro/outro
      return;
    }

    // Find the actual index in the segments array
    const contentSegments = allSegments.filter(s => s.type === 'content');
    const segmentIndex = contentSegments.findIndex(s => s.displayIndex === displayIndex);

    if (segmentIndex === -1) return;

    setDeletingIndex(displayIndex);
    try {
      await onDelete(segmentIndex);
    } finally {
      setDeletingIndex(null);
      setConfirmDeleteIndex(null);
    }
  };

  // Handle add segment
  const handleAddSegment = async (insertAfterDisplayIndex: number, speaker: string) => {
    if (!onAdd) return;

    // Calculate the actual segment index to insert after
    // -1 means insert at the very beginning (before all content segments)
    let insertAfterIndex = -1;

    if (insertAfterDisplayIndex >= 0) {
      const segment = allSegments[insertAfterDisplayIndex];
      if (segment) {
        if (segment.type === 'intro') {
          insertAfterIndex = -1; // Insert at the beginning of content segments
        } else if (segment.type === 'content') {
          // Find actual index in segments array
          const contentSegments = allSegments.filter(s => s.type === 'content');
          insertAfterIndex = contentSegments.findIndex(s => s.displayIndex === insertAfterDisplayIndex);
        } else if (segment.type === 'outro') {
          // Insert before outro = after last content segment
          insertAfterIndex = script.segments.length - 1;
        }
      }
    }

    setAddingAfterIndex(insertAfterDisplayIndex);
    try {
      const newIndex = await onAdd(insertAfterIndex, speaker);
      if (newIndex !== undefined) {
        // Could auto-open edit mode for the new segment here
      }
    } finally {
      setAddingAfterIndex(null);
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
                  {/* Delete button - only for content segments */}
                  {onDelete && segment.type === 'content' && (
                    confirmDeleteIndex === index ? (
                      <div className={styles.confirmDelete}>
                        <span className={styles.confirmText}>Delete?</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(index)}
                          disabled={deletingIndex === index}
                          className={styles.confirmYes}
                          title="Confirm delete"
                        >
                          {deletingIndex === index ? '...' : 'Yes'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteIndex(null)}
                          className={styles.confirmNo}
                          title="Cancel"
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteIndex(index)}
                        className={styles.deleteButton}
                        title="Delete segment"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </Button>
                    )
                  )}
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

            {/* Add Segment Button - show between content segments and after intro */}
            {onAdd && (segment.type === 'content' || segment.type === 'intro') && (
              <div className={styles.addSegmentContainer}>
                {addingAfterIndex === index ? (
                  <div className={styles.speakerSelector}>
                    <span className={styles.selectorLabel}>Select speaker:</span>
                    <div className={styles.speakerOptions}>
                      {SPEAKER_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`${styles.speakerOption} ${getSpeakerColor(option.value)}`}
                          onClick={() => handleAddSegment(index, option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={styles.cancelOption}
                        onClick={() => setAddingAfterIndex(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.addSegmentButton}
                    onClick={() => setAddingAfterIndex(index)}
                    title="Add new segment here"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Add Segment</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ScriptPreviewEditor;
