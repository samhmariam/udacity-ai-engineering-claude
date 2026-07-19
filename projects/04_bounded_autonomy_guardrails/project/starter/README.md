# Enterprise Multi-Agent Code Review Orchestrator

A completed TypeScript CLI that reviews GitHub pull requests with the Claude Agent SDK. It fetches pull request data through GitHub MCP, delegates analysis to three specialized agents, validates the combined result with Zod, and writes Markdown, HTML, and JSON reports.

## Features

- Coordinates code-quality, test-coverage, and refactoring agents through the SDK's `Task` tool.
- Fetches pull request metadata and changed files through the GitHub MCP server.
- Provides ESLint analysis through the ESLint MCP server.
- Uses Claude Skills for specialized JavaScript and security analysis.
- Enforces a structured `ReviewReport` response with JSON Schema and Zod validation.
- Recalculates summary metrics from validated file-level findings.
- Excludes documentation files such as README files from test-coverage analysis.
- Produces readable Markdown and HTML reports plus machine-readable JSON.
- Includes CLI validation, structured logging, timeouts, exponential-backoff retries, and sliding-window rate limiting.

## How it works

```text
CLI
  -> Orchestrator
     -> GitHub MCP: pull request metadata and changed files
     -> Code Quality Analyzer: security, performance, maintainability
     -> Test Coverage Analyzer: untested paths and concrete test cases
     -> Refactoring Suggester: structure, clarity, modernization
  -> ReviewReportSchema validation
  -> Markdown, HTML, and JSON reports
```

The orchestrator explicitly invokes all three registered subagents. Each subagent returns findings shaped for its corresponding Zod schema, and the orchestrator aggregates those findings into `ReviewReportSchema` from `src/types/report-types.ts`.

## Project structure

```text
.claude/skills/                 Claude Skills used during analysis
src/
  agents/                       Specialized AgentDefinition objects
  config/mcp.config.ts          GitHub and ESLint MCP server configuration
  prompts/                      Orchestrator and subagent prompts
  types/                        Zod schemas and TypeScript result types
  utils/                        Reports, logging, errors, and rate limiting
  main.ts                       CLI entry point
  orchestrator.ts               SDK query and aggregation workflow
tests/                          Schema, utility, and orchestrator tests
reports/                        Generated review reports
```

## Prerequisites

- Node.js 18 or newer
- npm
- A GitHub personal access token with read access to the repositories being reviewed
- One Claude authentication method:
  - an Anthropic API key, or
  - AWS credentials with access to Claude on Amazon Bedrock
- An Anthropic model identifier appropriate for the selected authentication method

The MCP servers are launched with `npx` when a review starts, so the machine must also be able to download or resolve their npm packages.

## Installation

From the repository root:

```bash
npm install
cd projects/04_bounded_autonomy_guardrails/project/starter
```

This project is part of an npm workspace. Running `npm install` from the repository root installs its dependencies. Running it directly from this directory is also supported.

## Configuration

Create a `.env` file in this directory or export the same variables in your shell. The `.env` file is ignored by Git; never commit credentials.

### Anthropic API

```dotenv
GITHUB_TOKEN=github_pat_your_token
ANTHROPIC_API_KEY=sk-ant-your_key
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
```

### AWS Bedrock

```dotenv
GITHUB_TOKEN=github_pat_your_token
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
```

When AWS credentials are selected, the CLI enables Bedrock mode automatically. `GITHUB_TOKEN` and `ANTHROPIC_MODEL` are required for both authentication methods.

### Optional variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `PROJECT_ROOT` | Working directory exposed to the agents | Current working directory |
| `MAX_TURNS` | Maximum SDK turns available to a review | `60` |
| `LOG_LEVEL` | Winston logging level | `info` |

Set `PROJECT_ROOT` to this project directory when launching the CLI from elsewhere.

## Usage

Run commands from `projects/04_bounded_autonomy_guardrails/project/starter`.

### Development

```bash
npm run dev -- <owner> <repo> <positive-pr-number>
```

Example smoke test:

```bash
npm run dev -- octocat Hello-World 1
```

Required submission analyses:

```bash
npm run dev -- airaamane simple-todo-app 1
npm run dev -- airaamane simple-todo-app 2
npm run dev -- airaamane simple-todo-app 3
```

### Production build

```bash
npm run build
npm start -- <owner> <repo> <positive-pr-number>
```

The `--` forwards the repository arguments through npm to the CLI.

## Generated reports

Every successful review writes three PR-specific files to `reports/`:

```text
reports/<owner>-<repo>-pr-<number>.md
reports/<owner>-<repo>-pr-<number>.html
reports/<owner>-<repo>-pr-<number>.json
```

It also updates `reports/report.md`, `reports/report.html`, and `reports/report.json` as aliases for the latest review. Running all three required `airaamane/simple-todo-app` reviews therefore creates the nine distinct submission files while retaining the latest aliases.

The JSON output contains pull request metadata, per-file code-quality findings, missing-test suggestions, refactoring recommendations, aggregate scores, and analysis metadata. Scores are validated as numbers from 0 through 100.

## Validation and failure handling

The CLI exits with an actionable message when:

- owner, repository, or pull request number is missing;
- the pull request number is not a positive integer;
- `GITHUB_TOKEN` is missing;
- neither Anthropic API nor complete AWS credentials are configured;
- Bedrock is selected without `AWS_REGION`;
- `ANTHROPIC_MODEL` is missing;
- the SDK fails, times out, reaches its turn limit, or returns invalid structured output.

Reviews use a 15-minute timeout and a sliding 60-second rate-limit window. The default limiter permits 50 requests per minute, 100,000 estimated tokens per minute, and five concurrent requests. Retry utilities add exponential backoff and jitter for transient operations.

If a larger pull request reaches `error_max_turns`, raise the optional limit and retry:

```dotenv
MAX_TURNS=80
```

If the error reports a low Anthropic credit balance, add API credits or configure AWS Bedrock before retrying.

## Development commands

```bash
# Type-check and compile to dist/
npm run build

# Type-check without emitting files
npm run lint

# Run the test suite once
npm test

# Run tests in watch mode
npm run test:watch

# Run one test file
npm test -- tests/schemas.test.ts
```

The test suite covers schema acceptance and rejection, boundary values, JSON Schema conversion, retry and timeout behavior, rate limiting, and orchestrator result handling. The real `octocat/Hello-World` integration test is intentionally skipped during normal unit-test runs because it requires live credentials and network access; the CLI command above provides the live smoke test.

On Windows, a missing `@rolldown/binding-win32-x64-msvc` error is an npm optional-dependency installation problem rather than a test failure. Remove `node_modules` and the lockfile generated on the incompatible platform, then run `npm install` again from Windows.

## Key technologies

- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Zod](https://zod.dev/)
- TypeScript
- Vitest
- Winston

## Security notes

- Credentials are read only from environment variables or `.env`.
- No API keys or GitHub tokens should be stored in source files or generated reports.
- Use the least-privileged GitHub token that can read the target repository.
- Review generated findings before applying suggested code changes.
