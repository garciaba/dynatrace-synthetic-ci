# Dynatrace Synthetic CI — GitHub Action

A GitHub Action to trigger on-demand [Dynatrace Synthetic](https://docs.dynatrace.com/docs/observe/digital-experience/synthetic-monitoring) monitor executions in your CI/CD pipeline and gate deployments on their results.

Built on the [Synthetic API v2](https://docs.dynatrace.com/docs/shortlink/api-synthetic-v2-monitor-executions).

---

## Quick start

```yaml
- name: Run Dynatrace Synthetic tests
  uses: your-org/dynatrace-synthetic-ci@v1
  with:
    environment_url: ${{ secrets.DT_ENVIRONMENT_URL }}
    api_token: ${{ secrets.DT_API_TOKEN }}
    tags: 'e2e-tests'
```

## Setup

### 1. Create a Dynatrace API Token

Go to **Settings → Access tokens** in your Dynatrace environment and create a token with these scopes:

| Scope | Purpose |
|---|---|
| `syntheticExecutions.write` | Trigger on-demand monitor executions |
| `syntheticExecutions.read` | Poll for execution results |

### 2. Add GitHub Secrets

| Secret | Value |
|---|---|
| `DT_ENVIRONMENT_URL` | Your Dynatrace SaaS URL, e.g. `https://abc12345.live.dynatrace.com` (no trailing slash) |
| `DT_API_TOKEN` | The API token created in step 1 |

### 3. Add the action to your workflow

See the [example workflow](.github/workflows/dynatrace-synthetic.yml) or the usage examples below.

---

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `environment_url` | **Yes** | — | Dynatrace environment URL (e.g. `https://abc12345.live.dynatrace.com`) |
| `api_token` | **Yes** | — | Dynatrace API token |
| `tags` | No | `''` | Comma-separated tags to filter monitors. Ignored if `monitor_ids` is set |
| `monitor_ids` | No | `''` | Comma-separated monitor IDs to execute. Overrides `tags` |
| `applications` | No | `''` | Comma-separated application IDs. Only monitors with all listed applications run |
| `services` | No | `''` | Comma-separated service IDs. Only monitors with all listed services run |
| `locations` | No | `''` | Comma-separated location IDs to execute from |
| `fail_on_performance_issue` | No | `true` | Fail if a performance issue is detected |
| `fail_on_ssl_warning` | No | `true` | Fail on SSL certificate warnings (HTTP monitors only) |
| `poll_interval` | No | `30` | Seconds between polling attempts |
| `timeout` | No | `600` | Maximum seconds to wait for all executions to complete |

> **Note:** You must specify at least one of `tags`, `monitor_ids`, `applications`, or `services`.

## Outputs

| Output | Description |
|---|---|
| `batch_id` | The batch ID of the triggered execution |
| `triggered_count` | Number of monitor executions triggered |
| `executed_count` | Number of executions that completed |
| `failed_count` | Number of executions that failed |
| `batch_status` | Final batch status (`SUCCESS`, `FAILED`, `FAILED_TO_EXECUTE`) |

---

## Usage examples

### Run monitors by tag on every push

```yaml
name: Synthetic Tests
on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Dynatrace Synthetic tests
        uses: your-org/dynatrace-synthetic-ci@v1
        with:
          environment_url: ${{ secrets.DT_ENVIRONMENT_URL }}
          api_token: ${{ secrets.DT_API_TOKEN }}
          tags: 'e2e-tests,production'
```

### Run specific monitors by ID

```yaml
- name: Run Dynatrace Synthetic tests
  uses: your-org/dynatrace-synthetic-ci@v1
  with:
    environment_url: ${{ secrets.DT_ENVIRONMENT_URL }}
    api_token: ${{ secrets.DT_API_TOKEN }}
    monitor_ids: 'HTTP_CHECK-ABC123,BROWSER_MONITOR-DEF456'
```

### Run monitors from specific locations

```yaml
- name: Run Dynatrace Synthetic tests
  uses: your-org/dynatrace-synthetic-ci@v1
  with:
    environment_url: ${{ secrets.DT_ENVIRONMENT_URL }}
    api_token: ${{ secrets.DT_API_TOKEN }}
    tags: 'e2e-tests'
    locations: 'SYNTHETIC_LOCATION-ABC123,SYNTHETIC_LOCATION-DEF456'
```

### Use outputs in subsequent steps

```yaml
- name: Run Dynatrace Synthetic tests
  id: synthetic
  uses: your-org/dynatrace-synthetic-ci@v1
  with:
    environment_url: ${{ secrets.DT_ENVIRONMENT_URL }}
    api_token: ${{ secrets.DT_API_TOKEN }}
    tags: 'e2e-tests'

- name: Print results
  if: always()
  run: |
    echo "Batch ID: ${{ steps.synthetic.outputs.batch_id }}"
    echo "Status: ${{ steps.synthetic.outputs.batch_status }}"
    echo "Executed: ${{ steps.synthetic.outputs.executed_count }}"
    echo "Failed: ${{ steps.synthetic.outputs.failed_count }}"
```

### Gate a deployment

```yaml
jobs:
  synthetic-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/dynatrace-synthetic-ci@v1
        with:
          environment_url: ${{ secrets.DT_ENVIRONMENT_URL }}
          api_token: ${{ secrets.DT_API_TOKEN }}
          tags: 'smoke-tests'

  deploy:
    needs: synthetic-tests
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploying — all synthetic tests passed!"
```

---

## How it works

```
┌─────────────────────────────────────────────────────────┐
│  GitHub Actions Runner                                  │
│                                                         │
│  1. POST /api/v2/synthetic/executions/batch             │
│     → Trigger monitors by tags, IDs, apps, or services  │
│     → Returns batchId                                   │
│                                                         │
│  2. GET /api/v2/synthetic/executions/batch/{batchId}    │
│     → Poll every N seconds until all executions finish  │
│                                                         │
│  3. Evaluate results                                    │
│     → Pass: all monitors succeeded                      │
│     → Fail: any monitor failed or timed out             │
│     → Write GitHub Job Summary with result table        │
└─────────────────────────────────────────────────────────┘
```

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or later)
- npm (comes with Node.js)

### Getting started

```bash
# 1. Install dependencies
npm install
```

This installs all packages listed in `package.json`, including:
- **`@actions/core`** and **`@actions/http-client`** — the GitHub Actions SDK used at runtime.
- **`@vercel/ncc`** and **`typescript`** — dev tools for compiling and bundling.

### Building

```bash
# 2. Build the bundled action
npm run build
```

This runs [`@vercel/ncc`](https://github.com/vercel/ncc) to compile the TypeScript source in `src/` and bundle **all** dependencies into a single file at `dist/index.js`. This is the file that GitHub Actions actually executes.

### Type-checking

```bash
# 3. Type-check without emitting files
npm run typecheck
```

Runs the TypeScript compiler in check-only mode (`tsc --noEmit`). It validates types across the codebase without producing any output files — useful to catch errors before building.

### Why `dist/` must be committed

Unlike a normal Node.js project, GitHub Actions **does not run `npm install`** on the runner. When your action executes, GitHub clones the repository and directly runs the file specified in `action.yml` (in this case `dist/index.js`). That means:

- The bundled `dist/` folder **must be checked into git** so the runner can find it.
- After every code change, you need to run `npm run build` and commit the updated `dist/` folder.

A typical development cycle looks like:

```bash
# Make your changes in src/
npm run typecheck   # Catch type errors early
npm run build       # Re-bundle into dist/
git add -A
git commit -m "your change description"
```

## Project structure

```
├── action.yml          Action definition (node20)
├── src/
│   ├── index.ts        Entry point — input parsing, orchestration, job summary
│   ├── client.ts       DynatraceClient — API calls (trigger + poll)
│   └── types.ts        TypeScript interfaces for Synthetic API v2
├── dist/
│   └── index.js        Bundled output (via @vercel/ncc)
└── .github/
    └── workflows/
        └── dynatrace-synthetic.yml   Example workflow
```

## License

MIT
