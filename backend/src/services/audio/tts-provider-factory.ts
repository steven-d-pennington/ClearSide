/**
 * TTS Provider Factory
 *
 * Creates the appropriate TTS service based on provider selection.
 * Supports ElevenLabs, Gemini, Google Cloud, Azure, and Edge TTS.
 *
 * @see types.ts for TTSProvider enum and ITTSService interface
 */

import pino from 'pino';
import type { TTSProvider, ITTSService, TTSProviderInfo } from './types.js';
import { ElevenLabsService, createElevenLabsService } from './elevenlabs-service.js';
import { GeminiTTSService, createGeminiTTSService } from './gemini-tts-service.js';
import { VertexTTSService, createVertexTTSService } from './vertex-tts-service.js';
import { GoogleCloudTTSService, createGoogleCloudTTSService } from './google-cloud-tts-service.js';
import { GoogleCloudLongAudioService, createGoogleCloudLongAudioService } from './google-cloud-long-audio-service.js';
import { AzureTTSService, createAzureTTSService } from './azure-tts-service.js';
import { EdgeTTSService, createEdgeTTSService } from './edge-tts-service.js';

const logger = pino({
  name: 'tts-provider-factory',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Check which TTS providers are available based on environment configuration
 */
export function getAvailableProviders(): TTSProvider[] {
  const available: TTSProvider[] = [];

  // ElevenLabs
  if (process.env.ELEVENLABS_API_KEY) {
    available.push('elevenlabs');
  }

  // Gemini (Google AI Studio)
  if (process.env.GOOGLE_AI_API_KEY) {
    available.push('gemini');
  }

  // Vertex AI (Gemini via service account)
  if (process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON) {
    available.push('vertex');
  }

  // Google Cloud TTS
  if (process.env.GOOGLE_CLOUD_API_KEY) {
    available.push('google-cloud');
  }

  // Google Cloud Long Audio (requires service account + GCS bucket)
  if (process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_CLOUD_TTS_BUCKET) {
    available.push('google-cloud-long');
  }

  // Azure Speech Services
  if (process.env.AZURE_SPEECH_KEY) {
    available.push('azure');
  }

  // Edge TTS is always available (no API key needed)
  available.push('edge');

  logger.debug({ available }, 'Available TTS providers');
  return available;
}

/**
 * Get the default TTS provider based on available configuration
 *
 * Priority order:
 * 1. Vertex AI (Gemini 2.5 Flash Lite Preview - premium quality, fast)
 * 2. Google Cloud Long Audio (async, no chunking needed, high quality)
 * 3. ElevenLabs (premium quality)
 * 4. Gemini (premium quality via AI Studio, but requires chunking)
 * 5. Azure (high quality, good free tier)
 * 6. Google Cloud (high quality, good free tier)
 * 7. Edge (free, no API key needed)
 */
export function getDefaultProvider(): TTSProvider {
  // Prefer Vertex AI - Gemini 2.5 Flash Lite Preview TTS
  if (process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON) {
    return 'vertex';
  }
  // Fallback to Google Cloud Long Audio - async synthesis, no chunking needed
  if (process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_CLOUD_TTS_BUCKET) {
    return 'google-cloud-long';
  }
  if (process.env.ELEVENLABS_API_KEY) return 'elevenlabs';
  if (process.env.GOOGLE_AI_API_KEY) return 'gemini';
  if (process.env.AZURE_SPEECH_KEY) return 'azure';
  if (process.env.GOOGLE_CLOUD_API_KEY) return 'google-cloud';
  return 'edge';
}

/**
 * Create a TTS service for the specified provider
 *
 * @param provider - TTS provider to use
 * @returns TTS service instance implementing ITTSService
 * @throws Error if provider is not available
 */
export function createTTSService(provider: TTSProvider): ITTSService {
  logger.info({ provider }, 'Creating TTS service');

  switch (provider) {
    case 'elevenlabs': {
      if (!process.env.ELEVENLABS_API_KEY) {
        throw new Error(
          'ELEVENLABS_API_KEY is required for ElevenLabs TTS. ' +
            'Set the environment variable or choose a different provider.'
        );
      }
      return createElevenLabsService() as unknown as ITTSService;
    }

    case 'gemini': {
      if (!process.env.GOOGLE_AI_API_KEY) {
        throw new Error(
          'GOOGLE_AI_API_KEY is required for Gemini TTS. ' +
            'Set the environment variable or choose a different provider.'
        );
      }
      return createGeminiTTSService();
    }

    case 'vertex': {
      if (!process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON) {
        throw new Error(
          'GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON is required for Vertex AI TTS. ' +
            'Set the environment variable with your service account JSON.'
        );
      }
      return createVertexTTSService();
    }

    case 'google-cloud': {
      if (!process.env.GOOGLE_CLOUD_API_KEY) {
        throw new Error(
          'GOOGLE_CLOUD_API_KEY is required for Google Cloud TTS. ' +
            'Set the environment variable or choose a different provider.'
        );
      }
      return createGoogleCloudTTSService();
    }

    case 'google-cloud-long': {
      if (!process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON) {
        throw new Error(
          'GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON is required for Google Cloud Long Audio. ' +
            'Set the environment variable with your service account JSON.'
        );
      }
      if (!process.env.GOOGLE_CLOUD_TTS_BUCKET) {
        throw new Error(
          'GOOGLE_CLOUD_TTS_BUCKET is required for Google Cloud Long Audio. ' +
            'Set the environment variable with your GCS bucket name.'
        );
      }
      return createGoogleCloudLongAudioService();
    }

    case 'azure': {
      if (!process.env.AZURE_SPEECH_KEY) {
        throw new Error(
          'AZURE_SPEECH_KEY is required for Azure TTS. ' +
            'Set the environment variable or choose a different provider.'
        );
      }
      return createAzureTTSService();
    }

    case 'edge': {
      // Edge TTS doesn't require API key
      return createEdgeTTSService();
    }

    default:
      throw new Error(`Unknown TTS provider: ${provider}`);
  }
}

/**
 * Get a cached TTS service (singleton pattern per provider)
 */
const serviceCache = new Map<TTSProvider, ITTSService>();

export function getTTSService(provider: TTSProvider): ITTSService {
  const cached = serviceCache.get(provider);
  if (cached) {
    return cached;
  }

  const service = createTTSService(provider);
  serviceCache.set(provider, service);
  return service;
}

/**
 * Clear the service cache (useful for testing)
 */
export function clearServiceCache(): void {
  serviceCache.clear();
}

/**
 * Validate that a provider is available
 */
export function isProviderAvailable(provider: TTSProvider): boolean {
  return getAvailableProviders().includes(provider);
}

/**
 * Get provider information with availability status
 */
export function getProvidersWithStatus(): Array<
  TTSProviderInfo & { available: boolean }
> {
  const available = getAvailableProviders();

  // Import TTS_PROVIDERS from types
  const TTS_PROVIDERS: Record<TTSProvider, TTSProviderInfo> = {
    elevenlabs: {
      id: 'elevenlabs',
      name: 'ElevenLabs',
      description: 'Premium AI voices with exceptional quality and emotion',
      freeTier: '10,000 chars/month (non-commercial)',
      quality: 'premium',
      requiresApiKey: true,
      envVar: 'ELEVENLABS_API_KEY',
    },
    gemini: {
      id: 'gemini',
      name: 'Google Gemini TTS',
      description: 'Gemini 2.5 native TTS with multi-speaker support',
      freeTier: 'Pay-as-you-go (low cost)',
      quality: 'premium',
      requiresApiKey: true,
      envVar: 'GOOGLE_AI_API_KEY',
    },
    vertex: {
      id: 'vertex',
      name: 'Vertex AI TTS',
      description: 'Gemini 2.5 Flash Lite Preview TTS via Vertex AI',
      freeTier: 'Pay-as-you-go (service account required)',
      quality: 'premium',
      requiresApiKey: true,
      envVar: 'GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON',
    },
    'google-cloud': {
      id: 'google-cloud',
      name: 'Google Cloud TTS',
      description: 'Google WaveNet and Neural2 voices',
      freeTier: '1M chars/month free',
      quality: 'high',
      requiresApiKey: true,
      envVar: 'GOOGLE_CLOUD_API_KEY',
    },
    'google-cloud-long': {
      id: 'google-cloud-long',
      name: 'Google Cloud Long Audio',
      description: 'Async synthesis for long content (up to 1MB), outputs to GCS',
      freeTier: '1M chars/month free',
      quality: 'high',
      requiresApiKey: true,
      envVar: 'GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON',
    },
    azure: {
      id: 'azure',
      name: 'Microsoft Azure TTS',
      description: 'Azure Cognitive Services Neural TTS',
      freeTier: '500K chars/month free',
      quality: 'high',
      requiresApiKey: true,
      envVar: 'AZURE_SPEECH_KEY',
    },
    edge: {
      id: 'edge',
      name: 'Edge TTS (Free)',
      description: 'Microsoft Edge browser TTS - completely free',
      freeTier: 'Unlimited (no API key needed)',
      quality: 'good',
      requiresApiKey: false,
    },
  };

  return Object.values(TTS_PROVIDERS).map((info) => ({
    ...info,
    available: available.includes(info.id),
  }));
}

// Re-export types
export type { TTSProvider, ITTSService, TTSProviderInfo };

// Re-export service classes for direct use if needed
export {
  ElevenLabsService,
  GeminiTTSService,
  VertexTTSService,
  GoogleCloudTTSService,
  GoogleCloudLongAudioService,
  AzureTTSService,
  EdgeTTSService,
};
