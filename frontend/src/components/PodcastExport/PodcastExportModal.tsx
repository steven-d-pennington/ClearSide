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

  // Handle regenerating all audio from scratch with correct settings
  const handleRegenerateAll = () => {
    if (!existingJob) return;

    const targetJobId = existingJob.id;
    resumeExistingJob();
    setStep('generate');
    // Pass the jobId directly since state update is async
    regenerateAllAudio({ elevenLabsModel: 'eleven_v3' }, targetJobId);
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
    const canRetryGeneration = existingJob.status === 'error' && hasScript;
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
              {existingJob.partialCostCents !== undefined && existingJob.partialCostCents > 0 && (
                <> • Partial cost: ${(existingJob.partialCostCents / 100).toFixed(2)}</>
              )}
            </span>
            {existingJob.errorMessage && (
              <span className={styles.bannerError}>{existingJob.errorMessage}</span>
            )}
            {needsModelUpdate && (
              <span className={styles.bannerWarning}>
                Using older model. Use "Regenerate All (V3)" to use the latest model with audio tags.
              </span>
            )}
          </div>
          <div className={styles.bannerActions}>
            {canRetryGeneration ? (
              <>
                <Button variant="secondary" size="sm" onClick={handleRetryGeneration}>
                  Retry
                </Button>
                <Button variant="primary" size="sm" onClick={handleRegenerateAll}>
                  Regenerate All (V3)
                </Button>
              </>
            ) : hasScript ? (
              <>
                <Button variant="secondary" size="sm" onClick={handleResumeJob}>
                  Resume
                </Button>
                {needsModelUpdate && (
                  <Button variant="primary" size="sm" onClick={handleRegenerateAll}>
                    Regenerate (V3)
                  </Button>
                )}
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

  // Render configuration step
  const renderConfigureStep = () => (
    <div className={styles.configureStep}>
      {renderExistingJobBanner()}

      {renderConfigTabs()}

      <div className={styles.tabContent}>
        {activeTab === 'voices' && (
          <VoiceAssignmentPanel
            assignments={config.voiceAssignments}
            onChange={(assignments) =>
              updateConfig({ voiceAssignments: assignments })
            }
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
