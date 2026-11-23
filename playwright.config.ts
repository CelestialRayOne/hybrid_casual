import { defineConfig, devices } from '@playwright/test';

// Smoke tests against the production build (vite preview). The GPU flags make headless Chromium on Windows
// render rotated sprites correctly (ANGLE/D3D11 instead of the software fallback).
const gpuArgs = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'mobile-portrait',
      use: { ...devices['Pixel 7'], launchOptions: { args: gpuArgs } },
    },
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 720 }, launchOptions: { args: gpuArgs } },
    },
  ],
});
