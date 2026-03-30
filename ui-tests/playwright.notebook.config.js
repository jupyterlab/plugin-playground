/**
 * Playwright configuration for Notebook v7 compatibility smoke tests.
 */
const baseConfig = require('./playwright.config');

module.exports = {
  ...baseConfig,
  testMatch: /notebook-v7\.spec\.ts/,
  webServer: {
    command: 'jlpm start:notebook',
    url: 'http://localhost:8888/tree',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI
  }
};
