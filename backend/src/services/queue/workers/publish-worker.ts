/**
 * Publish Worker - Full Implementation
 *
 * Orchestrates end-to-end podcast publishing automation.
 */

import { Job, type JobProgress, Worker } from 'bullmq';
import fs from 'fs/promises';
import path from 'path';
import { connection } from '../queue-manager.js';
import { pool } from '../../../db/connection.js';
import { createConversationScriptRefiner } from '../../podcast/conversation-script-refiner.js';
import { createPodcastPipeline } from '../../podcast/podcast-pipeline.js';
import { createMetadataGenerator } from '../../podcast/metadata-generator.js';
import { createRSSFeedService } from '../../podcast/rss-feed-service.js';
import { createNotificationService } from '../../notifications/notification-service.js';
import { createLogger } from '../../../utils/logger.js';
import * as podcastRepo from '../../../db/repositories/podcast-export-repository.js';
import {
  DEFAULT_VOICE_ASSIGNMENTS,
  type PodcastSegment,
  type RefinedPodcastScript,
} from '../../../types/podcast-export.js';

const logger = createLogger({ module: 'PublishWorker' });

export const publishWorker = new Worker(
  'podcast-publish',
  async (job: Job) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'Processing job');

    switch (job.name) {
      case 'auto-publish-conversation':
        return handleAutoPublish(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 3,
  }
);

async function handleAutoPublish(job: Job) {
  const { sessionId, conversationMode = 'normal' } = job.data as {
    sessionId: string;
    conversationMode?: 'normal' | 'rapid_fire' | 'model_debate';
  };

  job.log(`Starting auto-publish pipeline for session ${sessionId}`);
  await job.updateProgress(0);

  try {
    job.log('Loading conversation session');
    const sessionResult = await pool.query(
      'SELECT * FROM conversation_sessions WHERE id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      throw new Error(`Conversation session not found: ${sessionId}`);
    }

    const session = sessionResult.rows[0];
    await job.updateProgress(5);

    await job.updateProgress(10);

    job.log('Creating podcast export job');
    const exportJob = await podcastRepo.createForConversation(sessionId, {
      ttsProvider: 'google-cloud-long',
      refinementModel: 'none',
      includeIntro: false,
      includeOutro: false,
      addTransitions: false,
      elevenLabsModel: 'eleven_v3',
      outputFormat: 'mp3_44100_128',
      voiceAssignments: DEFAULT_VOICE_ASSIGNMENTS,
      useCustomPronunciation: false,
      normalizeVolume: true,
      tone: 'spirited',
      debateMode: 'turn_based',
    });

    const exportJobId = exportJob.id;
    await job.updateProgress(15);

    job.log('Refining conversation script');
    const refiner = createConversationScriptRefiner(pool);
    const conversationScript = await refiner.refine(sessionId, 'google_cloud');

    const speakerLabelMap = new Map<string, string>();
    let guestCount = 0;

    const podcastSegments: PodcastSegment[] = conversationScript.segments.map((segment, index) => {
      let speakerLabel = speakerLabelMap.get(segment.speakerName);
      if (!speakerLabel) {
        if (segment.speakerRole === 'host') {
          speakerLabel = 'moderator';
        } else {
          guestCount += 1;
          const slot = ((guestCount - 1) % 4) + 1;
          speakerLabel = `participant_${slot}`;
        }
        speakerLabelMap.set(segment.speakerName, speakerLabel);
      }

      return {
        index,
        speaker: speakerLabel,
        voiceId: '',
        text: segment.content,
        voiceSettings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          speed: 1.0,
          use_speaker_boost: true,
        },
      };
    });

    const totalCharacters = podcastSegments.reduce((sum, segment) => sum + segment.text.length, 0);
    const durationEstimateSeconds = Math.round((conversationScript.totalWords / 150) * 60);

    const refinedPodcastScript: RefinedPodcastScript = {
      title: conversationScript.title,
      segments: podcastSegments,
      intro: undefined,
      outro: undefined,
      totalCharacters,
      durationEstimateSeconds,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await podcastRepo.saveRefinedScript(exportJobId, refinedPodcastScript);
    await podcastRepo.updateStatus(exportJobId, 'pending');

    await job.updateProgress(30);

    job.log('Generating TTS audio (this may take several minutes)');
    const pipeline = createPodcastPipeline({
      ttsProvider: 'google-cloud-long',
    });

    const audioResult = await pipeline.generate(exportJobId);

    if (!audioResult.success) {
      throw new Error(`Audio generation failed: ${audioResult.error}`);
    }

    if (!audioResult.audioUrl || !audioResult.durationSeconds) {
      throw new Error('Audio generation completed without audio metadata');
    }

    await job.updateProgress(70);

    job.log('Loading participant metadata');
    const participantsResult = await pool.query(
      `SELECT cp.display_name_override, pp.name
       FROM conversation_participants cp
       JOIN podcast_personas pp ON cp.persona_id = pp.id
       WHERE cp.session_id = $1`,
      [sessionId]
    );

    const participantNames = participantsResult.rows.map(
      (participant) => participant.display_name_override || participant.name
    );

    await job.updateProgress(75);

    job.log('Generating episode metadata');
    const metadataGenerator = createMetadataGenerator();
    const metadata = await metadataGenerator.generateMetadata({
      topic: session.topic,
      participants: participantNames,
      mode: conversationMode,
      script: refinedPodcastScript,
    });

    await job.updateProgress(80);

    job.log('Creating published episode record');
    const audioStats = await getAudioStats(audioResult.audioUrl);

    const episodeResult = await pool.query(
      `INSERT INTO published_episodes (
        podcast_job_id, conversation_session_id,
        title, description, tags, explicit,
        guid, pub_date, audio_url, duration_seconds, file_size_bytes,
        rss_published_at, notification_recipient
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, NOW(), $11)
      RETURNING id`,
      [
        exportJobId,
        sessionId,
        metadata.title,
        metadata.description,
        metadata.tags,
        metadata.explicit,
        `clearside-episode-${exportJobId}`,
        audioResult.audioUrl,
        audioResult.durationSeconds,
        audioStats.fileSizeBytes,
        process.env.NOTIFICATION_EMAIL || null,
      ]
    );

    const episodeId = episodeResult.rows[0].id;
    await job.updateProgress(85);

    job.log('Regenerating RSS feed');
    const rssService = createRSSFeedService();
    await rssService.generateFeed();
    await job.updateProgress(90);

    const notificationEmail = process.env.NOTIFICATION_EMAIL;
    if (notificationEmail) {
      job.log('Sending notification email');
      const notificationService = createNotificationService();
      const notified = await notificationService.sendEpisodePublishedEmail({
        recipientEmail: notificationEmail,
        episodeTitle: metadata.title,
        episodeDescription: metadata.description,
        episodeUrl: `https://clearside.app${audioResult.audioUrl}`,
        rssFeedUrl: process.env.PODCAST_FEED_URL || 'https://clearside.app/rss/podcast.xml',
      });

      if (notified) {
        await pool.query(
          `UPDATE published_episodes
           SET notification_sent_at = NOW()
           WHERE id = $1`,
          [episodeId]
        );
      }
    } else {
      job.log('NOTIFICATION_EMAIL not configured, skipping email');
    }

    await job.updateProgress(100);

    job.log('Auto-publish complete');
    return {
      success: true,
      exportJobId,
      episodeId,
      audioUrl: audioResult.audioUrl,
      costCents: audioResult.actualCostCents || 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    job.log(`ERROR: ${message}`);
    logger.error({ error: message, sessionId }, 'Auto-publish failed');

    const notificationEmail = process.env.NOTIFICATION_EMAIL;
    if (notificationEmail) {
      try {
        const notificationService = createNotificationService();
        await notificationService.sendErrorNotification({
          recipientEmail: notificationEmail,
          errorMessage: message,
          sessionId,
          failedStep: 'auto-publish',
        });
      } catch (notifyError) {
        const notifyMessage = notifyError instanceof Error ? notifyError.message : String(notifyError);
        logger.error({ error: notifyMessage }, 'Failed to send automation error notification');
      }
    }

    throw error;
  }
}

async function getAudioStats(audioUrl: string): Promise<{ fileSizeBytes: number }> {
  if (!audioUrl) {
    return { fileSizeBytes: 0 };
  }

  const exportsDir = process.env.EXPORTS_DIR || './exports';
  const relativePath = audioUrl.replace(/^\/exports\//, '');
  const filePath = path.resolve(exportsDir, relativePath);

  try {
    const stats = await fs.stat(filePath);
    return { fileSizeBytes: stats.size };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message, filePath }, 'Unable to read audio file size');
    return { fileSizeBytes: 0 };
  }
}

publishWorker.on('completed', (job: Job) => {
  logger.info({ jobId: job.id, result: job.returnvalue }, 'Job completed');
});

publishWorker.on('failed', (job: Job | undefined, err: Error) => {
  logger.error({
    jobId: job?.id,
    error: err.message,
    stack: err.stack,
  }, 'Job failed');
});

publishWorker.on('progress', (job: Job, progress: JobProgress) => {
  logger.info({ jobId: job.id, progress: `${progress}%` }, 'Job progress');
});

logger.info('Publish worker started');

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing worker');
  await publishWorker.close();
});
