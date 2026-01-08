/**
 * External Service Testing Utilities
 *
 * Provides status and test helpers for external integrations.
 */

import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import axios from 'axios';
import { Pinecone } from '@pinecone-database/pinecone';
import {
  createAccessToken,
  parseServiceAccountJson,
  type ServiceAccountCredentials,
} from '../audio/google-cloud-auth.js';

const exec = promisify(execCallback);

export type ExternalServiceId =
  | 'elevenlabs'
  | 'gemini'
  | 'google-cloud-tts'
  | 'google-cloud-long'
  | 'azure-tts'
  | 'edge-tts'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'listen-notes'
  | 'pinecone';

export type ExternalServiceCategory = 'tts' | 'llm' | 'research';

export interface ExternalServiceField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'textarea';
  required?: boolean;
  placeholder?: string;
  hint?: string;
}

export interface ExternalServiceDefinition {
  id: ExternalServiceId;
  name: string;
  category: ExternalServiceCategory;
  description: string;
  envVars: string[];
  requiredEnvVars: string[];
  fields: ExternalServiceField[];
}

export interface ExternalServiceStatus extends ExternalServiceDefinition {
  configured: boolean;
  credentialPreview?: string;
  details?: Record<string, string | number | boolean | undefined>;
}

export interface ExternalServiceTestInput {
  apiKey?: string;
  baseUrl?: string;
  region?: string;
  modelId?: string;
  serviceAccountJson?: string;
  bucket?: string;
  projectId?: string;
  location?: string;
  indexName?: string;
}

export interface ExternalServiceTestResult {
  ok: boolean;
  message: string;
  details?: Record<string, string | number | boolean | undefined>;
}

const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';
const DEFAULT_ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const DEFAULT_OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const SERVICE_DEFINITIONS: ExternalServiceDefinition[] = [
  {
    id: 'elevenlabs',
    name: 'ElevenLabs TTS',
    category: 'tts',
    description: 'Premium AI voices with emotion control.',
    envVars: ['ELEVENLABS_API_KEY'],
    requiredEnvVars: ['ELEVENLABS_API_KEY'],
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 'elevenlabs_api_key',
      },
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini 2.5 TTS',
    category: 'tts',
    description: 'Google AI Studio TTS (Gemini 2.5).',
    envVars: ['GOOGLE_AI_API_KEY'],
    requiredEnvVars: ['GOOGLE_AI_API_KEY'],
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 'google_ai_api_key',
      },
      {
        name: 'modelId',
        label: 'Model ID (optional)',
        type: 'text',
        placeholder: 'gemini-2.5-flash-preview-tts',
      },
    ],
  },
  {
    id: 'google-cloud-tts',
    name: 'Google Cloud TTS (API Key)',
    category: 'tts',
    description: 'WaveNet/Neural2 voices using API key auth.',
    envVars: ['GOOGLE_CLOUD_API_KEY'],
    requiredEnvVars: ['GOOGLE_CLOUD_API_KEY'],
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 'google_cloud_api_key',
      },
    ],
  },
  {
    id: 'google-cloud-long',
    name: 'Google Cloud Long Audio',
    category: 'tts',
    description: 'Async long audio synthesis with GCS output.',
    envVars: ['GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON', 'GOOGLE_CLOUD_TTS_BUCKET'],
    requiredEnvVars: ['GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON', 'GOOGLE_CLOUD_TTS_BUCKET'],
    fields: [
      {
        name: 'serviceAccountJson',
        label: 'Service Account JSON',
        type: 'textarea',
        placeholder: 'Paste JSON, base64:..., or file path',
      },
      {
        name: 'bucket',
        label: 'GCS Bucket',
        type: 'text',
        placeholder: 'your-tts-bucket',
      },
      {
        name: 'location',
        label: 'Location (optional)',
        type: 'text',
        placeholder: 'us-central1',
      },
    ],
  },
  {
    id: 'azure-tts',
    name: 'Azure Speech TTS',
    category: 'tts',
    description: 'Azure Neural TTS voices.',
    envVars: ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'],
    requiredEnvVars: ['AZURE_SPEECH_KEY'],
    fields: [
      {
        name: 'apiKey',
        label: 'Subscription Key',
        type: 'password',
        placeholder: 'azure_speech_key',
      },
      {
        name: 'region',
        label: 'Region (optional)',
        type: 'text',
        placeholder: 'eastus',
      },
    ],
  },
  {
    id: 'edge-tts',
    name: 'Edge TTS (Local)',
    category: 'tts',
    description: 'Python edge-tts package availability check.',
    envVars: [],
    requiredEnvVars: [],
    fields: [],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'llm',
    description: 'OpenAI API connectivity test.',
    envVars: ['OPENAI_API_KEY', 'OPENAI_BASE_URL'],
    requiredEnvVars: ['OPENAI_API_KEY'],
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 'openai_api_key',
      },
      {
        name: 'baseUrl',
        label: 'Base URL (optional)',
        type: 'text',
        placeholder: DEFAULT_OPENAI_BASE,
      },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    category: 'llm',
    description: 'Anthropic API connectivity test.',
    envVars: ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL'],
    requiredEnvVars: ['ANTHROPIC_API_KEY'],
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 'anthropic_api_key',
      },
      {
        name: 'baseUrl',
        label: 'Base URL (optional)',
        type: 'text',
        placeholder: DEFAULT_ANTHROPIC_BASE,
      },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    category: 'llm',
    description: 'OpenRouter model catalog connectivity.',
    envVars: ['OPENROUTER_API_KEY'],
    requiredEnvVars: ['OPENROUTER_API_KEY'],
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 'openrouter_api_key',
      },
      {
        name: 'baseUrl',
        label: 'Base URL (optional)',
        type: 'text',
        placeholder: DEFAULT_OPENROUTER_BASE,
      },
    ],
  },
  {
    id: 'listen-notes',
    name: 'Listen Notes',
    category: 'research',
    description: 'Trending podcast data provider.',
    envVars: ['LISTEN_NOTES_API_KEY'],
    requiredEnvVars: ['LISTEN_NOTES_API_KEY'],
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 'listen_notes_api_key',
      },
    ],
  },
  {
    id: 'pinecone',
    name: 'Pinecone',
    category: 'research',
    description: 'Vector DB connectivity test.',
    envVars: ['PINECONE_API_KEY', 'PINECONE_INDEX_NAME'],
    requiredEnvVars: ['PINECONE_API_KEY'],
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 'pinecone_api_key',
      },
      {
        name: 'indexName',
        label: 'Index Name (optional)',
        type: 'text',
        placeholder: 'duelogic-research',
      },
    ],
  },
];

function maskSecret(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return `${'*'.repeat(trimmed.length)}`;
  }
  if (trimmed.length <= 12) {
    return `${trimmed.slice(0, 4)}…${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

function buildServiceAccountPreview(credentials: ServiceAccountCredentials): string {
  const email = credentials.client_email || 'unknown';
  const keyIdPreview = maskSecret(credentials.private_key_id) || 'unknown';
  return `${email} (${keyIdPreview})`;
}

export function listExternalServiceStatuses(): ExternalServiceStatus[] {
  return SERVICE_DEFINITIONS.map((definition) => {
    let credentialPreview: string | undefined;
    const details: Record<string, string | number | boolean | undefined> = {};

    if (definition.id === 'google-cloud-long') {
      const serviceAccount = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON;
      if (serviceAccount) {
        try {
          const credentials = parseServiceAccountJson(serviceAccount);
          credentialPreview = buildServiceAccountPreview(credentials);
          details.projectId = credentials.project_id;
        } catch {
          credentialPreview = 'Invalid service account JSON';
        }
      }
      details.bucket = process.env.GOOGLE_CLOUD_TTS_BUCKET || undefined;
    } else {
      const envKey = definition.envVars.find((envVar) => envVar.endsWith('API_KEY') || envVar.endsWith('KEY'));
      if (envKey) {
        credentialPreview = maskSecret(process.env[envKey]);
      }
    }

    if (definition.id === 'azure-tts') {
      details.region = process.env.AZURE_SPEECH_REGION || 'eastus';
    }

    if (definition.id === 'openai') {
      details.baseUrl = process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE;
    }

    if (definition.id === 'anthropic') {
      details.baseUrl = process.env.ANTHROPIC_BASE_URL || DEFAULT_ANTHROPIC_BASE;
    }

    if (definition.id === 'openrouter') {
      details.baseUrl = DEFAULT_OPENROUTER_BASE;
    }

    if (definition.id === 'pinecone') {
      details.indexName = process.env.PINECONE_INDEX_NAME || undefined;
    }

    const configured = definition.requiredEnvVars.every((envVar) => !!process.env[envVar]);

    return {
      ...definition,
      configured,
      credentialPreview,
      details: Object.keys(details).length > 0 ? details : undefined,
    };
  });
}

export async function runExternalServiceTest(
  serviceId: ExternalServiceId,
  input: ExternalServiceTestInput
): Promise<ExternalServiceTestResult> {
  switch (serviceId) {
    case 'elevenlabs': {
      const apiKey = input.apiKey || process.env.ELEVENLABS_API_KEY;
      if (!apiKey) throw new Error('Missing ElevenLabs API key');
      const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': apiKey },
      });
      const voiceCount = response.data?.voices?.length || 0;
      return {
        ok: true,
        message: `Fetched ${voiceCount} voices from ElevenLabs.`,
        details: { voiceCount },
      };
    }

    case 'gemini': {
      const apiKey = input.apiKey || process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) throw new Error('Missing Google AI API key');
      if (input.modelId) {
        const response = await axios.get(
          `https://generativelanguage.googleapis.com/v1beta/models/${input.modelId}`,
          {
            params: { key: apiKey },
          }
        );
        return {
          ok: true,
          message: `Model ${response.data?.name || input.modelId} is reachable.`,
          details: { modelId: response.data?.name || input.modelId },
        };
      }

      const response = await axios.get(
        'https://generativelanguage.googleapis.com/v1beta/models',
        {
          params: { key: apiKey },
        }
      );
      const modelCount = response.data?.models?.length || 0;
      return {
        ok: true,
        message: `Fetched ${modelCount} Gemini models.`,
        details: { modelCount },
      };
    }

    case 'google-cloud-tts': {
      const apiKey = input.apiKey || process.env.GOOGLE_CLOUD_API_KEY;
      if (!apiKey) throw new Error('Missing Google Cloud API key');
      const response = await axios.get('https://texttospeech.googleapis.com/v1/voices', {
        params: { key: apiKey, languageCode: 'en-US' },
      });
      const voiceCount = response.data?.voices?.length || 0;
      return {
        ok: true,
        message: `Fetched ${voiceCount} Google Cloud voices.`,
        details: { voiceCount },
      };
    }

    case 'google-cloud-long': {
      const serviceAccountJson =
        input.serviceAccountJson || process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON;
      const bucket = input.bucket || process.env.GOOGLE_CLOUD_TTS_BUCKET;
      const location = input.location || 'us-central1';
      if (!serviceAccountJson) throw new Error('Missing service account JSON');
      if (!bucket) throw new Error('Missing GCS bucket');

      const credentials = parseServiceAccountJson(serviceAccountJson);
      const token = await createAccessToken(credentials);
      const accessToken = token.accessToken;

      const voicesResponse = await axios.get('https://texttospeech.googleapis.com/v1/voices', {
        params: { languageCode: 'en-US' },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const voiceCount = voicesResponse.data?.voices?.length || 0;

      const bucketResponse = await axios.get(
        `https://storage.googleapis.com/storage/v1/b/${bucket}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      return {
        ok: true,
        message: `Verified Google Cloud Long Audio access (${voiceCount} voices).`,
        details: {
          voiceCount,
          bucket: bucketResponse.data?.name || bucket,
          location,
          projectId: input.projectId || credentials.project_id,
        },
      };
    }

    case 'azure-tts': {
      const apiKey = input.apiKey || process.env.AZURE_SPEECH_KEY;
      if (!apiKey) throw new Error('Missing Azure Speech key');
      const region = input.region || process.env.AZURE_SPEECH_REGION || 'eastus';
      const response = await axios.get(
        `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': apiKey,
          },
        }
      );
      const voiceCount = response.data?.length || 0;
      return {
        ok: true,
        message: `Fetched ${voiceCount} Azure voices.`,
        details: { voiceCount, region },
      };
    }

    case 'edge-tts': {
      try {
        await exec('python3 -c "import edge_tts"');
        return {
          ok: true,
          message: 'edge-tts is available via python3.',
          details: { python: 'python3' },
        };
      } catch {
        await exec('python -c "import edge_tts"');
        return {
          ok: true,
          message: 'edge-tts is available via python.',
          details: { python: 'python' },
        };
      }
    }

    case 'openai': {
      const apiKey = input.apiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('Missing OpenAI API key');
      const baseUrl = input.baseUrl || process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE;
      const response = await axios.get(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const modelCount = response.data?.data?.length || 0;
      return {
        ok: true,
        message: `Fetched ${modelCount} OpenAI models.`,
        details: { modelCount, baseUrl },
      };
    }

    case 'anthropic': {
      const apiKey = input.apiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('Missing Anthropic API key');
      const baseUrl = input.baseUrl || process.env.ANTHROPIC_BASE_URL || DEFAULT_ANTHROPIC_BASE;
      const response = await axios.get(`${baseUrl}/models`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      const modelCount = response.data?.data?.length || 0;
      return {
        ok: true,
        message: `Fetched ${modelCount} Anthropic models.`,
        details: { modelCount, baseUrl },
      };
    }

    case 'openrouter': {
      const apiKey = input.apiKey || process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error('Missing OpenRouter API key');
      const baseUrl = input.baseUrl || DEFAULT_OPENROUTER_BASE;
      const response = await axios.get(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const modelCount = response.data?.data?.length || 0;
      return {
        ok: true,
        message: `Fetched ${modelCount} OpenRouter models.`,
        details: { modelCount, baseUrl },
      };
    }

    case 'listen-notes': {
      const apiKey = input.apiKey || process.env.LISTEN_NOTES_API_KEY;
      if (!apiKey) throw new Error('Missing Listen Notes API key');
      const response = await axios.get('https://listen-api.listennotes.com/api/v2/genres', {
        headers: { 'X-ListenAPI-Key': apiKey },
      });
      const genreCount = response.data?.genres?.length || 0;
      return {
        ok: true,
        message: `Fetched ${genreCount} Listen Notes genres.`,
        details: { genreCount },
      };
    }

    case 'pinecone': {
      const apiKey = input.apiKey || process.env.PINECONE_API_KEY;
      if (!apiKey) throw new Error('Missing Pinecone API key');
      const indexName = input.indexName || process.env.PINECONE_INDEX_NAME;
      const client = new Pinecone({ apiKey });

      if (indexName) {
        const index = client.index(indexName);
        const stats = await index.describeIndexStats();
        return {
          ok: true,
          message: `Pinecone index '${indexName}' reachable.`,
          details: {
            indexName,
            namespaces: Object.keys(stats.namespaces || {}).length,
          },
        };
      }

      const indexes = await client.listIndexes();
      const indexCount = indexes?.indexes?.length || 0;
      return {
        ok: true,
        message: `Fetched ${indexCount} Pinecone indexes.`,
        details: { indexCount },
      };
    }

    default:
      throw new Error(`Unsupported service: ${serviceId}`);
  }
}
