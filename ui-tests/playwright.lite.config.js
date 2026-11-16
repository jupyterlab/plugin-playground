/**
 * Playwright configuration for the JupyterLite profile tests.
 */
const baseConfig = require('./playwright.config');

module.exports = {
  ...baseConfig,
  testIgnore: [],
  testMatch: /lite-profile\.spec\.ts/,
  use: {
    ...baseConfig.use,
    appPath: '',
    autoGoto: false,
    baseURL: 'http://localhost:8000'
  },
  webServer: {
    command: 'jlpm start:lite',
    url: 'http://localhost:8000/lab/index.html',
    timeout: 300 * 1000,
    reuseExistingServer: !process.env.CI
  }
};
