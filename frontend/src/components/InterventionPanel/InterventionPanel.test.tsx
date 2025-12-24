/**
 * InterventionPanel Component Tests
 *
 * Uses Vitest + React Testing Library
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterventionPanel } from './InterventionPanel';
import { InterventionForm } from './InterventionForm';
import { InterventionCard } from './InterventionCard';
import { useDebateStore } from '../../stores/debate-store';
import type { Intervention, Debate } from '../../types/debate';
import { DebatePhase, Speaker } from '../../types/debate';

// Mock the debate store
vi.mock('../../stores/debate-store', () => ({
  useDebateStore: vi.fn(),
  selectPendingInterventions: vi.fn((state) =>
    state.debate?.interventions.filter((i: Intervention) => i.status === 'pending') ?? []
  ),
}));

// Sample test data
const mockIntervention: Intervention = {
  id: 'int-1',
  debateId: 'debate-1',
  type: 'question',
  content: 'Can you elaborate on this point?',
  status: 'pending',
  timestamp: new Date(),
};

const mockAddressedIntervention: Intervention = {
  id: 'int-2',
  debateId: 'debate-1',
  type: 'challenge',
  content: 'I disagree with this assumption.',
  status: 'addressed',
  timestamp: new Date(Date.now() - 60000),
  response: 'Thank you for raising this point. Let me address your concern...',
  targetSpeaker: 'PRO',
};

const mockDebate: Debate = {
  id: 'debate-1',
  proposition: 'AI will benefit humanity',
  status: 'live',
  currentPhase: DebatePhase.PHASE_2_CONSTRUCTIVE,
  currentSpeaker: Speaker.PRO,
  turns: [],
  interventions: [mockIntervention, mockAddressedIntervention],
  createdAt: new Date(),
  totalElapsedMs: 120000,
};

describe('InterventionPanel', () => {
  const mockSubmitIntervention = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useDebateStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (state: { debate: Debate | null; submitIntervention: typeof mockSubmitIntervention }) => unknown) => {
        const state = {
          debate: mockDebate,
          submitIntervention: mockSubmitIntervention,
        };
        return selector(state);
      }
    );
  });

  it('renders the panel with title', () => {
    render(<InterventionPanel />);
    expect(screen.getByText('Interventions')).toBeInTheDocument();
  });

  it('shows pending intervention count', () => {
    render(<InterventionPanel />);
    expect(screen.getByText('1 pending')).toBeInTheDocument();
  });

  it('displays submit intervention button when debate is live', () => {
    render(<InterventionPanel />);
    expect(screen.getByRole('button', { name: /submit intervention/i })).toBeEnabled();
  });

  it('disables submit button when debate is not live', () => {
    (useDebateStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (state: { debate: Debate | null; submitIntervention: typeof mockSubmitIntervention }) => unknown) => {
        const state = {
          debate: { ...mockDebate, status: 'completed' },
          submitIntervention: mockSubmitIntervention,
        };
        return selector(state);
      }
    );

    render(<InterventionPanel />);
    expect(screen.getByRole('button', { name: /submit intervention/i })).toBeDisabled();
  });

  it('opens modal when submit button is clicked', async () => {
    const user = userEvent.setup();
    render(<InterventionPanel />);

    await user.click(screen.getByRole('button', { name: /submit intervention/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Check modal title (h2 with id="modal-title")
    expect(screen.getByRole('heading', { name: 'Submit Intervention' })).toBeInTheDocument();
  });

  it('displays list of interventions', () => {
    render(<InterventionPanel />);

    expect(screen.getByText('question')).toBeInTheDocument();
    expect(screen.getByText('challenge')).toBeInTheDocument();
  });

  it('shows empty state when no interventions', () => {
    (useDebateStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (state: { debate: Debate | null; submitIntervention: typeof mockSubmitIntervention }) => unknown) => {
        const state = {
          debate: { ...mockDebate, interventions: [] },
          submitIntervention: mockSubmitIntervention,
        };
        return selector(state);
      }
    );

    render(<InterventionPanel />);
    expect(screen.getByText('No interventions yet')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<InterventionPanel onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /close intervention panel/i }));

    expect(onClose).toHaveBeenCalled();
  });
});

describe('InterventionForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all intervention type options', () => {
    render(
      <InterventionForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    expect(screen.getByText('Ask a Question')).toBeInTheDocument();
    expect(screen.getByText('Challenge Argument')).toBeInTheDocument();
    expect(screen.getByText('Submit Evidence')).toBeInTheDocument();
    expect(screen.getByText('Request Clarification')).toBeInTheDocument();
  });

  it('renders speaker target options', () => {
    render(
      <InterventionForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    expect(screen.getByText('Either side')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('Con')).toBeInTheDocument();
  });

  it('allows selecting intervention type', async () => {
    const user = userEvent.setup();

    render(
      <InterventionForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    const challengeOption = screen.getByLabelText(/challenge argument/i);
    await user.click(challengeOption);

    expect(challengeOption.closest('label')).toHaveClass('selected');
  });

  it('validates minimum content length', async () => {
    const user = userEvent.setup();

    render(
      <InterventionForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'short');

    const submitButton = screen.getByRole('button', { name: /submit intervention/i });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit when content is valid', async () => {
    const user = userEvent.setup();

    render(
      <InterventionForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'This is a valid intervention with more than 10 characters');

    const submitButton = screen.getByRole('button', { name: /submit intervention/i });
    expect(submitButton).toBeEnabled();
  });

  it('calls onSubmit with correct data', async () => {
    const user = userEvent.setup();

    render(
      <InterventionForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    // Select challenge type
    await user.click(screen.getByLabelText(/challenge argument/i));

    // Select target speaker by finding the radio with value="PRO"
    const proRadio = screen.getByRole('radio', { name: /^pro$/i });
    await user.click(proRadio);

    // Enter content
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'I challenge this specific claim because it lacks evidence.');

    // Submit
    await user.click(screen.getByRole('button', { name: /submit intervention/i }));

    expect(mockOnSubmit).toHaveBeenCalledWith({
      type: 'challenge',
      content: 'I challenge this specific claim because it lacks evidence.',
      targetTurnId: undefined,
      targetSpeaker: 'PRO',
    });
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <InterventionForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('shows submitting state', () => {
    render(
      <InterventionForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        isSubmitting
      />
    );

    expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
  });
});

describe('InterventionCard', () => {
  const mockOnToggleExpand = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays intervention type and status', () => {
    render(
      <InterventionCard
        intervention={mockIntervention}
        isExpanded={false}
        onToggleExpand={mockOnToggleExpand}
      />
    );

    expect(screen.getByText('question')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('shows content when expanded', () => {
    render(
      <InterventionCard
        intervention={mockIntervention}
        isExpanded={true}
        onToggleExpand={mockOnToggleExpand}
      />
    );

    expect(screen.getByText('Can you elaborate on this point?')).toBeVisible();
  });

  it('shows response when intervention is addressed', () => {
    render(
      <InterventionCard
        intervention={mockAddressedIntervention}
        isExpanded={true}
        onToggleExpand={mockOnToggleExpand}
      />
    );

    expect(screen.getByText('Response:')).toBeInTheDocument();
    expect(
      screen.getByText(/Thank you for raising this point/)
    ).toBeInTheDocument();
  });

  it('shows target speaker badge when specified', () => {
    render(
      <InterventionCard
        intervention={mockAddressedIntervention}
        isExpanded={false}
        onToggleExpand={mockOnToggleExpand}
      />
    );

    expect(screen.getByText('to Pro')).toBeInTheDocument();
  });

  it('calls onToggleExpand when header is clicked', async () => {
    const user = userEvent.setup();

    render(
      <InterventionCard
        intervention={mockIntervention}
        isExpanded={false}
        onToggleExpand={mockOnToggleExpand}
      />
    );

    const header = screen.getByText('question').closest('header');
    await user.click(header!);

    expect(mockOnToggleExpand).toHaveBeenCalled();
  });

  it('shows pending note for pending interventions', () => {
    render(
      <InterventionCard
        intervention={mockIntervention}
        isExpanded={true}
        onToggleExpand={mockOnToggleExpand}
      />
    );

    expect(screen.getByText('Waiting to be addressed...')).toBeInTheDocument();
  });

  it('shows acknowledged note for acknowledged interventions', () => {
    const acknowledgedIntervention = {
      ...mockIntervention,
      status: 'acknowledged' as const,
    };

    render(
      <InterventionCard
        intervention={acknowledgedIntervention}
        isExpanded={true}
        onToggleExpand={mockOnToggleExpand}
      />
    );

    expect(
      screen.getByText('Received, will be addressed shortly')
    ).toBeInTheDocument();
  });

  it('has correct aria attributes', () => {
    render(
      <InterventionCard
        intervention={mockIntervention}
        isExpanded={true}
        onToggleExpand={mockOnToggleExpand}
      />
    );

    const article = screen.getByRole('article');
    expect(article).toHaveAttribute('aria-expanded', 'true');
  });
});
