import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { CODE_QUALITY_ANALYZER_PROMPT } from '../prompts/code-quality-analyzer.prompt.js';

export const codeQualityAnalyzer: AgentDefinition = {
  description: 'Analyzes source code for security vulnerabilities, correctness risks, performance problems, maintainability concerns, and best-practice violations.',
  tools: ['Read', 'Glob', 'Grep', 'Skill'],
  model: 'inherit',
  prompt: CODE_QUALITY_ANALYZER_PROMPT
};
