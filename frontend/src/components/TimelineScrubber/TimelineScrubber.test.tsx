/**
 * TimelineScrubber Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineScrubber } from './TimelineScrubber';
import { ProgressBar } from './ProgressBar';
import { TimelinePhase } from './TimelinePhase';
import { useDebateStore } from '../../stores/debate-store';
import type { Debate, DebateTurn } from '../../types/debate';
import { DebatePhase, Speaker } from '../../types/debate';

// Mock the debate store
vi.mock('../../stores/debate-store', () => ({
  useDebateStore: vi.fn(),
}));

// Sample test data
const mockTurn: DebateTurn = {
  id: 'turn-1',
  debateId: 'debate-1',
  phase: DebatePhase.PHASE_1_OPENING,
  speaker: Speaker.PRO,
  content: 'Opening statement content',
  turnNumber: 1,
  timestamp: new Date(),
};

const mockDebate: Debate = {
  id: 'debate-1',
  proposition: 'AI will benefit humanity',
  status: 'live',
  currentPhase: DebatePhase.PHASE_2_CONSTRUCTIVE,
  currentSpeaker: Speaker.CON,
  turns: [
    mockTurn,
    {
      ...mockTurn,
      id: 'turn-2',
      phase: DebatePhase.PHASE_1_OPENING,
      speaker: Speaker.CON,
      turnNumber: 2,
    },
    {
      ...mockTurn,
      id: 'turn-3',
      phase: DebatePhase.PHASE_2_CONSTRUCTIVE,
      speaker: Speaker.PRO,
      turnNumber: 3,
    },
  ],
  interventions: [],
  createdAt: new Date(),
  totalElapsedMs: 300000,
};

describe('TimelineScrubber', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDebateStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (state: { debate: Debate | null }) => unknown) => {
        return selector({ debate: mockDebate });
      }
    );
  });

  it('renders timeline with all phases', () => {
    render(<TimelineScrubber />);

    expect(screen.getByText('Opening')).toBeInTheDocument();
    expect(screen.getByText('Arguments')).toBeInTheDocument();
    expect(screen.getByText('Cross-Exam')).toBeInTheDocument();
    expect(screen.getByText('Rebuttals')).toBeInTheDocument();
    expect(screen.getByText('Closing')).toBeInTheDocument();
    expect(screen.getByText('Synthesis')).toBeInTheDocument();
  });

  it('shows progress bar', () => {
    render(<TimelineScrubber />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
  });

  it('renders as navigation landmark', () => {
    render(<TimelineScrubber />);

    expect(screen.getByRole('navigation', { name: /debate timeline/i })).toBeInTheDocument();
  });

  it('allows clicking on completed phases', async () => {
    const onPhaseSelect = vi.fn();
    const user = userEvent.setup();

    render(<TimelineScrubber onPhaseSelect={onPhaseSelect} />);

    // Opening phase should be clickable since it has turns
    const openingButton = screen.getByRole('button', { name: /opening/i });
    await user.click(openingButton);

    expect(onPhaseSelect).toHaveBeenCalledWith('PHASE_1_OPENING', 0);
  });

  it('disables pending phases', () => {
    render(<TimelineScrubber />);

    // Synthesis phase should be disabled as it's not completed
    const synthesisButton = screen.getByRole('button', { name: /synthesis/i });
    expect(synthesisButton).toBeDisabled();
  });

  it('handles keyboard navigation', async () => {
    const onPhaseSelect = vi.fn();

    render(<TimelineScrubber onPhaseSelect={onPhaseSelect} />);

    const timeline = screen.getByRole('navigation');
    timeline.focus();

    // The focused index defaults to the current phase (PHASE_2_CONSTRUCTIVE in mock)
    // Press Enter to select it
    fireEvent.keyDown(timeline, { key: 'Enter' });

    // Should have selected the current phase (PHASE_2_CONSTRUCTIVE at index 2)
    expect(onPhaseSelect).toHaveBeenCalledWith('PHASE_2_CONSTRUCTIVE', 2);
  });

  it('does not render when debate is not active', () => {
    (useDebateStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (state: { debate: Debate | null }) => unknown) => {
        return selector({ debate: { ...mockDebate, status: 'initializing' } });
      }
    );

    const { container } = render(<TimelineScrubber />);
    expect(container.firstChild).toBeNull();
  });

  it('shows completed state when debate is finished', () => {
    (useDebateStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (state: { debate: Debate | null }) => unknown) => {
        return selector({
          debate: {
            ...mockDebate,
            status: 'completed',
            currentPhase: DebatePhase.COMPLETED,
          },
        });
      }
    );

    render(<TimelineScrubber />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '100');
  });
});

describe('ProgressBar', () => {
  it('renders with correct progress', () => {
    render(<ProgressBar progress={50} />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps progress to valid range', () => {
    const { rerender } = render(<ProgressBar progress={150} />);

    let progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '100');

    rerender(<ProgressBar progress={-20} />);
    progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '0');
  });

  it('applies custom className', () => {
    render(<ProgressBar progress={50} className="custom-class" />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveClass('custom-class');
  });
});

describe('TimelinePhase', () => {
  const defaultProps = {
    phase: 'PHASE_1_OPENING' as const,
    label: 'Opening',
    fullLabel: 'Opening Statements',
    isCompleted: false,
    isCurrent: false,
    isPending: true,
    isFocused: false,
    onClick: vi.fn(),
    showConnector: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders label correctly', () => {
    render(<TimelinePhase {...defaultProps} />);

    expect(screen.getByText('Opening')).toBeInTheDocument();
  });

  it('shows completed state with checkmark', () => {
    render(<TimelinePhase {...defaultProps} isCompleted isPending={false} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Opening Statements - completed');
  });

  it('shows current state with spinner', () => {
    render(<TimelinePhase {...defaultProps} isCurrent isPending={false} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Opening Statements - in progress');
  });

  it('disables button when pending', () => {
    render(<TimelinePhase {...defaultProps} isPending />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('calls onClick when clicked and not disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <TimelinePhase
        {...defaultProps}
        isCompleted
        isPending={false}
        onClick={onClick}
      />
    );

    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });

  it('shows connector when showConnector is true', () => {
    const { container } = render(<TimelinePhase {...defaultProps} showConnector />);

    const connector = container.querySelector('[class*="connector"]');
    expect(connector).toBeInTheDocument();
  });

  it('hides connector when showConnector is false', () => {
    const { container } = render(
      <TimelinePhase {...defaultProps} showConnector={false} />
    );

    const connector = container.querySelector('[class*="connector"]');
    expect(connector).not.toBeInTheDocument();
  });

  it('applies focused styling when focused', () => {
    const { container } = render(<TimelinePhase {...defaultProps} isFocused />);

    const phase = container.querySelector('[class*="focused"]');
    expect(phase).toBeInTheDocument();
  });
});
