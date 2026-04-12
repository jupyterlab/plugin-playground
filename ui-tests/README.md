# Integration Tests (ui-tests)

Browser integration tests for `@jupyterlab/plugin-playground` using:

- [Playwright](https://playwright.dev/docs/intro)
- [Galata](https://github.com/jupyterlab/jupyterlab/tree/main/galata)

## Quickstart

```bash
jlpm run build:prod
jlpm run test:integration
```

## Setup

```bash
cd ui-tests
jlpm install
jlpm playwright install chromium
```

## Commands

```bash
# List tests
cd ui-tests && jlpm playwright test --list

# Run only this plugin spec
cd ui-tests && jlpm playwright test tests/plugin-playground.spec.ts --workers=1

# Generate README screenshots (writes to docs/images/readme)
cd ui-tests && jlpm test:docs-screenshots
```

## Outputs

- `ui-tests/playwright-report`
- `ui-tests/test-results`
