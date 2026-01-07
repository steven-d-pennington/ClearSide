/**
 * usePodcastExport Hook
 *
 * Custom hook for managing podcast export workflow including:
 * - Script refinement
 * - Voice configuration
 * - Generation progress tracking
 * - SSE streaming for real-time updates
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  PodcastExportConfig,
  RefinedPodcastScript,
  PodcastSegment,
  PipelineProgress,
  RefineScriptResponse,
  UpdateScriptResponse,
  ProgressResponse,
  PipelinePhase,
} from '../types/podcast';
import { DEFAULT_PODCAST_CONFIG } from '../types/podcast';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Existing job info for resume/retry capability
 */
interface ExistingJobInfo {
  id: string;
  status: string;
  generationPhase?: string;
  errorMessage?: string;
  refinedScript?: RefinedPodcastScript;
  config?: PodcastExportConfig;
  createdAt: string;
  estimatedCostCents?: number;
  partialCostCents?: number;
}

interface UsePodcastExportReturn {
  // State
  config: PodcastExportConfig;
  jobId: string | null;
  refinedScript: RefinedPodcastScript | null;
  isRefining: boolean;
  isGenerating: boolean;
  isCheckingExisting: boolean;
  progress: PipelineProgress;
  error: string | undefined;
  audioUrl: string | undefined;
  estimatedCost: number;
  actualCost: number | undefined;
  existingJob: ExistingJobInfo | null;

  // Actions
  updateConfig: (updates: Partial<PodcastExportConfig>) => void;
  checkExistingJob: () => Promise<void>;
  refineScript: () => Promise<void>;
  resumeExistingJob: () => void;
  updateScript: (update: { segments?: PodcastSegment[]; intro?: PodcastSegment; outro?: PodcastSegment }) => Promise<void>;
  regenerateSegment: (segmentIndex: number, instructions?: string) => Promise<void>;
  deleteSegment: (segmentIndex: number) => Promise<void>;
  addSegment: (insertAfterIndex: number, speaker: string) => Promise<number | undefined>;
  startGeneration: () => Promise<void>;
  startGenerationWithSSE: () => void;
  updateJobConfig: (updates: Partial<PodcastExportConfig>) => Promise<void>;
  regenerateAllAudio: (configOverrides?: Partial<PodcastExportConfig>, jobIdOverride?: string) => void;
  downloadPodcast: () => void;
  reset: () => void;
}

/**
 * Get human-readable message for pipeline phase
 */
function getProgressMessage(phase: PipelinePhase, percent: number): string {
  switch (phase) {
    case 'idle':
      return 'Ready to generate...';
    case 'initializing':
      return 'Initializing podcast generation...';
    case 'generating':
      return `Generating speech audio (${percent}%)...`;
    case 'concatenating':
      return 'Combining audio segments...';
    case 'normalizing':
      return 'Normalizing audio levels...';
    case 'tagging':
      return 'Adding podcast metadata...';
    case 'complete':
      return 'Podcast generation complete!';
    case 'error':
      return 'Generation failed';
    default:
      return 'Processing...';
  }
}

/**
 * Hook for managing podcast export workflow
 */
export function usePodcastExport(debateId: string): UsePodcastExportReturn {
  // Configuration state
  const [config, setConfig] = useState<PodcastExportConfig>(DEFAULT_PODCAST_CONFIG);

  // Job tracking
  const [jobId, setJobId] = useState<string | null>(null);
  const [refinedScript, setRefinedScript] = useState<RefinedPodcastScript | null>(null);

  // Loading states
  const [isRefining, setIsRefining] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);

  // Existing job for resume
  const [existingJob, setExistingJob] = useState<ExistingJobInfo | null>(null);

  // Progress tracking
  const [progress, setProgress] = useState<PipelineProgress>({
    phase: 'idle',
    percentComplete: 0,
    message: '',
  });

  // Results
  const [error, setError] = useState<string | undefined>();
  const [audioUrl, setAudioUrl] = useState<string | undefined>();
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [actualCost, setActualCost] = useState<number | undefined>();

  // Refs for cleanup
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  /**
   * Update configuration
   */
  const updateConfig = useCallback((updates: Partial<PodcastExportConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * Check for existing jobs that can be resumed
   */
  const checkExistingJob = useCallback(async () => {
    setIsCheckingExisting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/exports/podcast/debate/${debateId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.hasResumableJob && data.job) {
          setExistingJob(data.job);
        } else {
          setExistingJob(null);
        }
      }
    } catch (err) {
      console.error('Failed to check existing jobs:', err);
      setExistingJob(null);
    } finally {
      setIsCheckingExisting(false);
    }
  }, [debateId]);

  /**
   * Resume an existing job (load its state)
   */
  const resumeExistingJob = useCallback(() => {
    if (!existingJob) return;

    setJobId(existingJob.id);
    if (existingJob.refinedScript) {
      setRefinedScript(existingJob.refinedScript);
    }
    if (existingJob.config) {
      setConfig(existingJob.config);
    }
    if (existingJob.estimatedCostCents) {
      setEstimatedCost(existingJob.estimatedCostCents);
    }
    // Clear the existing job state so UI shows normal flow
    setExistingJob(null);
  }, [existingJob]);

  /**
   * Refine the debate transcript into a podcast script
   */
  const refineScript = useCallback(async () => {
    setIsRefining(true);
    setError(undefined);

    try {
      const response = await fetch(`${API_BASE_URL}/api/exports/podcast/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ debateId, config }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || data.message || 'Failed to refine script');
      }

      const data: RefineScriptResponse = await response.json();
      setJobId(data.jobId);
      setRefinedScript(data.script);
      setEstimatedCost(data.estimatedCostCents);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to refine script';
      setError(message);
    } finally {
      setIsRefining(false);
    }
  }, [debateId, config]);

  /**
   * Update script segments after manual edits
   */
  const updateScript = useCallback(async (update: { segments?: PodcastSegment[]; intro?: PodcastSegment; outro?: PodcastSegment }) => {
    if (!jobId) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/exports/podcast/${jobId}/script`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });

      if (!response.ok) {
        throw new Error('Failed to update script');
      }

      const data: UpdateScriptResponse = await response.json();
      setRefinedScript(data.script);
      setEstimatedCost(data.estimatedCostCents);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update script';
      setError(message);
    }
  }, [jobId]);

  /**
   * Regenerate a specific segment with optional instructions
   */
  const regenerateSegment = useCallback(async (
    segmentIndex: number,
    instructions?: string
  ) => {
    if (!jobId) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/exports/podcast/${jobId}/regenerate-segment`,
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
      if (data.script) {
        setRefinedScript(data.script);
      }
      if (data.estimatedCostCents !== undefined) {
        setEstimatedCost(data.estimatedCostCents);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to regenerate segment';
      setError(message);
    }
  }, [jobId]);

  /**
   * Delete a segment from the script
   */
  const deleteSegment = useCallback(async (segmentIndex: number) => {
    if (!jobId) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/exports/podcast/${jobId}/segment/${segmentIndex}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete segment');
      }

      const data = await response.json();
      if (data.script) {
        setRefinedScript(data.script);
      }
      if (data.estimatedCostCents !== undefined) {
        setEstimatedCost(data.estimatedCostCents);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete segment';
      setError(message);
    }
  }, [jobId]);

  /**
   * Add a new blank segment after the specified index
   * @returns The index of the newly inserted segment, or undefined on error
   */
  const addSegment = useCallback(async (
    insertAfterIndex: number,
    speaker: string
  ): Promise<number | undefined> => {
    if (!jobId) return undefined;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/exports/podcast/${jobId}/segment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ insertAfterIndex, speaker }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add segment');
      }

      const data = await response.json();
      if (data.script) {
        setRefinedScript(data.script);
      }
      if (data.estimatedCostCents !== undefined) {
        setEstimatedCost(data.estimatedCostCents);
      }
      return data.newSegmentIndex;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add segment';
      setError(message);
      return undefined;
    }
  }, [jobId]);

  /**
   * Start podcast generation with polling for progress
   */
  const startGeneration = useCallback(async () => {
    if (!jobId) return;

    setIsGenerating(true);
    setError(undefined);
    setProgress({
      phase: 'initializing',
      percentComplete: 0,
      message: 'Starting generation...',
    });

    try {
      // Start generation
      const startResponse = await fetch(`${API_BASE_URL}/api/exports/podcast/${jobId}/generate`, {
        method: 'POST',
      });

      if (!startResponse.ok) {
        const data = await startResponse.json();
        throw new Error(data.error || data.message || 'Failed to start generation');
      }

      // Poll for progress
      pollIntervalRef.current = setInterval(async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/exports/podcast/${jobId}/progress`);
          const data: ProgressResponse = await response.json();

          const phase = (data.status === 'generating' ? 'generating' : data.status) as PipelinePhase;

          setProgress({
            phase,
            percentComplete: data.progressPercent,
            currentSegment: data.currentSegment,
            totalSegments: data.totalSegments,
            message: getProgressMessage(phase, data.progressPercent),
          });

          if (data.status === 'complete') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsGenerating(false);
            setAudioUrl(data.audioUrl);
            setActualCost(data.actualCostCents);
          }

          if (data.status === 'error') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsGenerating(false);
            setError(data.errorMessage || 'Generation failed');
          }
        } catch (pollErr) {
          console.error('Poll error:', pollErr);
        }
      }, 2000);
    } catch (err: unknown) {
      setIsGenerating(false);
      const message = err instanceof Error ? err.message : 'Failed to start generation';
      setError(message);
      setProgress({
        phase: 'error',
        percentComplete: 0,
        message: message,
      });
    }
  }, [jobId]);

  /**
   * Start podcast generation with SSE for real-time progress
   */
  const startGenerationWithSSE = useCallback(() => {
    if (!jobId) return;

    setIsGenerating(true);
    setError(undefined);
    setProgress({
      phase: 'initializing',
      percentComplete: 0,
      message: 'Starting generation...',
    });

    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Connect to SSE stream (this also starts generation)
    const eventSource = new EventSource(
      `${API_BASE_URL}/api/exports/podcast/${jobId}/stream`
    );
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        setProgress({
          phase: data.phase,
          percentComplete: data.percentComplete,
          currentSegment: data.currentSegment,
          totalSegments: data.totalSegments,
          message: data.message || getProgressMessage(data.phase, data.percentComplete),
        });

        if (data.phase === 'complete') {
          eventSource.close();
          eventSourceRef.current = null;
          setIsGenerating(false);
          setAudioUrl(data.audioUrl);
          setActualCost(data.actualCostCents);
        }

        if (data.phase === 'error') {
          eventSource.close();
          eventSourceRef.current = null;
          setIsGenerating(false);
          setError(data.error || data.message || 'Generation failed');
        }
      } catch (parseErr) {
        console.error('SSE parse error:', parseErr);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;
      setIsGenerating(false);
      setError('Connection lost. Please check the generation status.');
    };
  }, [jobId]);

  /**
   * Update job configuration on the server
   * Useful for changing settings before regenerating
   */
  const updateJobConfig = useCallback(async (updates: Partial<PodcastExportConfig>) => {
    if (!jobId) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/exports/podcast/${jobId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update config');
      }

      // Update local config state
      setConfig(prev => ({ ...prev, ...updates }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update config';
      setError(message);
    }
  }, [jobId]);

  /**
   * Regenerate all audio from scratch with current config
   * Clears existing segments and starts fresh
   * @param configOverrides - Optional config updates to apply before regenerating
   * @param jobIdOverride - Optional jobId to use (for when state hasn't updated yet)
   */
  const regenerateAllAudio = useCallback((configOverrides?: Partial<PodcastExportConfig>, jobIdOverride?: string) => {
    const targetJobId = jobIdOverride || jobId;
    if (!targetJobId) return;

    setIsGenerating(true);
    setError(undefined);
    setProgress({
      phase: 'initializing',
      percentComplete: 0,
      message: 'Resetting generation state...',
    });

    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // If config overrides provided, update server config first
    const startGeneration = async () => {
      if (configOverrides) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/exports/podcast/${targetJobId}/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configOverrides),
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to update config');
          }

          // Update local config and jobId
          setConfig(prev => ({ ...prev, ...configOverrides }));
          setJobId(targetJobId);
        } catch (err: unknown) {
          setIsGenerating(false);
          const message = err instanceof Error ? err.message : 'Failed to update config';
          setError(message);
          return;
        }
      }

      // Connect to SSE stream with restart=true to clear existing segments
      const eventSource = new EventSource(
        `${API_BASE_URL}/api/exports/podcast/${targetJobId}/stream?restart=true`
      );
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          setProgress({
            phase: data.phase,
            percentComplete: data.percentComplete,
            currentSegment: data.currentSegment,
            totalSegments: data.totalSegments,
            message: data.message || getProgressMessage(data.phase, data.percentComplete),
          });

          if (data.phase === 'complete') {
            eventSource.close();
            eventSourceRef.current = null;
            setIsGenerating(false);
            setAudioUrl(data.audioUrl);
            setActualCost(data.actualCostCents);
          }

          if (data.phase === 'error') {
            eventSource.close();
            eventSourceRef.current = null;
            setIsGenerating(false);
            setError(data.error || data.message || 'Generation failed');
          }
        } catch (parseErr) {
          console.error('SSE parse error:', parseErr);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        setIsGenerating(false);
        setError('Connection lost. Please check the generation status.');
      };
    };

    startGeneration();
  }, [jobId]);

  /**
   * Download the completed podcast
   */
  const downloadPodcast = useCallback(() => {
    if (!jobId) return;
    window.open(`${API_BASE_URL}/api/exports/podcast/${jobId}/download`, '_blank');
  }, [jobId]);

  /**
   * Reset all state for a new export
   */
  const reset = useCallback(() => {
    setConfig(DEFAULT_PODCAST_CONFIG);
    setJobId(null);
    setRefinedScript(null);
    setIsRefining(false);
    setIsGenerating(false);
    setIsCheckingExisting(false);
    setExistingJob(null);
    setProgress({ phase: 'idle', percentComplete: 0, message: '' });
    setError(undefined);
    setAudioUrl(undefined);
    setEstimatedCost(0);
    setActualCost(undefined);

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  return {
    // State
    config,
    jobId,
    refinedScript,
    isRefining,
    isGenerating,
    isCheckingExisting,
    progress,
    error,
    audioUrl,
    estimatedCost,
    actualCost,
    existingJob,

    // Actions
    updateConfig,
    checkExistingJob,
    refineScript,
    resumeExistingJob,
    updateScript,
    regenerateSegment,
    deleteSegment,
    addSegment,
    startGeneration,
    startGenerationWithSSE,
    updateJobConfig,
    regenerateAllAudio,
    downloadPodcast,
    reset,
  };
}
