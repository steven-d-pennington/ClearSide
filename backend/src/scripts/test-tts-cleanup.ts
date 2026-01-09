/**
 * Test script to verify TTS cleanup and audio generation
 * Run with: npx tsx src/scripts/test-tts-cleanup.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createGoogleCloudLongAudioService } from '../services/audio/google-cloud-long-audio-service.js';

// Test content with problematic elements that were being spoken literally
const testContent = `
*nods slowly, then leans forward with interest*

Professor Chen: Well, this is fascinating. *adjusts glasses* The key point here is: artificial intelligence has transformed our world.

*sighs thoughtfully*

However, we need to be careful. The implications are:
1. Economic disruption
2. Ethical concerns
3. Privacy issues

[pauses for effect]

As I mentioned before... (clears throat) the data shows that AI adoption is accelerating.

Viktor: *skeptically raises eyebrow* But where's the evidence? I'd like to see the numbers: specifically the ROI data.

<break time="3s"/>

Let me emphasize this point <emphasis level="strong">very strongly</emphasis>.

The URL https://example.com/report shows more details.

In conclusion—and this is crucial—we must proceed carefully. The e.g. case studies and i.e. examples we discussed show that ML and AI systems need oversight.
`;

// Replicated cleanForTTS function to test
function cleanForTTS(content: string): string {
  // FIRST: Remove action tags like *nods slowly*, *sighs*, *leans forward*, etc.
  content = content.replace(/\*[^*]+\*/g, '');

  // Remove markdown bold formatting (double asterisks)
  content = content.replace(/\*\*/g, '');

  // Remove any remaining single asterisks
  content = content.replace(/\*/g, '');

  // Remove backticks (code formatting)
  content = content.replace(/`/g, '');

  // Remove markdown headers
  content = content.replace(/#{1,6}\s*/g, '');

  // Remove bullet points and numbered lists
  content = content.replace(/^\s*[-*+]\s+/gm, '');
  content = content.replace(/^\s*\d+\.\s+/gm, '');

  // Remove parenthetical stage directions like (pauses), (sighs), (laughs)
  content = content.replace(/\([^)]*(?:pause|sigh|laugh|nod|smile|lean|gesture|adjust|clear|look|turn|shake)[^)]*\)/gi, '');

  // Remove square bracket stage directions like [pauses], [sighs]
  content = content.replace(/\[[^\]]*(?:pause|sigh|laugh|nod|smile|lean|gesture|adjust|clear|look|turn|shake)[^\]]*\]/gi, '');

  // Clean up URLs FIRST (before colon replacement damages them)
  content = content.replace(/https?:\/\/[^\s]+/g, '');

  // Clean up colons that might be read as "colon" - replace speaker labels at start
  content = content.replace(/^[A-Z][a-zA-Z\s]+:\s*/gm, '');

  // Replace standalone colons with natural pauses
  content = content.replace(/\s*:\s*/g, ', ');

  // Expand common abbreviations for natural speech
  content = content.replace(/\bAI\b/g, 'A.I.');
  content = content.replace(/\bML\b/g, 'M.L.');
  content = content.replace(/\be\.g\./g, 'for example');
  content = content.replace(/\bi\.e\./g, 'that is');
  content = content.replace(/\betc\./g, 'et cetera');
  content = content.replace(/\bvs\./g, 'versus');
  content = content.replace(/\bw\/\b/g, 'with');
  content = content.replace(/\bw\/o\b/g, 'without');

  // Remove any SSML-like tags that might have slipped through
  content = content.replace(/<[^>]+>/g, '');

  // Normalize quotation marks for TTS
  content = content.replace(/[""]/g, '"');
  content = content.replace(/['']/g, "'");

  // Clean up multiple spaces and normalize whitespace
  content = content.replace(/\s+/g, ' ').trim();

  // Clean up orphaned punctuation from removals
  content = content.replace(/\s+([,.])/g, '$1');
  content = content.replace(/([,.])\s*\1+/g, '$1'); // Remove duplicate punctuation
  content = content.replace(/^\s*[,.]\s*/g, ''); // Remove leading punctuation

  return content;
}

async function main() {
  console.log('=== TTS Cleanup Test ===\n');

  console.log('ORIGINAL CONTENT:');
  console.log('─'.repeat(50));
  console.log(testContent);
  console.log('─'.repeat(50));

  const cleanedContent = cleanForTTS(testContent);

  console.log('\nCLEANED CONTENT:');
  console.log('─'.repeat(50));
  console.log(cleanedContent);
  console.log('─'.repeat(50));

  // Check for required env vars
  if (!process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON) {
    console.error('ERROR: GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON not set');
    process.exit(1);
  }
  if (!process.env.GOOGLE_CLOUD_TTS_BUCKET) {
    console.error('ERROR: GOOGLE_CLOUD_TTS_BUCKET not set');
    process.exit(1);
  }

  // Create TTS service
  const ttsService = createGoogleCloudLongAudioService();

  console.log('\nGenerating audio with Google Cloud Long Audio API...');

  try {
    const result = await ttsService.generateSpeech(cleanedContent, 'narrator');

    if (result.audioBuffer && result.audioBuffer.length > 0) {
      const outputPath = path.join(process.cwd(), 'exports', 'tts-test-output.mp3');

      // Ensure exports directory exists
      const exportsDir = path.dirname(outputPath);
      if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, result.audioBuffer);
      console.log(`\n✅ Audio saved to: ${outputPath}`);
      console.log(`   Duration: ${Math.round(result.durationMs / 1000)}s`);
      console.log(`   Characters: ${result.charactersUsed}`);
      console.log(`\nPlease listen to the audio file to verify the cleanup works correctly.`);
    } else {
      console.error('ERROR: No audio content in response');
    }
  } catch (error) {
    console.error('ERROR generating audio:', error);
    process.exit(1);
  }
}

main().catch(console.error);
