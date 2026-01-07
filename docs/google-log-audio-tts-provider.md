# Plan: Google Cloud Long Audio Synthesis Integration

## Goal
Add Google Cloud Text-to-Speech Long Audio Synthesis as a TTS provider option, providing reliable audio generation for long podcast scripts without the chunking/timeout issues experienced with Gemini TTS.

---

## Problem Analysis

### Current Issues with Gemini TTS
1. **Timeout issues**: Long text (>1000 chars) requires chunking, causing complexity
2. **Director's notes inconsistency**: `system_instruction` parameter doesn't reliably control voice performance across chunks
3. **Rate limits**: 30 RPM on paid tier limits throughput

### Why Google Cloud Long Audio Synthesis
| Feature | Gemini TTS | Google Cloud Long Audio |
|---------|-----------|------------------------|
| Max input | ~1000 chars (chunked) | 1MB (~1 million chars) |
| Processing | Synchronous + chunking | Asynchronous (background) |
| Audio output | Base64 inline | GCS bucket (download) |
| Timeout risk | High for long text | None (async) |
| Voice quality | Good (8 voices) | Excellent (Neural2, WaveNet, Studio) |
| Cost | ~$0.015/1K chars | ~$0.016/1K chars (Neural2) |

---

## Architecture


```
┌─────────────────────────────────────────────────────────────┐
│                   PodcastTTSAdapter                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  provider='google-cloud-long'                           ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │  GoogleCloudLongAudioService                        │││
│  │  │                                                     │││
│  │  │  1. synthesizeLongAudio() → operation ID            │││
│  │  │  2. Poll operations/{id} until DONE                 │││
│  │  │  3. Download audio from GCS bucket                  │││
│  │  │  4. Return audio buffer                             │││
│  │  └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Google Cloud Storage (GCS) │
              │  - Output bucket            │
              │  - Audio files (LINEAR16)   │
              └─────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create Long Audio Service

**New file:** `backend/src/services/audio/google-cloud-long-audio-service.ts`

Key implementation:
```typescript
export class GoogleCloudLongAudioService implements ITTSService {
  readonly provider: TTSProvider = 'google-cloud-long';

  // Authentication: service account JSON or ADC
  private readonly credentials: ServiceAccountCredentials;
  private readonly projectId: string;
  private readonly outputBucket: string;

  async generateSpeech(text: string, voiceType: VoiceType): Promise<TTSResult> {
    // 1. Call synthesizeLongAudio
    const operation = await this.startLongAudioSynthesis(text, voice);

    // 2. Poll until complete
    await this.waitForOperation(operation.name);

    // 3. Download from GCS
    const audioBuffer = await this.downloadFromGCS(operation.outputUri);

    // 4. Convert LINEAR16 to MP3
    return this.convertToMp3(audioBuffer);
  }
}
```

### Step 2: Add GCS Helper

**New file:** `backend/src/services/audio/gcs-helper.ts`

Simple GCS operations:
- `downloadFile(bucket, path)` - Download audio result
- `deleteFile(bucket, path)` - Clean up after download

### Step 3: Update Types

**Modify:** `backend/src/services/audio/types.ts`

Add provider type:
```typescript
export type TTSProvider =
  | 'elevenlabs'
  | 'gemini'
  | 'google-cloud'
  | 'google-cloud-long'  // NEW
  | 'azure'
  | 'edge';
```

Add provider metadata:
```typescript
'google-cloud-long': {
  name: 'Google Cloud Long Audio',
  quality: 'premium',
  freeCharactersPerMonth: 1_000_000,
  requiresApiKey: true,
  envVarName: 'GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON',
  description: 'Async synthesis for long content, outputs to GCS',
}
```

### Step 4: Update Provider Factory

**Modify:** `backend/src/services/audio/tts-provider-factory.ts`

Add to `getAvailableProviders()`:
```typescript
if (process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON &&
    process.env.GOOGLE_CLOUD_TTS_BUCKET) {
  providers.push('google-cloud-long');
}
```

Add to `createTTSService()`:
```typescript
case 'google-cloud-long':
  return new GoogleCloudLongAudioService({
    serviceAccountJson: process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON,
    bucket: process.env.GOOGLE_CLOUD_TTS_BUCKET,
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  });
```

### Step 5: Update TTS Adapter

**Modify:** `backend/src/services/podcast/podcast-tts-adapter.ts`

Add cost calculation:
```typescript
case 'google-cloud-long':
  return characters * 0.000016; // $16/1M chars for Neural2
```

### Step 6: Add Environment Variables

**Modify:** `backend/.env.example`

```bash
# Google Cloud Long Audio Synthesis
# Service account JSON with TTS and GCS permissions (paste JSON or path)
GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON=
# GCS bucket for audio output (must exist, service account needs write access)
GOOGLE_CLOUD_TTS_BUCKET=clearside-tts-output
# Project ID (usually extracted from service account JSON)
GOOGLE_CLOUD_PROJECT_ID=
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `backend/src/services/audio/google-cloud-long-audio-service.ts` | Long Audio Synthesis implementation |
| `backend/src/services/audio/gcs-helper.ts` | GCS download/cleanup utilities |

## Files to Modify

| File | Changes |
|------|---------|
| `backend/src/services/audio/types.ts` | Add `'google-cloud-long'` provider type and metadata |
| `backend/src/services/audio/tts-provider-factory.ts` | Instantiate Long Audio service |
| `backend/src/services/podcast/podcast-tts-adapter.ts` | Add cost calculation |
| `backend/.env.example` | Document required env vars |

---

## Voice Configuration

Use same voices as standard Google Cloud TTS (Neural2):

```typescript
export const GOOGLE_CLOUD_LONG_VOICE_PROFILES: VoiceProfiles = {
  pro: { voiceId: 'en-US-Neural2-F', name: 'Pro Advocate', ... },
  con: { voiceId: 'en-US-Neural2-D', name: 'Con Advocate', ... },
  moderator: { voiceId: 'en-US-Neural2-C', name: 'Moderator', ... },
  narrator: { voiceId: 'en-US-Neural2-A', name: 'Narrator', ... },
};
```

---

## API Flow

### 1. Start Synthesis
```http
POST https://texttospeech.googleapis.com/v1/text:synthesizeLongAudio
Authorization: Bearer {access_token}

{
  "parent": "projects/{project}/locations/{location}",
  "output_gcs_uri": "gs://{bucket}/audio/{job_id}.wav",
  "input": { "text": "Full podcast script..." },
  "voice": { "languageCode": "en-US", "name": "en-US-Neural2-F" },
  "audioConfig": { "audioEncoding": "LINEAR16", "sampleRateHertz": 24000 }
}
```

Response:
```json
{ "name": "projects/.../operations/12345", "metadata": {...} }
```

### 2. Poll Operation
```http
GET https://texttospeech.googleapis.com/v1/operations/{operation_id}
```

Response (when complete):
```json
{ "name": "...", "done": true, "response": { "outputGcsUri": "gs://..." } }
```

### 3. Download from GCS
```http
GET https://storage.googleapis.com/{bucket}/audio/{job_id}.wav
Authorization: Bearer {access_token}
```

---

## Error Handling

1. **Operation timeout**: Poll with exponential backoff, max 10 minutes
2. **GCS access denied**: Check service account permissions
3. **Quota exceeded**: Fallback to chunked Gemini or ElevenLabs
4. **Audio conversion failure**: Keep WAV if MP3 conversion fails

---

## Prerequisites

### GCS Bucket Setup
```bash
# Create bucket (one-time)
gsutil mb -l us-central1 gs://clearside-tts-output

# Grant service account access
gsutil iam ch serviceAccount:tts-service@project.iam.gserviceaccount.com:objectCreator gs://clearside-tts-output
gsutil iam ch serviceAccount:tts-service@project.iam.gserviceaccount.com:objectViewer gs://clearside-tts-output
```

### Service Account Permissions
- `roles/texttospeech.synthesizer` - TTS API access
- `roles/storage.objectCreator` - Write to GCS bucket
- `roles/storage.objectViewer` - Read audio files

---

## Testing Plan

1. **Unit tests**: Mock GCS and TTS API responses
2. **Integration test**: Generate short audio, verify GCS cleanup
3. **E2E test**: Full podcast generation with Long Audio provider
4. **Performance test**: Compare generation time vs Gemini chunking

---

## Implementation Order

1. Create `GoogleCloudLongAudioService` skeleton with interface methods
2. Implement OAuth2 token generation from service account JSON
3. Implement `synthesizeLongAudio` API call
4. Implement operation polling with backoff
5. Create GCS helper for download and cleanup
6. Add LINEAR16 to MP3 conversion (reuse Gemini's ffmpeg logic)
7. Wire up in provider factory
8. Update adapter with cost calculation
9. Test with actual podcast generation

---

## Comparison: When to Use Each Provider

| Scenario | Recommended Provider |
|----------|---------------------|
| Short segments (<1000 chars) | Gemini (fastest) |
| Long segments (>5000 chars) | Google Cloud Long Audio |
| Highest quality voices | ElevenLabs |
| Free tier / testing | Edge TTS |
| Director's notes needed | Gemini (with system_instruction) |
