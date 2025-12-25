import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the ClearSide Debate Page
 *
 * Handles interaction with the live debate stream, including:
 * - Watching the debate progress through phases
 * - Reading arguments from Pro, Con, and Moderator agents
 * - Pausing/resuming debates
 * - Interventions and challenges
 */
export class DebatePage {
  readonly page: Page;
  readonly streamTitle: Locator;
  readonly proposition: Locator;
  readonly phaseIndicator: Locator;
  readonly statusBadge: Locator;
  readonly errorAlert: Locator;
  readonly pauseButton: Locator;
  readonly resumeButton: Locator;
  readonly autoScrollButton: Locator;
  readonly streamContent: Locator;
  readonly turnCards: Locator;
  readonly streamingTurn: Locator;
  readonly completionMessage: Locator;
  readonly waitingState: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header elements
    this.streamTitle = page.getByRole('heading', { name: /debate stream/i });
    this.proposition = page.getByText(/proposition:/i);
    this.phaseIndicator = page.locator('[class*="phaseIndicator"]');
    this.statusBadge = page.locator('[class*="status"]').first();

    // Error handling
    this.errorAlert = page.getByText(/an error occurred/i);

    // Controls
    this.pauseButton = page.getByRole('button', { name: /pause debate/i });
    this.resumeButton = page.getByRole('button', { name: /resume debate/i });
    this.autoScrollButton = page.getByRole('button', { name: /auto-scroll/i });

    // Stream content
    this.streamContent = page.locator('[class*="streamContent"]');
    this.turnCards = page.locator('[class*="turnCard"]');
    this.streamingTurn = page.locator('[class*="streamingTurn"]');
    this.completionMessage = page.getByText(/debate complete/i);
    this.waitingState = page.getByText(/waiting for debate to begin/i);
    this.emptyState = page.getByText(/no active debate/i);
  }

  /**
   * Navigate to the debate page
   * @param debateId - Optional debate ID to navigate to specific debate
   */
  async goto(debateId?: string) {
    if (debateId) {
      await this.page.goto(`/debate/${debateId}`);
    } else {
      await this.page.goto('/');
    }
  }

  /**
   * Wait for the proposition to be displayed
   */
  async waitForProposition(timeout = 10000) {
    await this.proposition.waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for a specific phase to start
   * @param phaseName - Name of the phase (e.g., "Opening", "Constructive")
   */
  async waitForPhase(phaseName: string, timeout = 30000) {
    await this.page
      .getByText(new RegExp(phaseName, 'i'))
      .first()
      .waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for the debate to complete
   */
  async waitForCompletion(timeout = 120000) {
    await this.completionMessage.waitFor({ state: 'visible', timeout });
  }

  /**
   * Get all completed turns
   */
  async getTurns() {
    return await this.turnCards.all();
  }

  /**
   * Get the count of completed turns
   */
  async getTurnCount(): Promise<number> {
    return await this.turnCards.count();
  }

  /**
   * Get the content of a specific turn
   * @param index - Zero-based index of the turn
   */
  async getTurnContent(index: number): Promise<string> {
    const turns = await this.getTurns();
    if (index >= turns.length) {
      throw new Error(`Turn ${index} not found. Only ${turns.length} turns available.`);
    }
    return (await turns[index].textContent()) || '';
  }

  /**
   * Get the current streaming content (if any)
   */
  async getStreamingContent(): Promise<string | null> {
    if (await this.streamingTurn.isVisible()) {
      return await this.streamingTurn.textContent();
    }
    return null;
  }

  /**
   * Pause the debate
   */
  async pause() {
    await this.pauseButton.click();
    await this.resumeButton.waitFor({ state: 'visible' });
  }

  /**
   * Resume the debate
   */
  async resume() {
    await this.resumeButton.click();
    await this.pauseButton.waitFor({ state: 'visible' });
  }

  /**
   * Toggle auto-scroll
   */
  async toggleAutoScroll() {
    await this.autoScrollButton.click();
  }

  /**
   * Check if the debate is live
   */
  async isLive(): Promise<boolean> {
    const badge = await this.statusBadge.textContent();
    return badge?.toLowerCase().includes('live') || false;
  }

  /**
   * Check if the debate is paused
   */
  async isPaused(): Promise<boolean> {
    const badge = await this.statusBadge.textContent();
    return badge?.toLowerCase().includes('paused') || false;
  }

  /**
   * Check if the debate is completed
   */
  async isCompleted(): Promise<boolean> {
    return await this.completionMessage.isVisible();
  }

  /**
   * Check if there's an error
   */
  async hasError(): Promise<boolean> {
    return await this.errorAlert.isVisible();
  }

  /**
   * Get the current phase name
   */
  async getCurrentPhase(): Promise<string> {
    const phaseText = await this.phaseIndicator.textContent();
    return phaseText?.trim() || '';
  }

  /**
   * Wait for at least N turns to be completed
   * @param count - Minimum number of turns to wait for
   */
  async waitForMinimumTurns(count: number, timeout = 60000) {
    await this.page.waitForFunction(
      (minCount) => {
        const turns = document.querySelectorAll('[class*="turnCard"]');
        return turns.length >= minCount;
      },
      count,
      { timeout }
    );
  }

  /**
   * Select a specific turn by index
   * @param index - Zero-based index of the turn
   */
  async selectTurn(index: number) {
    const turns = await this.getTurns();
    if (index < turns.length) {
      await turns[index].click();
    }
  }
}
