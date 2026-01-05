/**
 * Debate Routes
 * Express routes for debate management and SSE streaming
 */

import express, { type Request, type Response } from 'express';
import { sseManager } from '../services/sse/index.js';
import * as debateRepository from '../db/repositories/debate-repository.js';
import * as utteranceRepository from '../db/repositories/utterance-repository.js';
import * as presetRepository from '../db/repositories/preset-repository.js';
import * as personaRepository from '../db/repositories/persona-repository.js';
import * as livelyRepository from '../db/repositories/lively-repository.js';
import * as informalRepository from '../db/repositories/informal-repository.js';
import * as duelogicRepository from '../db/repositories/duelogic-repository.js';
import { createLogger } from '../utils/logger.js';
import type { CreateDebateInput, FlowMode } from '../types/database.js';
import {
  isPresetMode,
  isBrevityLevel,
  isHumanSide,
  type PresetMode,
  type BrevityLevel,
  type HumanSide,
  type HumanParticipationConfig,
} from '../types/configuration.js';
import { humanTurnService } from '../services/human-turn/index.js';
import type { DebateMode, LivelySettingsInput } from '../types/lively.js';
import type { DebateModelConfig, ModelSelectionMode, CostThreshold, ReasoningEffort, ReasoningConfig } from '../types/openrouter.js';
import { createDebateClients } from '../services/llm/openrouter-adapter.js';
import { getOpenRouterClient, createModelPairingService } from '../services/openrouter/index.js';

// Orchestrator and dependencies
import { DebateOrchestrator, DebateStateMachine, turnManager, orchestratorRegistry } from '../services/debate/index.js';
import { createLivelyOrchestrator } from '../services/debate/lively-orchestrator.js';
import { createInformalOrchestrator } from '../services/debate/informal-orchestrator.js';
import type { CreateInformalDiscussionInput } from '../types/informal.js';
import {
  ProAdvocateAgent,
  ConAdvocateAgent,
  ModeratorAgent,
  OrchestratorAgent,
} from '../services/agents/index.js';
import { schemaValidator } from '../services/validation/index.js';

const router = express.Router();
const logger = createLogger({ module: 'DebateRoutes' });

/**
 * Validate configuration input from request body
 * Returns validation errors array (empty if valid)
 */
interface ConfigInput {
  presetMode?: unknown;
  brevityLevel?: unknown;
  llmTemperature?: unknown;
  maxTokensPerResponse?: unknown;
  requireCitations?: unknown;
  proPersonaId?: unknown;
  conPersonaId?: unknown;
  debateMode?: unknown;
  livelySettings?: unknown;
  informalSettings?: unknown;
  // Model selection
  modelSelectionMode?: unknown;
  proModelId?: unknown;
  conModelId?: unknown;
  moderatorModelId?: unknown;
  costThreshold?: unknown;
  // Reasoning configuration
  reasoningEffort?: unknown;
  // Human participation
  humanParticipation?: unknown;
}

function validateConfigInput(config: ConfigInput): string[] {
  const errors: string[] = [];

  if (config.presetMode !== undefined && !isPresetMode(config.presetMode)) {
    errors.push(
      `Invalid presetMode: must be one of 'quick', 'balanced', 'deep_dive', 'research', or 'custom'`
    );
  }

  if (config.brevityLevel !== undefined && !isBrevityLevel(config.brevityLevel)) {
    errors.push(`Invalid brevityLevel: must be an integer between 1 and 5`);
  }

  if (config.llmTemperature !== undefined) {
    const temp = Number(config.llmTemperature);
    if (isNaN(temp) || temp < 0 || temp > 1) {
      errors.push(`Invalid llmTemperature: must be a number between 0 and 1`);
    }
  }

  if (config.maxTokensPerResponse !== undefined) {
    const tokens = Number(config.maxTokensPerResponse);
    if (isNaN(tokens) || !Number.isInteger(tokens) || tokens < 128 || tokens > 4096) {
      errors.push(`Invalid maxTokensPerResponse: must be an integer between 128 and 4096`);
    }
  }

  if (config.requireCitations !== undefined && typeof config.requireCitations !== 'boolean') {
    errors.push(`Invalid requireCitations: must be a boolean`);
  }

  // Persona validations - must be strings or null
  if (config.proPersonaId !== undefined && config.proPersonaId !== null && typeof config.proPersonaId !== 'string') {
    errors.push(`Invalid proPersonaId: must be a string or null`);
  }

  if (config.conPersonaId !== undefined && config.conPersonaId !== null && typeof config.conPersonaId !== 'string') {
    errors.push(`Invalid conPersonaId: must be a string or null`);
  }

  // Debate mode validation
  if (config.debateMode !== undefined && config.debateMode !== 'turn_based' && config.debateMode !== 'lively' && config.debateMode !== 'informal') {
    errors.push(`Invalid debateMode: must be 'turn_based', 'lively', or 'informal'`);
  }

  // Lively settings validation (only validate structure if provided)
  if (config.livelySettings !== undefined) {
    if (typeof config.livelySettings !== 'object' || config.livelySettings === null) {
      errors.push(`Invalid livelySettings: must be an object`);
    } else {
      const settings = config.livelySettings as Record<string, unknown>;

      if (settings.aggressionLevel !== undefined) {
        const level = Number(settings.aggressionLevel);
        if (isNaN(level) || !Number.isInteger(level) || level < 1 || level > 5) {
          errors.push(`Invalid livelySettings.aggressionLevel: must be an integer between 1 and 5`);
        }
      }

      if (settings.maxInterruptsPerMinute !== undefined) {
        const max = Number(settings.maxInterruptsPerMinute);
        if (isNaN(max) || !Number.isInteger(max) || max < 0 || max > 10) {
          errors.push(`Invalid livelySettings.maxInterruptsPerMinute: must be an integer between 0 and 10`);
        }
      }

      if (settings.pacingMode !== undefined) {
        const validModes = ['slow', 'medium', 'fast', 'frantic'];
        if (!validModes.includes(settings.pacingMode as string)) {
          errors.push(`Invalid livelySettings.pacingMode: must be one of ${validModes.join(', ')}`);
        }
      }
    }
  }

  // Reasoning effort validation
  if (config.reasoningEffort !== undefined) {
    const validEfforts = ['xhigh', 'high', 'medium', 'low', 'minimal', 'none'];
    if (!validEfforts.includes(String(config.reasoningEffort))) {
      errors.push(`Invalid reasoningEffort: must be one of ${validEfforts.join(', ')}`);
    }
  }

  // Human participation validation
  if (config.humanParticipation !== undefined) {
    if (typeof config.humanParticipation !== 'object' || config.humanParticipation === null) {
      errors.push(`Invalid humanParticipation: must be an object`);
    } else {
      const hp = config.humanParticipation as Record<string, unknown>;

      if (hp.enabled !== undefined && typeof hp.enabled !== 'boolean') {
        errors.push(`Invalid humanParticipation.enabled: must be a boolean`);
      }

      if (hp.humanSide !== undefined && !isHumanSide(hp.humanSide)) {
        errors.push(`Invalid humanParticipation.humanSide: must be 'pro' or 'con'`);
      }

      if (hp.timeLimitSeconds !== undefined && hp.timeLimitSeconds !== null) {
        const limit = Number(hp.timeLimitSeconds);
        if (isNaN(limit) || !Number.isInteger(limit) || limit < 30 || limit > 600) {
          errors.push(`Invalid humanParticipation.timeLimitSeconds: must be an integer between 30 and 600, or null`);
        }
      }
    }
  }

  return errors;
}

/**
 * Validate that persona IDs exist in the database
 * Returns validation errors array (empty if valid)
 */
async function validatePersonaIds(proPersonaId?: string | null, conPersonaId?: string | null): Promise<string[]> {
  const errors: string[] = [];

  if (proPersonaId) {
    const exists = await personaRepository.exists(proPersonaId);
    if (!exists) {
      errors.push(`Invalid proPersonaId: persona '${proPersonaId}' not found`);
    }
  }

  if (conPersonaId) {
    const exists = await personaRepository.exists(conPersonaId);
    if (!exists) {
      errors.push(`Invalid conPersonaId: persona '${conPersonaId}' not found`);
    }
  }

  return errors;
}

/**
 * Build reasoning configuration from effort level
 */
function buildReasoningConfig(reasoningEffort?: ReasoningEffort): ReasoningConfig | undefined {
  if (!reasoningEffort || reasoningEffort === 'none') {
    return undefined;
  }

  return {
    enabled: true,
    effort: reasoningEffort,
  };
}

/**
 * Build model configuration for debate
 * Handles both auto and manual mode
 */
async function buildModelConfig(configInput: ConfigInput): Promise<DebateModelConfig | undefined> {
  const selectionMode = configInput.modelSelectionMode as ModelSelectionMode | undefined;
  const reasoningEffort = configInput.reasoningEffort as ReasoningEffort | undefined;
  const reasoning = buildReasoningConfig(reasoningEffort);

  // If no model selection specified but reasoning is set, still return config
  if (!selectionMode && !reasoning) {
    return undefined;
  }

  // If no model selection but reasoning is specified, return just reasoning config
  if (!selectionMode && reasoning) {
    return {
      selectionMode: 'auto',
      reasoning,
    };
  }

  // Manual mode - use provided model IDs
  if (selectionMode === 'manual') {
    return {
      selectionMode: 'manual',
      proModelId: configInput.proModelId as string | undefined,
      conModelId: configInput.conModelId as string | undefined,
      moderatorModelId: configInput.moderatorModelId as string | undefined,
      costThreshold: configInput.costThreshold as CostThreshold | undefined,
      reasoning,
    };
  }

  // Auto mode - use smart pairing service
  if (selectionMode === 'auto') {
    const costThreshold = (configInput.costThreshold as CostThreshold) || 'medium';

    try {
      const openRouterClient = getOpenRouterClient();
      const pairingService = createModelPairingService(openRouterClient);
      const pairing = await pairingService.autoSelectPairing(costThreshold);

      if (pairing) {
        logger.info({
          proModel: pairing.proModel.id,
          conModel: pairing.conModel.id,
          tier: pairing.tier,
          reasoning: reasoning?.effort || 'disabled',
        }, 'Auto-selected model pairing');

        return {
          selectionMode: 'auto',
          proModelId: pairing.proModel.id,
          conModelId: pairing.conModel.id,
          costThreshold,
          reasoning,
        };
      } else {
        logger.warn({ costThreshold }, 'Could not auto-select models, using defaults');
        return reasoning ? { selectionMode: 'auto', reasoning } : undefined;
      }
    } catch (error) {
      logger.warn({ error }, 'Error in auto model selection, using defaults');
      return reasoning ? { selectionMode: 'auto', reasoning } : undefined;
    }
  }

  return undefined;
}

/**
 * Start the debate orchestrator in the background
 * This is a fire-and-forget operation - the HTTP response is sent before this completes
 */
async function startDebateOrchestrator(
  debateId: string,
  propositionText: string,
  propositionContext?: Record<string, unknown>,
  flowMode: FlowMode = 'auto',
  debateMode: DebateMode = 'turn_based',
  livelySettings?: LivelySettingsInput,
  informalSettings?: CreateInformalDiscussionInput,
  modelConfig?: DebateModelConfig,
  humanParticipation?: HumanParticipationConfig
): Promise<void> {
  logger.info({
    debateId,
    propositionText,
    flowMode,
    debateMode,
    modelConfig,
    humanParticipation,
    informalSettings: informalSettings ? { participantCount: informalSettings.participants?.length } : undefined,
  }, 'Starting debate orchestrator');

  try {
    // Create per-debate state machine
    const stateMachine = new DebateStateMachine(debateId);

    // Create model-specific LLM clients if model config provided
    const clients = await createDebateClients(modelConfig);

    // Create per-debate agent instances with model overrides
    const agents = {
      pro: new ProAdvocateAgent(
        clients.proClient,
        clients.proModelId ? { model: clients.proModelId } : undefined
      ),
      con: new ConAdvocateAgent(
        clients.conClient,
        clients.conModelId ? { model: clients.conModelId } : undefined
      ),
      moderator: new ModeratorAgent(
        clients.moderatorClient,
        clients.moderatorModelId ? { model: clients.moderatorModelId } : undefined
      ),
      orchestrator: new OrchestratorAgent(
        clients.moderatorClient,
        clients.moderatorModelId ? { model: clients.moderatorModelId } : undefined
      ),
    };

    // Check if informal mode is requested
    if (debateMode === 'informal') {
      if (!informalSettings) {
        throw new Error('Informal mode requires informalSettings');
      }

      logger.info({ debateId, participantCount: informalSettings.participants.length }, 'Starting informal discussion mode');

      // Create informal orchestrator
      const informalOrchestrator = await createInformalOrchestrator(
        debateId,
        propositionText, // Topic
        sseManager,
        {
          topicContext: informalSettings.topicContext,
          participants: informalSettings.participants,
          maxExchanges: informalSettings.maxExchanges,
          endDetectionEnabled: informalSettings.endDetectionEnabled,
          endDetectionInterval: informalSettings.endDetectionInterval,
          endDetectionThreshold: informalSettings.endDetectionThreshold,
          discussionStyle: informalSettings.discussionStyle,
          tone: informalSettings.tone,
          devilsAdvocateParticipantId: informalSettings.devilsAdvocateParticipantId,
        }
      );

      // Register orchestrator so it can be accessed for stop
      orchestratorRegistry.register(debateId, informalOrchestrator);

      try {
        // Start informal discussion
        await informalOrchestrator.start();
        logger.info({ debateId }, 'Informal discussion completed successfully');
      } finally {
        // Always unregister when done (success or failure)
        orchestratorRegistry.unregister(debateId);
      }
      return;
    }

    // Check if lively mode is requested
    if (debateMode === 'lively') {
      logger.info({ debateId }, 'Starting lively debate mode');

      // Create lively settings in the database
      await livelyRepository.createLivelySettings({
        debateId,
        ...livelySettings,
      });

      // Create lively orchestrator
      const livelyOrchestrator = await createLivelyOrchestrator(
        debateId,
        propositionText,
        sseManager,
        stateMachine,
        turnManager,
        agents,
        livelySettings,
        humanParticipation
      );

      // Register lively orchestrator so it can be accessed for stop/pause
      orchestratorRegistry.register(debateId, livelyOrchestrator);

      try {
        // Start lively debate
        await livelyOrchestrator.start();
        logger.info({ debateId }, 'Lively debate completed successfully');
      } finally {
        // Always unregister when done (success or failure)
        orchestratorRegistry.unregister(debateId);
      }
      return;
    }

    // Standard turn-based mode
    const orchestrator = new DebateOrchestrator(
      debateId,
      stateMachine,
      turnManager,
      sseManager,
      schemaValidator,
      agents,
      {
        validateUtterances: true,
        broadcastEvents: true,
        autoSaveTranscript: true,
        flowMode,
      }
    );

    // Register orchestrator so it can be accessed for stop/pause
    orchestratorRegistry.register(debateId, orchestrator);

    try {
      // Start the debate - this runs all 6 phases
      const transcript = await orchestrator.startDebate(propositionText, propositionContext);

      logger.info(
        { debateId, phases: transcript.utterances.length },
        'Debate completed successfully'
      );
    } finally {
      // Always unregister when done (success or failure)
      orchestratorRegistry.unregister(debateId);
    }
  } catch (error) {
    // Properly serialize the error for logging
    const errorDetails = error instanceof Error
      ? { message: error.message, stack: error.stack, name: error.name }
      : { message: String(error) };
    logger.error({ debateId, error: errorDetails }, 'Debate orchestrator failed');

    // Broadcast error to connected SSE clients
    sseManager.broadcastToDebate(debateId, 'error', {
      debateId,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });

    // Update debate status to failed
    try {
      await debateRepository.updateStatus(debateId, { status: 'failed' });
    } catch (updateError) {
      logger.error({ debateId, updateError }, 'Failed to update debate status to failed');
    }
  }
}

/**
 * GET /debates/:debateId/stream
 * SSE endpoint for streaming debate events in real-time
 */
router.get('/debates/:debateId/stream', async (req: Request, res: Response) => {
  const { debateId } = req.params;
  const lastEventId = req.headers['last-event-id'] as string | undefined;
  // Query param for catch-up: ?lastTurnNumber=5 means client has seen turns 0-5
  const lastTurnNumber = req.query.lastTurnNumber ? parseInt(req.query.lastTurnNumber as string, 10) : undefined;

  logger.info({ debateId, lastEventId, lastTurnNumber }, 'SSE stream requested');

  try {
    // Verify debate exists
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      logger.warn({ debateId }, 'Debate not found for SSE stream');
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    // Register SSE client
    const clientId = sseManager.registerClient(debateId!, res, lastEventId);

    logger.info({ debateId, clientId, debateStatus: debate.status }, 'SSE client connected');

    // Handle client disconnect
    req.on('close', () => {
      logger.info({ debateId: debateId!, clientId }, 'SSE client disconnected');
      sseManager.unregisterClient(clientId);
    });

    // Handle connection errors
    res.on('error', (error) => {
      logger.error({ debateId: debateId!, clientId, error }, 'SSE stream error');
      sseManager.unregisterClient(clientId);
    });

    // CATCH-UP MECHANISM: Send historical utterances if client is reconnecting
    if (lastTurnNumber !== undefined && !isNaN(lastTurnNumber)) {
      try {
        // Fetch all utterances for this debate
        const allUtterances = await utteranceRepository.findByDebateId(debateId!);

        // Filter to get missed utterances (turns after lastTurnNumber)
        // Turn numbers are stored in metadata.turnNumber or inferred from order
        const missedUtterances = allUtterances.filter((u, index) => {
          const turnNum = (u.metadata?.turnNumber as number) ?? index;
          return turnNum > lastTurnNumber;
        });

        if (missedUtterances.length > 0) {
          logger.info(
            { debateId, clientId, missedCount: missedUtterances.length, lastTurnNumber },
            'Sending catch-up utterances'
          );

          // Send catch-up start event
          sseManager.sendToClient(clientId, 'catchup_start' as any, {
            debateId: debateId!,
            missedTurnCount: missedUtterances.length,
            fromTurnNumber: lastTurnNumber + 1,
            toTurnNumber: (missedUtterances[missedUtterances.length - 1]?.metadata?.turnNumber as number) ??
              (allUtterances.length - 1),
          });

          // Send each missed utterance
          for (const utterance of missedUtterances) {
            sseManager.sendToClient(clientId, 'catchup_utterance' as any, {
              id: utterance.id,
              timestamp_ms: utterance.timestampMs,
              phase: utterance.phase,
              speaker: utterance.speaker,
              content: utterance.content,
              metadata: utterance.metadata,
              isCatchup: true,
            });
          }

          // Send catch-up complete event
          sseManager.sendToClient(clientId, 'catchup_complete' as any, {
            debateId: debateId!,
            utterancesSent: missedUtterances.length,
            currentPhase: debate.currentPhase,
            debateStatus: debate.status,
          });
        }
      } catch (catchupError) {
        logger.error({ debateId, clientId, catchupError }, 'Error sending catch-up data');
        // Continue with normal stream even if catch-up fails
      }
    }

    // If debate is already completed, send complete event immediately
    if (debate.status === 'completed') {
      sseManager.sendToClient(clientId, 'complete', {
        debateId: debate.id,
        totalDurationMs: debate.totalDurationMs || 0,
        finalPhase: debate.currentPhase,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error({ debateId, error }, 'Error setting up SSE stream');

    // If headers not sent yet, send error response
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to set up SSE stream',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

/**
 * POST /debates
 * Create a new debate and start the orchestrator
 *
 * Request body:
 * - propositionText (required): The debate proposition
 * - propositionContext (optional): Additional context object
 * - flowMode (optional): 'auto' or 'step' (default: 'auto')
 * - presetMode (optional): 'quick' | 'balanced' | 'deep_dive' | 'research' | 'custom'
 * - brevityLevel (optional): 1-5 (1=detailed, 5=concise)
 * - llmTemperature (optional): 0-1
 * - maxTokensPerResponse (optional): 128-4096
 * - requireCitations (optional): boolean
 * - proPersonaId (optional): Persona ID for Pro advocate (e.g., 'theorist', 'economist')
 * - conPersonaId (optional): Persona ID for Con advocate (e.g., 'lawyer', 'ethicist')
 * - debateMode (optional): 'turn_based' | 'lively' (default: 'turn_based')
 * - livelySettings (optional): Lively mode configuration (only used if debateMode is 'lively')
 */
router.post('/debates', async (req: Request, res: Response) => {
  try {
    // Validate flowMode if provided
    const flowMode: FlowMode = req.body.flowMode === 'step' ? 'step' : 'auto';

    // Validate configuration input
    const configInput: ConfigInput = {
      presetMode: req.body.presetMode,
      brevityLevel: req.body.brevityLevel,
      llmTemperature: req.body.llmTemperature,
      maxTokensPerResponse: req.body.maxTokensPerResponse,
      requireCitations: req.body.requireCitations,
      proPersonaId: req.body.proPersonaId,
      conPersonaId: req.body.conPersonaId,
      debateMode: req.body.debateMode,
      livelySettings: req.body.livelySettings,
      informalSettings: req.body.informalSettings,
      // Model selection fields
      modelSelectionMode: req.body.modelSelectionMode,
      proModelId: req.body.proModelId,
      conModelId: req.body.conModelId,
      moderatorModelId: req.body.moderatorModelId,
      costThreshold: req.body.costThreshold,
      // Reasoning configuration
      reasoningEffort: req.body.reasoningEffort,
      // Human participation
      humanParticipation: req.body.humanParticipation,
    };

    const configErrors = validateConfigInput(configInput);
    if (configErrors.length > 0) {
      res.status(400).json({
        error: 'Invalid configuration',
        messages: configErrors,
      });
      return;
    }

    // Validate persona IDs exist in database
    const proPersonaId = configInput.proPersonaId as string | null | undefined;
    const conPersonaId = configInput.conPersonaId as string | null | undefined;
    const personaErrors = await validatePersonaIds(proPersonaId, conPersonaId);
    if (personaErrors.length > 0) {
      res.status(400).json({
        error: 'Invalid persona configuration',
        messages: personaErrors,
      });
      return;
    }

    // Build model configuration FIRST (handles auto and manual modes)
    // This resolves actual model IDs before creating the debate
    const modelConfig = await buildModelConfig(configInput);

    // Extract resolved model IDs for storage
    const resolvedProModelId = modelConfig?.proModelId ?? (configInput.proModelId as string | undefined) ?? null;
    const resolvedConModelId = modelConfig?.conModelId ?? (configInput.conModelId as string | undefined) ?? null;
    const resolvedModeratorModelId = modelConfig?.moderatorModelId ?? (configInput.moderatorModelId as string | undefined) ?? null;

    // Build CreateDebateInput with optional config fields
    const input: CreateDebateInput = {
      propositionText: req.body.propositionText,
      propositionContext: req.body.propositionContext,
      flowMode,
      // Include config fields only if provided
      ...(configInput.presetMode !== undefined && {
        presetMode: configInput.presetMode as PresetMode,
      }),
      ...(configInput.brevityLevel !== undefined && {
        brevityLevel: configInput.brevityLevel as BrevityLevel,
      }),
      ...(configInput.llmTemperature !== undefined && {
        llmTemperature: Number(configInput.llmTemperature),
      }),
      ...(configInput.maxTokensPerResponse !== undefined && {
        maxTokensPerResponse: Number(configInput.maxTokensPerResponse),
      }),
      ...(configInput.requireCitations !== undefined && {
        requireCitations: configInput.requireCitations as boolean,
      }),
      // Persona selections
      ...(proPersonaId !== undefined && {
        proPersonaId: proPersonaId ?? null,
      }),
      ...(conPersonaId !== undefined && {
        conPersonaId: conPersonaId ?? null,
      }),
      // Model selections (resolved from auto or manual mode)
      proModelId: resolvedProModelId,
      conModelId: resolvedConModelId,
      moderatorModelId: resolvedModeratorModelId,
    };

    // Validate required input
    if (!input.propositionText || typeof input.propositionText !== 'string') {
      res.status(400).json({
        error: 'Invalid input',
        message: 'propositionText is required and must be a string',
      });
      return;
    }

    // Create debate in database
    const debate = await debateRepository.create(input);

    logger.info(
      {
        debateId: debate.id,
        propositionText: debate.propositionText,
        flowMode,
        presetMode: debate.presetMode,
        brevityLevel: debate.brevityLevel,
        proModelId: debate.proModelId,
        conModelId: debate.conModelId,
        moderatorModelId: debate.moderatorModelId,
      },
      'Debate created'
    );

    // Return 201 immediately - don't wait for orchestrator
    res.status(201).json(debate);

    // Extract debate mode settings
    let debateMode: DebateMode = 'turn_based';
    if (configInput.debateMode === 'lively') {
      debateMode = 'lively';
    } else if (configInput.debateMode === 'informal') {
      debateMode = 'informal';
    }

    const livelySettings = debateMode === 'lively'
      ? (configInput.livelySettings as LivelySettingsInput | undefined)
      : undefined;

    const informalSettings = debateMode === 'informal'
      ? (configInput.informalSettings as CreateInformalDiscussionInput | undefined)
      : undefined;

    // Extract human participation config if enabled
    const humanParticipation = configInput.humanParticipation as HumanParticipationConfig | undefined;

    // Start orchestrator in background (fire and forget)
    // The .catch() ensures errors don't crash the server
    startDebateOrchestrator(
      debate.id,
      input.propositionText,
      input.propositionContext as Record<string, unknown> | undefined,
      flowMode,
      debateMode,
      livelySettings,
      informalSettings,
      modelConfig,
      humanParticipation
    ).catch((error) => {
      // This catch is a safety net - startDebateOrchestrator has its own error handling
      logger.error({ debateId: debate.id, error }, 'Unhandled orchestrator error');
    });
  } catch (error) {
    logger.error({ error }, 'Error creating debate');
    res.status(500).json({
      error: 'Failed to create debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /debates/:debateId
 * Get debate status and details
 */
router.get('/debates/:debateId', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  try {
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    // Include client count in response
    const clientCount = sseManager.getClientCount(debateId);

    res.json({
      ...debate,
      liveViewers: clientCount,
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error getting debate');
    res.status(500).json({
      error: 'Failed to get debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /debates/:debateId/config
 * Get full debate configuration for re-running a debate
 * Returns all parameters needed to start a new debate with the same settings
 */
router.get('/debates/:debateId/config', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  try {
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    // Build the base configuration
    const config: Record<string, unknown> = {
      // Basic info
      proposition: debate.propositionText,
      propositionContext: debate.propositionContext,
      debateMode: debate.debateMode,
      flowMode: debate.flowMode,

      // Configuration settings
      presetMode: debate.presetMode,
      brevityLevel: debate.brevityLevel,
      llmTemperature: debate.llmTemperature,
      maxTokensPerResponse: debate.maxTokensPerResponse,
      requireCitations: debate.requireCitations,

      // Persona assignments
      proPersonaId: debate.proPersonaId,
      conPersonaId: debate.conPersonaId,

      // Model assignments
      proModelId: debate.proModelId,
      conModelId: debate.conModelId,
      moderatorModelId: debate.moderatorModelId,
    };

    // Fetch mode-specific settings
    if (debate.debateMode === 'lively') {
      try {
        const livelySettings = await livelyRepository.findLivelySettingsByDebateId(debateId!);
        if (livelySettings) {
          config.livelySettings = {
            aggressionLevel: livelySettings.aggressionLevel,
            maxInterruptsPerMinute: livelySettings.maxInterruptsPerMinute,
            interruptCooldownMs: livelySettings.interruptCooldownMs,
            minSpeakingTimeMs: livelySettings.minSpeakingTimeMs,
            relevanceThreshold: livelySettings.relevanceThreshold,
            contradictionBoost: livelySettings.contradictionBoost,
            pacingMode: livelySettings.pacingMode,
            interjectionMaxTokens: livelySettings.interjectionMaxTokens,
          };
        }
      } catch {
        // Lively settings not found, continue without them
      }
    } else if (debate.debateMode === 'informal') {
      try {
        const informalSettings = await informalRepository.findByDebateId(debateId!);
        if (informalSettings) {
          config.informalSettings = {
            participantNames: informalSettings.participantNames,
            maxExchanges: informalSettings.maxExchanges,
            minExchanges: informalSettings.minExchanges,
            endDetection: informalSettings.endDetection,
            maxTokensPerTurn: informalSettings.maxTokensPerTurn,
            temperature: informalSettings.temperature,
          };
        }
      } catch {
        // Informal settings not found, continue without them
      }
    } else if (debate.debateMode === 'duelogic') {
      try {
        const duelogicConfig = await duelogicRepository.getDuelogicConfig(debateId!);
        if (duelogicConfig) {
          config.duelogicConfig = duelogicConfig;
        }
      } catch {
        // Duelogic config not found, continue without it
      }
    }

    // Fetch persona names if assigned
    if (debate.proPersonaId) {
      try {
        const proPersona = await personaRepository.findById(debate.proPersonaId);
        if (proPersona) {
          config.proPersonaName = proPersona.name;
        }
      } catch {
        // Persona not found
      }
    }
    if (debate.conPersonaId) {
      try {
        const conPersona = await personaRepository.findById(debate.conPersonaId);
        if (conPersona) {
          config.conPersonaName = conPersona.name;
        }
      } catch {
        // Persona not found
      }
    }

    res.json({
      success: true,
      debateId,
      config,
      originalStatus: debate.status,
      createdAt: debate.createdAt,
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error getting debate config');
    res.status(500).json({
      error: 'Failed to get debate config',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /debates/:debateId/utterances
 * Get all utterances for a debate (for replay)
 */
router.get('/debates/:debateId/utterances', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  try {
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    const utterances = await utteranceRepository.findByDebateId(debateId!);

    res.json({
      debateId,
      utterances,
      count: utterances.length,
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error getting utterances');
    res.status(500).json({
      error: 'Failed to get utterances',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /debates
 * List all debates with optional filtering
 */
router.get('/debates', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const debates = await debateRepository.list({
      status: status as any,
      limit,
      offset,
    });

    res.json({
      debates,
      count: debates.length,
      limit,
      offset,
    });
  } catch (error) {
    logger.error({ error }, 'Error listing debates');
    res.status(500).json({
      error: 'Failed to list debates',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /debates/:debateId/pause
 * Pause a live debate
 */
router.post('/debates/:debateId/pause', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  logger.info({ debateId }, 'Pause request received');

  try {
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    // Check if debate is in a pausable state
    if (debate.status !== 'live') {
      res.status(400).json({
        error: 'Invalid debate status',
        message: `Cannot pause debate with status: ${debate.status}`,
        currentStatus: debate.status,
      });
      return;
    }

    // Update debate status to paused
    await debateRepository.updateStatus(debateId!, { status: 'paused' });

    // Broadcast pause event
    sseManager.broadcastToDebate(debateId!, 'debate_paused', {
      debateId,
      pausedAt: new Date().toISOString(),
      phase: debate.currentPhase,
    });

    logger.info({ debateId }, 'Debate paused');

    res.json({
      status: 'paused',
      debateId,
      pausedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error pausing debate');
    res.status(500).json({
      error: 'Failed to pause debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /debates/:debateId/resume
 * Resume a paused debate
 */
router.post('/debates/:debateId/resume', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  logger.info({ debateId }, 'Resume request received');

  try {
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    // Check if debate is paused
    if (debate.status !== 'paused') {
      res.status(400).json({
        error: 'Invalid debate status',
        message: `Cannot resume debate with status: ${debate.status}`,
        currentStatus: debate.status,
      });
      return;
    }

    // Update debate status back to live
    await debateRepository.updateStatus(debateId!, { status: 'live' });

    // Broadcast resume event
    sseManager.broadcastToDebate(debateId!, 'debate_resumed', {
      debateId,
      resumedAt: new Date().toISOString(),
      phase: debate.currentPhase,
    });

    logger.info({ debateId }, 'Debate resumed');

    res.json({
      status: 'live',
      debateId,
      resumedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error resuming debate');
    res.status(500).json({
      error: 'Failed to resume debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /debates/:debateId/continue
 * Signal the orchestrator to continue to the next turn (step mode only)
 */
router.post('/debates/:debateId/continue', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  logger.info({ debateId }, 'Continue request received');

  try {
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    // Verify debate is in step mode
    if (debate.flowMode !== 'step') {
      res.status(400).json({
        error: 'Invalid flow mode',
        message: 'Continue is only available for debates in step mode',
        flowMode: debate.flowMode,
      });
      return;
    }

    // Verify debate is waiting for continue
    if (!debate.isAwaitingContinue) {
      res.status(400).json({
        error: 'Not awaiting continue',
        message: 'Debate is not currently waiting for continue signal',
        isAwaitingContinue: debate.isAwaitingContinue,
      });
      return;
    }

    // Clear the awaiting continue flag
    await debateRepository.setAwaitingContinue(debateId!, false);

    // Broadcast continuing event
    sseManager.broadcastToDebate(debateId!, 'continuing', {
      debateId,
      continuedAt: new Date().toISOString(),
    });

    logger.info({ debateId }, 'Debate continued');

    res.json({
      success: true,
      debateId,
      continuedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error continuing debate');
    res.status(500).json({
      error: 'Failed to continue debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /debates/:debateId/human-turn
 * Submit a human turn during human participation mode
 *
 * Request body:
 * - content (required): The human's argument text
 * - speaker (required): Which side the human is playing ('pro' or 'con')
 */
router.post('/debates/:debateId/human-turn', async (req: Request, res: Response) => {
  const { debateId } = req.params;
  const { content, speaker } = req.body;

  logger.info(
    { debateId, speaker, contentLength: content?.length },
    'Human turn submission received'
  );

  try {
    // Validate required fields
    if (!content || typeof content !== 'string') {
      res.status(400).json({
        error: 'Invalid input',
        message: 'content is required and must be a string',
      });
      return;
    }

    if (!speaker || !isHumanSide(speaker)) {
      res.status(400).json({
        error: 'Invalid input',
        message: "speaker is required and must be 'pro' or 'con'",
      });
      return;
    }

    // Validate content length
    const trimmedContent = content.trim();
    if (trimmedContent.length < 50) {
      res.status(400).json({
        error: 'Content too short',
        message: 'Your argument must be at least 50 characters',
        length: trimmedContent.length,
        minimum: 50,
      });
      return;
    }

    if (trimmedContent.length > 5000) {
      res.status(400).json({
        error: 'Content too long',
        message: 'Your argument must be at most 5000 characters',
        length: trimmedContent.length,
        maximum: 5000,
      });
      return;
    }

    // Verify debate exists and is live
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    if (debate.status !== 'live') {
      res.status(400).json({
        error: 'Invalid debate status',
        message: `Cannot submit human turn for debate with status: ${debate.status}`,
        currentStatus: debate.status,
      });
      return;
    }

    // Check if there's a pending human turn for this debate
    if (!humanTurnService.hasPendingTurn(debateId!)) {
      res.status(400).json({
        error: 'Not awaiting human input',
        message: 'The debate is not currently waiting for human input',
      });
      return;
    }

    // Submit the human turn
    const result = humanTurnService.submitHumanTurn({
      debateId: debateId!,
      content: trimmedContent,
      speaker: speaker as HumanSide,
    });

    if (!result.success) {
      res.status(400).json({
        error: 'Submission failed',
        message: 'Could not submit human turn. It may not be your turn or the speaker does not match.',
      });
      return;
    }

    // Broadcast human turn received event
    sseManager.broadcastToDebate(debateId!, 'human_turn_received', {
      debateId: debateId!,
      speaker,
      contentLength: trimmedContent.length,
      responseTimeMs: result.responseTimeMs,
      timestampMs: Date.now(),
    });

    logger.info(
      { debateId, speaker, contentLength: trimmedContent.length, responseTimeMs: result.responseTimeMs },
      'Human turn accepted'
    );

    res.status(201).json({
      success: true,
      debateId: debateId!,
      speaker,
      contentLength: trimmedContent.length,
      responseTimeMs: result.responseTimeMs,
      message: 'Human turn submitted successfully',
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error submitting human turn');
    res.status(500).json({
      error: 'Failed to submit human turn',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /debates/:debateId/close
 * Manually close a stalled debate (mark as completed or cancelled)
 * Used when a debate is stuck in 'live' state after server restart
 */
router.post('/debates/:debateId/close', async (req: Request, res: Response) => {
  const { debateId } = req.params;
  const { status = 'completed', reason } = req.body as {
    status?: 'completed' | 'failed';
    reason?: string;
  };

  logger.info({ debateId, status, reason }, 'Close debate request received');

  try {
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    // Only allow closing live or paused debates
    if (debate.status !== 'live' && debate.status !== 'paused') {
      res.status(400).json({
        error: 'Invalid debate status',
        message: `Cannot close debate with status: ${debate.status}. Only 'live' or 'paused' debates can be closed.`,
        currentStatus: debate.status,
      });
      return;
    }

    // Update debate status
    const finalStatus = status === 'failed' ? 'failed' : 'completed';
    await debateRepository.updateStatus(debateId!, { status: finalStatus });

    // Broadcast close event
    sseManager.broadcastToDebate(debateId!, 'debate_complete', {
      debateId,
      completedAt: new Date().toISOString(),
      reason: reason || 'Manually closed',
      wasManualClose: true,
    });

    logger.info({ debateId, finalStatus }, 'Debate manually closed');

    res.json({
      success: true,
      debateId,
      status: finalStatus,
      closedAt: new Date().toISOString(),
      reason: reason || 'Manually closed',
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error closing debate');
    res.status(500).json({
      error: 'Failed to close debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /debates/:debateId/stop
 * Stop a running debate immediately
 * Unlike close, this actually stops the orchestrator execution
 */
router.post('/debates/:debateId/stop', async (req: Request, res: Response) => {
  const { debateId } = req.params;
  const { reason } = req.body as { reason?: string };

  logger.info({ debateId, reason }, 'Stop debate request received');

  try {
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    // Only allow stopping live or paused debates
    if (debate.status !== 'live' && debate.status !== 'paused' && debate.status !== 'initializing') {
      res.status(400).json({
        error: 'Invalid debate status',
        message: `Cannot stop debate with status: ${debate.status}. Only 'live', 'paused', or 'initializing' debates can be stopped.`,
        currentStatus: debate.status,
      });
      return;
    }

    // Get the running orchestrator
    const orchestrator = orchestratorRegistry.get(debateId!);

    if (orchestrator) {
      // Stop the orchestrator - this sets the flag and broadcasts the event
      await orchestrator.stop(reason || 'User stopped debate');
      logger.info({ debateId }, 'Orchestrator stopped');
    } else {
      // No orchestrator found - debate might be stalled or running in lively mode
      // Still update the status and broadcast
      logger.warn({ debateId }, 'No orchestrator found in registry, updating status directly');

      await debateRepository.updateStatus(debateId!, { status: 'completed' });

      sseManager.broadcastToDebate(debateId!, 'debate_stopped', {
        debateId,
        stoppedAt: new Date().toISOString(),
        reason: reason || 'User stopped debate (no active orchestrator)',
      });
    }

    res.json({
      success: true,
      debateId,
      stoppedAt: new Date().toISOString(),
      reason: reason || 'User stopped debate',
      hadActiveOrchestrator: !!orchestrator,
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error stopping debate');
    res.status(500).json({
      error: 'Failed to stop debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /debates/:debateId
 * Delete a debate and all associated data
 */
router.delete('/debates/:debateId', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  try {
    const deleted = await debateRepository.deleteById(debateId!);

    if (!deleted) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    logger.info({ debateId }, 'Debate deleted');

    res.json({
      success: true,
      debateId,
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error deleting debate');
    res.status(500).json({
      error: 'Failed to delete debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// Preset Routes
// ============================================================================

/**
 * GET /presets
 * List all available debate presets (system presets)
 */
router.get('/presets', async (_req: Request, res: Response) => {
  try {
    const presets = await presetRepository.listSystemPresets();

    res.json({
      presets,
      count: presets.length,
    });
  } catch (error) {
    logger.error({ error }, 'Error listing presets');
    res.status(500).json({
      error: 'Failed to list presets',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /presets/:presetId
 * Get details for a specific preset
 */
router.get('/presets/:presetId', async (req: Request, res: Response) => {
  const { presetId } = req.params;

  try {
    const preset = await presetRepository.findById(presetId!);

    if (!preset) {
      res.status(404).json({
        error: 'Preset not found',
        presetId,
      });
      return;
    }

    res.json(preset);
  } catch (error) {
    logger.error({ presetId, error }, 'Error getting preset');
    res.status(500).json({
      error: 'Failed to get preset',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
