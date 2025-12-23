# VIDEO-001: Remotion Setup & React Video Templates

**Task ID:** VIDEO-001
**Phase:** Phase 2
**Category:** Video Export
**Priority:** P2
**Estimated Effort:** 4 days
**Dependencies:** AUDIO-001 through AUDIO-004
**Status:** TO DO

---

## Overview

Set up Remotion for programmatic video generation using React. Create reusable video templates for debate presentations with animations, transitions, and synchronized audio.

---

## Objectives

1. Remotion framework setup
2. React-based video components
3. Animation templates
4. Audio synchronization
5. Scene transitions

---

## Technical Specification

```typescript
// remotion/compositions/DebateVideo.tsx

import { Composition } from 'remotion';
import { DebatePresentation } from './scenes/DebatePresentation';
import { DebateOutput } from '@/types/debate';

export const DebateVideoComposition: React.FC<{ debateData: DebateOutput }> = ({ debateData }) => {
  const durationInFrames = calculateDuration(debateData);

  return (
    <Composition
      id="DebateVideo"
      component={DebatePresentation}
      durationInFrames={durationInFrames}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ debateData }}
    />
  );
};

// remotion/scenes/DebatePresentation.tsx

import { AbsoluteFill, Sequence, Audio, useCurrentFrame, interpolate } from 'remotion';
import { TitleSlide } from '../components/TitleSlide';
import { ArgumentSlide } from '../components/ArgumentSlide';
import { ModeratorSlide } from '../components/ModeratorSlide';

export const DebatePresentation: React.FC<{ debateData: DebateOutput }> = ({ debateData }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: '#f8fafc' }}>
      {/* Title Slide (0-90 frames = 3s) */}
      <Sequence from={0} durationInFrames={90}>
        <TitleSlide proposition={debateData.proposition.normalized} />
      </Sequence>

      {/* Pro Arguments */}
      {debateData.pro.arguments.map((arg, i) => (
        <Sequence key={i} from={90 + i * 180} durationInFrames={180}>
          <ArgumentSlide argument={arg} side="pro" />
        </Sequence>
      ))}

      {/* Con Arguments */}
      {debateData.con.arguments.map((arg, i) => (
        <Sequence key={i} from={90 + debateData.pro.arguments.length * 180 + i * 180} durationInFrames={180}>
          <ArgumentSlide argument={arg} side="con" />
        </Sequence>
      ))}

      {/* Moderator Synthesis */}
      <Sequence from={90 + (debateData.pro.arguments.length + debateData.con.arguments.length) * 180} durationInFrames={240}>
        <ModeratorSlide moderator={debateData.moderator} />
      </Sequence>

      {/* Audio track */}
      <Audio src="/audio/debate-narration.mp3" />
    </AbsoluteFill>
  );
};
```

---

**Last Updated:** 2025-12-23
