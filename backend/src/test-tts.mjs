// Quick test script to generate TTS audio for a single segment
import { createGoogleCloudLongAudioService } from './services/audio/google-cloud-long-audio-service.js';
import fs from 'fs';

const text = `And that brings us to the close of today's debate on the fourteenth amendment... and its interpretation regarding citizenship for children born on United States soil.

From the Pragmatic Chair... Claude Haiku four point five... we heard a compelling argument for institutional self-respect. This perspective emphasized the importance of allowing the courts to acknowledge the limitations of the fourteenth amendment... while insisting that Congress step up to its legislative responsibilities. The argument highlighted that citizenship decisions... if left to fluctuate based on judicial reinterpretation alone... could create a destabilizing precedent... ultimately undermining the very institutions we depend on.

From the Precautionary Chair... Google Gemini three Flash Preview... we heard a principled defense of birthright citizenship as a constitutional bright line. This perspective argued that the fourteenth amendment's text and history clearly establish a rule of jus soli... and that any deviation would risk irreversible harm to millions of American born citizens... while opening the door to discriminatory enforcement. The argument emphasized that constitutional principles should not be traded for administrative convenience.

Where did we find common ground?... Both sides acknowledged that congressional action would be preferable to judicial reinterpretation. Both recognized the profound human stakes involved. And both showed a commitment to constitutional legitimacy... even as they disagreed sharply on what that legitimacy requires.

Where do the hard choices remain?... The fundamental tension between institutional modesty and constitutional fidelity remains unresolved. The pragmatic view asks us to accept uncertainty in the short term... trusting future legislatures to act justly. The precautionary view warns that such trust is misplaced... and that constitutional protections must be defended now... or risk being lost forever.

As always on Duel-Logic... we don't tell you what to think. We show you how to think... carefully... rigorously... and with respect for those who disagree.

Until next time... keep questioning.`;

async function main() {
  console.log('Creating Google Cloud Long Audio service...');
  const service = createGoogleCloudLongAudioService();

  console.log(`Generating audio for ${text.length} characters...`);
  console.log('Using voice: en-US-Journey-D (moderator)');
  console.log('Sample rate: 48kHz');

  const startTime = Date.now();

  try {
    const result = await service.generateSpeech(text, 'moderator');
    const elapsed = (Date.now() - startTime) / 1000;

    console.log(`\nSuccess!`);
    console.log(`Duration: ${Math.round(result.durationMs / 1000)}s of audio`);
    console.log(`Processing time: ${elapsed.toFixed(1)}s`);
    console.log(`Audio size: ${(result.audioBuffer.length / 1024).toFixed(1)} KB`);

    // Save to file
    const outputPath = './temp/test-journey-voice.mp3';
    fs.writeFileSync(outputPath, result.audioBuffer);
    console.log(`\nSaved to: ${outputPath}`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
