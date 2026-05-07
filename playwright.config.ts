import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5175/My-Travel-Helper/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Dev server must be running separately (npm run dev)
  webServer: {
    command: 'npm run dev -- --port 5175',
    url: 'http://localhost:5175/My-Travel-Helper/',
    reuseExistingServer: true,
    timeout: 15000,
  },
})
