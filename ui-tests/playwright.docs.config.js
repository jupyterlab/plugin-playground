/**
 * Playwright configuration for generating README screenshots.
 */
const baseConfig = require('./playwright.config');

module.exports = {
  ...baseConfig,
  testIgnore: [],
  testMatch: /readme-screenshots\.spec\.ts/
};
