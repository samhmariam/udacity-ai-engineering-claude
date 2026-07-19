import {
  query,
  type Options,
  type PermissionMode,
  type SDKResultMessage
} from '@anthropic-ai/claude-agent-sdk';
import { codeQualityAnalyzer, refactoringSuggester, testCoverageAnalyzer } from './agents/index.js';
import { mcpServersConfig } from './config/mcp.config.js';
import { buildOrchestratorPrompt } from './prompts/orchestrator.prompt.js';
import {
  ReviewReportJSONSchema,
  ReviewReportSchema,
  type ReviewReport
} from './types/report-types.js';
import { globalRateLimiter, type RateLimiter } from './utils/rate-limiter.js';
import { withTimeout } from './utils/error-handler.js';

type QueryFunction = typeof query;

export interface OrchestratorOptions {
  model?: string;
  maxTurns?: number;
  permissionMode?: PermissionMode;
  cwd?: string;
  queryFn?: QueryFunction;
  mcpServers?: Options['mcpServers'];
  rateLimiter?: RateLimiter;
  estimatedTokensPerReview?: number;
  reviewTimeoutMs?: number;
}

export class Orchestrator {
  private readonly model?: string;
  private readonly maxTurns: number;
  private readonly permissionMode: PermissionMode;
  private readonly cwd: string;
  private readonly queryFn: QueryFunction;
  private readonly mcpServers: Options['mcpServers'];
  private readonly rateLimiter: RateLimiter;
  private readonly estimatedTokensPerReview: number;
  private readonly reviewTimeoutMs: number;

  constructor(options: OrchestratorOptions = {}) {
    this.model = options.model ?? process.env.ANTHROPIC_MODEL;
    const environmentMaxTurns = Number(process.env.MAX_TURNS);
    this.maxTurns = options.maxTurns
      ?? (Number.isInteger(environmentMaxTurns) && environmentMaxTurns > 0
        ? environmentMaxTurns
        : 60);
    this.permissionMode = options.permissionMode ?? 'dontAsk';
    this.cwd = options.cwd ?? process.env.PROJECT_ROOT ?? process.cwd();
    this.queryFn = options.queryFn ?? query;
    this.mcpServers = options.mcpServers ?? mcpServersConfig;
    this.rateLimiter = options.rateLimiter ?? globalRateLimiter;
    this.estimatedTokensPerReview = options.estimatedTokensPerReview ?? 10_000;
    this.reviewTimeoutMs = options.reviewTimeoutMs ?? 15 * 60_000;
  }

  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    if (!owner.trim() || !repo.trim() || !Number.isInteger(prNumber) || prNumber <= 0) {
      throw new Error('A repository owner, repository name, and positive integer PR number are required.');
    }
    if (!this.model) {
      throw new Error('ANTHROPIC_MODEL is required (or pass model to CodeReviewOrchestrator).');
    }

    await this.rateLimiter.acquire(this.estimatedTokensPerReview);
    try {
    const startedAt = Date.now();
    let resultMessage: SDKResultMessage | undefined;
    const toolUseCounts = new Map<string, number>();
    const assistantBlockCounts = new Map<string, number>();
    const assistantText: string[] = [];
    let sdkInitialization = 'not received';

    const response = this.queryFn({
      prompt: buildOrchestratorPrompt(owner, repo, prNumber),
      options: {
        agents: {
          'code-quality-analyzer': {
            ...codeQualityAnalyzer,
            tools: ['Skill']
          },
          'test-coverage-analyzer': {
            ...testCoverageAnalyzer,
            tools: ['Skill']
          },
          'refactoring-suggester': {
            ...refactoringSuggester,
            tools: ['Skill']
          }
        },
        allowedTools: [
          'Task',
          'Skill',
          'mcp__github__get_pull_request',
          'mcp__github__get_pull_request_files',
          'mcp__github__pull_request_read',
          'mcp__eslint__lint-files'
        ],
        mcpServers: this.mcpServers,
        model: this.model,
        maxTurns: this.maxTurns,
        permissionMode: this.permissionMode,
        allowDangerouslySkipPermissions: this.permissionMode === 'bypassPermissions',
        cwd: this.cwd,
        persistSession: false,
        outputFormat: {
          type: 'json_schema',
          schema: ReviewReportJSONSchema
        }
      }
    });

    await withTimeout(async () => {
    for await (const message of response) {
      if (message.type === 'system' && message.subtype === 'init') {
        const mcpStatus = message.mcp_servers
          .map(server => `${server.name}:${server.status}`)
          .join(', ');
        sdkInitialization = `tools=[${message.tools.join(', ')}], mcp=[${mcpStatus}]`;
      }
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          assistantBlockCounts.set(
            block.type,
            (assistantBlockCounts.get(block.type) ?? 0) + 1
          );
          if (block.type === 'text') {
            assistantText.push(block.text.slice(0, 500));
            if (/credit balance is too low/i.test(block.text)) {
              throw new Error(
                'Anthropic API credit balance is too low. Add credits or configure AWS Bedrock, then retry the review.'
              );
            }
          }
          if (block.type === 'tool_use') {
            toolUseCounts.set(block.name, (toolUseCounts.get(block.name) ?? 0) + 1);
          }
        }
      }
      if (message.type === 'result') {
        resultMessage = message;
      }
    }
    }, this.reviewTimeoutMs, `Pull request review exceeded ${this.reviewTimeoutMs}ms`);

    if (!resultMessage) {
      throw new Error('The review completed without a result message.');
    }
    if (resultMessage.subtype !== 'success') {
      const toolSummary = [...toolUseCounts.entries()]
        .map(([name, count]) => `${name}=${count}`)
        .join(', ');
      const blockSummary = [...assistantBlockCounts.entries()]
        .map(([name, count]) => `${name}=${count}`)
        .join(', ');
      const denials = resultMessage.permission_denials
        .map(denial => denial.tool_name)
        .join(', ');
      throw new Error(
        `The review failed with SDK status: ${resultMessage.subtype}. `
        + `SDK errors: ${resultMessage.errors.join('; ') || 'none'}. `
        + `Permission denials: ${denials || 'none'}. `
        + `Tool usage: ${toolSummary || 'none'}. `
        + `Assistant blocks: ${blockSummary || 'none'}. `
        + `Assistant text: ${assistantText.join(' | ') || 'none'}. `
        + `Initialization: ${sdkInitialization}.`
      );
    }
    if (resultMessage.structured_output === undefined) {
      throw new Error('The review result did not include structured output.');
    }

    const candidate = resultMessage.structured_output;
    if (typeof candidate === 'object' && candidate !== null) {
      const report = candidate as Record<string, unknown>;
      report.pullRequest = { owner, repo, number: prNumber };
      const metadata = typeof report.metadata === 'object' && report.metadata !== null
        ? report.metadata as Record<string, unknown>
        : {};
      metadata.analyzedAt = new Date(startedAt).toISOString();
      metadata.duration = Date.now() - startedAt;
      report.metadata = metadata;
    }

    const validated = ReviewReportSchema.safeParse(candidate);
    if (!validated.success) {
      const details = validated.error.issues
        .map(issue => `${issue.path.join('.') || 'report'}: ${issue.message}`)
        .join('; ');
      throw new Error(`Invalid review report returned by the orchestrator: ${details}`);
    }

    const report = validated.data;
    report.fileReviews = report.fileReviews.filter(review => !isDocumentationFile(review.file));

    const reviewedFiles = new Set(report.fileReviews.map(review => review.file));
    report.recommendations = report.recommendations
      .map(recommendation => ({
        ...recommendation,
        files: recommendation.files.filter(file => reviewedFiles.has(file))
      }))
      .filter(recommendation => recommendation.files.length > 0);

    const totalFiles = report.fileReviews.length;
    report.summary = {
      totalFiles,
      overallScore: totalFiles === 0
        ? 100
        : report.fileReviews.reduce(
          (total, review) => total + review.codeQuality.overallScore,
          0
        ) / totalFiles,
      criticalIssues: report.fileReviews.reduce(
        (total, review) => total + review.codeQuality.issues.filter(
          issue => issue.severity === 'critical'
        ).length,
        0
      ),
      highPriorityTests: report.fileReviews.reduce(
        (total, review) => total + review.testCoverage.untestedPaths.filter(
          path => path.priority === 'critical' || path.priority === 'high'
        ).length,
        0
      ),
      refactoringOpportunities: report.fileReviews.reduce(
        (total, review) => total + review.refactorings.suggestions.length,
        0
      )
    };

      return report;
    } finally {
      this.rateLimiter.release();
    }
  }
}

export { Orchestrator as CodeReviewOrchestrator };

function isDocumentationFile(file: string): boolean {
  const fileName = file.split(/[\\/]/).pop() ?? file;
  return /^readme(?:\..+)?$/i.test(fileName) || /\.(?:md|mdx|rst|txt)$/i.test(fileName);
}
