# PODCAST-004: Script Preview & Edit API

**Task ID:** PODCAST-004
**Phase:** Phase 4
**Category:** Podcast Export
**Priority:** P1
**Estimated Effort:** M (4-8 hours)
**Dependencies:** PODCAST-001, PODCAST-002
**Status:** TO DO

---

## Context

Before generating TTS audio (which incurs costs), users should be able to preview and edit the refined script. This task implements API endpoints for script preview, manual editing, and regeneration of individual segments.

**References:**
- [FUTURE-FEATURES.md](../../../docs/FUTURE-FEATURES.md) - Section 9: Script Preview Modal
- Existing export routes in `backend/src/routes/export-routes.ts`

---

## Requirements

### Acceptance Criteria

- [ ] Create POST endpoint to refine a debate into a podcast script
- [ ] Create GET endpoint to retrieve a refined script by job ID
- [ ] Create PUT endpoint to update individual script segments
- [ ] Create POST endpoint to regenerate specific segments
- [ ] Add cost estimation to script preview response
- [ ] Support segment reordering and deletion
- [ ] Validate segment text length against model limits
- [ ] Include audio duration estimates in responses
- [ ] Add voice preview endpoint (generate sample audio for voice)

### Functional Requirements

From FUTURE-FEATURES.md:
- Allow script review before TTS generation
- Enable editing of individual segments
- Show cost estimation before committing to generation
- Support regenerating problematic segments

---

## Implementation Guide

### API Routes

```typescript
// backend/src/routes/podcast-routes.ts

import { Router, Request, Response } from 'express';
import { PodcastScriptRefiner } from '../services/podcast/script-refiner.js';
import { PodcastExportRepository } from '../db/repositories/podcast-export-repository.js';
import { PodcastTTSClient } from '../services/podcast/podcast-tts-client.js';
import { VoiceValidator } from '../services/podcast/voice-validator.js';
import { OpenRouterLLMClient } from '../services/llm/openrouter-client.js';
import { DebateRepository } from '../db/repositories/debate-repository.js';
import { MarkdownExporter } from '../services/export/markdownExporter.js';
import {
  PodcastExportConfig,
  RefinedPodcastScript,
  PodcastSegment,
  DEFAULT_VOICE_ASSIGNMENTS
} from '../types/podcast-export.js';

const router = Router();

/**
 * POST /api/exports/podcast/refine
 * Generate a refined podcast script from a debate (preview before TTS)
 */
router.post('/refine', async (req: Request, res: Response) => {
  try {
    const { debateId, config } = req.body as {
      debateId: string;
      config: Partial<PodcastExportConfig>;
    };

    // Validate debate exists
    const debateRepo = new DebateRepository(req.app.locals.pool);
    const debate = await debateRepo.findById(debateId);
    if (!debate) {
      return res.status(404).json({ error: 'Debate not found' });
    }

    // Build full config with defaults
    const fullConfig: PodcastExportConfig = {
      refinementModel: config.refinementModel || 'openai/gpt-4o-mini',
      includeIntro: config.includeIntro ?? true,
      includeOutro: config.includeOutro ?? true,
      addTransitions: config.addTransitions ?? true,
      elevenLabsModel: config.elevenLabsModel || 'eleven_multilingual_v2',
      outputFormat: config.outputFormat || 'mp3_44100_128',
      voiceAssignments: {
        ...DEFAULT_VOICE_ASSIGNMENTS,
        ...config.voiceAssignments,
      },
      useCustomPronunciation: config.useCustomPronunciation ?? false,
      pronunciationDictionaryId: config.pronunciationDictionaryId,
      normalizeVolume: config.normalizeVolume ?? true,
    };

    // Create job record
    const podcastRepo = new PodcastExportRepository(req.app.locals.pool);
    const job = await podcastRepo.create(debateId, fullConfig);

    // Update status to refining
    await podcastRepo.updateStatus(job.id, 'refining');

    // Get debate transcript
    const exporter = new MarkdownExporter();
    const transcript = await exporter.buildTranscript(debate);

    // Refine the script
    const llmClient = new OpenRouterLLMClient(process.env.OPENROUTER_API_KEY!);
    const refiner = new PodcastScriptRefiner(llmClient, fullConfig);
    const refinedScript = await refiner.refineTranscript(transcript);

    // Save refined script
    await podcastRepo.saveRefinedScript(job.id, refinedScript);
    await podcastRepo.updateStatus(job.id, 'pending'); // Ready for TTS

    // Calculate cost estimate
    const estimatedCostCents = PodcastTTSClient.estimateCostCents(
      refinedScript.totalCharacters
    );

    res.json({
      jobId: job.id,
      script: refinedScript,
      estimatedCostCents,
      estimatedDurationMinutes: Math.round(refinedScript.durationEstimateSeconds / 60),
    });

  } catch (error: any) {
    console.error('Script refinement error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/exports/podcast/:jobId
 * Get podcast export job details including refined script
 */
router.get('/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const podcastRepo = new PodcastExportRepository(req.app.locals.pool);
    const job = await podcastRepo.findById(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Add cost estimate if script exists
    let estimatedCostCents: number | undefined;
    if (job.refinedScript) {
      estimatedCostCents = PodcastTTSClient.estimateCostCents(
        job.refinedScript.totalCharacters
      );
    }

    res.json({
      ...job,
      estimatedCostCents,
    });

  } catch (error: any) {
    console.error('Get job error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/exports/podcast/:jobId/script
 * Update the refined script (edit segments)
 */
router.put('/:jobId/script', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { segments, intro, outro } = req.body as {
      segments?: PodcastSegment[];
      intro?: PodcastSegment;
      outro?: PodcastSegment;
    };

    const podcastRepo = new PodcastExportRepository(req.app.locals.pool);
    const job = await podcastRepo.findById(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'pending') {
      return res.status(400).json({
        error: 'Cannot edit script after generation has started'
      });
    }

    if (!job.refinedScript) {
      return res.status(400).json({ error: 'No script to edit' });
    }

    // Validate segment lengths
    const modelLimit = PodcastTTSClient.getModelCharLimit(job.config.elevenLabsModel);
    const allSegments = [intro, ...(segments || []), outro].filter(Boolean) as PodcastSegment[];

    for (const segment of allSegments) {
      if (segment.text.length > modelLimit) {
        return res.status(400).json({
          error: `Segment ${segment.index} exceeds ${modelLimit} character limit`,
        });
      }
    }

    // Update script
    const updatedScript: RefinedPodcastScript = {
      ...job.refinedScript,
      segments: segments || job.refinedScript.segments,
      intro: intro !== undefined ? intro : job.refinedScript.intro,
      outro: outro !== undefined ? outro : job.refinedScript.outro,
      updatedAt: new Date(),
    };

    // Recalculate totals
    const finalSegments = [
      updatedScript.intro,
      ...updatedScript.segments,
      updatedScript.outro
    ].filter(Boolean) as PodcastSegment[];

    updatedScript.totalCharacters = finalSegments.reduce(
      (sum, s) => sum + s.text.length, 0
    );

    const wordCount = finalSegments.reduce(
      (sum, s) => sum + s.text.split(/\s+/).length, 0
    );
    updatedScript.durationEstimateSeconds = Math.round((wordCount / 150) * 60);

    await podcastRepo.saveRefinedScript(jobId, updatedScript);

    res.json({
      script: updatedScript,
      estimatedCostCents: PodcastTTSClient.estimateCostCents(
        updatedScript.totalCharacters
      ),
    });

  } catch (error: any) {
    console.error('Update script error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/exports/podcast/:jobId/regenerate-segment
 * Regenerate a specific segment using LLM
 */
router.post('/:jobId/regenerate-segment', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { segmentIndex, instructions } = req.body as {
      segmentIndex: number;
      instructions?: string; // Optional guidance for regeneration
    };

    const podcastRepo = new PodcastExportRepository(req.app.locals.pool);
    const job = await podcastRepo.findById(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.refinedScript) {
      return res.status(400).json({ error: 'No script to regenerate' });
    }

    // Find the segment
    const allSegments = [
      job.refinedScript.intro,
      ...job.refinedScript.segments,
      job.refinedScript.outro
    ].filter(Boolean) as PodcastSegment[];

    const segment = allSegments[segmentIndex];
    if (!segment) {
      return res.status(404).json({ error: 'Segment not found' });
    }

    // Regenerate using LLM
    const llmClient = new OpenRouterLLMClient(process.env.OPENROUTER_API_KEY!);

    const prompt = instructions
      ? `Rewrite this podcast segment following these instructions: ${instructions}\n\nOriginal:\n${segment.text}`
      : `Improve this podcast segment for better spoken delivery:\n\n${segment.text}`;

    const response = await llmClient.complete({
      model: job.config.refinementModel,
      messages: [
        {
          role: 'system',
          content: 'You are a podcast script editor. Rewrite the given text for natural spoken delivery. Output only the rewritten text, no explanations.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.6,
      maxTokens: 1000,
    });

    // Update the segment
    segment.text = response.content.trim();

    // Recalculate totals
    job.refinedScript.totalCharacters = allSegments.reduce(
      (sum, s) => sum + s.text.length, 0
    );
    job.refinedScript.updatedAt = new Date();

    await podcastRepo.saveRefinedScript(jobId, job.refinedScript);

    res.json({
      segment,
      estimatedCostCents: PodcastTTSClient.estimateCostCents(
        job.refinedScript.totalCharacters
      ),
    });

  } catch (error: any) {
    console.error('Regenerate segment error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/exports/podcast/preview-voice
 * Generate a short voice preview sample
 */
router.post('/preview-voice', async (req: Request, res: Response) => {
  try {
    const { voiceId, text } = req.body as {
      voiceId: string;
      text?: string;
    };

    const sampleText = text || 'This is a sample of how I sound. I hope you like my voice for your podcast.';

    if (sampleText.length > 200) {
      return res.status(400).json({ error: 'Preview text must be under 200 characters' });
    }

    const ttsClient = new PodcastTTSClient(process.env.ELEVENLABS_API_KEY!);

    const response = await ttsClient.generateSegmentAudio(
      {
        index: 0,
        speaker: 'preview',
        voiceId,
        text: sampleText,
        voiceSettings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          speed: 1.0,
          use_speaker_boost: true,
        },
      },
      {
        modelId: 'eleven_flash_v2_5', // Fast model for previews
        outputFormat: 'mp3_22050_32',  // Lower quality for preview
      }
    );

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': response.audio.length,
    });
    res.send(response.audio);

  } catch (error: any) {
    console.error('Voice preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/exports/podcast/voices
 * Get available voices for assignment
 */
router.get('/voices', async (req: Request, res: Response) => {
  try {
    const ttsClient = new PodcastTTSClient(process.env.ELEVENLABS_API_KEY!);
    const validator = new VoiceValidator(ttsClient);

    const voices = await validator.getRecommendedVoices();

    res.json({ voices });

  } catch (error: any) {
    console.error('Get voices error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/exports/podcast/:jobId/segment/:segmentIndex
 * Delete a segment from the script
 */
router.delete('/:jobId/segment/:segmentIndex', async (req: Request, res: Response) => {
  try {
    const { jobId, segmentIndex } = req.params;
    const index = parseInt(segmentIndex, 10);

    const podcastRepo = new PodcastExportRepository(req.app.locals.pool);
    const job = await podcastRepo.findById(jobId);

    if (!job || !job.refinedScript) {
      return res.status(404).json({ error: 'Job or script not found' });
    }

    // Can't delete intro/outro through this endpoint
    if (index < 0 || index >= job.refinedScript.segments.length) {
      return res.status(400).json({ error: 'Invalid segment index' });
    }

    // Remove segment
    job.refinedScript.segments.splice(index, 1);

    // Reindex remaining segments
    job.refinedScript.segments.forEach((seg, i) => {
      seg.index = i + (job.refinedScript!.intro ? 1 : 0);
    });

    // Recalculate totals
    const allSegments = [
      job.refinedScript.intro,
      ...job.refinedScript.segments,
      job.refinedScript.outro
    ].filter(Boolean) as PodcastSegment[];

    job.refinedScript.totalCharacters = allSegments.reduce(
      (sum, s) => sum + s.text.length, 0
    );
    job.refinedScript.updatedAt = new Date();

    await podcastRepo.saveRefinedScript(jobId, job.refinedScript);

    res.json({
      script: job.refinedScript,
      estimatedCostCents: PodcastTTSClient.estimateCostCents(
        job.refinedScript.totalCharacters
      ),
    });

  } catch (error: any) {
    console.error('Delete segment error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

### Register Routes

```typescript
// Add to backend/src/routes/index.ts or main app file

import podcastRoutes from './routes/podcast-routes.js';

app.use('/api/exports/podcast', podcastRoutes);
```

---

## API Reference

### POST /api/exports/podcast/refine
Generate a refined script from a debate.

**Request:**
```json
{
  "debateId": "uuid",
  "config": {
    "refinementModel": "openai/gpt-4o-mini",
    "includeIntro": true,
    "includeOutro": true,
    "addTransitions": true,
    "elevenLabsModel": "eleven_multilingual_v2",
    "voiceAssignments": { ... }
  }
}
```

**Response:**
```json
{
  "jobId": "uuid",
  "script": { ... },
  "estimatedCostCents": 225,
  "estimatedDurationMinutes": 12
}
```

### PUT /api/exports/podcast/:jobId/script
Update script segments.

### POST /api/exports/podcast/:jobId/regenerate-segment
Regenerate a segment with optional instructions.

### POST /api/exports/podcast/preview-voice
Get a short audio sample for a voice.

### GET /api/exports/podcast/voices
Get available ElevenLabs voices.

---

## Validation

### How to Test

1. Create integration tests for each endpoint
2. Test error cases:
   - Invalid debate ID
   - Job not found
   - Segment exceeds character limit
   - Edit after generation started
3. Test with real debates of different lengths
4. Verify cost estimates match actual API costs

### Definition of Done

- [ ] All endpoints implemented and tested
- [ ] Error handling covers all edge cases
- [ ] Cost estimation is accurate
- [ ] Script editing preserves data integrity
- [ ] Voice preview works reliably
- [ ] API documentation is complete

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-03
**Updated:** 2026-01-03
