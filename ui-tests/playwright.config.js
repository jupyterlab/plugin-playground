/**
 * Configuration for Playwright using defaults from @jupyterlab/galata.
 */
const baseConfig = require('@jupyterlab/galata/lib/playwright-config');

module.exports = {
  ...baseConfig,
  testIgnore: /notebook-v7\.spec\.ts/,
  webServer: {
    command: 'jlpm start',
    url: 'http://localhost:8888/lab',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI
  }
};
