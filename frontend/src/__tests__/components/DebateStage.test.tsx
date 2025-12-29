/**
 * DebateStage Component Tests
 *
 * Tests for the lively debate mode UI components including:
 * - DebateStage multi-panel layout
 * - SpeakerPanel states and animations
 * - StateIndicator display
 * - InterjectionOverlay behavior
 * - InterruptPulse animation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useDebateStore } from '../../stores/debate-store';
import { DebateStage } from '../../components/DebateStage/DebateStage';
import { SpeakerPanel } from '../../components/DebateStage/SpeakerPanel';
import { StateIndicator } from '../../components/DebateStage/StateIndicator';
import { InterjectionOverlay } from '../../components/DebateStage/InterjectionOverlay';
import { InterruptPulse } from '../../components/DebateStage/InterruptPulse';
import { Speaker } from '../../types/debate';
import type { LivelySpeakerState } from '../../types/lively';

// Mock CSS modules
vi.mock('../../components/DebateStage/DebateStage.module.css', () => ({
  default: {
    stage: 'stage',
    grid: 'grid',
    sidePanel: 'sidePanel',
    centerPanel: 'centerPanel',
    bottomPanel: 'bottomPanel',
    statusBar: 'statusBar',
    empty: 'empty',
    turnBased: 'turnBased',
  },
}));

vi.mock('../../components/DebateStage/SpeakerPanel.module.css', () => ({
  default: {
    panel: 'panel',
    pro: 'pro',
    con: 'con',
    moderator: 'moderator',
    active: 'active',
    queued: 'queued',
    cooldown: 'cooldown',
    interjecting: 'interjecting',
    cutoff: 'cutoff',
    ready: 'ready',
    sm: 'sm',
    md: 'md',
    lg: 'lg',
    header: 'header',
    avatar: 'avatar',
    info: 'info',
    name: 'name',
    content: 'content',
    text: 'text',
    activeRing: 'activeRing',
  },
}));

vi.mock('../../components/DebateStage/StateIndicator.module.css', () => ({
  default: {
    indicator: 'indicator',
    ready: 'ready',
    speaking: 'speaking',
    cooldown: 'cooldown',
    queued: 'queued',
    sm: 'sm',
    md: 'md',
    lg: 'lg',
    icon: 'icon',
    label: 'label',
  },
}));

vi.mock('../../components/DebateStage/InterjectionOverlay.module.css', () => ({
  default: {
    overlay: 'overlay',
    visible: 'visible',
    hidden: 'hidden',
    container: 'container',
    header: 'header',
    avatar: 'avatar',
    speakerInfo: 'speakerInfo',
    label: 'label',
    name: 'name',
    content: 'content',
    text: 'text',
    cursor: 'cursor',
    pro: 'pro',
    con: 'con',
    moderator: 'moderator',
    dismissBtn: 'dismissBtn',
  },
}));

vi.mock('../../components/DebateStage/InterruptPulse.module.css', () => ({
  default: {
    pulseContainer: 'pulseContainer',
    ripples: 'ripples',
    ripple: 'ripple',
    ripple1: 'ripple1',
    ripple2: 'ripple2',
    ripple3: 'ripple3',
    center: 'center',
    icon: 'icon',
    label: 'label',
    progress: 'progress',
    progressBar: 'progressBar',
    pro: 'pro',
    con: 'con',
    moderator: 'moderator',
    intensityLow: 'intensityLow',
    intensityMedium: 'intensityMedium',
    intensityHigh: 'intensityHigh',
  },
}));

describe('SpeakerPanel', () => {
  it('renders speaker name and avatar', () => {
    render(
      <SpeakerPanel
        speaker={Speaker.PRO}
        state="ready"
      />
    );

    expect(screen.getByText('Pro Advocate')).toBeInTheDocument();
    expect(screen.getByText('P')).toBeInTheDocument(); // Avatar initial
  });

  it('displays content when provided', () => {
    const content = 'This is the speaker content';
    render(
      <SpeakerPanel
        speaker={Speaker.PRO}
        state="speaking"
        content={content}
      />
    );

    expect(screen.getByText(content)).toBeInTheDocument();
  });

  it('applies active styling when active', () => {
    const { container } = render(
      <SpeakerPanel
        speaker={Speaker.PRO}
        state="speaking"
        isActive={true}
      />
    );

    const panel = container.querySelector('.panel');
    expect(panel?.className).toContain('active');
  });

  it('applies queued animation when queued', () => {
    const { container } = render(
      <SpeakerPanel
        speaker={Speaker.CON}
        state="ready"
        isQueued={true}
      />
    );

    const panel = container.querySelector('.panel');
    expect(panel?.className).toContain('queued');
  });

  it('applies interjecting animation when interjecting', () => {
    const { container } = render(
      <SpeakerPanel
        speaker={Speaker.CON}
        state="speaking"
        isInterjecting={true}
      />
    );

    const panel = container.querySelector('.panel');
    expect(panel?.className).toContain('interjecting');
  });

  it('applies cutoff animation when cut off', () => {
    const { container } = render(
      <SpeakerPanel
        speaker={Speaker.PRO}
        state="ready"
        wasCutoff={true}
      />
    );

    const panel = container.querySelector('.panel');
    expect(panel?.className).toContain('cutoff');
  });

  it('applies different sizes correctly', () => {
    const { container, rerender } = render(
      <SpeakerPanel speaker={Speaker.PRO} state="ready" size="sm" />
    );

    expect(container.querySelector('.panel')?.className).toContain('sm');

    rerender(
      <SpeakerPanel speaker={Speaker.PRO} state="ready" size="lg" />
    );

    expect(container.querySelector('.panel')?.className).toContain('lg');
  });
});

describe('StateIndicator', () => {
  const states: LivelySpeakerState[] = ['ready', 'speaking', 'cooldown', 'queued'];

  states.forEach((state) => {
    it(`renders correctly for ${state} state`, () => {
      render(<StateIndicator state={state} />);

      // Should have the label text for the state
      const label = screen.getByText(state.charAt(0).toUpperCase() + state.slice(1));
      expect(label).toBeInTheDocument();
    });
  });

  it('applies correct size classes', () => {
    const { container, rerender } = render(
      <StateIndicator state="ready" size="sm" />
    );

    expect(container.querySelector('.indicator')?.className).toContain('sm');

    rerender(<StateIndicator state="ready" size="lg" />);

    expect(container.querySelector('.indicator')?.className).toContain('lg');
  });
});

describe('InterjectionOverlay', () => {
  it('renders speaker name and content', () => {
    render(
      <InterjectionOverlay
        speaker={Speaker.CON}
        content="Wait, that's not right!"
      />
    );

    expect(screen.getByText('Con Advocate')).toBeInTheDocument();
    expect(screen.getByText(/"Wait, that's not right!"/)).toBeInTheDocument();
  });

  it('shows cursor when streaming', () => {
    render(
      <InterjectionOverlay
        speaker={Speaker.CON}
        content="Streaming content"
        isStreaming={true}
      />
    );

    expect(screen.getByText('|')).toBeInTheDocument();
  });

  it('hides cursor when not streaming', () => {
    render(
      <InterjectionOverlay
        speaker={Speaker.CON}
        content="Complete content"
        isStreaming={false}
      />
    );

    expect(screen.queryByText('|')).not.toBeInTheDocument();
  });

  it('shows dismiss button when not streaming', () => {
    const onDismiss = vi.fn();
    render(
      <InterjectionOverlay
        speaker={Speaker.CON}
        content="Complete content"
        isStreaming={false}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
  });

  it('applies speaker-specific styling', () => {
    const { container } = render(
      <InterjectionOverlay
        speaker={Speaker.PRO}
        content="Pro interjection"
      />
    );

    const overlay = container.querySelector('.overlay');
    expect(overlay?.className).toContain('pro');
  });
});

describe('InterruptPulse', () => {
  it('renders nothing when not active', () => {
    const { container } = render(
      <InterruptPulse speaker={Speaker.CON} isActive={false} />
    );

    expect(container.querySelector('.pulseContainer')).not.toBeInTheDocument();
  });

  it('renders pulse animation when active', () => {
    const { container } = render(
      <InterruptPulse speaker={Speaker.CON} isActive={true} />
    );

    expect(container.querySelector('.pulseContainer')).toBeInTheDocument();
    expect(screen.getByText('Interjecting...')).toBeInTheDocument();
  });

  it('applies correct intensity class', () => {
    const { container, rerender } = render(
      <InterruptPulse speaker={Speaker.CON} isActive={true} intensity="low" />
    );

    expect(container.querySelector('.pulseContainer')?.className).toContain('intensityLow');

    rerender(
      <InterruptPulse speaker={Speaker.CON} isActive={true} intensity="high" />
    );

    expect(container.querySelector('.pulseContainer')?.className).toContain('intensityHigh');
  });

  it('has correct aria attributes', () => {
    render(
      <InterruptPulse speaker={Speaker.CON} isActive={true} />
    );

    const container = screen.getByRole('status');
    expect(container).toHaveAttribute('aria-live', 'polite');
    expect(container).toHaveAttribute('aria-label', expect.stringContaining('interject'));
  });
});

describe('DebateStage', () => {
  beforeEach(() => {
    // Reset the store before each test
    useDebateStore.getState()._reset();
  });

  it('shows empty state when no debate', () => {
    render(<DebateStage />);

    expect(screen.getByText('No active debate')).toBeInTheDocument();
  });

  it('shows turn-based layout for non-lively mode', () => {
    // Set up a debate in turn-based mode
    const store = useDebateStore.getState();
    act(() => {
      store._setDebate({
        id: 'test-123',
        proposition: 'Test proposition',
        currentPhase: 'opening_statements',
        status: 'active',
        startedAt: new Date(),
        turns: [],
        interventions: [],
      });
    });

    const { container } = render(<DebateStage />);

    expect(container.querySelector('.turnBased')).toBeInTheDocument();
  });

  it('shows multi-panel layout for lively mode', () => {
    // Set up a debate in lively mode
    const store = useDebateStore.getState();
    act(() => {
      store._setDebate({
        id: 'test-123',
        proposition: 'Test proposition',
        currentPhase: 'opening_statements',
        status: 'active',
        startedAt: new Date(),
        turns: [],
        interventions: [],
      });
      store._setLivelyState({
        isLivelyMode: true,
        settings: {
          aggressionLevel: 3,
          maxInterruptsPerMinute: 2,
          interruptCooldownMs: 15000,
          minSpeakingTimeMs: 5000,
          relevanceThreshold: 0.7,
          pacingMode: 'medium',
        },
        activeSpeaker: null,
        speakerStates: new Map(),
        pendingInterrupt: null,
        interruptsThisMinute: 0,
        streamingInterjection: null,
      });
    });

    const { container } = render(<DebateStage />);

    // Should have the grid layout
    expect(container.querySelector('.grid')).toBeInTheDocument();
    // Should have speaker panels
    expect(container.querySelectorAll('.sidePanel')).toHaveLength(2);
    // Should have status bar
    expect(container.querySelector('.statusBar')).toBeInTheDocument();
  });
});
