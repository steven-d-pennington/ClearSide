/**
 * Conversation API Routes
 *
 * Handles listing personas, creating conversation sessions,
 * control routes (launch, pause, resume), streaming, and data export.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import pino from 'pino';
import type { Pool } from 'pg';
import { createPodcastPersonaRepository } from '../db/repositories/podcast-persona-repository.js';
import { createConversationSessionRepository } from '../db/repositories/conversation-session-repository.js';
import { createConversationParticipantRepository } from '../db/repositories/conversation-participant-repository.js';
import { createContextBoardRepository } from '../db/repositories/context-board-repository.js';
import { createConversationUtteranceRepository } from '../db/repositories/conversation-utterance-repository.js';
import {
  createConversationalOrchestrator,
  ConversationalOrchestrator,
} from '../services/conversation/conversational-orchestrator.js';
import { createConversationScriptRefiner, TTSProvider } from '../services/podcast/conversation-script-refiner.js';
import { createOpenRouterClient } from '../services/llm/openrouter-adapter.js';
import type { SSEManager } from '../services/sse/sse-manager.js';
import type { FlowMode, SessionStatus } from '../types/conversation.js';
import type { RefinedPodcastScript, TTSProviderType, VoiceAssignment } from '../types/podcast-export.js';

const logger = pino({
  name: 'conversation-routes',
  level: process.env.LOG_LEVEL || 'info',
});

// Store active orchestrators in memory
const activeOrchestrators = new Map<string, ConversationalOrchestrator>();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createSessionSchema = z.object({
  topic: z.string().min(5).max(500),
  topicContext: z.string().max(2000).optional(),
  episodeProposalId: z.string().uuid().optional(),
  flowMode: z.enum(['manual', 'auto_stream', 'natural_pace']).default('manual'),
  paceDelayMs: z.number().min(500).max(10000).default(3000),
  rapidFire: z.boolean().default(false),
  minimalPersonaMode: z.boolean().default(false),
  maxTurns: z.number().min(5).max(100).default(30),
  hostModelId: z.string().optional(),
  hostDisplayName: z.string().max(100).optional(),
  participants: z.array(z.object({
    personaId: z.string().uuid(),
    modelId: z.string().min(1),
    modelDisplayName: z.string().optional(),
    providerName: z.string().optional(),
    displayNameOverride: z.string().max(100).optional(),
  })).min(2).max(6),
});

const listSessionsSchema = z.object({
  status: z.enum(['configuring', 'live', 'paused', 'completed', 'error']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const flowModeSchema = z.object({
  mode: z.enum(['manual', 'auto_stream', 'natural_pace']),
  paceDelayMs: z.number().min(500).max(10000).optional(),
});

const exportToPodcastSchema = z.object({
  provider: z.enum(['elevenlabs', 'gemini', 'google_cloud']).default('elevenlabs'),
});

const generateAudioSchema = z.object({
  provider: z.enum(['elevenlabs', 'gemini', 'google_cloud']).default('google_cloud'),
  voiceAssignments: z.record(z.string(), z.object({
    voiceId: z.string(),
    voiceName: z.string().optional(),
  })),
});

// ============================================================================
// ROUTE FACTORY
// ============================================================================

export function createConversationRoutes(pool: Pool, sseManager?: SSEManager): Router {
  const router = Router();
  const personaRepo = createPodcastPersonaRepository(pool);
  const sessionRepo = createConversationSessionRepository(pool);
  const participantRepo = createConversationParticipantRepository(pool);
  const contextBoardRepo = createContextBoardRepository(pool);
  const utteranceRepo = createConversationUtteranceRepository(pool);

  // ==========================================================================
  // DIAGNOSTIC ROUTES
  // ==========================================================================

  /**
   * GET /api/conversations/test-host-agent/:sessionId
   * Test that the host agent can generate an opening for a specific session
   */
  router.get('/test-host-agent/:sessionId', async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    try {
      console.log('TEST: Loading session', sessionId);

      const session = await sessionRepo.findById(sessionId || '');
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      console.log('TEST: Session found:', session.topic);

      const participants = await participantRepo.findBySessionId(sessionId || '');
      console.log('TEST: Participants:', participants.length);

      const personas = await personaRepo.findByIds(participants.map(p => p.personaId));
      console.log('TEST: Personas loaded:', personas.map(p => p.slug));

      const { createPodcastHostAgent } = await import('../services/agents/podcast-host-agent.js');

      const guestInfos = participants.map(p => {
        const persona = personas.find(ps => ps.id === p.personaId);
        if (!persona) throw new Error(`Persona not found for participant ${p.id}`);
        return { participant: p, persona };
      });

      console.log('TEST: Creating host agent...');
      const hostAgent = createPodcastHostAgent(
        sessionId || '',
        session.topic,
        guestInfos,
        session.topicContext || undefined
      );

      console.log('TEST: Generating opening...');
      const opening = await hostAgent.generateOpening();

      console.log('TEST: Opening generated:', opening.substring(0, 100) + '...');

      res.json({
        success: true,
        opening,
        message: 'Host agent opening generated successfully',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error('HOST AGENT TEST ERROR:', errorMessage);
      console.error('Stack:', errorStack);

      res.status(500).json({
        success: false,
        error: errorMessage,
        stack: errorStack,
      });
    }
  });

  /**
   * GET /api/conversations/test-llm
   * Test that the LLM client is working
   */
  router.get('/test-llm', async (_req: Request, res: Response) => {
    try {
      const { createOpenRouterClient } = await import('../services/llm/openrouter-adapter.js');

      console.log('Testing LLM client...');
      const client = createOpenRouterClient('anthropic/claude-haiku-4.5');

      const response = await client.complete({
        messages: [{ role: 'user', content: 'Say "Hello, I am working!" in exactly 5 words.' }],
        temperature: 0.7,
        maxTokens: 50,
      });

      console.log('LLM response:', response.content);

      res.json({
        success: true,
        response: response.content,
        message: 'LLM client is working',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error('LLM TEST ERROR:', errorMessage);
      console.error('Stack:', errorStack);

      res.status(500).json({
        success: false,
        error: errorMessage,
        stack: errorStack,
      });
    }
  });

  // ==========================================================================
  // PERSONA ROUTES
  // ==========================================================================

  /**
   * GET /api/conversations/personas
   * List all 12 podcast personas
   */
  router.get('/personas', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const personas = await personaRepo.findAll();

      res.json({
        personas,
        count: personas.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list personas');
      next(error);
    }
  });

  /**
   * GET /api/conversations/personas/summaries
   * Get lightweight persona data for dropdowns
   */
  router.get('/personas/summaries', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const summaries = await personaRepo.getSummaries();

      res.json({
        personas: summaries,
        count: summaries.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get persona summaries');
      next(error);
    }
  });

  /**
   * GET /api/conversations/personas/by-topics
   * Find personas by preferred topics
   * Note: Must come before /:slug to avoid route conflict
   */
  router.get('/personas/by-topics', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const topicsParam = req.query.topics;
      const topics = typeof topicsParam === 'string'
        ? topicsParam.split(',').filter(Boolean)
        : [];

      if (topics.length === 0) {
        res.status(400).json({ error: 'At least one topic required (e.g., ?topics=technology,ethics)' });
        return;
      }

      const personas = await personaRepo.findByTopics(topics);

      res.json({
        personas,
        count: personas.length,
        topics,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to find personas by topics');
      next(error);
    }
  });

  /**
   * GET /api/conversations/personas/voice-assignments
   * Get all voice assignments across all personas (for showing which voices are taken)
   */
  router.get('/personas/voice-assignments', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const personas = await personaRepo.findAll();

      // Build a map of voiceId -> persona info for assigned voices
      const voiceAssignments: Record<string, { personaId: string; personaName: string; avatarEmoji: string }> = {};

      for (const persona of personas) {
        if (persona.defaultVoiceId) {
          voiceAssignments[persona.defaultVoiceId] = {
            personaId: persona.id,
            personaName: persona.name,
            avatarEmoji: persona.avatarEmoji,
          };
        }
      }

      res.json({ voiceAssignments });
    } catch (error) {
      logger.error({ error }, 'Failed to get voice assignments');
      next(error);
    }
  });

  /**
   * GET /api/conversations/personas/:idOrSlug
   * Get a single persona by ID (UUID) or slug
   */
  router.get('/personas/:idOrSlug', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { idOrSlug } = req.params;

      if (!idOrSlug) {
        res.status(400).json({ error: 'ID or slug is required' });
        return;
      }

      // Check if it's a UUID (8-4-4-4-12 hex format)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isUuid = uuidRegex.test(idOrSlug);

      const persona = isUuid
        ? await personaRepo.findById(idOrSlug)
        : await personaRepo.findBySlug(idOrSlug);

      if (!persona) {
        res.status(404).json({ error: 'Persona not found' });
        return;
      }

      res.json({ persona });
    } catch (error) {
      logger.error({ error, idOrSlug: req.params.idOrSlug }, 'Failed to get persona');
      next(error);
    }
  });

  /**
   * PUT /api/conversations/personas/:id/voice
   * Update a persona's default voice settings
   */
  router.put('/personas/:id/voice', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { provider, voiceId, settings } = req.body;

      if (!id) {
        res.status(400).json({ error: 'Persona ID is required' });
        return;
      }

      // Validate provider if specified
      const validProviders = ['elevenlabs', 'gemini', 'google-cloud-long', 'azure', 'edge', null];
      if (provider !== undefined && !validProviders.includes(provider)) {
        res.status(400).json({
          error: `Invalid provider. Must be one of: ${validProviders.filter(p => p).join(', ')}`,
        });
        return;
      }

      // If clearing voice settings
      if (provider === null || (provider === undefined && voiceId === undefined)) {
        const persona = await personaRepo.clearVoiceSettings(id);
        if (!persona) {
          res.status(404).json({ error: 'Persona not found' });
          return;
        }
        res.json({ persona, message: 'Voice settings cleared' });
        return;
      }

      // Update voice settings
      const persona = await personaRepo.updateVoiceSettings(
        id,
        provider || null,
        voiceId || null,
        settings || null
      );

      if (!persona) {
        res.status(404).json({ error: 'Persona not found' });
        return;
      }

      logger.info({ personaId: id, provider, voiceId }, 'Updated persona voice settings');
      res.json({ persona, message: 'Voice settings updated' });
    } catch (error) {
      logger.error({ error, personaId: req.params.id }, 'Failed to update persona voice');
      next(error);
    }
  });

  /**
   * POST /api/conversations/voice/preview
   * Generate a TTS preview for a voice (short sample text)
   */
  router.post('/voice/preview', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { voiceId, text, provider = 'gemini' } = req.body;

      if (!voiceId || typeof voiceId !== 'string') {
        res.status(400).json({ error: 'voiceId is required' });
        return;
      }

      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'text is required' });
        return;
      }

      // Limit preview text length
      const previewText = text.slice(0, 200);

      logger.info({ voiceId, provider, textLength: previewText.length }, 'Generating voice preview');

      // Get TTS service
      const { getTTSService } = await import('../services/audio/tts-provider-factory.js');
      const ttsService = getTTSService(provider === 'gemini' ? 'gemini' : 'google-cloud-long');

      // Generate audio with custom voice ID
      const result = await ttsService.generateSpeech(previewText, 'narrator', voiceId);

      // Return audio as base64 for easy client-side playback
      const audioBase64 = result.audioBuffer.toString('base64');

      logger.info({
        voiceId,
        durationMs: result.durationMs,
        characterCount: result.charactersUsed,
      }, 'Voice preview generated');

      res.json({
        success: true,
        audio: audioBase64,
        contentType: 'audio/mpeg',
        durationMs: result.durationMs,
        characterCount: result.charactersUsed,
      });
    } catch (error) {
      logger.error({ error, voiceId: req.body?.voiceId }, 'Failed to generate voice preview');
      next(error);
    }
  });

  /**
   * PUT /api/conversations/personas/:id
   * Update a persona's profile details (name, backstory, speaking style, etc.)
   */
  router.put('/personas/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Persona ID is required' });
        return;
      }

      const {
        name,
        avatarEmoji,
        backstory,
        speakingStyle,
        worldview,
        quirks,
        examplePhrases,
        preferredTopics,
        voiceCharacteristics,
      } = req.body;

      // Basic validation
      if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
        res.status(400).json({ error: 'name must be a non-empty string' });
        return;
      }

      if (avatarEmoji !== undefined && typeof avatarEmoji !== 'string') {
        res.status(400).json({ error: 'avatarEmoji must be a string' });
        return;
      }

      if (backstory !== undefined && typeof backstory !== 'string') {
        res.status(400).json({ error: 'backstory must be a string' });
        return;
      }

      if (speakingStyle !== undefined && typeof speakingStyle !== 'string') {
        res.status(400).json({ error: 'speakingStyle must be a string' });
        return;
      }

      if (worldview !== undefined && typeof worldview !== 'string') {
        res.status(400).json({ error: 'worldview must be a string' });
        return;
      }

      if (quirks !== undefined && !Array.isArray(quirks)) {
        res.status(400).json({ error: 'quirks must be an array of strings' });
        return;
      }

      if (examplePhrases !== undefined && !Array.isArray(examplePhrases)) {
        res.status(400).json({ error: 'examplePhrases must be an array of strings' });
        return;
      }

      if (preferredTopics !== undefined && !Array.isArray(preferredTopics)) {
        res.status(400).json({ error: 'preferredTopics must be an array of strings' });
        return;
      }

      // Build updates object with only provided fields
      const updates: {
        name?: string;
        avatarEmoji?: string;
        backstory?: string;
        speakingStyle?: string;
        worldview?: string;
        quirks?: string[];
        examplePhrases?: string[];
        preferredTopics?: string[];
        voiceCharacteristics?: Record<string, unknown>;
      } = {};

      if (name !== undefined) updates.name = name;
      if (avatarEmoji !== undefined) updates.avatarEmoji = avatarEmoji;
      if (backstory !== undefined) updates.backstory = backstory;
      if (speakingStyle !== undefined) updates.speakingStyle = speakingStyle;
      if (worldview !== undefined) updates.worldview = worldview;
      if (quirks !== undefined) updates.quirks = quirks;
      if (examplePhrases !== undefined) updates.examplePhrases = examplePhrases;
      if (preferredTopics !== undefined) updates.preferredTopics = preferredTopics;
      if (voiceCharacteristics !== undefined) updates.voiceCharacteristics = voiceCharacteristics;

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'No valid fields provided for update' });
        return;
      }

      const persona = await personaRepo.updateProfile(id, updates);

      if (!persona) {
        res.status(404).json({ error: 'Persona not found' });
        return;
      }

      logger.info({ personaId: id, fields: Object.keys(updates) }, 'Updated persona profile');
      res.json({ persona, message: 'Profile updated' });
    } catch (error) {
      logger.error({ error, personaId: req.params.id }, 'Failed to update persona profile');
      next(error);
    }
  });

  // ==========================================================================
  // SESSION ROUTES
  // ==========================================================================

  /**
   * POST /api/conversations/sessions
   * Create a new conversation session
   */
  router.post('/sessions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createSessionSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid request',
          details: parsed.error.issues,
        });
        return;
      }

      const {
        topic,
        topicContext,
        episodeProposalId,
        flowMode,
        paceDelayMs,
        rapidFire,
        minimalPersonaMode,
        maxTurns,
        hostModelId,
        hostDisplayName,
        participants,
      } = parsed.data;

      // Validate all personas exist
      const personaIds = participants.map(p => p.personaId);
      const existingPersonas = await personaRepo.findByIds(personaIds);

      if (existingPersonas.length !== personaIds.length) {
        const existingIds = new Set(existingPersonas.map(p => p.id));
        const missing = personaIds.filter(id => !existingIds.has(id));
        res.status(400).json({
          error: 'Invalid persona IDs',
          missing,
        });
        return;
      }

      // Create session using the config with slug-based participants
      const participantConfigs = participants.map(p => {
        const persona = existingPersonas.find(per => per.id === p.personaId);
        return {
          personaSlug: persona?.slug || '',
          modelId: p.modelId,
          modelDisplayName: p.modelDisplayName,
          providerName: p.providerName,
          displayNameOverride: p.displayNameOverride,
        };
      });

      const session = await sessionRepo.create({
        topic,
        topicContext,
        episodeProposalId,
        flowMode: flowMode as FlowMode,
        paceDelayMs,
        rapidFire,
        minimalPersonaMode,
        maxTurns,
        hostModelId,
        hostDisplayName,
        participants: participantConfigs,
      });

      // Create participants using the create method
      const createdParticipants = await Promise.all(
        participants.map((p, index) =>
          participantRepo.create({
            sessionId: session.id,
            personaId: p.personaId,
            modelId: p.modelId,
            modelDisplayName: p.modelDisplayName,
            providerName: p.providerName,
            displayNameOverride: p.displayNameOverride,
            participantOrder: index,
          })
        )
      );

      // Initialize context board
      await contextBoardRepo.create(session.id);

      logger.info({
        sessionId: session.id,
        topic,
        participantCount: participants.length,
      }, 'Conversation session created');

      res.status(201).json({
        session: {
          ...session,
          participants: createdParticipants.map(p => ({
            ...p,
            persona: existingPersonas.find(per => per.id === p.personaId),
          })),
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create session');
      next(error);
    }
  });

  /**
   * GET /api/conversations/sessions
   * List conversation sessions
   */
  router.get('/sessions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = listSessionsSchema.safeParse(req.query);

      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid query parameters',
          details: parsed.error.issues,
        });
        return;
      }

      const { status, limit, offset } = parsed.data;

      const sessions = await sessionRepo.findAll({
        status: status as SessionStatus | undefined,
        limit,
        offset,
      });

      const total = await sessionRepo.count(status as SessionStatus | undefined);

      res.json({
        sessions,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + sessions.length < total,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list sessions');
      next(error);
    }
  });

  /**
   * GET /api/conversations/sessions/active
   * Get active (live or paused) sessions
   */
  router.get('/sessions/active', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const sessions = await sessionRepo.findActive();

      res.json({
        sessions,
        count: sessions.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get active sessions');
      next(error);
    }
  });

  /**
   * GET /api/conversations/sessions/:id
   * Get session details with participants
   */
  router.get('/sessions/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const session = await sessionRepo.findById(id);

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Load participants with personas
      const participants = await participantRepo.findBySessionId(id);
      const personaIds = participants.map(p => p.personaId);
      const personas = await personaRepo.findByIds(personaIds);

      const participantsWithPersonas = participants.map(p => ({
        ...p,
        persona: personas.find(per => per.id === p.personaId),
      }));

      // Load context board state
      const contextBoard = await contextBoardRepo.findBySessionId(id);

      // Check if orchestrator is active
      const isActive = activeOrchestrators.has(id);

      res.json({
        session: {
          ...session,
          participants: participantsWithPersonas,
          contextBoard,
          isActive,
        },
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to get session');
      next(error);
    }
  });

  /**
   * DELETE /api/conversations/sessions/:id
   * Delete a session (only if not completed)
   */
  router.delete('/sessions/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const session = await sessionRepo.findById(id);

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      if (session.status === 'completed') {
        res.status(400).json({ error: 'Cannot delete completed session' });
        return;
      }

      // Stop any active orchestrator
      const orchestrator = activeOrchestrators.get(id);
      if (orchestrator) {
        await orchestrator.stop();
        activeOrchestrators.delete(id);
      }

      await sessionRepo.delete(id);

      logger.info({ sessionId: id }, 'Session deleted');
      res.status(204).send();
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to delete session');
      next(error);
    }
  });

  // ==========================================================================
  // CONTROL ROUTES
  // ==========================================================================

  /**
   * POST /api/conversations/sessions/:id/launch
   * Start a conversation
   */
  router.post('/sessions/:id/launch', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      // Check if already running (with lock to prevent race condition)
      // Must set placeholder BEFORE any async operations to prevent TOCTOU race
      if (activeOrchestrators.has(id)) {
        res.status(409).json({ error: 'Conversation already running' });
        return;
      }

      // Set placeholder immediately to prevent concurrent launch attempts
      // Will be replaced with real orchestrator or deleted on error
      activeOrchestrators.set(id, null as unknown as ConversationalOrchestrator);

      const session = await sessionRepo.findById(id);
      if (!session) {
        activeOrchestrators.delete(id); // Clean up placeholder
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      if (session.status === 'completed') {
        activeOrchestrators.delete(id); // Clean up placeholder
        res.status(400).json({ error: 'Session already completed' });
        return;
      }

      if (!sseManager) {
        activeOrchestrators.delete(id); // Clean up placeholder
        res.status(500).json({ error: 'SSE manager not available' });
        return;
      }

      // Create and initialize orchestrator with session's configured maxTurns
      const orchestrator = await createConversationalOrchestrator(
        pool,
        sseManager,
        id,
        session.maxTurns
      );

      activeOrchestrators.set(id, orchestrator);

      // Start conversation in background
      orchestrator.start()
        .then(() => {
          activeOrchestrators.delete(id);
          logger.info({ sessionId: id }, 'Conversation completed');
        })
        .catch((error) => {
          activeOrchestrators.delete(id);
          logger.error({ error, sessionId: id }, 'Conversation failed');
        });

      logger.info({ sessionId: id }, 'Conversation launched');

      res.json({
        message: 'Conversation launched',
        sessionId: id,
        status: 'live',
      });
    } catch (error) {
      // Clean up placeholder on error
      if (req.params.id) {
        activeOrchestrators.delete(req.params.id);
      }
      logger.error({ error, sessionId: req.params.id }, 'Failed to launch conversation');
      next(error);
    }
  });

  /**
   * POST /api/conversations/sessions/:id/advance
   * Advance to next turn (manual mode only)
   */
  router.post('/sessions/:id/advance', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const orchestrator = activeOrchestrators.get(id);
      if (!orchestrator) {
        res.status(404).json({ error: 'No active conversation found' });
        return;
      }

      orchestrator.advanceOnce();

      res.json({
        message: 'Advanced to next turn',
        sessionId: id,
        turnCount: orchestrator.getTurnCount(),
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to advance');
      next(error);
    }
  });

  /**
   * POST /api/conversations/sessions/:id/pause
   * Pause a running conversation
   */
  router.post('/sessions/:id/pause', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const orchestrator = activeOrchestrators.get(id);
      if (!orchestrator) {
        res.status(404).json({ error: 'No active conversation found' });
        return;
      }

      await orchestrator.pause();

      res.json({
        message: 'Conversation paused',
        sessionId: id,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to pause');
      next(error);
    }
  });

  /**
   * POST /api/conversations/sessions/:id/resume
   * Resume a paused conversation
   */
  router.post('/sessions/:id/resume', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const orchestrator = activeOrchestrators.get(id);
      if (!orchestrator) {
        res.status(404).json({ error: 'No active conversation found' });
        return;
      }

      await orchestrator.resume();

      res.json({
        message: 'Conversation resumed',
        sessionId: id,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to resume');
      next(error);
    }
  });

  /**
   * POST /api/conversations/sessions/:id/stop
   * Stop a running conversation
   */
  router.post('/sessions/:id/stop', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const orchestrator = activeOrchestrators.get(id);
      if (!orchestrator) {
        res.status(404).json({ error: 'No active conversation found' });
        return;
      }

      await orchestrator.stop();
      activeOrchestrators.delete(id);

      res.json({
        message: 'Conversation stopped',
        sessionId: id,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to stop');
      next(error);
    }
  });

  /**
   * POST /api/conversations/sessions/:id/restart
   * Restart a conversation from the beginning (clears all data)
   */
  router.post('/sessions/:id/restart', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const session = await sessionRepo.findById(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Stop any active orchestrator
      const orchestrator = activeOrchestrators.get(id);
      if (orchestrator) {
        await orchestrator.stop();
        activeOrchestrators.delete(id);
      }

      // Delete all utterances
      const deletedCount = await utteranceRepo.deleteBySessionId(id);
      logger.info({ sessionId: id, deletedUtterances: deletedCount }, 'Deleted utterances for restart');

      // Reset context board
      await contextBoardRepo.reset(id);

      // Reset session status to configuring and clear timestamps
      await sessionRepo.updateStatus(id, 'configuring');

      logger.info({ sessionId: id }, 'Conversation restarted');

      res.json({
        message: 'Conversation restarted',
        sessionId: id,
        deletedUtterances: deletedCount,
        status: 'configuring',
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to restart conversation');
      next(error);
    }
  });

  /**
   * POST /api/conversations/sessions/:id/flow-mode
   * Change flow mode during conversation
   */
  router.post('/sessions/:id/flow-mode', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const parsed = flowModeSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid request',
          details: parsed.error.issues,
        });
        return;
      }

      const { mode, paceDelayMs } = parsed.data;

      const orchestrator = activeOrchestrators.get(id);
      if (orchestrator) {
        await orchestrator.setFlowMode(mode as FlowMode, paceDelayMs);
      } else {
        // Update in database even if not running
        await sessionRepo.updateFlowMode(id, mode as FlowMode, paceDelayMs);
      }

      res.json({
        message: 'Flow mode updated',
        sessionId: id,
        mode,
        paceDelayMs,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to update flow mode');
      next(error);
    }
  });

  // ==========================================================================
  // STREAMING ROUTES
  // ==========================================================================

  /**
   * GET /api/conversations/sessions/:id/stream
   * SSE endpoint for real-time updates
   */
  router.get('/sessions/:id/stream', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const session = await sessionRepo.findById(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      if (!sseManager) {
        res.status(500).json({ error: 'SSE manager not available' });
        return;
      }

      // Register client with SSE manager using conversation-specific method
      const clientId = sseManager.addConversationClient(
        id,
        res,
        req.headers['last-event-id'] as string | undefined
      );

      // Send initial state using the conversation event format
      sseManager.broadcastToConversation(id, 'conversation_connected', {
        sessionId: id,
        clientId,
        status: session.status,
        isActive: activeOrchestrators.has(id),
        message: 'Connected to conversation stream',
      });

      // Handle disconnect
      req.on('close', () => {
        sseManager.removeConversationClient(id, clientId);
        logger.debug({ sessionId: id, clientId }, 'SSE client disconnected');
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to establish SSE');
      next(error);
    }
  });

  // ==========================================================================
  // DATA ROUTES
  // ==========================================================================

  /**
   * GET /api/conversations/sessions/:id/context-board
   * Get current context board state
   */
  router.get('/sessions/:id/context-board', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const contextBoard = await contextBoardRepo.findBySessionId(id);
      if (!contextBoard) {
        res.status(404).json({ error: 'Context board not found' });
        return;
      }

      res.json({ contextBoard });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to get context board');
      next(error);
    }
  });

  /**
   * GET /api/conversations/sessions/:id/transcript
   * Export transcript as markdown
   */
  router.get('/sessions/:id/transcript', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const session = await sessionRepo.findById(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const participants = await participantRepo.findBySessionId(id);
      const personaIds = participants.map(p => p.personaId);
      const personas = await personaRepo.findByIds(personaIds);
      const utterances = await utteranceRepo.findBySessionId(id);

      // Build markdown transcript
      let markdown = `# Conversation: ${session.topic}\n\n`;
      markdown += `**Date:** ${session.createdAt.toISOString().split('T')[0]}\n`;
      markdown += `**Participants:** ${participants.map(p => {
        const persona = personas.find(per => per.id === p.personaId);
        return p.displayNameOverride || persona?.name || 'Unknown';
      }).join(', ')}\n\n`;
      markdown += `---\n\n`;

      for (const utterance of utterances) {
        let speakerName: string;

        if (utterance.isHostUtterance) {
          speakerName = '**Host**';
        } else {
          const participant = participants.find(p => p.id === utterance.participantId);
          const persona = participant ? personas.find(per => per.id === participant.personaId) : null;
          speakerName = `**${participant?.displayNameOverride || persona?.name || 'Unknown'}**`;
        }

        markdown += `${speakerName}:\n\n${utterance.content}\n\n`;

        if (utterance.isKeyPoint) {
          markdown += `> 📌 Key Point\n\n`;
        }

        if (utterance.topicMarker) {
          markdown += `*[Topic: ${utterance.topicMarker}]*\n\n`;
        }

        markdown += `---\n\n`;
      }

      // Set response headers for download
      const format = req.query.format || 'json';
      if (format === 'md') {
        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', `attachment; filename="conversation-${id}.md"`);
        res.send(markdown);
      } else {
        res.json({
          sessionId: id,
          topic: session.topic,
          markdown,
          utteranceCount: utterances.length,
        });
      }
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to export transcript');
      next(error);
    }
  });

  /**
   * GET /api/conversations/sessions/:id/utterances
   * Get all utterances for a session
   */
  router.get('/sessions/:id/utterances', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const utterances = await utteranceRepo.findBySessionId(id);
      const total = await utteranceRepo.getCount(id);

      res.json({
        utterances,
        total,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to get utterances');
      next(error);
    }
  });

  // ==========================================================================
  // UTTERANCE REGENERATION ROUTES
  // ==========================================================================

  /**
   * POST /api/conversations/sessions/:sessionId/utterances/:utteranceId/regenerate
   * Regenerate a truncated utterance with a different model
   */
  router.post('/sessions/:sessionId/utterances/:utteranceId/regenerate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId, utteranceId } = req.params;
      const { modelId } = req.body;

      logger.info({
        sessionId,
        utteranceId,
        modelId,
        body: req.body,
      }, 'Regenerate utterance request received');

      if (!sessionId || !utteranceId) {
        res.status(400).json({ error: 'Session ID and Utterance ID are required' });
        return;
      }

      if (!modelId || typeof modelId !== 'string') {
        res.status(400).json({ error: 'Model ID is required' });
        return;
      }

      // Get the utterance
      const utterance = await utteranceRepo.findById(parseInt(utteranceId, 10));
      if (!utterance) {
        res.status(404).json({ error: 'Utterance not found' });
        return;
      }

      // Verify utterance belongs to session
      if (utterance.sessionId !== sessionId) {
        res.status(400).json({ error: 'Utterance does not belong to this session' });
        return;
      }

      // Get the session
      const session = await sessionRepo.findById(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Get conversation context up to (but not including) this utterance
      const allUtterances = await utteranceRepo.findBySessionId(sessionId);
      const precedingUtterances = allUtterances.filter(u => u.timestampMs < utterance.timestampMs);

      // Get the participant info
      const participants = await participantRepo.findBySessionId(sessionId);

      // Helper to get speaker name
      const getSpeakerName = (u: typeof utterance): string => {
        if (u.isHostUtterance) return 'Host';
        const p = participants.find(p => p.id === u.participantId);
        return p?.persona?.name || p?.displayNameOverride || 'Speaker';
      };

      // Build context string from preceding utterances
      const context = precedingUtterances
        .map(u => `${getSpeakerName(u)}: ${u.content}`)
        .join('\n\n');

      const participant = utterance.participantId
        ? participants.find(p => p.id === utterance.participantId)
        : null;

      // Get persona info if this is a participant utterance
      let personaPrompt = '';
      if (participant && participant.persona) {
        const persona = participant.persona;
        personaPrompt = `You are ${persona.name}. ${persona.backstory}\n\nSpeaking style: ${persona.speakingStyle}\n\nWorldview: ${persona.worldview}`;
      } else if (utterance.isHostUtterance) {
        personaPrompt = `You are the host of a podcast discussion about "${session.topic}". Your role is to facilitate engaging conversation.`;
      }

      // Create new LLM client with selected model
      const { createOpenRouterClient } = await import('../services/llm/openrouter-adapter.js');
      const llmClient = createOpenRouterClient(modelId);

      // Build messages for regeneration
      const messages = [
        { role: 'system' as const, content: personaPrompt },
        { role: 'user' as const, content: `The conversation so far:\n\n${context}\n\nPlease provide your response. Make sure to complete your thought fully. Do not cut off mid-sentence.` }
      ];

      // Generate new content
      const newContent = await llmClient.chat(messages, {
        temperature: 0.8,
        maxTokens: 800, // Larger token limit for regeneration
      });

      // Update the utterance in database
      await utteranceRepo.updateContent(parseInt(utteranceId, 10), newContent, {
        regenerated: true,
        regeneratedAt: new Date().toISOString(),
        originalModelId: participant?.modelId || 'unknown',
        newModelId: modelId,
      });

      // Update the participant's model for future turns
      if (participant?.id) {
        await participantRepo.updateModel(participant.id, modelId);
        logger.info({
          participantId: participant.id,
          oldModelId: participant.modelId,
          newModelId: modelId,
        }, 'Updated participant model configuration');
      }

      // Broadcast update via SSE if available
      if (sseManager) {
        sseManager.broadcastToConversation(sessionId, 'conversation_utterance', {
          sessionId,
          utteranceId: parseInt(utteranceId, 10),
          participantId: utterance.participantId || null,
          speakerName: getSpeakerName(utterance),
          personaSlug: participant?.persona?.slug || 'host',
          content: newContent,
          isHost: utterance.isHostUtterance,
          isKeyPoint: utterance.isKeyPoint,
          turnCount: precedingUtterances.length + 1,
          timestampMs: utterance.timestampMs,
          regenerated: true,
        });
      }

      logger.info({
        sessionId,
        utteranceId,
        originalLength: utterance.content.length,
        newLength: newContent.length,
        originalModelId: participant?.modelId,
        newModelId: modelId,
      }, 'Utterance regenerated successfully');

      res.json({
        success: true,
        utteranceId: parseInt(utteranceId, 10),
        newContent,
        newLength: newContent.length,
        modelUsed: modelId,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.sessionId, utteranceId: req.params.utteranceId }, 'Failed to regenerate utterance');
      next(error);
    }
  });

  // ==========================================================================
  // EXPORT ROUTES
  // ==========================================================================

  /**
   * POST /api/conversations/sessions/:id/export-to-podcast
   * Create podcast export from a completed conversation
   * Returns the refined script ready for TTS processing
   */
  router.post('/sessions/:id/export-to-podcast', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const parsed = exportToPodcastSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid request',
          details: parsed.error.issues,
        });
        return;
      }

      const { provider } = parsed.data;

      // Verify session exists
      const session = await sessionRepo.findById(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Only allow export of completed conversations
      if (session.status !== 'completed') {
        res.status(400).json({
          error: 'Can only export completed conversations',
          currentStatus: session.status,
        });
        return;
      }

      // Check for saved edits first
      const savedScript = await sessionRepo.getRefinedScript(id);

      let script;
      let usedSavedEdits = false;

      // Create LLM client for Gemini emotional tag enhancement
      // Uses a fast model (Haiku) for efficient tag injection
      const llmClient = provider === 'gemini'
        ? createOpenRouterClient('anthropic/claude-haiku-4.5')
        : undefined;

      if (savedScript && savedScript.segments.length > 0) {
        // Use saved edits
        usedSavedEdits = true;

        // Refine to get voice assignments and metadata
        const refiner = createConversationScriptRefiner(pool, llmClient);
        const freshScript = await refiner.refine(id, provider as TTSProvider);

        // For Gemini, re-enhance saved segments with emotional tags
        let enhancedSegments = savedScript.segments;
        if (provider === 'gemini' && llmClient) {
          logger.info({ sessionId: id, segmentCount: savedScript.segments.length }, 'Re-enhancing saved segments with LLM emotional tags');
          enhancedSegments = [];
          for (const segment of savedScript.segments) {
            const enhancedContent = await refiner.enhanceWithEmotionalTags(
              segment.content,
              segment.speakerName
            );
            enhancedSegments.push({
              ...segment,
              content: enhancedContent,
            });
          }
        }

        script = {
          ...freshScript,
          segments: enhancedSegments,
          totalSegments: enhancedSegments.length,
          totalWords: savedScript.totalWords || enhancedSegments.reduce(
            (sum, s) => sum + s.content.split(/\s+/).length, 0
          ),
          estimatedDurationMinutes: savedScript.estimatedDurationMinutes || Math.ceil(
            enhancedSegments.reduce((sum, s) => sum + s.content.split(/\s+/).length, 0) / 150
          ),
        };

        logger.info({
          sessionId: id,
          provider,
          totalSegments: script.totalSegments,
          usedSavedEdits: true,
          llmEnhanced: provider === 'gemini',
        }, 'Using saved script edits for podcast export');
      } else {
        // Refine from original utterances with LLM enhancement for Gemini
        const refiner = createConversationScriptRefiner(pool, llmClient);
        script = provider === 'gemini'
          ? await refiner.refineWithLLMEnhancement(id, provider as TTSProvider)
          : await refiner.refine(id, provider as TTSProvider);

        logger.info({
          sessionId: id,
          provider,
          totalSegments: script.totalSegments,
          estimatedDuration: script.estimatedDurationMinutes,
          llmEnhanced: provider === 'gemini',
        }, 'Conversation exported for podcast');
      }

      res.json({
        script,
        usedSavedEdits,
        message: usedSavedEdits
          ? 'Using saved script edits. Use /api/conversations/sessions/:id/generate-audio to generate audio.'
          : 'Script refined successfully. Use /api/conversations/sessions/:id/generate-audio to generate audio.',
        nextSteps: {
          audioGeneration: 'POST /api/conversations/sessions/:id/generate-audio with voiceAssignments',
          voiceAssignment: 'Assign voice IDs to each speaker in voiceAssignments',
          resetScript: usedSavedEdits ? 'DELETE /api/conversations/sessions/:id/refined-script to reset to original' : undefined,
        },
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to export conversation to podcast');
      next(error);
    }
  });

  /**
   * POST /api/conversations/sessions/:id/generate-audio
   * Generate podcast audio from a completed conversation with voice assignments
   */
  router.post('/sessions/:id/generate-audio', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const parsed = generateAudioSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid request',
          details: parsed.error.issues,
        });
        return;
      }

      const { provider, voiceAssignments } = parsed.data;

      // Verify session exists and is completed
      const session = await sessionRepo.findById(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      if (session.status !== 'completed') {
        res.status(400).json({
          error: 'Can only generate audio for completed conversations',
          currentStatus: session.status,
        });
        return;
      }

      // Check for saved edits first, otherwise refine from original
      const savedScript = await sessionRepo.getRefinedScript(id);

      // Create LLM client for Gemini emotional tag enhancement
      const llmClient = provider === 'gemini'
        ? createOpenRouterClient('anthropic/claude-haiku-4.5')
        : undefined;

      const refiner = createConversationScriptRefiner(pool, llmClient);
      const freshScript = provider === 'gemini'
        ? await refiner.refineWithLLMEnhancement(id, provider as TTSProvider)
        : await refiner.refine(id, provider as TTSProvider);

      let conversationScript;
      if (savedScript && savedScript.segments.length > 0) {
        // Use saved edits with fresh voice assignments
        conversationScript = {
          ...freshScript,
          segments: savedScript.segments,
          totalSegments: savedScript.segments.length,
          totalWords: savedScript.totalWords || savedScript.segments.reduce(
            (sum, s) => sum + s.content.split(/\s+/).length, 0
          ),
        };
        logger.info({ sessionId: id, usedSavedEdits: true, llmEnhanced: provider === 'gemini' }, 'Using saved script edits for audio generation');
      } else {
        conversationScript = freshScript;
      }

      // Import podcast-related modules
      const { createPodcastPipeline } = await import('../services/podcast/podcast-pipeline.js');
      const podcastRepo = await import('../db/repositories/podcast-export-repository.js');
      const { DEFAULT_VOICE_ASSIGNMENTS } = await import('../types/podcast-export.js');

      // Convert conversation script to podcast format
      const podcastSegments = conversationScript.segments.map((seg, index) => {
        const assignment = voiceAssignments[seg.speakerName];
        if (!assignment) {
          throw new Error(`No voice assignment for speaker: ${seg.speakerName}`);
        }

        return {
          index,
          speaker: seg.speakerName,
          voiceId: assignment.voiceId,
          text: seg.content,
          voiceSettings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            speed: 1.0,
            use_speaker_boost: true,
          },
        };
      });

      // Calculate totals
      const totalCharacters = podcastSegments.reduce((sum, s) => sum + s.text.length, 0);
      const totalWords = conversationScript.totalWords;
      const durationEstimateSeconds = Math.round((totalWords / 150) * 60);

      // Create refined script in podcast format
      // Include Gemini director's notes if available (generated from persona voice characteristics)
      const refinedPodcastScript: RefinedPodcastScript = {
        title: conversationScript.title,
        segments: podcastSegments,
        intro: undefined,
        outro: undefined,
        totalCharacters,
        durationEstimateSeconds,
        createdAt: new Date(),
        updatedAt: new Date(),
        geminiDirectorNotes: conversationScript.geminiDirectorNotes,
      };

      // Create podcast export job
      const ttsProviderMap: Record<string, TTSProviderType> = {
        'google_cloud': 'google-cloud-long',
        'elevenlabs': 'elevenlabs',
        'gemini': 'gemini',
      };
      const mappedProvider: TTSProviderType = ttsProviderMap[provider] || 'google-cloud-long';

      // Build voice assignments in correct format
      const conversationVoiceAssignments: Record<string, VoiceAssignment> = {};
      for (const [name, va] of Object.entries(voiceAssignments)) {
        conversationVoiceAssignments[name] = {
          speakerId: name,
          voiceId: va.voiceId,
          voiceName: va.voiceName || name,
          settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            speed: 1.0,
            use_speaker_boost: true,
          },
        };
      }

      const job = await podcastRepo.createForConversation(id, {
        ttsProvider: mappedProvider,
        refinementModel: 'none', // Already refined
        includeIntro: false,
        includeOutro: false,
        addTransitions: false,
        elevenLabsModel: 'eleven_v3',
        outputFormat: 'mp3_44100_128',
        voiceAssignments: {
          ...DEFAULT_VOICE_ASSIGNMENTS,
          ...conversationVoiceAssignments,
        },
        useCustomPronunciation: false,
        normalizeVolume: true,
        tone: 'spirited',
        debateMode: 'turn_based',
      });

      // Save the refined script
      await podcastRepo.saveRefinedScript(job.id, refinedPodcastScript);
      await podcastRepo.updateStatus(job.id, 'pending');

      // Start generation in background
      const pipeline = createPodcastPipeline({
        ttsProvider: mappedProvider,
      });

      pipeline.generate(job.id).catch(err => {
        logger.error({ jobId: job.id, error: err.message }, 'Pipeline background error');
      });

      logger.info({
        sessionId: id,
        jobId: job.id,
        provider,
        totalSegments: podcastSegments.length,
        totalCharacters,
      }, 'Conversation audio generation started');

      res.json({
        jobId: job.id,
        status: 'generating',
        message: `Audio generation started (using ${provider})`,
        totalSegments: podcastSegments.length,
        estimatedDurationMinutes: conversationScript.estimatedDurationMinutes,
        progressUrl: `/api/exports/podcast/${job.id}/progress`,
        downloadUrl: `/api/exports/podcast/${job.id}/download`,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to generate conversation audio');
      next(error);
    }
  });

  // ============================================================================
  // TTS Prompt Preview (for viewing director's notes and voice direction)
  // ============================================================================

  /**
   * GET /api/conversations/sessions/:id/tts-prompt-preview
   * Get full TTS prompt preview showing director's notes and all sections
   * This lets users see exactly what will be sent to Gemini TTS
   */
  router.get('/sessions/:id/tts-prompt-preview', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const provider = (req.query.provider as TTSProvider) || 'gemini';

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      // Get the session
      const session = await sessionRepo.findById(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Refine the script to get director's notes with LLM emotional enhancement
      const llmClient = createOpenRouterClient('anthropic/claude-haiku-4.5');
      const refiner = createConversationScriptRefiner(pool, llmClient);
      const script = await refiner.refineWithLLMEnhancement(id, provider as TTSProvider);

      if (!script.geminiDirectorNotes) {
        res.status(400).json({ error: 'Director notes only available for Gemini provider' });
        return;
      }

      // Build segment previews
      const segmentPreviews = script.segments.map((segment, index) => {
        // Find the speaker direction for this segment
        const speakerDirection = script.geminiDirectorNotes?.speakerDirections[segment.speakerName] || {
          speakerId: segment.speakerName,
          characterProfile: 'Podcast participant',
          vocalStyle: 'Natural, conversational',
          performanceNotes: 'Speak naturally',
        };

        // Build the four sections that make up the TTS prompt
        const audioProfile = `${speakerDirection.characterProfile}\n${speakerDirection.vocalStyle}`;
        const scene = script.geminiDirectorNotes?.sceneContext || '';
        const directorsNotes = speakerDirection.performanceNotes;

        // Extract injected tags from the content
        const injectedTags: Array<{ tag: string; position: number; reason: string; type: string }> = [];
        const tagRegex = /\[(excited|thoughtful|empathetic|sad|soft|firm|sigh|laughing|clears throat|hmm|uhm|gasps|short pause|medium pause|long pause|whisper|loud|slow|fast)\]/gi;
        let match;
        while ((match = tagRegex.exec(segment.content)) !== null) {
          const tag = match[0];
          const captured = match[1];
          if (!captured) continue;
          const tagName = captured.toLowerCase();

          // Categorize the tag
          let type: string;
          if (['excited', 'thoughtful', 'empathetic', 'sad', 'soft', 'firm'].includes(tagName)) {
            type = 'emotion';
          } else if (['short pause', 'medium pause', 'long pause'].includes(tagName)) {
            type = 'pause';
          } else if (['whisper', 'loud', 'slow', 'fast'].includes(tagName)) {
            type = 'modifier';
          } else {
            type = 'micro-expression';
          }

          injectedTags.push({
            tag,
            position: match.index,
            reason: getTagReason(tagName),
            type,
          });
        }

        return {
          segmentIndex: index,
          speakerName: segment.speakerName,
          speakerRole: segment.speakerRole,
          sections: {
            audioProfile,
            scene,
            directorsNotes,
            transcript: {
              original: segment.content.replace(tagRegex, '').trim(), // Remove tags for original
              enhanced: segment.content,
            },
          },
          injectedTags,
          characterCounts: {
            audioProfile: audioProfile.length,
            scene: scene.length,
            directorsNotes: directorsNotes.length,
            transcript: segment.content.length,
            total: audioProfile.length + scene.length + directorsNotes.length + segment.content.length,
          },
        };
      });

      res.json({
        sessionId: id,
        topic: session.topic,
        showContext: script.geminiDirectorNotes.showContext,
        sceneContext: script.geminiDirectorNotes.sceneContext,
        pacingNotes: script.geminiDirectorNotes.pacingNotes,
        speakerDirections: script.geminiDirectorNotes.speakerDirections,
        segmentPreviews,
        totalSegments: script.segments.length,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to get TTS prompt preview');
      next(error);
    }
  });

  /**
   * GET /api/conversations/sessions/:id/segments/:index/tts-prompt
   * Get the full TTS prompt for a specific segment
   */
  router.get('/sessions/:id/segments/:index/tts-prompt', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, index } = req.params;
      const provider = (req.query.provider as TTSProvider) || 'gemini';

      if (!id || !index) {
        res.status(400).json({ error: 'Session ID and segment index are required' });
        return;
      }

      const segmentIndex = parseInt(index, 10);

      if (isNaN(segmentIndex) || segmentIndex < 0) {
        res.status(400).json({ error: 'Valid segment index is required' });
        return;
      }

      // Get the session
      const session = await sessionRepo.findById(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Refine the script with LLM emotional enhancement for Gemini
      const llmClient = provider === 'gemini'
        ? createOpenRouterClient('anthropic/claude-haiku-4.5')
        : undefined;
      const refiner = createConversationScriptRefiner(pool, llmClient);
      const script = provider === 'gemini'
        ? await refiner.refineWithLLMEnhancement(id, provider as TTSProvider)
        : await refiner.refine(id, provider as TTSProvider);

      if (segmentIndex >= script.segments.length) {
        res.status(404).json({ error: `Segment ${segmentIndex} not found. Script has ${script.segments.length} segments.` });
        return;
      }

      const segment = script.segments[segmentIndex];
      if (!segment) {
        res.status(404).json({ error: 'Segment not found' });
        return;
      }

      if (!script.geminiDirectorNotes) {
        res.status(400).json({ error: 'Director notes only available for Gemini provider' });
        return;
      }

      // Build the full prompt as it would be sent to Gemini TTS
      const speakerDirection = script.geminiDirectorNotes.speakerDirections[segment.speakerName] || {
        speakerId: segment.speakerName,
        characterProfile: 'Podcast participant',
        vocalStyle: 'Natural, conversational',
        performanceNotes: 'Speak naturally',
      };

      // This matches the format in podcast-tts-adapter.ts prependGeminiDirectorNotes()
      const fullPrompt = `# AUDIO PROFILE
${speakerDirection.characterProfile}
${speakerDirection.vocalStyle}

## THE SCENE
${script.geminiDirectorNotes.sceneContext}

### DIRECTOR'S NOTES
${speakerDirection.performanceNotes}
${script.geminiDirectorNotes.pacingNotes}

#### TRANSCRIPT
${segment.content}`;

      // Extract tags for display
      const tagRegex = /\[(excited|thoughtful|empathetic|sad|soft|firm|sigh|laughing|clears throat|hmm|uhm|gasps|short pause|medium pause|long pause|whisper|loud|slow|fast)\]/gi;
      const injectedTags: Array<{ tag: string; position: number; reason: string; type: string }> = [];
      let match;
      while ((match = tagRegex.exec(segment.content)) !== null) {
        const tag = match[0];
        const captured = match[1];
        if (!captured) continue;
        const tagName = captured.toLowerCase();
        let type: string;
        if (['excited', 'thoughtful', 'empathetic', 'sad', 'soft', 'firm'].includes(tagName)) {
          type = 'emotion';
        } else if (['short pause', 'medium pause', 'long pause'].includes(tagName)) {
          type = 'pause';
        } else if (['whisper', 'loud', 'slow', 'fast'].includes(tagName)) {
          type = 'modifier';
        } else {
          type = 'micro-expression';
        }
        injectedTags.push({
          tag,
          position: match.index,
          reason: getTagReason(tagName),
          type,
        });
      }

      res.json({
        segmentIndex,
        speakerName: segment.speakerName,
        speakerRole: segment.speakerRole,
        fullPrompt,
        sections: {
          audioProfile: `${speakerDirection.characterProfile}\n${speakerDirection.vocalStyle}`,
          scene: script.geminiDirectorNotes.sceneContext,
          directorsNotes: `${speakerDirection.performanceNotes}\n${script.geminiDirectorNotes.pacingNotes}`,
          transcript: {
            original: segment.content.replace(tagRegex, '').trim(),
            enhanced: segment.content,
          },
        },
        injectedTags,
        characterCount: fullPrompt.length,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id, segmentIndex: req.params.index }, 'Failed to get segment TTS prompt');
      next(error);
    }
  });

  // ============================================================================
  // Refined Script Management (for Script Review step)
  // ============================================================================

  /**
   * GET /api/conversations/sessions/:id/refined-script
   * Get saved refined script edits for a session
   */
  router.get('/sessions/:id/refined-script', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const savedScript = await sessionRepo.getRefinedScript(id);

      if (!savedScript) {
        res.status(404).json({ error: 'No saved refined script found for this session' });
        return;
      }

      res.json({
        sessionId: savedScript.sessionId,
        segments: savedScript.segments,
        provider: savedScript.provider,
        title: savedScript.title,
        topic: savedScript.topic,
        totalWords: savedScript.totalWords,
        estimatedDurationMinutes: savedScript.estimatedDurationMinutes,
        updatedAt: savedScript.updatedAt,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to get refined script');
      next(error);
    }
  });

  /**
   * PATCH /api/conversations/sessions/:id/refined-script
   * Save edited refined script segments
   */
  router.patch('/sessions/:id/refined-script', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      // Validate request body
      const { segments, provider, title, topic } = req.body;

      if (!segments || !Array.isArray(segments)) {
        res.status(400).json({ error: 'segments array is required' });
        return;
      }

      if (segments.length === 0) {
        res.status(400).json({ error: 'segments array cannot be empty' });
        return;
      }

      // Validate segment structure
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg.speakerName || typeof seg.content !== 'string') {
          res.status(400).json({
            error: `Invalid segment at index ${i}: speakerName and content are required`,
          });
          return;
        }
      }

      // Verify session exists
      const session = await sessionRepo.findById(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Save the refined script
      const saved = await sessionRepo.saveRefinedScript(id, segments, {
        provider,
        title,
        topic,
      });

      logger.info({ sessionId: id, segmentCount: segments.length }, 'Refined script saved');

      res.json({
        success: true,
        sessionId: saved.sessionId,
        segmentCount: saved.segments.length,
        totalWords: saved.totalWords,
        estimatedDurationMinutes: saved.estimatedDurationMinutes,
        updatedAt: saved.updatedAt,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to save refined script');
      next(error);
    }
  });

  /**
   * DELETE /api/conversations/sessions/:id/refined-script
   * Delete saved refined script (reset to original)
   */
  router.delete('/sessions/:id/refined-script', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const deleted = await sessionRepo.deleteRefinedScript(id);

      if (!deleted) {
        res.status(404).json({ error: 'No saved refined script found for this session' });
        return;
      }

      logger.info({ sessionId: id }, 'Refined script deleted (reset to original)');

      res.json({
        success: true,
        message: 'Refined script deleted. Export will regenerate from original utterances.',
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to delete refined script');
      next(error);
    }
  });

  // ============================================================================
  // Segment Preview (for previewing individual segments before full export)
  // ============================================================================

  /**
   * POST /api/conversations/sessions/:id/segments/:index/preview
   * Generate TTS preview for a single segment
   */
  router.post('/sessions/:id/segments/:index/preview', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, index } = req.params;

      if (!id || !index) {
        res.status(400).json({ error: 'Session ID and segment index are required' });
        return;
      }

      const segmentIndex = parseInt(index, 10);

      if (isNaN(segmentIndex) || segmentIndex < 0) {
        res.status(400).json({ error: 'Valid segment index is required' });
        return;
      }

      // Validate request body
      const { content, voiceId, provider } = req.body;

      if (!content || typeof content !== 'string') {
        res.status(400).json({ error: 'content is required' });
        return;
      }

      if (!voiceId || typeof voiceId !== 'string') {
        res.status(400).json({ error: 'voiceId is required' });
        return;
      }

      const ttsProvider = provider || 'google_cloud';

      // Verify session exists
      const session = await sessionRepo.findById(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Generate content hash for cache invalidation
      const crypto = await import('crypto');
      const contentHash = crypto.createHash('md5').update(content + voiceId + ttsProvider).digest('hex');

      // Check if we already have a preview with the same content
      const existingPreview = await sessionRepo.getSegmentPreview(id, segmentIndex);
      if (existingPreview && existingPreview.contentHash === contentHash && existingPreview.audioUrl) {
        logger.info({ sessionId: id, segmentIndex }, 'Returning cached segment preview');
        res.json({
          success: true,
          preview: {
            segmentIndex,
            voiceId: existingPreview.voiceId,
            provider: existingPreview.provider,
            audioUrl: existingPreview.audioUrl,
            durationMs: existingPreview.durationMs,
            characterCount: existingPreview.characterCount,
            cached: true,
          },
        });
        return;
      }

      // Generate TTS audio
      const { getTTSService } = await import('../services/audio/tts-provider-factory.js');

      // Map provider strings
      const serviceProviderMap: Record<string, 'elevenlabs' | 'gemini' | 'google-cloud-long'> = {
        'google_cloud': 'google-cloud-long',
        'elevenlabs': 'elevenlabs',
        'gemini': 'gemini',
      };
      const serviceProvider = serviceProviderMap[ttsProvider] || 'google-cloud-long';

      // Apply SSML refinements for Google Cloud
      let processedContent = content;
      if (ttsProvider === 'google_cloud') {
        // Apply basic SSML inline for pauses
        processedContent = content
          .replace(/\?(\s)/g, '?<break time="400ms"/>$1')
          .replace(/\.\s+(But|However|Yet|Now|Well)\b/g, '.<break time="500ms"/> $1');
      }

      const ttsService = getTTSService(serviceProvider);

      logger.info({
        sessionId: id,
        segmentIndex,
        voiceId,
        provider: ttsProvider,
        contentLength: content.length,
      }, 'Generating segment preview');

      // Generate audio with custom voice ID
      const result = await ttsService.generateSpeech(processedContent, 'narrator', voiceId);

      // Save audio to filesystem
      const fs = await import('fs/promises');
      const path = await import('path');

      const previewDir = path.join(process.cwd(), 'exports', 'previews', id);
      await fs.mkdir(previewDir, { recursive: true });

      const audioFilename = `segment-${segmentIndex}-${Date.now()}.mp3`;
      const audioPath = path.join(previewDir, audioFilename);
      await fs.writeFile(audioPath, result.audioBuffer);

      // Create URL for the audio
      const audioUrl = `/api/conversations/sessions/${id}/segments/${segmentIndex}/preview/audio`;

      // Save preview metadata to database
      // Note: durationMs must be rounded to integer for PostgreSQL INT column
      const preview = await sessionRepo.saveSegmentPreview(id, segmentIndex, {
        voiceId,
        provider: ttsProvider,
        audioPath,
        audioUrl,
        durationMs: Math.round(result.durationMs),
        characterCount: result.charactersUsed,
        contentHash,
      });

      logger.info({
        sessionId: id,
        segmentIndex,
        durationMs: result.durationMs,
        characterCount: result.charactersUsed,
      }, 'Segment preview generated');

      res.json({
        success: true,
        preview: {
          segmentIndex,
          voiceId: preview.voiceId,
          provider: preview.provider,
          audioUrl: preview.audioUrl,
          durationMs: preview.durationMs,
          characterCount: preview.characterCount,
          cached: false,
        },
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id, segmentIndex: req.params.index }, 'Failed to generate segment preview');
      next(error);
    }
  });

  /**
   * GET /api/conversations/sessions/:id/segments/:index/preview/audio
   * Stream the preview audio file
   */
  router.get('/sessions/:id/segments/:index/preview/audio', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, index } = req.params;

      if (!id || !index) {
        res.status(400).json({ error: 'Valid session ID and segment index are required' });
        return;
      }

      const segmentIndex = parseInt(index, 10);

      if (isNaN(segmentIndex)) {
        res.status(400).json({ error: 'Valid segment index is required' });
        return;
      }

      const preview = await sessionRepo.getSegmentPreview(id, segmentIndex);
      if (!preview || !preview.audioPath) {
        res.status(404).json({ error: 'Preview audio not found' });
        return;
      }

      const fs = await import('fs');

      // Check if file exists
      if (!fs.existsSync(preview.audioPath)) {
        res.status(404).json({ error: 'Preview audio file not found on disk' });
        return;
      }

      // Get file stats for Content-Length
      const stat = fs.statSync(preview.audioPath);

      // Set headers for audio streaming (no-cache to ensure fresh previews)
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Stream the file
      const readStream = fs.createReadStream(preview.audioPath);
      readStream.pipe(res);
    } catch (error) {
      logger.error({ error, sessionId: req.params.id, segmentIndex: req.params.index }, 'Failed to stream preview audio');
      next(error);
    }
  });

  /**
   * GET /api/conversations/sessions/:id/segments/previews
   * Get all segment previews for a session
   */
  router.get('/sessions/:id/segments/previews', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      const previews = await sessionRepo.getSegmentPreviews(id);

      res.json({
        sessionId: id,
        previews: previews.map(p => ({
          segmentIndex: p.segmentIndex,
          voiceId: p.voiceId,
          provider: p.provider,
          audioUrl: p.audioUrl,
          durationMs: p.durationMs,
          characterCount: p.characterCount,
          contentHash: p.contentHash,
          createdAt: p.createdAt,
        })),
        count: previews.length,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to get segment previews');
      next(error);
    }
  });

  /**
   * DELETE /api/conversations/sessions/:id/segments/:index/preview
   * Delete a segment preview (user unhappy with it)
   */
  router.delete('/sessions/:id/segments/:index/preview', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, index } = req.params;

      if (!id || !index) {
        res.status(400).json({ error: 'Valid session ID and segment index are required' });
        return;
      }

      const segmentIndex = parseInt(index, 10);

      if (isNaN(segmentIndex)) {
        res.status(400).json({ error: 'Valid segment index is required' });
        return;
      }

      // Get preview to find audio file
      const preview = await sessionRepo.getSegmentPreview(id, segmentIndex);

      if (preview && preview.audioPath) {
        // Delete audio file
        const fs = await import('fs/promises');
        try {
          await fs.unlink(preview.audioPath);
        } catch {
          // File might already be deleted, that's ok
        }
      }

      // Delete from database
      const deleted = await sessionRepo.deleteSegmentPreview(id, segmentIndex);

      if (!deleted) {
        res.status(404).json({ error: 'Preview not found' });
        return;
      }

      logger.info({ sessionId: id, segmentIndex }, 'Segment preview deleted');

      res.json({
        success: true,
        message: 'Preview deleted',
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id, segmentIndex: req.params.index }, 'Failed to delete segment preview');
      next(error);
    }
  });

  /**
   * DELETE /api/conversations/sessions/:id/segments/previews
   * Delete all segment previews for a session
   */
  router.delete('/sessions/:id/segments/previews', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      // Get all previews to delete audio files
      const previews = await sessionRepo.getSegmentPreviews(id);

      const fs = await import('fs/promises');
      for (const preview of previews) {
        if (preview.audioPath) {
          try {
            await fs.unlink(preview.audioPath);
          } catch {
            // File might already be deleted, that's ok
          }
        }
      }

      // Delete from database
      const deletedCount = await sessionRepo.deleteAllSegmentPreviews(id);

      // Also delete the preview directory
      const path = await import('path');
      const previewDir = path.join(process.cwd(), 'exports', 'previews', id);
      try {
        await fs.rm(previewDir, { recursive: true, force: true });
      } catch {
        // Directory might not exist, that's ok
      }

      logger.info({ sessionId: id, deletedCount }, 'All segment previews deleted');

      res.json({
        success: true,
        deletedCount,
        message: `Deleted ${deletedCount} preview(s)`,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to delete all segment previews');
      next(error);
    }
  });

  return router;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a human-readable reason for why a TTS tag was injected
 * Used for displaying in the TTS prompt preview UI
 */
function getTagReason(tagName: string): string {
  const tagReasons: Record<string, string> = {
    // Emotions
    'excited': 'Enthusiastic or passionate content',
    'thoughtful': 'Analytical or reflective content',
    'empathetic': 'Acknowledging or understanding others\' points',
    'sad': 'Concern, regret, or disappointment',
    'soft': 'Gentle or intimate moment',
    'firm': 'Strong assertion or important point',
    // Micro-expressions
    'sigh': 'Concession, heavy topic, or resignation',
    'laughing': 'Humorous or ironic moment',
    'clears throat': 'Before an important statement',
    'hmm': 'Thoughtful pause, considering options',
    'uhm': 'Hedging or uncertain language',
    'gasps': 'Surprise or realization',
    // Pauses
    'short pause': 'After question or brief moment',
    'medium pause': 'Before pivot (But, However)',
    'long pause': 'Before conclusion or major transition',
    // Modifiers
    'whisper': 'Intimate or secretive tone',
    'loud': 'Emphasis or strong emotion',
    'slow': 'Important point requiring emphasis',
    'fast': 'Excited or hurried speech',
  };

  return tagReasons[tagName] || 'Voice direction for natural speech';
}

/**
 * Get active orchestrator by session ID (for use in other modules)
 */
export function getActiveOrchestrator(sessionId: string): ConversationalOrchestrator | undefined {
  return activeOrchestrators.get(sessionId);
}

/**
 * Check if a conversation is active
 */
export function isConversationActive(sessionId: string): boolean {
  return activeOrchestrators.has(sessionId);
}

export default createConversationRoutes;
