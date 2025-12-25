import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { DebatePage } from '../pages/DebatePage';

/**
 * E2E Visual Regression Tests
 *
 * Captures screenshots to detect unintended visual changes.
 * These tests help ensure UI consistency across releases.
 *
 * Note: First run will create baseline screenshots.
 * Subsequent runs compare against baselines.
 */
test.describe('Visual Regression - Home Page', () => {
  test('home page initial state', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.title.waitFor({ state: 'visible' });

    // Take full-page screenshot
    await expect(page).toHaveScreenshot('home-page-initial.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('home page with filled question', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.questionInput.fill(
      'Should we implement a temporary moratorium on new AI data centers?'
    );

    // Wait for character counter to update
    await expect(homePage.questionCharCounter).toBeVisible();

    await expect(page).toHaveScreenshot('home-page-filled.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('home page with context field visible', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.questionInput.fill('Should we use renewable energy?');
    await homePage.showContextField();
    await homePage.contextTextarea.fill(
      'Consider environmental impact, economic feasibility, and technological readiness.'
    );

    await expect(page).toHaveScreenshot('home-page-with-context.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('home page with validation error', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Enter text exceeding character limit
    const longQuestion = 'a'.repeat(600);
    await homePage.questionInput.fill(longQuestion);

    // Wait for error state
    await expect(homePage.submitButton).toBeDisabled();

    await expect(page).toHaveScreenshot('home-page-validation-error.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('home page loading state', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Intercept API to delay response
    await page.route('**/api/debates', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-123' }),
      });
    });

    // Submit form
    await homePage.submitQuestion('Test proposition');

    // Wait for loading state
    await homePage.loadingMessage.waitFor({ state: 'visible' });

    await expect(page).toHaveScreenshot('home-page-loading.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });
});

test.describe('Visual Regression - Debate Stream', () => {
  test('debate stream initial state', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we protect the environment?');

    // Wait for debate stream to load
    await debatePage.streamTitle.waitFor({ state: 'visible', timeout: 30000 });
    await debatePage.proposition.waitFor({ state: 'visible' });

    await expect(page).toHaveScreenshot('debate-stream-initial.png', {
      fullPage: true,
      maxDiffPixels: 150,
    });
  });

  test('debate stream with phase indicator', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we explore outer space?');

    // Wait for phase indicator
    await debatePage.phaseIndicator.waitFor({ state: 'visible', timeout: 30000 });

    // Capture just the phase indicator
    await expect(debatePage.phaseIndicator).toHaveScreenshot('phase-indicator.png', {
      maxDiffPixels: 50,
    });
  });

  test('debate stream with turn cards', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we invest in public transportation?');

    // Wait for at least one turn
    await debatePage.waitForProposition({ timeout: 30000 });
    await debatePage.waitForMinimumTurns(1, 60000);

    await expect(page).toHaveScreenshot('debate-stream-with-turns.png', {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test('debate stream paused state', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we conserve water?');

    // Wait for debate to start
    await debatePage.pauseButton.waitFor({ state: 'visible', timeout: 30000 });

    // Pause the debate
    await debatePage.pause();

    // Wait for paused state to render
    await debatePage.resumeButton.waitFor({ state: 'visible' });

    await expect(page).toHaveScreenshot('debate-stream-paused.png', {
      fullPage: true,
      maxDiffPixels: 150,
    });
  });

  test.skip('debate stream completed state', async ({ page }) => {
    // Skipped: Requires full debate completion which takes several minutes
    test.setTimeout(300000);

    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we protect endangered species?');

    // Wait for completion
    await debatePage.waitForCompletion(240000);

    await expect(page).toHaveScreenshot('debate-stream-completed.png', {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test('debate stream error state', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();

    // Mock SSE error
    await page.route('**/api/debates/*/stream', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Internal Server Error',
      });
    });

    await homePage.submitQuestion('Test proposition');

    // Wait for error state
    await debatePage.errorAlert.waitFor({ state: 'visible', timeout: 30000 });

    await expect(page).toHaveScreenshot('debate-stream-error.png', {
      fullPage: true,
      maxDiffPixels: 150,
    });
  });
});

test.describe('Visual Regression - Status Badges', () => {
  test('live status badge', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we use clean energy?');

    // Wait for live badge
    await debatePage.statusBadge.waitFor({ state: 'visible', timeout: 30000 });

    // Capture just the badge
    await expect(debatePage.statusBadge).toHaveScreenshot('status-badge-live.png', {
      maxDiffPixels: 20,
    });
  });

  test('paused status badge', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we reduce waste?');

    // Wait for debate and pause
    await debatePage.pauseButton.waitFor({ state: 'visible', timeout: 30000 });
    await debatePage.pause();

    // Capture paused badge
    await expect(debatePage.statusBadge).toHaveScreenshot('status-badge-paused.png', {
      maxDiffPixels: 20,
    });
  });
});

test.describe('Visual Regression - Components', () => {
  test('input form component', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Capture just the form area
    const form = page.locator('form');
    await expect(form).toHaveScreenshot('input-form-component.png', {
      maxDiffPixels: 100,
    });
  });

  test('submit button states', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Disabled state
    await expect(homePage.submitButton).toHaveScreenshot('button-disabled.png', {
      maxDiffPixels: 20,
    });

    // Enabled state
    await homePage.questionInput.fill('Should we build better cities?');
    await expect(homePage.submitButton).toHaveScreenshot('button-enabled.png', {
      maxDiffPixels: 20,
    });
  });

  test('character counter', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Initial state (0 characters)
    await expect(homePage.questionCharCounter).toHaveScreenshot('char-counter-empty.png', {
      maxDiffPixels: 10,
    });

    // Partial fill
    await homePage.questionInput.fill('Should we?');
    await expect(homePage.questionCharCounter).toHaveScreenshot('char-counter-partial.png', {
      maxDiffPixels: 10,
    });

    // Near limit
    const nearLimitText = 'a'.repeat(490);
    await homePage.questionInput.fill(nearLimitText);
    await expect(homePage.questionCharCounter).toHaveScreenshot('char-counter-near-limit.png', {
      maxDiffPixels: 10,
    });

    // Over limit
    const overLimitText = 'a'.repeat(510);
    await homePage.questionInput.fill(overLimitText);
    await expect(homePage.questionCharCounter).toHaveScreenshot('char-counter-over-limit.png', {
      maxDiffPixels: 10,
    });
  });
});

test.describe('Visual Regression - Cross-Browser', () => {
  test('home page renders consistently across browsers', async ({ page, browserName }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.questionInput.fill('Should we combat climate change?');

    await expect(page).toHaveScreenshot(`home-${browserName}.png`, {
      fullPage: true,
      maxDiffPixels: 150,
    });
  });

  test('debate stream renders consistently across browsers', async ({ page, browserName }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we protect forests?');

    // Wait for debate stream
    await debatePage.proposition.waitFor({ state: 'visible', timeout: 30000 });

    await expect(page).toHaveScreenshot(`debate-stream-${browserName}.png`, {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });
});

test.describe('Visual Regression - Dark Mode (if implemented)', () => {
  test.skip('home page in dark mode', async ({ page }) => {
    // This test is skipped until dark mode is implemented
    const homePage = new HomePage(page);

    // Set dark mode preference
    await page.emulateMedia({ colorScheme: 'dark' });

    await homePage.goto();

    await expect(page).toHaveScreenshot('home-page-dark.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test.skip('debate stream in dark mode', async ({ page }) => {
    // This test is skipped until dark mode is implemented
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    // Set dark mode preference
    await page.emulateMedia({ colorScheme: 'dark' });

    await homePage.goto();
    await homePage.submitQuestion('Should we innovate responsibly?');

    await debatePage.proposition.waitFor({ state: 'visible', timeout: 30000 });

    await expect(page).toHaveScreenshot('debate-stream-dark.png', {
      fullPage: true,
      maxDiffPixels: 150,
    });
  });
});
