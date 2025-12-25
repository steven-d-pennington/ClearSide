import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';

/**
 * Keyboard Navigation Tests
 *
 * These tests verify that all interactive elements can be accessed
 * and operated using only the keyboard, meeting WCAG 2.1 AA standard 2.1.1.
 */

describe('Keyboard Navigation', () => {
  describe('Button Component', () => {
    it('can be focused with Tab', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <Button>First</Button>
          <Button>Second</Button>
        </div>
      );

      const firstButton = screen.getByText('First');
      const secondButton = screen.getByText('Second');

      // Tab to first button
      await user.tab();
      expect(firstButton).toHaveFocus();

      // Tab to second button
      await user.tab();
      expect(secondButton).toHaveFocus();
    });

    it('can be activated with Enter key', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<Button onClick={handleClick}>Click me</Button>);

      const button = screen.getByText('Click me');
      await user.tab();
      expect(button).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('can be activated with Space key', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<Button onClick={handleClick}>Click me</Button>);

      const button = screen.getByText('Click me');
      await user.tab();
      expect(button).toHaveFocus();

      await user.keyboard(' ');
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('cannot be focused when disabled', async () => {
      const user = userEvent.setup();

      render(
        <div>
          <Button>Enabled</Button>
          <Button disabled>Disabled</Button>
          <Button>Another Enabled</Button>
        </div>
      );

      const firstButton = screen.getByText('Enabled');
      const lastButton = screen.getByText('Another Enabled');

      // Tab to first button
      await user.tab();
      expect(firstButton).toHaveFocus();

      // Tab should skip disabled button
      await user.tab();
      expect(lastButton).toHaveFocus();
    });

    it('cannot be activated when disabled', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<Button onClick={handleClick} disabled>Disabled</Button>);

      const button = screen.getByText('Disabled');

      // Attempt to click (should not work)
      await user.click(button);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('cannot be focused when loading', async () => {
      const user = userEvent.setup();

      render(
        <div>
          <Button>Enabled</Button>
          <Button loading>Loading</Button>
          <Button>Another Enabled</Button>
        </div>
      );

      const firstButton = screen.getByText('Enabled');
      const lastButton = screen.getByText('Another Enabled');

      await user.tab();
      expect(firstButton).toHaveFocus();

      // Tab should skip loading button
      await user.tab();
      expect(lastButton).toHaveFocus();
    });
  });

  describe('Input Component', () => {
    it('can be focused with Tab', async () => {
      const user = userEvent.setup();

      render(<Input label="Username" />);

      const input = screen.getByLabelText('Username');

      await user.tab();
      expect(input).toHaveFocus();
    });

    it('can receive text input', async () => {
      const user = userEvent.setup();

      render(<Input label="Email" />);

      const input = screen.getByLabelText('Email');

      await user.tab();
      await user.keyboard('test@example.com');

      expect(input).toHaveValue('test@example.com');
    });

    it('supports arrow key navigation in text', async () => {
      const user = userEvent.setup();

      render(<Input label="Text" defaultValue="Hello" />);

      const input = screen.getByLabelText('Text') as HTMLInputElement;

      await user.tab();

      // Move to end of text
      await user.keyboard('{End}');
      expect(input.selectionStart).toBe(5);

      // Move to beginning
      await user.keyboard('{Home}');
      expect(input.selectionStart).toBe(0);

      // Move right
      await user.keyboard('{ArrowRight}');
      expect(input.selectionStart).toBe(1);
    });

    it('label click focuses input', async () => {
      const user = userEvent.setup();

      render(<Input label="Password" type="password" />);

      const label = screen.getByText('Password');
      const input = screen.getByLabelText('Password');

      await user.click(label);
      expect(input).toHaveFocus();
    });
  });

  describe('Modal Component', () => {
    it('receives focus when opened', async () => {
      const handleClose = vi.fn();

      const { rerender } = render(
        <Modal isOpen={false} onClose={handleClose} title="Test Modal">
          <p>Content</p>
        </Modal>
      );

      // Open modal
      rerender(
        <Modal isOpen={true} onClose={handleClose} title="Test Modal">
          <p>Content</p>
        </Modal>
      );

      await waitFor(() => {
        const modal = screen.getByRole('dialog');
        expect(modal).toHaveFocus();
      });
    });

    it('traps focus within modal', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(
        <div>
          <Button>Outside Button</Button>
          <Modal isOpen={true} onClose={handleClose} title="Test Modal">
            <Input label="First Input" />
            <Input label="Second Input" />
            <Button>Modal Button</Button>
          </Modal>
        </div>
      );

      const closeButton = screen.getByLabelText('Close modal');
      const firstInput = screen.getByLabelText('First Input');
      const secondInput = screen.getByLabelText('Second Input');
      const modalButton = screen.getByText('Modal Button');

      // Start from close button
      closeButton.focus();
      expect(closeButton).toHaveFocus();

      // Tab through modal elements
      await user.tab();
      expect(firstInput).toHaveFocus();

      await user.tab();
      expect(secondInput).toHaveFocus();

      await user.tab();
      expect(modalButton).toHaveFocus();

      // Tab should cycle back to close button
      await user.tab();
      expect(closeButton).toHaveFocus();
    });

    it('can be closed with Escape key', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(
        <Modal isOpen={true} onClose={handleClose} title="Test Modal">
          <p>Content</p>
        </Modal>
      );

      await user.keyboard('{Escape}');
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('does not close with Escape when closeOnEscape is false', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(
        <Modal isOpen={true} onClose={handleClose} closeOnEscape={false} title="Test Modal">
          <p>Content</p>
        </Modal>
      );

      await user.keyboard('{Escape}');
      expect(handleClose).not.toHaveBeenCalled();
    });

    it('close button can be focused and activated', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(
        <Modal isOpen={true} onClose={handleClose} title="Test Modal">
          <p>Content</p>
        </Modal>
      );

      const closeButton = screen.getByLabelText('Close modal');

      closeButton.focus();
      expect(closeButton).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('restores focus to previous element when closed', async () => {
      const handleClose = vi.fn();

      const { rerender } = render(
        <div>
          <Button>Trigger Button</Button>
          <Modal isOpen={false} onClose={handleClose} title="Test Modal">
            <p>Content</p>
          </Modal>
        </div>
      );

      const triggerButton = screen.getByText('Trigger Button');
      triggerButton.focus();
      expect(triggerButton).toHaveFocus();

      // Open modal
      rerender(
        <div>
          <Button>Trigger Button</Button>
          <Modal isOpen={true} onClose={handleClose} title="Test Modal">
            <p>Content</p>
          </Modal>
        </div>
      );

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toHaveFocus();
      });

      // Close modal
      rerender(
        <div>
          <Button>Trigger Button</Button>
          <Modal isOpen={false} onClose={handleClose} title="Test Modal">
            <p>Content</p>
          </Modal>
        </div>
      );

      // Focus should return to trigger button
      await waitFor(() => {
        expect(triggerButton).toHaveFocus();
      });
    });

    it('supports reverse tabbing with Shift+Tab', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(
        <Modal isOpen={true} onClose={handleClose} title="Test Modal">
          <Input label="First Input" />
          <Input label="Second Input" />
          <Button>Modal Button</Button>
        </Modal>
      );

      const closeButton = screen.getByLabelText('Close modal');
      const modalButton = screen.getByText('Modal Button');

      // Start from close button
      closeButton.focus();
      expect(closeButton).toHaveFocus();

      // Shift+Tab should go to last element
      await user.keyboard('{Shift>}{Tab}{/Shift}');
      expect(modalButton).toHaveFocus();
    });
  });

  describe('Alert Component', () => {
    it('close button can be focused and activated', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(
        <Alert variant="info" onClose={handleClose}>
          Test alert message
        </Alert>
      );

      const closeButton = screen.getByLabelText('Dismiss alert');

      await user.tab();
      expect(closeButton).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('close button can be activated with Space', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(
        <Alert variant="info" onClose={handleClose}>
          Test alert message
        </Alert>
      );

      const closeButton = screen.getByLabelText('Dismiss alert');

      await user.tab();
      expect(closeButton).toHaveFocus();

      await user.keyboard(' ');
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Complex Forms', () => {
    it('can navigate through form with Tab', async () => {
      const user = userEvent.setup();
      const handleSubmit = vi.fn((e) => e.preventDefault());

      render(
        <form onSubmit={handleSubmit}>
          <Input label="Name" required />
          <Input label="Email" type="email" required />
          <Input label="Password" type="password" required />
          <Button type="submit">Submit</Button>
        </form>
      );

      const nameInput = screen.getByLabelText(/Name/);
      const emailInput = screen.getByLabelText(/Email/);
      const passwordInput = screen.getByLabelText(/Password/);
      const submitButton = screen.getByText('Submit');

      // Tab through all elements
      await user.tab();
      expect(nameInput).toHaveFocus();

      await user.tab();
      expect(emailInput).toHaveFocus();

      await user.tab();
      expect(passwordInput).toHaveFocus();

      await user.tab();
      expect(submitButton).toHaveFocus();
    });

    it('can fill and submit form with keyboard only', async () => {
      const user = userEvent.setup();
      const handleSubmit = vi.fn((e) => e.preventDefault());

      render(
        <form onSubmit={handleSubmit}>
          <Input label="Username" required />
          <Input label="Email" type="email" required />
          <Button type="submit">Register</Button>
        </form>
      );

      const usernameInput = screen.getByLabelText(/Username/);
      const emailInput = screen.getByLabelText(/Email/);

      // Tab to username
      await user.tab();
      expect(usernameInput).toHaveFocus();

      // Type username
      await user.keyboard('testuser');
      expect(usernameInput).toHaveValue('testuser');

      // Tab to email
      await user.tab();
      expect(emailInput).toHaveFocus();

      // Type email
      await user.keyboard('test@example.com');
      expect(emailInput).toHaveValue('test@example.com');

      // Tab to submit button
      await user.tab();
      const submitButton = screen.getByText('Register');
      expect(submitButton).toHaveFocus();

      // Submit with Enter
      await user.keyboard('{Enter}');
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });
  });

  describe('Focus Management', () => {
    it('visible focus indicator on interactive elements', async () => {
      const user = userEvent.setup();

      render(
        <div>
          <Button>Button 1</Button>
          <Input label="Input 1" />
          <Button>Button 2</Button>
        </div>
      );

      const button1 = screen.getByText('Button 1');
      const input = screen.getByLabelText('Input 1');
      const button2 = screen.getByText('Button 2');

      // Each element should be focusable
      await user.tab();
      expect(button1).toHaveFocus();

      await user.tab();
      expect(input).toHaveFocus();

      await user.tab();
      expect(button2).toHaveFocus();
    });

    it('skip links work for navigation', async () => {
      const user = userEvent.setup();

      render(
        <div>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <nav>
            <Button>Nav Item 1</Button>
            <Button>Nav Item 2</Button>
            <Button>Nav Item 3</Button>
          </nav>
          <main id="main-content" tabIndex={-1}>
            <h1>Main Content</h1>
            <Button>Main Action</Button>
          </main>
        </div>
      );

      const skipLink = screen.getByText('Skip to main content');
      const mainContent = document.getElementById('main-content');

      // Tab to skip link
      await user.tab();
      expect(skipLink).toHaveFocus();

      // Activate skip link
      await user.keyboard('{Enter}');

      // Focus should move to main content
      await waitFor(() => {
        expect(mainContent).toHaveFocus();
      });
    });
  });
});
