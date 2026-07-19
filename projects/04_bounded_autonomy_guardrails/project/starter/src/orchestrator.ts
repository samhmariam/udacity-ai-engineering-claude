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

type QueryFunction = typeof query;

export interface OrchestratorOptions {
  model?: string;
  maxTurns?: number;
  permissionMode?: PermissionMode;
  cwd?: string;
  queryFn?: QueryFunction;
  mcpServers?: Options['mcpServers'];
}

export class Orchestrator {
  private readonly model?: string;
  private readonly maxTurns: number;
  private readonly permissionMode: PermissionMode;
  private readonly cwd: string;
  private readonly queryFn: QueryFunction;
  private readonly mcpServers: Options['mcpServers'];

  constructor(options: OrchestratorOptions = {}) {
    this.model = options.model ?? process.env.ANTHROPIC_MODEL;
    this.maxTurns = options.maxTurns ?? 30;
    this.permissionMode = options.permissionMode ?? 'dontAsk';
    this.cwd = options.cwd ?? process.env.PROJECT_ROOT ?? process.cwd();
    this.queryFn = options.queryFn ?? query;
    this.mcpServers = options.mcpServers ?? mcpServersConfig;
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

    const startedAt = Date.now();
    let resultMessage: SDKResultMessage | undefined;

    const response = this.queryFn({
      prompt: buildOrchestratorPrompt(owner, repo, prNumber),
      options: {
        agents: {
          'code-quality-analyzer': codeQualityAnalyzer,
          'test-coverage-analyzer': testCoverageAnalyzer,
          'refactoring-suggester': refactoringSuggester
        },
        allowedTools: [
          'Task',
          'mcp__github__get_pull_request',
          'mcp__github__get_pull_request_files',
          'mcp__github__pull_request_read'
        ],
        mcpServers: this.mcpServers,
        model: this.model,
        maxTurns: this.maxTurns,
        permissionMode: this.permissionMode,
        cwd: this.cwd,
        persistSession: false,
        outputFormat: {
          type: 'json_schema',
          schema: ReviewReportJSONSchema
        }
      }
    });

    for await (const message of response) {
      if (message.type === 'result') {
        resultMessage = message;
      }
    }

    if (!resultMessage) {
      throw new Error('The review completed without a result message.');
    }
    if (resultMessage.subtype !== 'success') {
      throw new Error(`The review failed with SDK status: ${resultMessage.subtype}.`);
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
  }
}

export { Orchestrator as CodeReviewOrchestrator };

function isDocumentationFile(file: string): boolean {
  const fileName = file.split(/[\\/]/).pop() ?? file;
  return /^readme(?:\..+)?$/i.test(fileName) || /\.(?:md|mdx|rst|txt)$/i.test(fileName);
}
