import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Orchestrator } from './orchestrator.js';
import { formatError, logger, ReportGenerator } from './utils/index.js';

interface CliArguments {
  owner: string;
  repo: string;
  prNumber: number;
}

function parseArguments(args: string[]): CliArguments | undefined {
  const [owner, repo, prNumberText] = args;

  if (!owner || !repo || !prNumberText) {
    console.error('Error: owner, repo, and prNumber are required.');
    console.error('Usage: npm run dev -- <owner> <repo> <positive-pr-number>');
    console.error('Example: npm run dev -- octocat Hello-World 1');
    return undefined;
  }

  if (!/^\d+$/.test(prNumberText)) {
    console.error(`Error: prNumber must be a positive integer; received "${prNumberText}".`);
    return undefined;
  }

  const prNumber = Number(prNumberText);
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) {
    console.error(`Error: prNumber must be a positive safe integer; received "${prNumberText}".`);
    return undefined;
  }

  return { owner, repo, prNumber };
}

function validateEnvironment(): boolean {
  if (!process.env.GITHUB_TOKEN?.trim()) {
    console.error('Error: GITHUB_TOKEN is required for GitHub MCP authentication.');
    console.error('Create a GitHub personal access token with repository read access, then set GITHUB_TOKEN in your environment or .env file.');
    return false;
  }

  const hasAnthropicApiKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const hasAwsAccessKey = Boolean(process.env.AWS_ACCESS_KEY_ID?.trim());
  const hasAwsSecretKey = Boolean(process.env.AWS_SECRET_ACCESS_KEY?.trim());
  const hasAwsCredentials = hasAwsAccessKey && hasAwsSecretKey;

  if (hasAnthropicApiKey) {
    logger.info('Using Anthropic API authentication');
  } else if (hasAwsCredentials) {
    if (!process.env.AWS_REGION?.trim()) {
      console.error('Error: AWS_REGION is required when using AWS Bedrock authentication.');
      console.error('Example: AWS_REGION=us-east-1');
      return false;
    }

    process.env.CLAUDE_CODE_USE_BEDROCK = '1';
    logger.info('Using AWS Bedrock authentication', { region: process.env.AWS_REGION });
  } else {
    console.error('Error: no supported Anthropic authentication is configured.');
    console.error('Configure one of the following:');
    console.error('  Anthropic API: ANTHROPIC_API_KEY=sk-ant-...');
    console.error('  AWS Bedrock: AWS_ACCESS_KEY_ID=..., AWS_SECRET_ACCESS_KEY=..., AWS_REGION=us-east-1');
    if (hasAwsAccessKey !== hasAwsSecretKey) {
      console.error('The AWS credentials are incomplete: both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required.');
    }
    return false;
  }

  if (!process.env.ANTHROPIC_MODEL?.trim()) {
    console.error('Error: ANTHROPIC_MODEL is required.');
    console.error('Anthropic API example: ANTHROPIC_MODEL=claude-sonnet-4-5-20250929');
    console.error('AWS Bedrock example: ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0');
    return false;
  }

  return true;
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'repository';
}

async function main(): Promise<void> {
  const cli = parseArguments(process.argv.slice(2));
  if (!cli || !validateEnvironment()) {
    process.exitCode = 1;
    return;
  }

  const { owner, repo, prNumber } = cli;
  logger.info('Starting pull request review', { owner, repo, prNumber });

  try {
    const orchestrator = new Orchestrator();
    const report = await orchestrator.reviewPullRequest(owner, repo, prNumber);
    const generator = new ReportGenerator();

    const reportsDirectory = resolve(process.cwd(), 'reports');
    await mkdir(reportsDirectory, { recursive: true });

    const baseName = `${safeFilePart(owner)}-${safeFilePart(repo)}-pr-${prNumber}`;
    const paths = {
      markdown: resolve(reportsDirectory, `${baseName}.md`),
      html: resolve(reportsDirectory, `${baseName}.html`),
      json: resolve(reportsDirectory, `${baseName}.json`)
    };
    const canonicalPaths = {
      markdown: resolve(reportsDirectory, 'report.md'),
      html: resolve(reportsDirectory, 'report.html'),
      json: resolve(reportsDirectory, 'report.json')
    };

    const markdownReport = generator.generateMarkdownReport(report);
    const htmlReport = generator.generateHTMLReport(report);
    const jsonReport = generator.generateJSONReport(report);

    await Promise.all([
      writeFile(paths.markdown, markdownReport, 'utf8'),
      writeFile(paths.html, htmlReport, 'utf8'),
      writeFile(paths.json, jsonReport, 'utf8'),
      writeFile(canonicalPaths.markdown, markdownReport, 'utf8'),
      writeFile(canonicalPaths.html, htmlReport, 'utf8'),
      writeFile(canonicalPaths.json, jsonReport, 'utf8')
    ]);

    logger.info('Pull request review completed', {
      owner,
      repo,
      prNumber,
      overallScore: report.summary.overallScore
    });
    console.log('Reports saved successfully:');
    console.log(`  Markdown: ${paths.markdown}`);
    console.log(`  HTML:     ${paths.html}`);
    console.log(`  JSON:     ${paths.json}`);
    console.log(`  Latest report aliases: ${canonicalPaths.markdown}, ${canonicalPaths.html}, ${canonicalPaths.json}`);
  } catch (error) {
    logger.error('Pull request review failed', {
      owner,
      repo,
      prNumber,
      error: formatError(error)
    });
    console.error(`Review failed: ${formatError(error)}`);
    process.exitCode = 1;
  }
}

void main();
