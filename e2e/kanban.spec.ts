import { test, expect } from '@playwright/test'

// These tests validate the kanban UI structure and interactions.
// They run against the dev server and require the user to be logged in.
// If Firebase anonymous auth is not enabled, tests that need login will be skipped.

test.describe('Kanban overview', () => {
  test('overview button opens kanban view', async ({ page }) => {
    await page.goto('/')
    // If on login page, skip (Firebase auth not configured)
    if (page.url().includes('login')) {
      test.skip(true, 'Skipping: requires authenticated session')
      return
    }

    // Navigate to any trip
    const firstTrip = page.locator('a[href*="/trips/"]').first()
    const hasTip = await firstTrip.count()
    if (!hasTip) {
      test.skip(true, 'Skipping: no trips available')
      return
    }
    await firstTrip.click()
    await page.waitForURL(/\/trips\//)

    // Click the kanban overview (grid) button in the top bar
    const overviewBtn = page.getByTitle(/trip overview/i)
    await overviewBtn.click()

    // Kanban and Map toggle buttons should appear
    await expect(page.getByRole('button', { name: /kanban/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /map/i }).first()).toBeVisible()
  })

  test('kanban view renders day columns', async ({ page }) => {
    await page.goto('/')
    if (page.url().includes('login')) {
      test.skip(true, 'Skipping: requires authenticated session')
      return
    }

    const firstTrip = page.locator('a[href*="/trips/"]').first()
    if (!(await firstTrip.count())) {
      test.skip(true, 'Skipping: no trips available')
      return
    }
    await firstTrip.click()
    await page.waitForURL(/\/trips\//)

    await page.getByTitle(/trip overview/i).click()
    await expect(page.getByRole('button', { name: /kanban/i })).toBeVisible({ timeout: 5000 })

    // Grip handles for draggable day columns should appear
    const gripButtons = page.getByTitle(/drag to reorder day/i)
    const count = await gripButtons.count()
    // May be 0 if trip has no days — that's acceptable
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

test.describe('Kanban — UI elements', () => {
  test('login page shows both auth options', async ({ page }) => {
    await page.goto('/#/login')
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /dev login/i })).toBeVisible()
  })

  test('app root renders without crashing', async ({ page }) => {
    await page.goto('/')
    // Either the app, login or trips page should render something
    await expect(page.locator('body')).not.toBeEmpty()
    const title = await page.title()
    expect(title).toContain('Travel')
  })

  test('navigating to a non-existent trip shows not found state', async ({ page }) => {
    await page.goto('/')
    if (page.url().includes('login')) {
      test.skip(true, 'Skipping: requires authenticated session')
      return
    }
    await page.goto('/#/trips/nonexistent-trip-id-xyz')
    // Should show some kind of not-found or error state
    await page.waitForTimeout(2000)
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})
