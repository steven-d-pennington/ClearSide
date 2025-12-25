import { test, expect, devices } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { DebatePage } from '../pages/DebatePage';

/**
 * E2E Tests for Responsive Design
 *
 * Tests the application across different viewports and devices:
 * - Mobile phones (iPhone, Android)
 * - Tablets (iPad)
 * - Desktop browsers
 */
test.describe('Mobile Responsiveness - iPhone', () => {
  test.use(devices['iPhone 12']);

  test('home page renders correctly on mobile', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Main elements should be visible
    await expect(homePage.title).toBeVisible();
    await expect(homePage.questionInput).toBeVisible();
    await expect(homePage.submitButton).toBeVisible();

    // Take screenshot for visual comparison
    await expect(page).toHaveScreenshot('mobile-home-page.png', {
      fullPage: true,
    });
  });

  test('input form is usable on mobile', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Question input should be full-width and tappable
    const questionBox = await homePage.questionInput.boundingBox();
    const viewport = page.viewportSize()!;

    expect(questionBox).toBeTruthy();
    expect(questionBox!.width).toBeGreaterThan(viewport.width * 0.8);

    // Can fill input on mobile
    await homePage.questionInput.fill('Should we use solar energy?');

    // Character counter should be visible
    await expect(homePage.questionCharCounter).toBeVisible();

    // Submit button should be full-width or nearly full-width
    const submitBox = await homePage.submitButton.boundingBox();
    expect(submitBox!.width).toBeGreaterThan(viewport.width * 0.8);
  });

  test('debate stream is readable on mobile', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we protect rainforests?');

    // Wait for debate stream
    await debatePage.waitForProposition({ timeout: 30000 });

    // Stream should be visible and scrollable
    await expect(debatePage.streamContent).toBeVisible();

    // Proposition should wrap properly
    await expect(debatePage.proposition).toBeVisible();

    // Controls should be accessible
    await expect(debatePage.pauseButton).toBeVisible();
    await expect(debatePage.autoScrollButton).toBeVisible();
  });

  test('context field toggle works on mobile', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Add context button should be tappable
    await expect(homePage.addContextButton).toBeVisible();
    await homePage.addContextButton.click();

    // Context field should appear
    await expect(homePage.contextTextarea).toBeVisible();

    // Should be full-width on mobile
    const contextBox = await homePage.contextTextarea.boundingBox();
    const viewport = page.viewportSize()!;
    expect(contextBox!.width).toBeGreaterThan(viewport.width * 0.8);
  });

  test('phase indicator is visible on mobile', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we use electric vehicles?');

    // Wait for debate to start
    await debatePage.waitForProposition({ timeout: 30000 });

    // Phase indicator should be visible and readable
    await expect(debatePage.phaseIndicator).toBeVisible();

    // Should not overflow viewport
    const phaseBox = await debatePage.phaseIndicator.boundingBox();
    const viewport = page.viewportSize()!;
    expect(phaseBox!.width).toBeLessThanOrEqual(viewport.width);
  });
});

test.describe('Mobile Responsiveness - Android', () => {
  test.use(devices['Pixel 5']);

  test('home page renders correctly on Android', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Verify core elements
    await expect(homePage.title).toBeVisible();
    await expect(homePage.questionInput).toBeVisible();
    await expect(homePage.submitButton).toBeVisible();

    // Take screenshot
    await expect(page).toHaveScreenshot('android-home-page.png', {
      fullPage: true,
    });
  });

  test('can submit debate on Android', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();

    // Fill and submit form
    await homePage.submitQuestion('Should we colonize Mars?');

    // Should navigate to debate stream
    await expect(debatePage.streamTitle).toBeVisible({ timeout: 30000 });
    await expect(debatePage.proposition).toBeVisible();
  });

  test('touch interactions work on Android', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Tap to show context
    await homePage.addContextButton.tap();
    await expect(homePage.contextTextarea).toBeVisible();

    // Tap to remove context
    await homePage.removeContextButton.tap();
    await expect(homePage.contextTextarea).not.toBeVisible();
  });
});

test.describe('Tablet Responsiveness', () => {
  test.use(devices['iPad Pro']);

  test('home page uses tablet layout', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // All elements should be visible
    await expect(homePage.title).toBeVisible();
    await expect(homePage.questionInput).toBeVisible();
    await expect(homePage.submitButton).toBeVisible();

    // Form might be centered on tablet
    const viewport = page.viewportSize()!;
    const inputBox = await homePage.questionInput.boundingBox();

    // Should not be full-width like mobile (likely 70-90% of viewport)
    expect(inputBox!.width).toBeLessThan(viewport.width);
    expect(inputBox!.width).toBeGreaterThan(viewport.width * 0.5);

    // Take screenshot
    await expect(page).toHaveScreenshot('tablet-home-page.png', {
      fullPage: true,
    });
  });

  test('debate stream has good layout on tablet', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we develop AI responsibly?');

    // Wait for debate
    await debatePage.waitForProposition({ timeout: 30000 });

    // Stream should be readable
    await expect(debatePage.streamContent).toBeVisible();
    await expect(debatePage.phaseIndicator).toBeVisible();

    // Controls should be accessible
    await expect(debatePage.pauseButton).toBeVisible();
  });

  test('two-column layout works on tablet (if implemented)', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we protect biodiversity?');

    // Wait for debate
    await debatePage.waitForProposition({ timeout: 30000 });

    // On tablet, there might be more horizontal space
    // This test verifies the layout doesn't break
    const viewport = page.viewportSize()!;
    expect(viewport.width).toBeGreaterThan(1000);

    // Stream should use available space efficiently
    const streamBox = await debatePage.streamContent.boundingBox();
    expect(streamBox!.width).toBeGreaterThan(600);
  });
});

test.describe('Desktop Responsiveness', () => {
  test('home page has desktop layout', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Verify page loads
    await expect(homePage.title).toBeVisible();

    // Form should be centered and have max-width
    const viewport = page.viewportSize()!;
    const inputBox = await homePage.questionInput.boundingBox();

    // Should not be full-width on desktop
    expect(inputBox!.width).toBeLessThan(viewport.width);

    // Take screenshot
    await expect(page).toHaveScreenshot('desktop-home-page.png', {
      fullPage: true,
    });
  });

  test('debate stream has desktop layout', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we reduce carbon emissions?');

    // Wait for debate
    await debatePage.waitForProposition({ timeout: 30000 });

    // Stream should be visible
    await expect(debatePage.streamContent).toBeVisible();

    // Take screenshot
    await expect(page).toHaveScreenshot('desktop-debate-stream.png', {
      fullPage: true,
    });
  });

  test('all controls are accessible on desktop', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we invest in education?');

    // Wait for debate
    await debatePage.waitForProposition({ timeout: 30000 });

    // All controls should be clickable
    await expect(debatePage.pauseButton).toBeVisible();
    await expect(debatePage.autoScrollButton).toBeVisible();

    // Phase indicator should be visible
    await expect(debatePage.phaseIndicator).toBeVisible();
  });
});

test.describe('Viewport Breakpoints', () => {
  test('handles narrow viewport gracefully', async ({ page }) => {
    // Set very narrow viewport (320px - old iPhone SE)
    await page.setViewportSize({ width: 320, height: 568 });

    const homePage = new HomePage(page);
    await homePage.goto();

    // Should still be usable
    await expect(homePage.title).toBeVisible();
    await expect(homePage.questionInput).toBeVisible();
    await expect(homePage.submitButton).toBeVisible();

    // Elements should not overflow
    const inputBox = await homePage.questionInput.boundingBox();
    expect(inputBox!.width).toBeLessThanOrEqual(320);
  });

  test('handles wide viewport gracefully', async ({ page }) => {
    // Set ultra-wide viewport (2560px)
    await page.setViewportSize({ width: 2560, height: 1440 });

    const homePage = new HomePage(page);
    await homePage.goto();

    // Content should be centered and have max-width
    await expect(homePage.title).toBeVisible();

    const inputBox = await homePage.questionInput.boundingBox();

    // Should have reasonable max-width, not stretch full screen
    expect(inputBox!.width).toBeLessThan(1200);
  });

  test('handles portrait to landscape rotation', async ({ page }) => {
    const homePage = new HomePage(page);

    // Start in portrait (mobile)
    await page.setViewportSize({ width: 375, height: 812 });
    await homePage.goto();

    // Fill some content
    await homePage.questionInput.fill('Should we protect wildlife?');

    // Rotate to landscape
    await page.setViewportSize({ width: 812, height: 375 });

    // Content should be preserved
    const value = await homePage.questionInput.inputValue();
    expect(value).toBe('Should we protect wildlife?');

    // UI should adapt
    await expect(homePage.questionInput).toBeVisible();
    await expect(homePage.submitButton).toBeVisible();
  });
});
