/**
 * Layout Components Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { Header } from './Header';
import { Navigation } from './Navigation';
import { MobileMenu } from './MobileMenu';
import { Footer } from './Footer';
import { SkipLink } from './SkipLink';

// Mock useMediaQuery hook
vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false), // Default: desktop
}));

import { useMediaQuery } from '../../hooks/useMediaQuery';

function renderWithRouter(component: React.ReactNode) {
  return render(<BrowserRouter>{component}</BrowserRouter>);
}

describe('AppLayout', () => {
  it('renders header, main, and footer', () => {
    renderWithRouter(<AppLayout>Test content</AppLayout>);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('renders skip link', () => {
    renderWithRouter(<AppLayout>Test content</AppLayout>);

    const skipLink = screen.getByText('Skip to main content');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  it('renders children in main content area', () => {
    renderWithRouter(<AppLayout>Test content</AppLayout>);

    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('Test content');
  });

  it('main content has correct id for skip link', () => {
    renderWithRouter(<AppLayout>Test content</AppLayout>);

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
  });
});

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useMediaQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it('renders logo with text and tagline', () => {
    renderWithRouter(<Header />);

    expect(screen.getByText('ClearSide')).toBeInTheDocument();
    expect(screen.getByText('Think both sides')).toBeInTheDocument();
  });

  it('renders navigation on desktop', () => {
    renderWithRouter(<Header />);

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('renders hamburger menu on mobile', () => {
    (useMediaQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

    renderWithRouter(<Header />);

    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
  });

  it('opens mobile menu when hamburger is clicked', async () => {
    (useMediaQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const user = userEvent.setup();

    renderWithRouter(<Header />);

    await user.click(screen.getByRole('button', { name: /open menu/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Navigation', () => {
  it('renders all nav items', () => {
    renderWithRouter(<Navigation />);

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('How It Works')).toBeInTheDocument();
    expect(screen.getByText('Examples')).toBeInTheDocument();
  });

  it('renders as navigation landmark', () => {
    renderWithRouter(<Navigation />);

    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
  });

  it('marks active link', () => {
    render(
      <MemoryRouter initialEntries={['/how-it-works']}>
        <Navigation />
      </MemoryRouter>
    );

    const howItWorksLink = screen.getByText('How It Works');
    expect(howItWorksLink).toHaveClass('active');
  });
});

describe('MobileMenu', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    renderWithRouter(<MobileMenu isOpen={false} onClose={mockOnClose} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders menu when open', () => {
    renderWithRouter(<MobileMenu isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Menu')).toBeInTheDocument();
  });

  it('renders nav links', () => {
    renderWithRouter(<MobileMenu isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('How It Works')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();

    renderWithRouter(<MobileMenu isOpen={true} onClose={mockOnClose} />);

    await user.click(screen.getByRole('button', { name: /close menu/i }));

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();

    const { container } = renderWithRouter(
      <MobileMenu isOpen={true} onClose={mockOnClose} />
    );

    const backdrop = container.querySelector('[class*="backdrop"]');
    await user.click(backdrop!);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    renderWithRouter(<MobileMenu isOpen={true} onClose={mockOnClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes when nav link is clicked', async () => {
    const user = userEvent.setup();

    renderWithRouter(<MobileMenu isOpen={true} onClose={mockOnClose} />);

    await user.click(screen.getByText('Home'));

    expect(mockOnClose).toHaveBeenCalled();
  });
});

describe('Footer', () => {
  it('renders tagline', () => {
    renderWithRouter(<Footer />);

    expect(screen.getByText('Think both sides. Decide with clarity.')).toBeInTheDocument();
  });

  it('renders current year in copyright', () => {
    renderWithRouter(<Footer />);

    const currentYear = new Date().getFullYear();
    expect(screen.getByText(new RegExp(currentYear.toString()))).toBeInTheDocument();
  });

  it('renders product links', () => {
    renderWithRouter(<Footer />);

    expect(screen.getByText('Product')).toBeInTheDocument();
    expect(screen.getByText('How It Works')).toBeInTheDocument();
  });

  it('renders legal links', () => {
    renderWithRouter(<Footer />);

    expect(screen.getByText('Legal')).toBeInTheDocument();
    expect(screen.getByText('Privacy')).toBeInTheDocument();
    expect(screen.getByText('Terms')).toBeInTheDocument();
  });

  it('has contentinfo role', () => {
    renderWithRouter(<Footer />);

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});

describe('SkipLink', () => {
  it('renders with correct href', () => {
    render(<SkipLink href="#main">Skip to content</SkipLink>);

    const link = screen.getByText('Skip to content');
    expect(link).toHaveAttribute('href', '#main');
  });

  it('renders children', () => {
    render(<SkipLink href="#main">Custom skip text</SkipLink>);

    expect(screen.getByText('Custom skip text')).toBeInTheDocument();
  });
});
