import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the ClearSide Home Page
 *
 * Handles interaction with the debate input form where users
 * enter propositions to start a new debate.
 */
export class HomePage {
  readonly page: Page;
  readonly title: Locator;
  readonly questionInput: Locator;
  readonly contextTextarea: Locator;
  readonly addContextButton: Locator;
  readonly removeContextButton: Locator;
  readonly submitButton: Locator;
  readonly questionCharCounter: Locator;
  readonly contextCharCounter: Locator;
  readonly loadingMessage: Locator;
  readonly apiError: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header elements
    this.title = page.getByRole('heading', { name: /think both sides/i });

    // Form inputs
    this.questionInput = page.locator('#question');
    this.contextTextarea = page.locator('#context');

    // Context controls
    this.addContextButton = page.getByRole('button', { name: /add context/i });
    this.removeContextButton = page.getByRole('button', { name: /remove context/i });

    // Submit button
    this.submitButton = page.getByRole('button', { name: /start debate/i });

    // Character counters
    this.questionCharCounter = page.getByText(/\d+ \/ 500/);
    this.contextCharCounter = page.getByText(/\d+ \/ 2000/);

    // Loading and error states
    this.loadingMessage = page.getByRole('status', { name: /initializing/i });
    this.apiError = page.getByText(/failed to start debate/i);
  }

  /**
   * Navigate to the home page
   */
  async goto() {
    await this.page.goto('/');
  }

  /**
   * Submit a question to start a debate
   * @param question - The proposition to debate
   * @param context - Optional additional context
   */
  async submitQuestion(question: string, context?: string) {
    await this.questionInput.fill(question);

    if (context) {
      // Show context field if not already visible
      if (!(await this.contextTextarea.isVisible())) {
        await this.addContextButton.click();
        await this.contextTextarea.waitFor({ state: 'visible' });
      }
      await this.contextTextarea.fill(context);
    }

    await this.submitButton.click();
  }

  /**
   * Wait for the debate to start loading
   */
  async waitForDebateStart() {
    await this.loadingMessage.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Check if submit button is disabled
   */
  async isSubmitDisabled(): Promise<boolean> {
    return await this.submitButton.isDisabled();
  }

  /**
   * Get the current question character count
   */
  async getQuestionCharCount(): Promise<number> {
    const text = await this.questionCharCounter.textContent();
    const match = text?.match(/(\d+) \/ 500/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Show the optional context field
   */
  async showContextField() {
    if (!(await this.contextTextarea.isVisible())) {
      await this.addContextButton.click();
      await this.contextTextarea.waitFor({ state: 'visible' });
    }
  }

  /**
   * Hide the optional context field
   */
  async hideContextField() {
    if (await this.contextTextarea.isVisible()) {
      await this.removeContextButton.click();
      await this.contextTextarea.waitFor({ state: 'hidden' });
    }
  }

  /**
   * Check if validation error is shown
   */
  async hasValidationError(fieldName: 'question' | 'context'): Promise<boolean> {
    const input = fieldName === 'question' ? this.questionInput : this.contextTextarea;
    const errorMessage = this.page.locator(`[id="${fieldName}"] + .error`);
    return await errorMessage.isVisible().catch(() => false);
  }
}
