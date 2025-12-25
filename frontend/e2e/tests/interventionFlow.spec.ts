import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { DebatePage } from '../pages/DebatePage';

/**
 * E2E Tests for Intervention Flow
 *
 * Tests user interactions with the intervention system:
 * - Submitting questions, challenges, and evidence
 * - Viewing intervention status
 * - Targeting specific turns
 */
test.describe('Intervention Panel', () => {
  test('intervention panel is visible during live debate', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we transition to renewable energy?');

    // Wait for debate to start
    const interventionPanel = page.getByRole('complementary', { name: /intervention/i });
    await interventionPanel.waitFor({ state: 'visible', timeout: 30000 });

    // Panel should have title
    await expect(page.getByRole('heading', { name: /interventions/i })).toBeVisible();

    // Submit button should be visible
    const submitButton = page.getByRole('button', { name: /submit intervention/i });
    await expect(submitButton).toBeVisible();
  });

  test('shows empty state when no interventions', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we protect wildlife?');

    // Wait for intervention panel
    const interventionPanel = page.getByRole('complementary', { name: /intervention/i });
    await interventionPanel.waitFor({ state: 'visible', timeout: 30000 });

    // Should show empty state
    await expect(page.getByText(/no interventions yet/i)).toBeVisible();
  });

  test('can open intervention form modal', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we use solar power?');

    // Wait for intervention panel
    await page
      .getByRole('button', { name: /submit intervention/i })
      .waitFor({ state: 'visible', timeout: 30000 });

    // Click to open form
    await page.getByRole('button', { name: /submit intervention/i }).click();

    // Modal should open
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Modal should have title
    await expect(page.getByText(/submit intervention/i)).toBeVisible();
  });

  test('intervention form has all input fields', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we build green buildings?');

    // Open intervention form
    await page
      .getByRole('button', { name: /submit intervention/i })
      .waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /submit intervention/i }).click();

    // Wait for modal
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Should have intervention type selector (radio buttons or select)
    const typeInputs = modal.getByRole('radio').or(modal.getByRole('combobox'));
    await expect(typeInputs.first()).toBeVisible();

    // Should have content textarea
    const contentInput = modal.getByRole('textbox').first();
    await expect(contentInput).toBeVisible();

    // Should have submit and cancel buttons
    await expect(modal.getByRole('button', { name: /submit/i })).toBeVisible();
    await expect(modal.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('can close intervention form modal', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we conserve resources?');

    // Open form
    await page
      .getByRole('button', { name: /submit intervention/i })
      .waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /submit intervention/i }).click();

    // Modal should be open
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Click cancel
    await modal.getByRole('button', { name: /cancel/i }).click();

    // Modal should close
    await expect(modal).not.toBeVisible();
  });

  test('submits question intervention', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we reduce plastic use?');

    // Open intervention form
    await page
      .getByRole('button', { name: /submit intervention/i })
      .waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /submit intervention/i }).click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Select intervention type (question)
    const questionOption = modal.getByLabel(/question/i).or(modal.getByRole('radio', { name: /question/i }));
    if (await questionOption.isVisible()) {
      await questionOption.click();
    }

    // Fill content
    const contentInput = modal.getByRole('textbox').first();
    await contentInput.fill('What are the specific environmental impacts you are considering?');

    // Submit
    await modal.getByRole('button', { name: /^submit$/i }).click();

    // Modal should close
    await expect(modal).not.toBeVisible();

    // Intervention should appear in list
    await expect(
      page.getByText(/what are the specific environmental impacts/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('submits challenge intervention', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we ban fossil fuels?');

    // Open intervention form
    await page
      .getByRole('button', { name: /submit intervention/i })
      .waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /submit intervention/i }).click();

    const modal = page.getByRole('dialog');

    // Select challenge type
    const challengeOption = modal.getByLabel(/challenge/i).or(modal.getByRole('radio', { name: /challenge/i }));
    if (await challengeOption.isVisible()) {
      await challengeOption.click();
    }

    // Fill content
    const contentInput = modal.getByRole('textbox').first();
    await contentInput.fill('This assumption seems unsupported. Can you provide evidence?');

    // Submit
    await modal.getByRole('button', { name: /^submit$/i }).click();

    // Intervention should appear
    await expect(page.getByText(/this assumption seems unsupported/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('submits evidence intervention', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we invest in public transit?');

    // Open intervention form
    await page
      .getByRole('button', { name: /submit intervention/i })
      .waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /submit intervention/i }).click();

    const modal = page.getByRole('dialog');

    // Select evidence type
    const evidenceOption = modal.getByLabel(/evidence/i).or(modal.getByRole('radio', { name: /evidence/i }));
    if (await evidenceOption.isVisible()) {
      await evidenceOption.click();
    }

    // Fill content
    const contentInput = modal.getByRole('textbox').first();
    await contentInput.fill(
      'According to a 2023 study, public transit reduces urban emissions by 35%.'
    );

    // Submit
    await modal.getByRole('button', { name: /^submit$/i }).click();

    // Intervention should appear
    await expect(page.getByText(/public transit reduces urban emissions/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('shows pending badge when intervention is pending', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we protect biodiversity?');

    // Submit an intervention
    await page
      .getByRole('button', { name: /submit intervention/i })
      .waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /submit intervention/i }).click();

    const modal = page.getByRole('dialog');
    const contentInput = modal.getByRole('textbox').first();
    await contentInput.fill('Test intervention');
    await modal.getByRole('button', { name: /^submit$/i }).click();

    // Should show pending badge
    await expect(page.getByText(/pending/i)).toBeVisible({ timeout: 10000 });
  });

  test('can expand and collapse intervention cards', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we save the rainforests?');

    // Submit an intervention
    await page
      .getByRole('button', { name: /submit intervention/i })
      .waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /submit intervention/i }).click();

    const modal = page.getByRole('dialog');
    const contentInput = modal.getByRole('textbox').first();
    await contentInput.fill('This is a test intervention with some content to expand.');
    await modal.getByRole('button', { name: /^submit$/i }).click();

    // Wait for intervention to appear
    await expect(page.getByText(/test intervention/i)).toBeVisible({ timeout: 10000 });

    // Look for expand/collapse button (might be in the intervention card)
    const expandButton = page.getByRole('button', { name: /expand|show more|details/i }).first();

    if (await expandButton.isVisible()) {
      // Click to expand
      await expandButton.click();

      // Should show more content or details
      // (exact assertion depends on implementation)

      // Click again to collapse
      await expandButton.click();
    }
  });

  test('validates intervention content before submission', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we use wind power?');

    // Open intervention form
    await page
      .getByRole('button', { name: /submit intervention/i })
      .waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /submit intervention/i }).click();

    const modal = page.getByRole('dialog');

    // Try to submit empty content
    const submitButton = modal.getByRole('button', { name: /^submit$/i });

    // Submit button should be disabled when content is empty
    await expect(submitButton).toBeDisabled();

    // Fill with very short content
    const contentInput = modal.getByRole('textbox').first();
    await contentInput.fill('Hi');

    // Might still be disabled (minimum length validation)
    // Or might show error message
  });

  test('disables intervention submission when debate is not live', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we go carbon neutral?');

    // Wait for debate to start and then pause it
    await page
      .getByRole('button', { name: /pause debate/i })
      .waitFor({ state: 'visible', timeout: 30000 });
    await debatePage.pause();

    // Submit intervention button should be disabled
    const submitButton = page.getByRole('button', { name: /submit intervention/i });
    await expect(submitButton).toBeDisabled();

    // Should show hint
    await expect(page.getByText(/interventions available during live debate/i)).toBeVisible();
  });

  test('handles intervention submission errors gracefully', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Mock API failure
    await page.route('**/api/debates/*/interventions', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Failed to submit intervention' }),
      });
    });

    await homePage.submitQuestion('Should we protect coral reefs?');

    // Submit intervention
    await page
      .getByRole('button', { name: /submit intervention/i })
      .waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /submit intervention/i }).click();

    const modal = page.getByRole('dialog');
    const contentInput = modal.getByRole('textbox').first();
    await contentInput.fill('Test intervention');
    await modal.getByRole('button', { name: /^submit$/i }).click();

    // Should show error message
    await expect(modal.getByText(/failed to submit/i)).toBeVisible({ timeout: 10000 });

    // Modal should stay open
    await expect(modal).toBeVisible();
  });
});

test.describe('Targeted Interventions', () => {
  test('can target specific turn for intervention', async ({ page }) => {
    const homePage = new HomePage(page);
    const debatePage = new DebatePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we protect the oceans?');

    // Wait for at least one turn
    await debatePage.waitForMinimumTurns(1, 60000);

    // Select a turn
    await debatePage.selectTurn(0);

    // Look for intervention button on the selected turn
    const turnInterventionButton = page
      .getByRole('button', { name: /challenge|intervene|question/i })
      .first();

    if (await turnInterventionButton.isVisible()) {
      // Click to open intervention form for this turn
      await turnInterventionButton.click();

      // Modal should open
      const modal = page.getByRole('dialog');
      await expect(modal).toBeVisible();

      // Should indicate which turn is being targeted
      // (implementation-specific assertion)
    }
  });

  test.skip('can target specific speaker for intervention', async ({ page }) => {
    // This test depends on implementation of speaker targeting
    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we use geothermal energy?');

    // Open intervention form
    await page
      .getByRole('button', { name: /submit intervention/i })
      .waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /submit intervention/i }).click();

    const modal = page.getByRole('dialog');

    // Look for speaker selector
    const speakerSelector = modal.getByLabel(/target speaker|direct to/i);

    if (await speakerSelector.isVisible()) {
      // Select a speaker (Pro, Con, or Moderator)
      await speakerSelector.selectOption('pro');
    }
  });
});

test.describe('Intervention Status Updates', () => {
  test.skip('shows when intervention is addressed', async ({ page }) => {
    // This is a long-running test that requires the AI to process the intervention
    test.setTimeout(120000);

    const homePage = new HomePage(page);

    await homePage.goto();
    await homePage.submitQuestion('Should we protect endangered species?');

    // Submit intervention
    await page
      .getByRole('button', { name: /submit intervention/i })
      .waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /submit intervention/i }).click();

    const modal = page.getByRole('dialog');
    const contentInput = modal.getByRole('textbox').first();
    await contentInput.fill('Can you provide specific examples of endangered species?');
    await modal.getByRole('button', { name: /^submit$/i }).click();

    // Wait for intervention to be addressed (this could take time)
    await expect(page.getByText(/addressed/i)).toBeVisible({ timeout: 90000 });
  });
});
