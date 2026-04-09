/**
 * Playwright configuration for generating README screenshots.
 */
const baseConfig = require('./playwright.config');

const DOCS_OUTPUT_DIR = 'test-results-docs-screenshots';
const DOCS_HTML_REPORT_DIR = 'playwright-report-docs-screenshots';

const reporter = Array.isArray(baseConfig.reporter)
  ? baseConfig.reporter.map(entry => {
      if (entry === 'html') {
        return ['html', { outputFolder: DOCS_HTML_REPORT_DIR }];
      }
      if (Array.isArray(entry) && entry[0] === 'html') {
        return [
          'html',
          {
            ...(entry[1] ?? {}),
            outputFolder: DOCS_HTML_REPORT_DIR
          }
        ];
      }
      return entry;
    })
  : baseConfig.reporter === 'html'
  ? [['html', { outputFolder: DOCS_HTML_REPORT_DIR }]]
  : baseConfig.reporter;

module.exports = {
  ...baseConfig,
  testIgnore: [],
  testMatch: /readme-screenshots\.spec\.ts/,
  outputDir: DOCS_OUTPUT_DIR,
  reporter
};
