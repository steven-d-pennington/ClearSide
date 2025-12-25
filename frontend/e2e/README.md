# ClearSide E2E Testing with Playwright

This directory contains end-to-end tests for the ClearSide frontend application using [Playwright](https://playwright.dev/).

## Overview

The E2E test suite verifies the complete user journey through ClearSide, including:

- **Debate Flow**: Starting debates, watching live streams, phase transitions
- **Responsive Design**: Mobile, tablet, and desktop layouts
- **Visual Regression**: UI consistency across releases and browsers
- **Interventions**: User participation through questions, challenges, and evidence

## Directory Structure

```
e2e/
├── README.md              # This file
├── pages/                 # Page Object Models
│   ├── HomePage.ts        # Input form interactions
│   └── DebatePage.ts      # Debate stream interactions
└── tests/                 # Test specifications
    ├── debateFlow.spec.ts       # Main user journey tests
    ├── responsive.spec.ts       # Mobile/tablet/desktop tests
    ├── visual.spec.ts          # Visual regression tests
    └── interventionFlow.spec.ts # User intervention tests
```

## Getting Started

### 1. Install Dependencies

```bash
# Install Playwright and browsers
npm install
npx playwright install

# Or install specific browsers
npx playwright install chromium
npx playwright install firefox
npx playwright install webkit
```

### 2. Start the Development Server

Playwright will automatically start the dev server when running tests (configured in `playwright.config.ts`), but you can also start it manually:

```bash
npm run dev
```

The frontend should be running on http://localhost:5173

### 3. Run Tests

```bash
# Run all E2E tests
npm run e2e

# Run tests in UI mode (interactive)
npm run e2e:ui

# Run tests in headed mode (see browser)
npm run e2e:headed

# Run specific test file
npx playwright test debateFlow

# Run tests on specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Run tests on mobile
npx playwright test --project="Mobile Chrome"
npx playwright test --project="Mobile Safari"

# Debug tests
npm run e2e:debug
```

## Test Organization

### Page Object Models

Page objects encapsulate page interactions and provide reusable methods:

**HomePage** (`pages/HomePage.ts`)
- Input form interactions
- Question and context submission
- Validation and error states

**DebatePage** (`pages/DebatePage.ts`)
- Debate stream display
- Phase indicators
- Turn cards and streaming content
- Pause/resume controls
- Auto-scroll toggle

### Test Suites

**Debate Flow** (`tests/debateFlow.spec.ts`)
- Home page rendering
- Form validation
- Debate submission
- Live stream display
- Pause/resume functionality
- Phase transitions
- Turn card display

**Responsive Design** (`tests/responsive.spec.ts`)
- Mobile (iPhone 12, Pixel 5)
- Tablet (iPad Pro)
- Desktop
- Viewport breakpoints
- Touch interactions
- Portrait/landscape rotation

**Visual Regression** (`tests/visual.spec.ts`)
- Screenshot comparisons
- Component states (empty, loading, error)
- Cross-browser consistency
- Dark mode (when implemented)

**Intervention Flow** (`tests/interventionFlow.spec.ts`)
- Opening intervention panel
- Submitting interventions (question, challenge, evidence)
- Intervention status updates
- Targeted interventions
- Error handling

## Writing New Tests

### Using Page Objects

```typescript
import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { DebatePage } from '../pages/DebatePage';

test('my new test', async ({ page }) => {
  const homePage = new HomePage(page);
  const debatePage = new DebatePage(page);

  // Navigate and submit
  await homePage.goto();
  await homePage.submitQuestion('Should we test everything?');

  // Verify debate starts
  await debatePage.waitForProposition();
  await expect(debatePage.streamTitle).toBeVisible();
});
```

### Visual Regression Tests

```typescript
test('capture component state', async ({ page }) => {
  await page.goto('/');

  // Take screenshot
  await expect(page).toHaveScreenshot('my-screenshot.png', {
    fullPage: true,
    maxDiffPixels: 100,
  });

  // Or capture specific element
  const element = page.locator('.my-component');
  await expect(element).toHaveScreenshot('component.png');
});
```

First run will create baseline screenshots. Subsequent runs compare against baselines.

## Test Configuration

Configuration is in `../playwright.config.ts`:

- **Base URL**: http://localhost:5173
- **Test Directory**: `./e2e`
- **Browsers**: Chromium, Firefox, WebKit
- **Mobile Devices**: iPhone 12, Pixel 5, iPad Pro
- **Timeouts**: 30s for tests, 10s for actions
- **Retries**: 2 retries on CI, 0 locally
- **Screenshots**: Only on failure
- **Video**: Only on failure
- **Traces**: On first retry

## CI/CD Integration

Tests are configured to run in CI with:

- Stricter settings (no `test.only` allowed)
- 2 retries for flaky tests
- Sequential execution (1 worker)
- JUnit and JSON reports
- Screenshot/video artifacts on failure

### GitHub Actions Example

```yaml
- name: Install dependencies
  run: npm ci

- name: Install Playwright browsers
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npm run e2e

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Debugging Tests

### Interactive Debugging

```bash
# Open Playwright Inspector
npm run e2e:debug

# Debug specific test
npx playwright test debateFlow --debug

# Debug from specific line
npx playwright test debateFlow:42 --debug
```

### VS Code Extension

Install the [Playwright Test for VSCode](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright) extension for:

- Running tests from editor
- Setting breakpoints
- Step-through debugging
- Test discovery

### Viewing Test Reports

```bash
# Open HTML report
npm run e2e:report

# View specific report
npx playwright show-report playwright-report
```

## Common Patterns

### Waiting for Elements

```typescript
// Wait for element to be visible
await element.waitFor({ state: 'visible' });

// Wait with custom timeout
await element.waitFor({ state: 'visible', timeout: 60000 });

// Wait for multiple turns
await debatePage.waitForMinimumTurns(3, 60000);
```

### Handling Async Operations

```typescript
// Wait for navigation
await Promise.all([
  page.waitForNavigation(),
  page.click('button'),
]);

// Wait for API response
await page.waitForResponse(response =>
  response.url().includes('/api/debates') && response.status() === 200
);
```

### Mocking API Responses

```typescript
// Mock successful response
await page.route('**/api/debates', route => {
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'test-123' }),
  });
});

// Mock error response
await page.route('**/api/debates', route => {
  route.fulfill({
    status: 500,
    body: 'Internal Server Error',
  });
});
```

## Skipped Tests

Some tests are skipped by default due to long execution times:

- Full debate completion (5+ minutes)
- Intervention status updates (waiting for AI processing)
- Dark mode tests (feature not yet implemented)

To run skipped tests:

```bash
# Run specific skipped test
npx playwright test --grep @full-debate

# Remove .skip() from test
test('my test', async ({ page }) => { ... });
```

## Performance Testing

Performance assertions are included in the test suite:

```typescript
// Measure Core Web Vitals
const metrics = await page.evaluate(() => {
  return new Promise((resolve) => {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const paint = entries.find(e => e.name === 'first-contentful-paint');
      resolve({ fcp: paint?.startTime || 0 });
    }).observe({ entryTypes: ['paint'] });
  });
});

expect(metrics.fcp).toBeLessThan(1500); // FCP < 1.5s
```

## Best Practices

1. **Use Page Objects**: Encapsulate page interactions
2. **Meaningful Test Names**: Describe what's being tested
3. **Wait for Elements**: Don't use arbitrary timeouts
4. **Isolate Tests**: Each test should be independent
5. **Clean Up**: Reset state between tests
6. **Assertions**: Use explicit expectations
7. **Screenshots**: Use for visual regression, not debugging
8. **Selectors**: Prefer accessible selectors (roles, labels)

### Good Selectors

```typescript
// ✅ Good - semantic and accessible
page.getByRole('button', { name: /submit/i })
page.getByLabel('Your Proposition')
page.getByText(/debate complete/i)

// ❌ Avoid - brittle and non-semantic
page.locator('.btn-primary')
page.locator('#submit-button-123')
page.locator('div > div > button:nth-child(2)')
```

## Troubleshooting

### Tests Fail Locally But Pass in CI

- Check Node.js version matches CI
- Ensure dev server is running
- Clear browser cache: `npx playwright install --with-deps`

### Visual Regression Failures

```bash
# Update baselines
npx playwright test --update-snapshots

# Update specific test
npx playwright test visual --update-snapshots
```

### Timeouts

- Increase timeout in test: `test.setTimeout(60000)`
- Increase global timeout in config: `timeout: 60000`
- Use longer waits: `waitFor({ timeout: 30000 })`

### Flaky Tests

- Add explicit waits instead of `page.waitForTimeout()`
- Wait for network idle: `page.waitForLoadState('networkidle')`
- Increase retries locally: `retries: 2`

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Guide](https://playwright.dev/docs/debug)
- [API Reference](https://playwright.dev/docs/api/class-playwright)
- [ClearSide Task: TEST-003](../../tasks/phase1/testing/TEST-003.md)

## Support

For questions or issues with E2E tests:

1. Check this README
2. Review test examples in `tests/`
3. Check Playwright documentation
4. Open an issue in the repository

---

**Last Updated**: 2025-12-25
**Playwright Version**: 1.57.0
**Test Coverage**: 40+ tests across 4 test suites
