import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.E2E_PORT ?? 3101);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid E2E_PORT');
const origin = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: origin, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm start',
    url: `${origin}/api/health`,
    reuseExistingServer: false,
    env: { HOST: '127.0.0.1', PORT: String(port), DATA_DIR: `./data/e2e-${port}`, AI_PROVIDER: 'mock', HAPTICS_DRIVER: 'mock' },
  },
});
