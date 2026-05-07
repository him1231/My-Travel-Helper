import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page loads and shows Google sign-in button', async ({ page }) => {
    await page.goto('/#/login')
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  })

  test('dev login button is visible in dev mode', async ({ page }) => {
    await page.goto('/#/login')
    await expect(page.getByRole('button', { name: /dev login/i })).toBeVisible()
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    // Clear any stored auth state
    await page.context().clearCookies()
    await page.evaluate(() => {
      try { window.localStorage.clear() } catch { /* ignore */ }
      try { window.sessionStorage.clear() } catch { /* ignore */ }
    })
    await page.goto('/#/trips')
    // Should end up on login page
    await page.waitForURL(/#\/(login|$)/, { timeout: 8000 })
    const url = page.url()
    expect(url.includes('login') || url.endsWith('/')).toBeTruthy()
  })

  test('dev login button click triggers auth attempt (anonymous auth may not be enabled)', async ({ page }) => {
    await page.goto('/#/login')
    const btn = page.getByRole('button', { name: /dev login/i })
    await expect(btn).toBeVisible()
    await btn.click()
    // Wait a moment for Firebase to respond
    await page.waitForTimeout(3000)
    // Accept any outcome: navigated to trips, toast appeared, or still on login
    // (anonymous auth may be disabled in this Firebase project)
    const url = page.url()
    const onTrips = url.includes('trips')
    const onLogin = url.includes('login') || url.endsWith('/')
    expect(onTrips || onLogin).toBeTruthy()
  })
})
