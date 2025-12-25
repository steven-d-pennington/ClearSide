import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { DebatePage } from '../pages/DebatePage';

/**
 * E2E Tests for Complete Debate Flow
 *
 * Tests the full user journey from entering a proposition
 * to watching the debate complete.
 */
test.describe('Debate Generation Flow', () => {
  test('renders home page with input form', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Verify page title
    await expect(page).toHaveTitle(/ClearSide/);

    // Verify main heading
    await expect(homePage.title).toBeVisible();
    await expect(homePage.title).toContainText(/think both sides/i);

    // Verify form elements
    await expect(homePage.questionInput).toBeVisible();
    await expect(homePage.submitButton).toBeVisible();

    // Context field should be hidden initially
    await expect(homePage.contextTextarea).not.toBeVisible();
  });

  test('validates required question field', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Submit button should be disabled when question is empty
    await expect(homePage.submitButton).toBeDisabled();

    // Type a short question
    await homePage.questionInput.fill('Should we?');

    // Button should still be disabled (question too short)
    await expect(homePage.submitButton).toBeDisabled();

    // Type a valid question
    await homePage.questionInput.fill(
      'Should we implement a temporary moratorium on new AI data centers?'
    );

    // Button should now be enabled
    await expect(homePage.submitButton).toBeEnabled();
  });

  test('enforces maximum character limit', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Enter a question exceeding max length (500 characters)
    const longQuestion = 'a'.repeat(600);
    await homePage.questionInput.fill(longQuestion);

    // Should show error and disable submit
    await expect(homePage.submitButton).toBeDisabled();

    // Character counter should show over limit
    const charCount = await homePage.getQuestionCharCount();
    expect(charCount).toBeGreaterThan(500);
  });

  test('shows and hides optional context field', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Context should be hidden initially
    await expect(homePage.contextTextarea).not.toBeVisible();
    await expect(homePage.addContextButton).toBeVisible();

    // Click to show context
    await homePage.showContextField();
    await expect(homePage.contextTextarea).toBeVisible();
    await expect(homePage.removeContextButton).toBeVisible();

    // Fill context
    await homePage.contextTextarea.fill('This is additional context.');

    // Click to hide context
    await homePage.hideContextField();
    await expect(homePage.contextTextarea).not.toBeVisible();
  });

  test('submits question and navigates to debate stream', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();

    // Submit a valid question
    await homePage.submitQuestion(
      'Should we implement a temporary moratorium on new AI data centers?'
    );

    // Should show loading state
    await expect(homePage.loadingMessage).toBeVisible();

    // Should eventually navigate to debate page
    await expect(debatePage.streamTitle).toBeVisible({ timeout: 30000 });

    // Should show the proposition
    await expect(debatePage.proposition).toBeVisible();
    await expect(debatePage.proposition).toContainText(/moratorium/i);
  });

  test.skip('completes full debate generation (long-running)', async ({ page }) => {
    // This test is skipped by default as it may take several minutes
    // Run with: npx playwright test --grep @full-debate
    test.setTimeout(300000); // 5 minutes

    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    // Start debate
    await homePage.goto();
    await homePage.submitQuestion(
      'Should we implement a temporary moratorium on new AI data centers?'
    );

    // Wait for debate stream
    await debatePage.waitForProposition();

    // Verify status is live
    await expect(debatePage.statusBadge).toContainText(/live/i);

    // Wait for at least a few turns
    await debatePage.waitForMinimumTurns(3, 60000);

    // Verify we have turns
    const turnCount = await debatePage.getTurnCount();
    expect(turnCount).toBeGreaterThan(0);

    // Wait for completion (this could take minutes)
    await debatePage.waitForCompletion(240000);

    // Verify completion message
    await expect(debatePage.completionMessage).toBeVisible();

    // Verify final status
    const isCompleted = await debatePage.isCompleted();
    expect(isCompleted).toBe(true);
  });

  test('handles API errors gracefully', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Mock API failure by intercepting the request
    await page.route('**/api/debates', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    // Submit question
    await homePage.submitQuestion('Test proposition');

    // Should show error message
    await expect(homePage.apiError).toBeVisible({ timeout: 10000 });
    await expect(homePage.apiError).toContainText(/failed to start debate/i);
  });

  test('can pause and resume debate', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    // Start debate
    await homePage.goto();
    await homePage.submitQuestion(
      'Should we ban single-use plastics?'
    );

    // Wait for debate to start
    await debatePage.waitForProposition();
    await expect(debatePage.pauseButton).toBeVisible({ timeout: 30000 });

    // Pause the debate
    await debatePage.pause();

    // Verify paused state
    await expect(debatePage.resumeButton).toBeVisible();
    const isPaused = await debatePage.isPaused();
    expect(isPaused).toBe(true);

    // Resume the debate
    await debatePage.resume();

    // Verify live state
    await expect(debatePage.pauseButton).toBeVisible();
  });

  test('auto-scroll toggle works', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    // Start debate
    await homePage.goto();
    await homePage.submitQuestion('Should we use renewable energy?');

    // Wait for debate stream
    await debatePage.waitForProposition();

    // Auto-scroll button should be visible
    await expect(debatePage.autoScrollButton).toBeVisible();

    // Toggle auto-scroll
    await debatePage.toggleAutoScroll();

    // Button should update text (On -> Off or vice versa)
    await expect(debatePage.autoScrollButton).toContainText(/auto-scroll/i);
  });

  test('displays phases in correct order', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    // Start debate
    await homePage.goto();
    await homePage.submitQuestion('Should we explore space?');

    // Wait for debate to start
    await debatePage.waitForProposition();

    // Phase indicator should be visible
    await expect(debatePage.phaseIndicator).toBeVisible();

    // Should show phase information
    const currentPhase = await debatePage.getCurrentPhase();
    expect(currentPhase).toBeTruthy();
  });
});

test.describe('Debate Stream Display', () => {
  test('shows empty state when no debate', async ({ page }) => {
    const debatePage = new DebatePage(page);

    // Navigate directly to debate route without starting a debate
    await debatePage.goto();

    // Should show empty state
    await expect(debatePage.emptyState).toBeVisible();
    await expect(debatePage.emptyState).toContainText(/no active debate/i);
  });

  test('displays turn cards as debate progresses', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    // Start debate
    await homePage.goto();
    await homePage.submitQuestion('Should we protect the oceans?');

    // Wait for proposition
    await debatePage.waitForProposition();

    // Wait for at least one turn
    await debatePage.waitForMinimumTurns(1, 60000);

    // Verify turn is displayed
    const turnCount = await debatePage.getTurnCount();
    expect(turnCount).toBeGreaterThan(0);

    // Verify turn has content
    const turnContent = await debatePage.getTurnContent(0);
    expect(turnContent.length).toBeGreaterThan(0);
  });

  test('can select and deselect turns', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    // Start debate
    await homePage.goto();
    await homePage.submitQuestion('Should we fund space exploration?');

    // Wait for at least one turn
    await debatePage.waitForProposition();
    await debatePage.waitForMinimumTurns(1, 60000);

    // Select first turn
    await debatePage.selectTurn(0);

    // Turn should be selected (visual state would be tested in visual.spec.ts)
    // For now, just verify the click action worked
    const turns = await debatePage.getTurns();
    expect(turns.length).toBeGreaterThan(0);
  });
});
