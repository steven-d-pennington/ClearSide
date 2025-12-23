# TEST-003: End-to-End Testing with Playwright

**Task ID:** TEST-003
**Phase:** Phase 1 - MVP
**Category:** Testing
**Priority:** P1 (High - Quality Assurance)
**Estimated Effort:** 3-4 days
**Dependencies:** TEST-001, TEST-002, All UI components
**Status:** TO DO

---

## Overview

Implement end-to-end tests using Playwright to verify the complete user journey from landing page through debate generation to challenging arguments. Test across multiple browsers (Chrome, Firefox, Safari) and devices (desktop, tablet, mobile).

### Related Documentation
- **Requirements:** `docs/REQUIREMENTS.md` - E2E testing requirements
- **Kanban:** `docs/KANBAN.md` - Task TEST-003

---

## Objectives

1. **Playwright setup** with TypeScript support
2. **User journey tests** (happy path and error scenarios)
3. **Cross-browser testing** (Chrome, Firefox, Safari/WebKit)
4. **Mobile/responsive testing** on different viewports
5. **Visual regression testing** with screenshots
6. **Performance testing** (load times, Core Web Vitals)

---

## Acceptance Criteria

- [ ] Playwright configured for all browsers
- [ ] Complete user journeys tested
- [ ] Tests pass on desktop and mobile viewports
- [ ] Visual regression tests capture UI changes
- [ ] Performance assertions for key metrics
- [ ] Tests run in CI/CD pipeline
- [ ] Test reports generated with screenshots

---

## Technical Specification

### Playwright Configuration

```typescript
// playwright.config.ts

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'Tablet',
      use: { ...devices['iPad Pro'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

### Page Object Model

```typescript
// e2e/pages/HomePage.ts

import { Page, Locator } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly questionInput: Locator;
  readonly contextTextarea: Locator;
  readonly submitButton: Locator;
  readonly charCounter: Locator;

  constructor(page: Page) {
    this.page = page;
    this.questionInput = page.getByLabel(/your question/i);
    this.contextTextarea = page.getByLabel(/additional context/i);
    this.submitButton = page.getByRole('button', { name: /analyze/i });
    this.charCounter = page.getByText(/\d+ \/ 500/);
  }

  async goto() {
    await this.page.goto('/');
  }

  async submitQuestion(question: string, context?: string) {
    await this.questionInput.fill(question);
    if (context) {
      await this.contextTextarea.fill(context);
    }
    await this.submitButton.click();
  }

  async waitForAnalysisStart() {
    await this.page.waitForSelector('text=/analyzing/i');
  }
}
```

```typescript
// e2e/pages/ResultsPage.ts

import { Page, Locator } from '@playwright/test';

export class ResultsPage {
  readonly page: Page;
  readonly propositionSection: Locator;
  readonly proSection: Locator;
  readonly conSection: Locator;
  readonly moderatorSection: Locator;
  readonly timeline: Locator;
  readonly challengeButtons: Locator;

  constructor(page: Page) {
    this.page = page;
    this.propositionSection = page.getByRole('region', { name: /proposition/i });
    this.proSection = page.getByRole('region', { name: /arguments for/i });
    this.conSection = page.getByRole('region', { name: /arguments against/i });
    this.moderatorSection = page.getByRole('region', { name: /synthesis/i });
    this.timeline = page.getByRole('navigation', { name: /timeline/i });
    this.challengeButtons = page.getByRole('button', { name: /challenge/i });
  }

  async waitForProposition() {
    await this.propositionSection.waitFor({ state: 'visible' });
  }

  async waitForProArguments() {
    await this.proSection.waitFor({ state: 'visible' });
  }

  async waitForConArguments() {
    await this.conSection.waitFor({ state: 'visible' });
  }

  async waitForModerator() {
    await this.moderatorSection.waitFor({ state: 'visible' });
  }

  async challengeArgument(index: number = 0) {
    await this.challengeButtons.nth(index).click();
  }

  async waitForComplete() {
    await this.page.waitForSelector('text=/analysis complete/i');
  }
}
```

### Complete User Journey Tests

```typescript
// e2e/tests/debateFlow.spec.ts

import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { ResultsPage } from '../pages/ResultsPage';

test.describe('Debate Generation Flow', () => {
  test('completes full debate generation', async ({ page }) => {
    const homePage = new HomePage(page);
    const resultsPage = new ResultsPage(page);

    // Navigate to home page
    await homePage.goto();
    await expect(page).toHaveTitle(/ClearSide/);

    // Submit question
    await homePage.submitQuestion(
      'Should we implement a temporary moratorium on new AI data centers?'
    );

    // Wait for analysis to start
    await homePage.waitForAnalysisStart();
    await expect(page.getByText(/analyzing/i)).toBeVisible();

    // Wait for proposition
    await resultsPage.waitForProposition();
    await expect(resultsPage.propositionSection).toContainText('moratorium');

    // Wait for pro arguments
    await resultsPage.waitForProArguments();
    await expect(resultsPage.proSection).toBeVisible();

    // Wait for con arguments
    await resultsPage.waitForConArguments();
    await expect(resultsPage.conSection).toBeVisible();

    // Wait for moderator synthesis
    await resultsPage.waitForModerator();
    await expect(resultsPage.moderatorSection).toBeVisible();

    // Verify completion
    await resultsPage.waitForComplete();
    await expect(page.getByText(/analysis complete/i)).toBeVisible();

    // Verify timeline shows all stages complete
    await expect(resultsPage.timeline).toBeVisible();
  });

  test('validates input before submission', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Try to submit empty form
    await homePage.submitButton.click();

    // Should not navigate, button should be disabled
    await expect(homePage.submitButton).toBeDisabled();
  });

  test('handles very long questions gracefully', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Enter question exceeding max length
    const longQuestion = 'a'.repeat(600);
    await homePage.questionInput.fill(longQuestion);

    // Should show error
    await expect(page.getByText(/must be no more than 500/i)).toBeVisible();
    await expect(homePage.submitButton).toBeDisabled();
  });
});
```

### Challenge Flow Tests

```typescript
// e2e/tests/challengeFlow.spec.ts

import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { ResultsPage } from '../pages/ResultsPage';

test.describe('Challenge Flow', () => {
  test('allows user to challenge an argument', async ({ page }) => {
    const homePage = new HomePage(page);
    const resultsPage = new ResultsPage(page);

    // Complete debate generation first
    await homePage.goto();
    await homePage.submitQuestion('Should we ban single-use plastics?');
    await resultsPage.waitForComplete();

    // Challenge first argument
    await resultsPage.challengeArgument(0);

    // Modal should open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/challenge argument/i)).toBeVisible();

    // Select challenge type
    await page.getByLabel(/request more evidence/i).click();

    // Enter challenge text
    await page.getByPlaceholder(/what specific evidence/i).fill(
      'What studies support this claim?'
    );

    // Submit challenge
    await page.getByRole('button', { name: /submit challenge/i }).click();

    // Wait for response
    await expect(page.getByText(/challenge response/i)).toBeVisible({
      timeout: 20000,
    });

    // Modal should close
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
```

### Cross-Browser Tests

```typescript
// e2e/tests/crossBrowser.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Cross-Browser Compatibility', () => {
  test('renders correctly in all browsers', async ({ page, browserName }) => {
    await page.goto('/');

    // Take screenshot for visual comparison
    await expect(page).toHaveScreenshot(`home-${browserName}.png`);

    // Verify critical elements
    await expect(page.getByRole('heading', { name: /think both sides/i })).toBeVisible();
    await expect(page.getByLabel(/your question/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /analyze/i })).toBeVisible();
  });
});
```

### Mobile Responsive Tests

```typescript
// e2e/tests/responsive.spec.ts

import { test, expect, devices } from '@playwright/test';

test.describe('Mobile Responsiveness', () => {
  test.use(devices['iPhone 12']);

  test('mobile navigation works correctly', async ({ page }) => {
    await page.goto('/');

    // Hamburger menu should be visible
    const hamburger = page.getByRole('button', { name: /open menu/i });
    await expect(hamburger).toBeVisible();

    // Click to open menu
    await hamburger.click();

    // Menu should slide in
    await expect(page.getByRole('dialog', { name: /menu/i })).toBeVisible();

    // Can navigate
    await page.getByRole('link', { name: /how it works/i }).click();
    await expect(page).toHaveURL(/how-it-works/);
  });

  test('input form adapts to mobile', async ({ page }) => {
    await page.goto('/');

    const questionInput = page.getByLabel(/your question/i);
    await expect(questionInput).toBeVisible();

    // Form should be full-width on mobile
    const box = await questionInput.boundingBox();
    const viewport = page.viewportSize()!;

    expect(box!.width).toBeGreaterThan(viewport.width * 0.8);
  });
});
```

### Performance Tests

```typescript
// e2e/tests/performance.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Performance', () => {
  test('meets Core Web Vitals', async ({ page }) => {
    await page.goto('/');

    // Measure performance
    const metrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const paint = entries.find((entry) => entry.name === 'first-contentful-paint');

          resolve({
            fcp: paint ? paint.startTime : 0,
          });
        }).observe({ entryTypes: ['paint'] });
      });
    });

    // FCP should be < 1500ms
    expect((metrics as any).fcp).toBeLessThan(1500);
  });

  test('loads quickly on 3G', async ({ page, context }) => {
    // Simulate 3G network
    await context.route('**/*', (route) => route.continue());

    const startTime = Date.now();
    await page.goto('/');
    const loadTime = Date.now() - startTime;

    // Should load within 5 seconds on 3G
    expect(loadTime).toBeLessThan(5000);
  });
});
```

### Visual Regression Tests

```typescript
// e2e/tests/visual.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('home page matches screenshot', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveScreenshot('home-page.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('results page matches screenshot', async ({ page }) => {
    // Navigate to results page with pre-generated debate
    await page.goto('/analyze/test-session-123');

    // Wait for content to load
    await page.waitForSelector('text=/analysis complete/i');

    await expect(page).toHaveScreenshot('results-page.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('modal matches screenshot', async ({ page }) => {
    await page.goto('/analyze/test-session-123');

    // Open challenge modal
    await page.getByRole('button', { name: /challenge/i }).first().click();

    // Wait for modal animation
    await page.waitForTimeout(300);

    await expect(page.getByRole('dialog')).toHaveScreenshot('challenge-modal.png', {
      maxDiffPixels: 50,
    });
  });
});
```

---

## Implementation Steps

1. **Day 1:** Set up Playwright, create page objects
2. **Day 2:** Write user journey and challenge flow tests
3. **Day 3:** Add cross-browser, mobile, and performance tests
4. **Day 4:** Implement visual regression tests and CI integration

---

## Validation Steps

- [ ] All E2E tests pass on all browsers
- [ ] Mobile tests pass on different viewports
- [ ] Visual regression tests capture changes
- [ ] Performance tests meet targets
- [ ] Tests run in CI/CD
- [ ] Test reports generated with screenshots

---

**Last Updated:** 2025-12-23
