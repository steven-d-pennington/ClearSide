/**
 * PodcastExportModal Component
 *
 * Main modal for podcast export with multi-step workflow:
 * 1. Configure - Voice assignments, script options, quality settings
 * 2. Preview - Review and edit refined script
 * 3. Generate - Track progress and download
 */

import { useState, useEffect } from 'react';
import { Modal, Button, Alert } from '../ui';
import { VoiceAssignmentPanel } from './VoiceAssignmentPanel';
import { ScriptOptionsPanel } from './ScriptOptionsPanel';
import { QualitySettingsPanel } from './QualitySettingsPanel';
import { ScriptPreviewEditor } from './ScriptPreviewEditor';
import { GenerationProgress } from './GenerationProgress';
import { usePodcastExport } from '../../hooks/usePodcastExport';
import { TTS_PROVIDERS } from '../../types/podcast';
import styles from './PodcastExportModal.module.css';

interface PodcastExportModalProps {
  debateId: string;
  debateTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'configure' | 'preview' | 'generate';
type ConfigTab = 'voices' | 'options' | 'quality';

export function PodcastExportModal({
  debateId,
  debateTitle,
  isOpen,
  onClose,
}: PodcastExportModalProps) {
  const [step, setStep] = useState<Step>('configure');
  const [activeTab, setActiveTab] = useState<ConfigTab>('voices');

  const {
    config,
    updateConfig,
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
    checkExistingJob,
    refineScript,
    resumeExistingJob,
    updateScript,
    regenerateSegment,
    deleteSegment,
    addSegment,
    startGenerationWithSSE,
    regenerateAllAudio,
    downloadPodcast,
    reset,
  } = usePodcastExport(debateId);

  // Check for existing jobs and reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('configure');
      setActiveTab('voices');
      reset();
      // Check for existing resumable jobs
      checkExistingJob();
    }
  }, [isOpen, reset, checkExistingJob]);

  // Handle resuming an existing job
  const handleResumeJob = () => {
    resumeExistingJob();
    // If the job has a refined script, go to preview; otherwise stay on configure
    if (existingJob?.refinedScript) {
      setStep('preview');
    }
  };

  // Handle retrying generation for a failed job (resume from where it left off)
  const handleRetryGeneration = () => {
    resumeExistingJob();
    setStep('generate');
    // Small delay to ensure state is updated before starting generation
    setTimeout(() => {
      startGenerationWithSSE();
    }, 100);
  };

  // Handle regenerating all audio from scratch with V3 model
  const handleRegenerateAllV3 = () => {
    if (!existingJob) return;

    const targetJobId = existingJob.id;
    resumeExistingJob();
    setStep('generate');
    // Pass the jobId directly since state update is async
    regenerateAllAudio({ elevenLabsModel: 'eleven_v3' }, targetJobId);
  };

  // Handle starting fresh - clear all audio but keep current settings
  const handleStartFresh = () => {
    if (!existingJob) return;

    const targetJobId = existingJob.id;
    resumeExistingJob();
    setStep('generate');
    // Start fresh without changing any settings
    regenerateAllAudio(undefined, targetJobId);
  };

  // Handle refine and preview
  const handleRefineAndPreview = async () => {
    await refineScript();
    if (!error) {
      setStep('preview');
    }
  };

  // Handle start generation
  const handleStartGeneration = () => {
    setStep('generate');
    startGenerationWithSSE();
  };

  // Handle close with confirmation if generating
  const handleClose = () => {
    if (isGenerating) {
      const confirmed = window.confirm(
        'Generation is in progress. Are you sure you want to close?'
      );
      if (!confirmed) return;
    }
    onClose();
  };

  // Export refined script as markdown
  const handleExportMarkdown = () => {
    if (!refinedScript) return;

    const getSpeakerLabel = (speaker: string): string => {
      const labels: Record<string, string> = {
        moderator: 'Moderator',
        pro_advocate: 'Pro Advocate',
        con_advocate: 'Con Advocate',
        narrator: 'Narrator',
      };
      return labels[speaker] || speaker;
    };

    const getVoiceName = (speaker: string): string => {
      return config.voiceAssignments[speaker]?.voiceName || 'Unknown';
    };

    // Build markdown content
    let markdown = `# ${refinedScript.title}\n\n`;
    markdown += `**Duration:** ~${Math.round(refinedScript.durationEstimateSeconds / 60)} min | `;
    markdown += `**Characters:** ${refinedScript.totalCharacters.toLocaleString()}\n\n`;
    markdown += `---\n\n`;

    // Intro
    if (refinedScript.intro) {
      markdown += `## Introduction\n\n`;
      markdown += `**${getSpeakerLabel(refinedScript.intro.speaker)}** _(${getVoiceName(refinedScript.intro.speaker)})_\n\n`;
      markdown += `${refinedScript.intro.text}\n\n`;
    }

    // Main segments
    markdown += `## Debate\n\n`;
    for (const segment of refinedScript.segments) {
      markdown += `**${getSpeakerLabel(segment.speaker)}** _(${getVoiceName(segment.speaker)})_\n\n`;
      markdown += `${segment.text}\n\n`;
    }

    // Outro
    if (refinedScript.outro) {
      markdown += `## Closing\n\n`;
      markdown += `**${getSpeakerLabel(refinedScript.outro.speaker)}** _(${getVoiceName(refinedScript.outro.speaker)})_\n\n`;
      markdown += `${refinedScript.outro.text}\n\n`;
    }

    // Footer
    markdown += `---\n\n`;
    markdown += `_Generated via ClearSide Podcast Export_\n`;

    // Create and download file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${debateTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-script.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Render configuration tabs
  const renderConfigTabs = () => (
    <div className={styles.tabs}>
      <button
        className={`${styles.tab} ${activeTab === 'voices' ? styles.active : ''}`}
        onClick={() => setActiveTab('voices')}
      >
        <span className={styles.tabNumber}>1</span>
        Voices
      </button>
      <button
        className={`${styles.tab} ${activeTab === 'options' ? styles.active : ''}`}
        onClick={() => setActiveTab('options')}
      >
        <span className={styles.tabNumber}>2</span>
        Options
      </button>
      <button
        className={`${styles.tab} ${activeTab === 'quality' ? styles.active : ''}`}
        onClick={() => setActiveTab('quality')}
      >
        <span className={styles.tabNumber}>3</span>
        Quality
      </button>
    </div>
  );

  // Render existing job banner
  const renderExistingJobBanner = () => {
    if (isCheckingExisting) {
      return (
        <div className={styles.existingJobBanner}>
          <span className={styles.spinner} /> Checking for existing jobs...
        </div>
      );
    }

    if (!existingJob) return null;

    const statusLabels: Record<string, string> = {
      error: 'Failed',
      pending: 'Pending',
      generating: 'In Progress',
    };

    const phaseLabels: Record<string, string> = {
      tts: 'Speech generation',
      concat: 'Audio concatenation',
      normalize: 'Audio normalization',
      tag: 'Metadata tagging',
    };

    const statusLabel = statusLabels[existingJob.status] || existingJob.status;
    const phaseLabel = existingJob.generationPhase
      ? phaseLabels[existingJob.generationPhase] || existingJob.generationPhase
      : null;

    const createdDate = new Date(existingJob.createdAt).toLocaleDateString();
    const hasScript = !!existingJob.refinedScript;
    const hasPartialAudio = (existingJob.partialCostCents ?? 0) > 0;
    const wasGenerating = existingJob.status === 'generating' || existingJob.status === 'error';
    const existingModel = existingJob.config?.elevenLabsModel || 'unknown';
    const needsModelUpdate = existingModel !== 'eleven_v3';

    return (
      <div className={`${styles.existingJobBanner} ${styles[existingJob.status]}`}>
        <div className={styles.bannerContent}>
          <div className={styles.bannerInfo}>
            <strong>Previous Job Found</strong>
            <span className={styles.bannerMeta}>
              {statusLabel}
              {phaseLabel && ` (${phaseLabel})`}
              {' • '}
              {createdDate}
              {' • '}
              Model: {existingModel}
              {hasPartialAudio && (
                <> • Partial cost: ${(existingJob.partialCostCents! / 100).toFixed(2)}</>
              )}
            </span>
            {existingJob.errorMessage && (
              <span className={styles.bannerError}>{existingJob.errorMessage}</span>
            )}
            {needsModelUpdate && (
              <span className={styles.bannerWarning}>
                Using older model. Use "Upgrade to V3" for the latest model with audio tags.
              </span>
            )}
          </div>
          <div className={styles.bannerActions}>
            {/* Job was generating or failed - show audio generation options */}
            {wasGenerating && hasScript ? (
              <>
                {hasPartialAudio && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRetryGeneration}
                    title="Continue generating from where it stopped"
                  >
                    Continue
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleStartFresh}
                  title="Clear all generated audio and start over"
                >
                  Start Fresh
                </Button>
                {needsModelUpdate && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleRegenerateAllV3}
                    title="Clear all and regenerate with ElevenLabs V3 model"
                  >
                    Upgrade to V3
                  </Button>
                )}
              </>
            ) : hasScript ? (
              /* Job has script but hasn't started generating - go to preview */
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleResumeJob}
                  title="Review and edit the refined script"
                >
                  Edit Script
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStartFresh}
                  title="Start generating audio for this script"
                >
                  Generate
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" onClick={handleResumeJob}>
                View
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Get current provider
  const selectedProvider = config.ttsProvider || 'elevenlabs';

  // Render provider selector (at top of configure step)
  const renderProviderSelector = () => (
    <div className={styles.providerSelector}>
      <span className={styles.providerLabel}>TTS Provider</span>
      <div className={styles.providerOptions}>
        {TTS_PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className={`${styles.providerOption} ${
              selectedProvider === provider.id ? styles.selected : ''
            }`}
            onClick={() => updateConfig({ ttsProvider: provider.id })}
          >
            <span className={styles.providerName}>{provider.name}</span>
            <span className={styles.providerDescription}>{provider.description}</span>
            <span className={styles.providerCost}>
              ~${(provider.costPer1000Chars / 100).toFixed(3)}/1K chars
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  // Render configuration step
  const renderConfigureStep = () => (
    <div className={styles.configureStep}>
      {renderExistingJobBanner()}

      {renderProviderSelector()}

      {renderConfigTabs()}

      <div className={styles.tabContent}>
        {activeTab === 'voices' && (
          <VoiceAssignmentPanel
            assignments={config.voiceAssignments}
            onChange={(assignments) =>
              updateConfig({ voiceAssignments: assignments })
            }
            provider={selectedProvider}
          />
        )}
        {activeTab === 'options' && (
          <ScriptOptionsPanel config={config} onChange={updateConfig} />
        )}
        {activeTab === 'quality' && (
          <QualitySettingsPanel config={config} onChange={updateConfig} />
        )}
      </div>

      {error && (
        <Alert variant="error" className={styles.errorAlert}>
          {error}
        </Alert>
      )}

      <div className={styles.actions}>
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleRefineAndPreview}
          disabled={isRefining}
        >
          {isRefining ? (
            <>
              <span className={styles.spinner} />
              Refining Script...
            </>
          ) : (
            existingJob ? 'Start New' : 'Preview Script'
          )}
        </Button>
      </div>
    </div>
  );

  // Render preview step
  const renderPreviewStep = () => (
    <div className={styles.previewStep}>
      {refinedScript && (
        <>
          <ScriptPreviewEditor
            script={refinedScript}
            voiceAssignments={config.voiceAssignments}
            onUpdate={updateScript}
            onRegenerate={regenerateSegment}
            onDelete={deleteSegment}
            onAdd={addSegment}
          />

          <div className={styles.costEstimate}>
            <div className={styles.estimateDetails}>
              <div className={styles.estimateItem}>
                <span className={styles.estimateLabel}>Duration</span>
                <span className={styles.estimateValue}>
                  ~{Math.round(refinedScript.durationEstimateSeconds / 60)} min
                </span>
              </div>
              <div className={styles.estimateItem}>
                <span className={styles.estimateLabel}>Characters</span>
                <span className={styles.estimateValue}>
                  {refinedScript.totalCharacters.toLocaleString()}
                </span>
              </div>
              <div className={styles.estimateItem}>
                <span className={styles.estimateLabel}>Estimated Cost</span>
                <span className={styles.estimateCost}>
                  ${(estimatedCost / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="error" className={styles.errorAlert}>
              {error}
            </Alert>
          )}

          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setStep('configure')}>
              Back to Settings
            </Button>
            <Button variant="secondary" onClick={handleExportMarkdown}>
              Download Script (.md)
            </Button>
            <Button variant="primary" onClick={handleStartGeneration}>
              Generate Podcast (${(estimatedCost / 100).toFixed(2)})
            </Button>
          </div>
        </>
      )}
    </div>
  );

  // Render generate step
  const renderGenerateStep = () => (
    <div className={styles.generateStep}>
      <GenerationProgress
        progress={progress}
        error={error}
        audioUrl={audioUrl}
        actualCost={actualCost}
        onDownload={downloadPodcast}
        onRetry={handleStartGeneration}
        onClose={handleClose}
      />
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Export Podcast: ${debateTitle}`}
      size="lg"
      closeOnBackdropClick={!isGenerating}
      closeOnEscape={!isGenerating}
    >
      <div className={styles.content}>
        {/* Step Indicator */}
        <div className={styles.stepIndicator}>
          <div
            className={`${styles.stepDot} ${step === 'configure' ? styles.active : styles.completed}`}
          >
            1
          </div>
          <div className={styles.stepLine} />
          <div
            className={`${styles.stepDot} ${step === 'preview' ? styles.active : step === 'generate' ? styles.completed : ''}`}
          >
            2
          </div>
          <div className={styles.stepLine} />
          <div
            className={`${styles.stepDot} ${step === 'generate' ? styles.active : ''}`}
          >
            3
          </div>
        </div>

        {/* Step Content */}
        {step === 'configure' && renderConfigureStep()}
        {step === 'preview' && renderPreviewStep()}
        {step === 'generate' && renderGenerateStep()}
      </div>
    </Modal>
  );
}

export default PodcastExportModal;
