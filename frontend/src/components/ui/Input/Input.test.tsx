import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  describe('Rendering', () => {
    it('renders an input element', () => {
      render(<Input placeholder="Test input" />);
      expect(screen.getByPlaceholderText('Test input')).toBeInTheDocument();
    });

    it('renders with label', () => {
      render(<Input label="Email" id="email" />);
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<Input className="custom-class" data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveClass('custom-class');
    });
  });

  describe('States', () => {
    it('renders error state with message', () => {
      render(<Input error="This field is required" data-testid="input" />);
      expect(screen.getByText('This field is required')).toBeInTheDocument();
      expect(screen.getByTestId('input')).toHaveClass('error');
    });

    it('renders disabled state', () => {
      render(<Input disabled placeholder="Disabled" />);
      expect(screen.getByPlaceholderText('Disabled')).toBeDisabled();
    });
  });

  describe('Interaction', () => {
    it('calls onChange when value changes', () => {
      const handleChange = vi.fn();
      render(<Input onChange={handleChange} placeholder="Type here" />);

      fireEvent.change(screen.getByPlaceholderText('Type here'), {
        target: { value: 'test value' },
      });

      expect(handleChange).toHaveBeenCalled();
    });

    it('calls onBlur when focus is lost', () => {
      const handleBlur = vi.fn();
      render(<Input onBlur={handleBlur} placeholder="Blur test" />);

      const input = screen.getByPlaceholderText('Blur test');
      fireEvent.focus(input);
      fireEvent.blur(input);

      expect(handleBlur).toHaveBeenCalled();
    });

    it('supports controlled value', () => {
      const { rerender } = render(<Input value="initial" readOnly />);
      expect(screen.getByDisplayValue('initial')).toBeInTheDocument();

      rerender(<Input value="updated" readOnly />);
      expect(screen.getByDisplayValue('updated')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('associates label with input via id', () => {
      render(<Input label="Username" id="username" />);
      const input = screen.getByLabelText('Username');
      expect(input).toHaveAttribute('id', 'username');
    });

    it('is focusable', () => {
      render(<Input placeholder="Focus me" />);
      const input = screen.getByPlaceholderText('Focus me');
      input.focus();
      expect(document.activeElement).toBe(input);
    });
  });
});
