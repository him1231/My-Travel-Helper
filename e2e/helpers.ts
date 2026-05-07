import { type Page } from '@playwright/test'

/** Click the dev login button and wait for the trips list page */
export async function devLogin(page: Page) {
  await page.goto('/')
  // If already logged in, we land on / which redirects to /trips
  const url = page.url()
  if (url.includes('login')) {
    await page.getByRole('button', { name: /Dev Login/i }).click()
    await page.waitForURL(/trips/, { timeout: 15000 })
  }
}

/** Create a new trip and return its URL. Requires being on the trips list page. */
export async function createTrip(page: Page, title: string): Promise<string> {
  await page.getByRole('button', { name: /new trip|create|add/i }).first().click()
  // Fill in the title field in the modal
  const titleInput = page.getByRole('textbox', { name: /title/i }).first()
  await titleInput.fill(title)
  // Submit the form
  await page.getByRole('button', { name: /create|save|add trip/i }).last().click()
  // Wait for navigation to trip detail
  await page.waitForURL(/\/trips\//, { timeout: 10000 })
  return page.url()
}
