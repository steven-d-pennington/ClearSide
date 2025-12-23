# VIDEO-004: Video Rendering Pipeline & Export

**Task ID:** VIDEO-004
**Phase:** Phase 2
**Category:** Video Export
**Priority:** P2
**Estimated Effort:** 3 days
**Dependencies:** VIDEO-001, VIDEO-002, VIDEO-003, QUEUE-001
**Status:** TO DO

---

## Overview

Implement the complete video rendering pipeline using Remotion's render API. Handle async processing, progress tracking, and multiple format exports (MP4, WebM).

---

## Objectives

1. Remotion render pipeline
2. Queue integration for async rendering
3. Progress tracking and webhooks
4. Multiple format support (MP4, WebM)
5. Quality presets (720p, 1080p, 4K)

---

## Technical Specification

```typescript
// src/services/video/videoRenderer.ts

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

export class VideoRenderer {
  async render(debateData: DebateOutput, options: RenderOptions): Promise<string> {
    const bundled = await bundle(path.join(__dirname, '../../remotion/index.ts'));
    const composition = await selectComposition({ serveUrl: bundled, id: 'DebateVideo' });

    const outputPath = path.join('/tmp/videos', `${Date.now()}.mp4`);

    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: { debateData },
      onProgress: ({ progress }) => {
        console.log(`Rendering: ${(progress * 100).toFixed(1)}%`);
      },
    });

    return outputPath;
  }
}
```

---

**Last Updated:** 2025-12-23
