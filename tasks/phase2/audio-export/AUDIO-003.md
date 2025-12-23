# AUDIO-003: FFmpeg Audio Processing & MP3 Generation

**Task ID:** AUDIO-003
**Phase:** Phase 2
**Category:** Audio Export
**Priority:** P2
**Estimated Effort:** 2 days
**Dependencies:** AUDIO-001, AUDIO-002
**Status:** TO DO

---

## Overview

Use FFmpeg to combine audio segments, add background music, normalize audio levels, and generate final MP3 files with proper metadata.

---

## Objectives

1. FFmpeg integration for audio processing
2. Segment concatenation
3. Audio normalization
4. Background music mixing
5. MP3 encoding with metadata

---

## Technical Specification

```typescript
// src/services/audio/audioProcessor.ts

import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';

export class AudioProcessor {
  async concatenateSegments(
    segmentPaths: string[],
    outputPath: string
  ): Promise<void> {
    const listFile = path.join(path.dirname(outputPath), 'segments.txt');
    const list Content = segmentPaths.map((p) => `file '${p}'`).join('\n');
    await fs.writeFile(listFile, listContent);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(listFile)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c:a libmp3lame',
          '-b:a 192k',
          '-ar 44100',
        ])
        .output(outputPath)
        .on('end', () => {
          fs.unlink(listFile).catch(console.error);
          resolve();
        })
        .on('error', reject)
        .run();
    });
  }

  async normalizeAudio(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters('loudnorm')
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }

  async addBackgroundMusic(
    voicePath: string,
    musicPath: string,
    outputPath: string,
    musicVolume: number = 0.1
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(voicePath)
        .input(musicPath)
        .complexFilter([
          `[1:a]volume=${musicVolume}[music]`,
          `[0:a][music]amix=inputs=2:duration=first`,
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }

  async addMetadata(
    inputPath: string,
    outputPath: string,
    metadata: {
      title: string;
      artist: string;
      album: string;
      comment: string;
    }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          `-metadata title="${metadata.title}"`,
          `-metadata artist="${metadata.artist}"`,
          `-metadata album="${metadata.album}"`,
          `-metadata comment="${metadata.comment}"`,
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }
}
```

---

**Last Updated:** 2025-12-23
