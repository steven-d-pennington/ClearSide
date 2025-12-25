import { describe, it, expect, vi } from 'vitest';
import { render } from '@/test-utils';
import { axe } from 'vitest-axe';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

/**
 * Component Accessibility Tests
 *
 * These tests verify that all UI components meet WCAG 2.1 AA standards
 * using axe-core automated accessibility testing.
 */

describe('Component Accessibility (axe-core)', () => {
  describe('Button Component', () => {
    it('has no violations in default state', async () => {
      const { container } = render(<Button>Click me</Button>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations when disabled', async () => {
      const { container } = render(<Button disabled>Disabled button</Button>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations when loading', async () => {
      const { container } = render(<Button loading>Loading button</Button>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations with icon only (requires aria-label)', async () => {
      const { container } = render(
        <Button aria-label="Search">
          <svg aria-hidden="true" />
        </Button>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations in all variants', async () => {
      const variants = ['primary', 'secondary', 'ghost', 'danger', 'pro', 'con'] as const;

      for (const variant of variants) {
        const { container } = render(<Button variant={variant}>Button</Button>);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      }
    });
  });

  describe('Input Component', () => {
    it('has no violations with label', async () => {
      const { container } = render(<Input label="Email" type="email" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations with error message', async () => {
      const { container } = render(
        <Input label="Email" type="email" error="Invalid email address" />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations with helper text', async () => {
      const { container } = render(
        <Input label="Password" type="password" helperText="At least 8 characters" />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations when required', async () => {
      const { container } = render(<Input label="Username" required />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations with icons', async () => {
      const { container } = render(
        <Input
          label="Search"
          leftIcon={<svg aria-hidden="true" />}
          rightIcon={<svg aria-hidden="true" />}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Alert Component', () => {
    it('has no violations for info variant', async () => {
      const { container } = render(<Alert variant="info">Information message</Alert>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations for success variant', async () => {
      const { container } = render(<Alert variant="success">Success message</Alert>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations for warning variant', async () => {
      const { container } = render(<Alert variant="warning">Warning message</Alert>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations for error variant', async () => {
      const { container } = render(<Alert variant="error">Error message</Alert>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations with title', async () => {
      const { container } = render(
        <Alert variant="info" title="Important Information">
          This is an important message.
        </Alert>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations with close button', async () => {
      const handleClose = vi.fn();
      const { container } = render(
        <Alert variant="info" onClose={handleClose}>
          Dismissible alert
        </Alert>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Modal Component', () => {
    it('has no violations when open', async () => {
      const handleClose = vi.fn();
      const { container } = render(
        <Modal isOpen={true} onClose={handleClose} title="Test Modal">
          <p>Modal content goes here</p>
        </Modal>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations without title (should have aria-label)', async () => {
      const handleClose = vi.fn();
      const { container } = render(
        <Modal isOpen={true} onClose={handleClose}>
          <div aria-label="Untitled modal">
            <p>Modal content</p>
          </div>
        </Modal>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations with footer', async () => {
      const handleClose = vi.fn();
      const { container } = render(
        <Modal
          isOpen={true}
          onClose={handleClose}
          title="Confirm Action"
          footer={
            <>
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="primary">Confirm</Button>
            </>
          }
        >
          <p>Are you sure you want to proceed?</p>
        </Modal>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations in different sizes', async () => {
      const sizes = ['sm', 'md', 'lg', 'xl', 'full'] as const;
      const handleClose = vi.fn();

      for (const size of sizes) {
        const { container } = render(
          <Modal isOpen={true} onClose={handleClose} title="Test Modal" size={size}>
            <p>Content</p>
          </Modal>
        );
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      }
    });
  });

  describe('Badge Component', () => {
    it('has no violations in default state', async () => {
      const { container } = render(<Badge>New</Badge>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations in all variants', async () => {
      const variants = ['default', 'pro', 'con', 'neutral'] as const;

      for (const variant of variants) {
        const { container } = render(<Badge variant={variant}>Badge</Badge>);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      }
    });
  });

  describe('Card Component', () => {
    it('has no violations in default state', async () => {
      const { container } = render(
        <Card>
          <p>Card content</p>
        </Card>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations with header', async () => {
      const { container } = render(
        <Card header={<h3>Card Title</h3>}>
          <p>Card content</p>
        </Card>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations with footer', async () => {
      const { container } = render(
        <Card footer={<Button>Action</Button>}>
          <p>Card content</p>
        </Card>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Complex Combinations', () => {
    it('has no violations with form elements in modal', async () => {
      const handleClose = vi.fn();
      const handleSubmit = vi.fn();

      const { container } = render(
        <Modal isOpen={true} onClose={handleClose} title="Login Form">
          <form onSubmit={handleSubmit}>
            <Input label="Email" type="email" required />
            <Input label="Password" type="password" required />
            <Button type="submit">Login</Button>
          </form>
        </Modal>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations with alert containing interactive elements', async () => {
      const handleClose = vi.fn();
      const handleAction = vi.fn();

      const { container } = render(
        <Alert variant="warning" title="Confirmation Required" onClose={handleClose}>
          <p>This action cannot be undone.</p>
          <Button variant="danger" onClick={handleAction}>
            Proceed
          </Button>
        </Alert>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no violations with nested interactive elements in card', async () => {
      const { container } = render(
        <Card
          header={<h3>Settings</h3>}
          footer={
            <>
              <Button variant="secondary">Cancel</Button>
              <Button variant="primary">Save</Button>
            </>
          }
        >
          <Input label="Username" />
          <Input label="Email" type="email" />
        </Card>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
