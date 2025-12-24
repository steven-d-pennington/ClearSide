import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Alert } from './Alert';

describe('Alert', () => {
  describe('Rendering', () => {
    it('renders children correctly', () => {
      render(<Alert>Alert message</Alert>);
      expect(screen.getByText('Alert message')).toBeInTheDocument();
    });

    it('renders with correct role', () => {
      render(<Alert>Test alert</Alert>);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<Alert className="custom-class">Test</Alert>);
      expect(screen.getByRole('alert')).toHaveClass('custom-class');
    });
  });

  describe('Variants', () => {
    it('renders info variant correctly', () => {
      render(<Alert variant="info">Info alert</Alert>);
      expect(screen.getByRole('alert')).toHaveClass('info');
    });

    it('renders success variant correctly', () => {
      render(<Alert variant="success">Success alert</Alert>);
      expect(screen.getByRole('alert')).toHaveClass('success');
    });

    it('renders warning variant correctly', () => {
      render(<Alert variant="warning">Warning alert</Alert>);
      expect(screen.getByRole('alert')).toHaveClass('warning');
    });

    it('renders error variant correctly', () => {
      render(<Alert variant="error">Error alert</Alert>);
      expect(screen.getByRole('alert')).toHaveClass('error');
    });
  });

  describe('Close Button', () => {
    it('shows close button when onClose is provided', () => {
      render(
        <Alert onClose={() => {}}>
          Closeable alert
        </Alert>
      );
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('calls onClose when close button clicked', () => {
      const handleClose = vi.fn();
      render(
        <Alert onClose={handleClose}>
          Closeable alert
        </Alert>
      );

      fireEvent.click(screen.getByRole('button'));
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('does not show close button when onClose is not provided', () => {
      render(<Alert>Non-closeable alert</Alert>);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('Title', () => {
    it('renders title when provided', () => {
      render(<Alert title="Alert Title">Alert content</Alert>);
      expect(screen.getByText('Alert Title')).toBeInTheDocument();
    });

    it('does not render title element when not provided', () => {
      render(<Alert>Alert content only</Alert>);
      expect(screen.queryByText('Alert Title')).not.toBeInTheDocument();
    });
  });

  describe('Icon', () => {
    it('renders default icon based on variant', () => {
      render(<Alert variant="info">Info alert</Alert>);
      // SVG icon should be present
      const icon = screen.getByRole('alert').querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('renders custom icon when provided', () => {
      render(
        <Alert icon={<span data-testid="custom-icon">🎉</span>}>
          Custom icon alert
        </Alert>
      );
      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    });

    it('hides icon when icon prop is null', () => {
      render(<Alert icon={null}>No icon alert</Alert>);
      const iconSpan = screen.getByRole('alert').querySelector('.icon');
      expect(iconSpan).toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('has accessible role of alert', () => {
      render(<Alert>Accessible alert</Alert>);
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });

    it('close button has accessible label', () => {
      render(
        <Alert onClose={() => {}}>
          Test
        </Alert>
      );
      expect(screen.getByLabelText('Dismiss alert')).toBeInTheDocument();
    });

    it('icon is hidden from screen readers', () => {
      render(<Alert variant="info">Info alert</Alert>);
      const iconContainer = screen.getByRole('alert').querySelector('[aria-hidden="true"]');
      expect(iconContainer).toBeInTheDocument();
    });
  });
});
