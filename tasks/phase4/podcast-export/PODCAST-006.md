# PODCAST-006: Frontend Podcast Export UI

**Task ID:** PODCAST-006
**Phase:** Phase 4
**Category:** Podcast Export
**Priority:** P1
**Estimated Effort:** L (1-2 days)
**Dependencies:** PODCAST-004, PODCAST-005
**Status:** DONE

---

## Context

Users need an intuitive interface to configure voice assignments, preview and edit the refined script, monitor generation progress, and download the final podcast. This task implements the complete frontend experience for podcast export.

**References:**
- [FUTURE-FEATURES.md](../../../docs/FUTURE-FEATURES.md) - Section 9: UI Workflow and Wireframes
- Existing ExportPanel component in `frontend/src/components/Export/`
- Design system in `frontend/src/components/ui/`

---

## Requirements

### Acceptance Criteria

- [x] Create `PodcastExportModal` component with multi-step workflow
- [x] Implement `VoiceAssignmentPanel` for speaker-to-voice mapping
- [x] Create `ScriptPreviewEditor` for reviewing/editing refined script
- [x] Add `VoicePreviewPlayer` for listening to voice samples
- [x] Implement `GenerationProgress` component with segment tracking
- [x] Display cost estimation before generation
- [x] Add download button when podcast is ready
- [x] Support regenerating individual segments
- [x] Handle errors gracefully with retry options
- [x] Make UI responsive for mobile devices

### Functional Requirements

From FUTURE-FEATURES.md:
- Step 1: Configure voices for each speaker role
- Step 2: Choose script options (intro, outro, transitions)
- Step 3: Select quality settings (model, format)
- Preview script before generating
- Monitor progress during generation
- Download when complete

---

## Implementation Guide

### Main Export Modal

```tsx
// frontend/src/components/PodcastExport/PodcastExportModal.tsx

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { VoiceAssignmentPanel } from './VoiceAssignmentPanel';
import { ScriptOptionsPanel } from './ScriptOptionsPanel';
import { QualitySettingsPanel } from './QualitySettingsPanel';
import { ScriptPreviewEditor } from './ScriptPreviewEditor';
import { GenerationProgress } from './GenerationProgress';
import { usePodcastExport } from '../../hooks/usePodcastExport';
import type { PodcastExportConfig, VoiceAssignment } from '../../types/podcast';

interface PodcastExportModalProps {
  debateId: string;
  debateTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'configure' | 'preview' | 'generate';

export function PodcastExportModal({
  debateId,
  debateTitle,
  isOpen,
  onClose,
}: PodcastExportModalProps) {
  const [step, setStep] = useState<Step>('configure');
  const [activeTab, setActiveTab] = useState('voices');

  const {
    config,
    updateConfig,
    refinedScript,
    isRefining,
    isGenerating,
    progress,
    error,
    audioUrl,
    estimatedCost,
    actualCost,
    refineScript,
    updateScript,
    regenerateSegment,
    startGeneration,
    downloadPodcast,
  } = usePodcastExport(debateId);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('configure');
      setActiveTab('voices');
    }
  }, [isOpen]);

  const handleRefineAndPreview = async () => {
    await refineScript();
    setStep('preview');
  };

  const handleStartGeneration = async () => {
    setStep('generate');
    await startGeneration();
  };

  const handleClose = () => {
    if (isGenerating) {
      const confirmed = window.confirm(
        'Generation is in progress. Are you sure you want to close?'
      );
      if (!confirmed) return;
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Export Podcast: {debateTitle}
          </DialogTitle>
        </DialogHeader>

        {step === 'configure' && (
          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="voices">1. Voices</TabsTrigger>
                <TabsTrigger value="options">2. Options</TabsTrigger>
                <TabsTrigger value="quality">3. Quality</TabsTrigger>
              </TabsList>

              <TabsContent value="voices" className="mt-4">
                <VoiceAssignmentPanel
                  assignments={config.voiceAssignments}
                  onChange={(assignments) =>
                    updateConfig({ voiceAssignments: assignments })
                  }
                />
              </TabsContent>

              <TabsContent value="options" className="mt-4">
                <ScriptOptionsPanel
                  config={config}
                  onChange={updateConfig}
                />
              </TabsContent>

              <TabsContent value="quality" className="mt-4">
                <QualitySettingsPanel
                  config={config}
                  onChange={updateConfig}
                />
              </TabsContent>
            </Tabs>

            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleRefineAndPreview} disabled={isRefining}>
                {isRefining ? 'Refining Script...' : 'Preview Script'}
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && refinedScript && (
          <div className="space-y-6">
            <ScriptPreviewEditor
              script={refinedScript}
              onUpdate={updateScript}
              onRegenerate={regenerateSegment}
              voiceAssignments={config.voiceAssignments}
            />

            <div className="bg-muted p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">Estimated</p>
                  <p className="font-medium">
                    ~{Math.round(refinedScript.durationEstimateSeconds / 60)} minutes
                    {' | '}
                    {refinedScript.totalCharacters.toLocaleString()} characters
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Cost</p>
                  <p className="font-medium text-lg">
                    ${(estimatedCost / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" onClick={() => setStep('configure')}>
                Back to Settings
              </Button>
              <Button onClick={handleStartGeneration}>
                Generate Podcast (${(estimatedCost / 100).toFixed(2)})
              </Button>
            </div>
          </div>
        )}

        {step === 'generate' && (
          <GenerationProgress
            progress={progress}
            error={error}
            audioUrl={audioUrl}
            actualCost={actualCost}
            onDownload={downloadPodcast}
            onRetry={handleStartGeneration}
            onClose={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

### Voice Assignment Panel

```tsx
// frontend/src/components/PodcastExport/VoiceAssignmentPanel.tsx

import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Slider } from '../ui/slider';
import { Button } from '../ui/button';
import { PlayIcon, StopIcon } from 'lucide-react';
import { VoicePreviewPlayer } from './VoicePreviewPlayer';
import type { VoiceAssignment, ElevenLabsVoiceSettings } from '../../types/podcast';

interface VoiceAssignmentPanelProps {
  assignments: Record<string, VoiceAssignment>;
  onChange: (assignments: Record<string, VoiceAssignment>) => void;
}

const SPEAKER_ROLES = [
  { id: 'moderator', label: 'Moderator', description: 'Professional, balanced' },
  { id: 'pro_advocate', label: 'Pro Advocate', description: 'Confident, persuasive' },
  { id: 'con_advocate', label: 'Con Advocate', description: 'Articulate, measured' },
  { id: 'narrator', label: 'Narrator (Intro/Outro)', description: 'Warm, inviting' },
];

export function VoiceAssignmentPanel({
  assignments,
  onChange,
}: VoiceAssignmentPanelProps) {
  const [availableVoices, setAvailableVoices] = useState<
    Array<{ voiceId: string; name: string; recommended: boolean }>
  >([]);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  useEffect(() => {
    fetchVoices();
  }, []);

  const fetchVoices = async () => {
    try {
      const response = await fetch('/api/exports/podcast/voices');
      const data = await response.json();
      setAvailableVoices(data.voices.moderator || []);
    } catch (error) {
      console.error('Failed to fetch voices:', error);
    }
  };

  const updateAssignment = (
    roleId: string,
    updates: Partial<VoiceAssignment>
  ) => {
    onChange({
      ...assignments,
      [roleId]: {
        ...assignments[roleId],
        ...updates,
      },
    });
  };

  const updateSettings = (
    roleId: string,
    settingKey: keyof ElevenLabsVoiceSettings,
    value: number | boolean
  ) => {
    onChange({
      ...assignments,
      [roleId]: {
        ...assignments[roleId],
        settings: {
          ...assignments[roleId].settings,
          [settingKey]: value,
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Assign distinct voices to each speaker role for a natural-sounding podcast.
      </p>

      {SPEAKER_ROLES.map((role) => (
        <div
          key={role.id}
          className="border rounded-lg p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">{role.label}</Label>
              <p className="text-sm text-muted-foreground">{role.description}</p>
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={assignments[role.id]?.voiceId}
                onValueChange={(voiceId) => {
                  const voice = availableVoices.find(v => v.voiceId === voiceId);
                  updateAssignment(role.id, {
                    voiceId,
                    voiceName: voice?.name || voiceId,
                  });
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  {availableVoices.map((voice) => (
                    <SelectItem key={voice.voiceId} value={voice.voiceId}>
                      {voice.name}
                      {voice.recommended && ' (Recommended)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <VoicePreviewPlayer
                voiceId={assignments[role.id]?.voiceId}
                isPlaying={previewingVoice === role.id}
                onPlay={() => setPreviewingVoice(role.id)}
                onStop={() => setPreviewingVoice(null)}
              />
            </div>
          </div>

          {/* Advanced Settings (collapsed by default) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpandedRole(
              expandedRole === role.id ? null : role.id
            )}
          >
            {expandedRole === role.id ? 'Hide' : 'Show'} Advanced Settings
          </Button>

          {expandedRole === role.id && (
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Stability</Label>
                  <span className="text-sm text-muted-foreground">
                    {assignments[role.id]?.settings.stability.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[assignments[role.id]?.settings.stability || 0.5]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={([value]) =>
                    updateSettings(role.id, 'stability', value)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Lower = more expressive, Higher = more consistent
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Similarity Boost</Label>
                  <span className="text-sm text-muted-foreground">
                    {assignments[role.id]?.settings.similarity_boost.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[assignments[role.id]?.settings.similarity_boost || 0.75]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={([value]) =>
                    updateSettings(role.id, 'similarity_boost', value)
                  }
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Speaking Speed</Label>
                  <span className="text-sm text-muted-foreground">
                    {assignments[role.id]?.settings.speed.toFixed(2)}x
                  </span>
                </div>
                <Slider
                  value={[assignments[role.id]?.settings.speed || 1.0]}
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  onValueChange={([value]) =>
                    updateSettings(role.id, 'speed', value)
                  }
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Script Preview Editor

```tsx
// frontend/src/components/PodcastExport/ScriptPreviewEditor.tsx

import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { RefreshCwIcon, TrashIcon, EditIcon, CheckIcon, XIcon } from 'lucide-react';
import type { RefinedPodcastScript, PodcastSegment, VoiceAssignment } from '../../types/podcast';

interface ScriptPreviewEditorProps {
  script: RefinedPodcastScript;
  voiceAssignments: Record<string, VoiceAssignment>;
  onUpdate: (segments: PodcastSegment[]) => void;
  onRegenerate: (index: number, instructions?: string) => Promise<void>;
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

  const allSegments = [
    script.intro && { ...script.intro, type: 'intro' as const },
    ...script.segments.map(s => ({ ...s, type: 'content' as const })),
    script.outro && { ...script.outro, type: 'outro' as const },
  ].filter(Boolean) as (PodcastSegment & { type: string })[];

  const getSpeakerColor = (speaker: string) => {
    const colors: Record<string, string> = {
      moderator: 'bg-blue-100 text-blue-800',
      pro_advocate: 'bg-green-100 text-green-800',
      con_advocate: 'bg-red-100 text-red-800',
      narrator: 'bg-purple-100 text-purple-800',
    };
    return colors[speaker] || 'bg-gray-100 text-gray-800';
  };

  const getVoiceName = (speaker: string) => {
    return voiceAssignments[speaker]?.voiceName || speaker;
  };

  const startEdit = (index: number, text: string) => {
    setEditingIndex(index);
    setEditText(text);
  };

  const saveEdit = () => {
    if (editingIndex === null) return;

    const newSegments = [...allSegments];
    newSegments[editingIndex] = {
      ...newSegments[editingIndex],
      text: editText,
    };

    // Extract back to proper structure
    const intro = newSegments.find(s => s.type === 'intro');
    const outro = newSegments.find(s => s.type === 'outro');
    const content = newSegments.filter(s => s.type === 'content');

    // This is simplified - actual implementation would call onUpdate properly
    onUpdate(content);

    setEditingIndex(null);
    setEditText('');
  };

  const handleRegenerate = async (index: number) => {
    setRegeneratingIndex(index);
    try {
      await onRegenerate(index);
    } finally {
      setRegeneratingIndex(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Refined Script</h3>
        <p className="text-sm text-muted-foreground">
          {allSegments.length} segments | Click to edit
        </p>
      </div>

      <div className="space-y-4 max-h-[400px] overflow-y-auto">
        {allSegments.map((segment, index) => (
          <div
            key={index}
            className="border rounded-lg p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {segment.type === 'intro' && (
                  <Badge variant="outline">Intro</Badge>
                )}
                {segment.type === 'outro' && (
                  <Badge variant="outline">Outro</Badge>
                )}
                <Badge className={getSpeakerColor(segment.speaker)}>
                  {getVoiceName(segment.speaker)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {segment.text.length} chars
                </span>
              </div>

              <div className="flex gap-1">
                {editingIndex !== index && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(index, segment.text)}
                    >
                      <EditIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRegenerate(index)}
                      disabled={regeneratingIndex === index}
                    >
                      <RefreshCwIcon
                        className={`h-4 w-4 ${
                          regeneratingIndex === index ? 'animate-spin' : ''
                        }`}
                      />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {editingIndex === index ? (
              <div className="space-y-2">
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingIndex(null)}
                  >
                    <XIcon className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveEdit}>
                    <CheckIcon className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap">
                {segment.text}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Generation Progress Component

```tsx
// frontend/src/components/PodcastExport/GenerationProgress.tsx

import React from 'react';
import { Progress } from '../ui/progress';
import { Button } from '../ui/button';
import { DownloadIcon, RefreshCwIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react';

interface GenerationProgressProps {
  progress: {
    phase: string;
    percentComplete: number;
    currentSegment?: number;
    totalSegments?: number;
    message: string;
  };
  error?: string;
  audioUrl?: string;
  actualCost?: number;
  onDownload: () => void;
  onRetry: () => void;
  onClose: () => void;
}

export function GenerationProgress({
  progress,
  error,
  audioUrl,
  actualCost,
  onDownload,
  onRetry,
  onClose,
}: GenerationProgressProps) {
  const isComplete = progress.phase === 'complete';
  const hasError = !!error;

  return (
    <div className="space-y-6 py-4">
      {/* Progress Header */}
      <div className="text-center space-y-2">
        {isComplete && (
          <CheckCircleIcon className="h-12 w-12 mx-auto text-green-500" />
        )}
        {hasError && (
          <XCircleIcon className="h-12 w-12 mx-auto text-red-500" />
        )}
        {!isComplete && !hasError && (
          <div className="h-12 w-12 mx-auto border-4 border-primary border-t-transparent rounded-full animate-spin" />
        )}

        <h3 className="text-lg font-medium">
          {isComplete && 'Podcast Ready!'}
          {hasError && 'Generation Failed'}
          {!isComplete && !hasError && 'Generating Podcast...'}
        </h3>

        <p className="text-sm text-muted-foreground">
          {progress.message}
        </p>
      </div>

      {/* Progress Bar */}
      {!isComplete && !hasError && (
        <div className="space-y-2">
          <Progress value={progress.percentComplete} />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{progress.phase}</span>
            {progress.currentSegment && progress.totalSegments && (
              <span>
                Segment {progress.currentSegment} of {progress.totalSegments}
              </span>
            )}
            <span>{progress.percentComplete}%</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {hasError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Success Info */}
      {isComplete && actualCost !== undefined && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-700">
            Generation cost: ${(actualCost / 100).toFixed(2)}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-4 pt-4 border-t">
        {isComplete && (
          <>
            <Button onClick={onDownload}>
              <DownloadIcon className="h-4 w-4 mr-2" />
              Download Podcast
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </>
        )}

        {hasError && (
          <>
            <Button onClick={onRetry}>
              <RefreshCwIcon className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
```

### Custom Hook for Podcast Export

```tsx
// frontend/src/hooks/usePodcastExport.ts

import { useState, useCallback } from 'react';
import type {
  PodcastExportConfig,
  RefinedPodcastScript,
  PodcastSegment,
} from '../types/podcast';
import { DEFAULT_VOICE_ASSIGNMENTS } from '../types/podcast';

interface PodcastProgress {
  phase: string;
  percentComplete: number;
  currentSegment?: number;
  totalSegments?: number;
  message: string;
}

export function usePodcastExport(debateId: string) {
  const [config, setConfig] = useState<PodcastExportConfig>({
    refinementModel: 'openai/gpt-4o-mini',
    includeIntro: true,
    includeOutro: true,
    addTransitions: true,
    elevenLabsModel: 'eleven_multilingual_v2',
    outputFormat: 'mp3_44100_128',
    voiceAssignments: DEFAULT_VOICE_ASSIGNMENTS,
    useCustomPronunciation: false,
    normalizeVolume: true,
  });

  const [jobId, setJobId] = useState<string | null>(null);
  const [refinedScript, setRefinedScript] = useState<RefinedPodcastScript | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<PodcastProgress>({
    phase: 'idle',
    percentComplete: 0,
    message: '',
  });
  const [error, setError] = useState<string | undefined>();
  const [audioUrl, setAudioUrl] = useState<string | undefined>();
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [actualCost, setActualCost] = useState<number | undefined>();

  const updateConfig = useCallback((updates: Partial<PodcastExportConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const refineScript = useCallback(async () => {
    setIsRefining(true);
    setError(undefined);

    try {
      const response = await fetch('/api/exports/podcast/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ debateId, config }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to refine script');
      }

      const data = await response.json();
      setJobId(data.jobId);
      setRefinedScript(data.script);
      setEstimatedCost(data.estimatedCostCents);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRefining(false);
    }
  }, [debateId, config]);

  const updateScript = useCallback(async (segments: PodcastSegment[]) => {
    if (!jobId) return;

    try {
      const response = await fetch(`/api/exports/podcast/${jobId}/script`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments }),
      });

      if (!response.ok) {
        throw new Error('Failed to update script');
      }

      const data = await response.json();
      setRefinedScript(data.script);
      setEstimatedCost(data.estimatedCostCents);
    } catch (err: any) {
      setError(err.message);
    }
  }, [jobId]);

  const regenerateSegment = useCallback(async (
    segmentIndex: number,
    instructions?: string
  ) => {
    if (!jobId) return;

    try {
      const response = await fetch(
        `/api/exports/podcast/${jobId}/regenerate-segment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ segmentIndex, instructions }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to regenerate segment');
      }

      const data = await response.json();
      // Update the specific segment in the script
      if (refinedScript) {
        const newScript = { ...refinedScript };
        // Handle intro/outro/content segment updates
        setRefinedScript(newScript);
      }
      setEstimatedCost(data.estimatedCostCents);
    } catch (err: any) {
      setError(err.message);
    }
  }, [jobId, refinedScript]);

  const startGeneration = useCallback(async () => {
    if (!jobId) return;

    setIsGenerating(true);
    setError(undefined);

    try {
      // Start generation
      await fetch(`/api/exports/podcast/${jobId}/generate`, {
        method: 'POST',
      });

      // Poll for progress
      const pollInterval = setInterval(async () => {
        const response = await fetch(`/api/exports/podcast/${jobId}/progress`);
        const data = await response.json();

        setProgress({
          phase: data.status,
          percentComplete: data.progressPercent,
          currentSegment: data.currentSegment,
          totalSegments: data.totalSegments,
          message: getProgressMessage(data.status, data.progressPercent),
        });

        if (data.status === 'complete') {
          clearInterval(pollInterval);
          setIsGenerating(false);
          setAudioUrl(data.audioUrl);
          setActualCost(data.actualCostCents);
        }

        if (data.status === 'error') {
          clearInterval(pollInterval);
          setIsGenerating(false);
          setError(data.errorMessage);
        }
      }, 2000);

    } catch (err: any) {
      setIsGenerating(false);
      setError(err.message);
    }
  }, [jobId]);

  const downloadPodcast = useCallback(() => {
    if (!jobId) return;
    window.open(`/api/exports/podcast/${jobId}/download`, '_blank');
  }, [jobId]);

  return {
    config,
    updateConfig,
    refinedScript,
    isRefining,
    isGenerating,
    progress,
    error,
    audioUrl,
    estimatedCost,
    actualCost,
    refineScript,
    updateScript,
    regenerateSegment,
    startGeneration,
    downloadPodcast,
  };
}

function getProgressMessage(status: string, percent: number): string {
  switch (status) {
    case 'pending': return 'Preparing to generate...';
    case 'refining': return 'Refining script for audio...';
    case 'generating': return `Generating speech audio (${percent}%)...`;
    case 'complete': return 'Podcast generation complete!';
    case 'error': return 'Generation failed';
    default: return 'Processing...';
  }
}
```

---

## Validation

### How to Test

1. Component tests:
   - Voice assignment updates config correctly
   - Script editing saves changes
   - Progress component shows all states

2. Integration tests:
   - Full workflow from configure to download
   - Error handling displays messages
   - Polling updates progress correctly

3. Accessibility:
   - Keyboard navigation through steps
   - Screen reader announces progress
   - Focus management in modal

### Definition of Done

- [x] All components implemented and tested
- [x] Multi-step workflow is intuitive
- [x] Voice preview plays samples correctly
- [x] Script editing preserves data
- [x] Progress tracking is accurate
- [x] Download works reliably
- [x] Responsive on mobile devices
- [x] Accessible (WCAG 2.1 AA)

---

## Notes

- Use existing design system components (Dialog, Button, etc.)
- Consider adding a "Save as Draft" feature for long sessions
- Voice preview should use a cheaper model (flash) to save costs
- Progress polling interval can be adjusted based on segment count
- Consider WebSocket for real-time progress instead of polling

---

## Implementation Context from PODCAST-005

The following details from the backend implementation will help with frontend integration:

### API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/exports/podcast/refine` | POST | Refine transcript into podcast script |
| `/api/exports/podcast/voices` | GET | Get available ElevenLabs voices |
| `/api/exports/podcast/preview-voice` | POST | Generate voice sample audio |
| `/api/exports/podcast/:jobId` | GET | Get job details with script |
| `/api/exports/podcast/:jobId/script` | PUT | Update script segments |
| `/api/exports/podcast/:jobId/regenerate-segment` | POST | Regenerate a single segment |
| `/api/exports/podcast/:jobId/generate` | POST | **Start TTS generation** |
| `/api/exports/podcast/:jobId/progress` | GET | **Poll generation progress** |
| `/api/exports/podcast/:jobId/download` | GET | **Download completed podcast** |
| `/api/exports/podcast/:jobId/stream` | GET | **SSE progress stream** |

### Pipeline Progress Phases

The `PipelineProgress` type from the backend defines these phases:

```typescript
type PipelinePhase =
  | 'initializing'  // Setting up directories
  | 'generating'    // TTS for each segment (has currentSegment/totalSegments)
  | 'concatenating' // FFmpeg combining audio files
  | 'normalizing'   // Volume normalization (-16 LUFS)
  | 'tagging'       // Adding ID3 metadata
  | 'complete'      // Done - audioUrl available
  | 'error';        // Failed - error message available

interface PipelineProgress {
  phase: PipelinePhase;
  currentSegment?: number;   // Only during 'generating' phase
  totalSegments?: number;    // Only during 'generating' phase
  percentComplete: number;   // 0-100
  message: string;           // Human-readable status
}
```

### Progress Polling Response

```typescript
// GET /api/exports/podcast/:jobId/progress
interface ProgressResponse {
  jobId: string;
  status: 'pending' | 'refining' | 'generating' | 'complete' | 'error';
  progressPercent: number;
  currentSegment?: number;
  totalSegments?: number;
  audioUrl?: string;        // Only when status === 'complete'
  durationSeconds?: number; // Only when status === 'complete'
  actualCostCents?: number; // Only when status === 'complete'
  errorMessage?: string;    // Only when status === 'error'
}
```

### SSE Stream Alternative (Recommended)

Instead of polling, the frontend can use SSE for real-time updates:

```typescript
// Using EventSource for SSE streaming
function useSSEProgress(jobId: string) {
  const [progress, setProgress] = useState<PipelineProgress | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(
      `/api/exports/podcast/${jobId}/stream`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data);

      if (data.phase === 'complete' || data.phase === 'error') {
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [jobId]);

  return progress;
}
```

**Note:** The SSE endpoint starts generation automatically when connected, so don't call `/generate` separately when using SSE.

### Cost Estimation

ElevenLabs pricing is approximately $0.15 per 1,000 characters. The backend calculates this:

```typescript
const estimatedCostCents = Math.ceil((totalCharacters / 1000) * 15);
```

Display format: `$${(costCents / 100).toFixed(2)}`

### Typical Generation Times

Based on ElevenLabs API behavior:
- ~600ms minimum between API calls (rate limiting)
- ~2-5 seconds per segment depending on length
- A 10-segment podcast takes approximately 30-60 seconds

Recommended polling interval: 2000ms (2 seconds)

### Files Created in PODCAST-005

- `backend/src/services/podcast/podcast-pipeline.ts` - Main orchestrator
- `backend/tests/podcast-pipeline.test.ts` - 16 unit tests

### Existing Frontend Components to Extend

Check the existing ExportPanel for patterns:
- `frontend/src/components/Export/ExportPanel.tsx`
- `frontend/src/components/Export/TTSProviderSelector.tsx`

These use similar progress tracking patterns that can be reused.

---

**Estimated Time:** 1-2 days
**Assigned To:** _Unassigned_
**Created:** 2026-01-03
**Updated:** 2026-01-03
