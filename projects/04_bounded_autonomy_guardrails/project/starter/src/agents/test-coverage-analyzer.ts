import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { TEST_COVERAGE_ANALYZER_PROMPT } from '../prompts/test-coverage-analyzer.prompt.js';

export const testCoverageAnalyzer: AgentDefinition = {
  description: 'Compares source behavior with related tests to estimate test completeness and propose specific tests for uncovered paths and edge cases.',
  tools: ['Read', 'Glob', 'Grep', 'Skill'],
  model: 'inherit',
  prompt: TEST_COVERAGE_ANALYZER_PROMPT
};
