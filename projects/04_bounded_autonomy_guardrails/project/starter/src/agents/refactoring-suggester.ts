import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { REFACTORING_SUGGESTER_PROMPT } from '../prompts/refactoring-suggester.prompt.js';

export const refactoringSuggester: AgentDefinition = {
  description: 'Identifies behavior-preserving opportunities to simplify code, improve structure and naming, modernize language patterns, and apply appropriate design patterns.',
  tools: ['Read', 'Glob', 'Grep', 'Skill'],
  model: 'inherit',
  prompt: REFACTORING_SUGGESTER_PROMPT
};
