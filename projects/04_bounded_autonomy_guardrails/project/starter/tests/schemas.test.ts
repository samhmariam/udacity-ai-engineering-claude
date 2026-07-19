import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  CodeQualityResultJSONSchema,
  CodeQualityResultSchema,
  RefactoringSuggestionJSONSchema,
  RefactoringSuggestionSchema,
  TestCoverageResultJSONSchema,
  TestCoverageResultSchema
} from '../src/types/analysis-results.js';
import {
  ReviewReportJSONSchema,
  ReviewReportSchema
} from '../src/types/report-types.js';

const validCodeQuality = {
  file: 'src/example.ts',
  issues: [{
    line: 12,
    severity: 'high' as const,
    category: 'security' as const,
    description: 'User input reaches a SQL query without parameterization.',
    suggestion: 'Use a parameterized query.'
  }],
  overallScore: 75,
  summary: 'One high-severity issue found.'
};

const validTestCoverage = {
  file: 'src/example.ts',
  hasTests: true,
  testFiles: ['tests/example.test.ts'],
  untestedPaths: [{
    type: 'branch' as const,
    location: 'src/example.ts:20',
    priority: 'medium' as const,
    reasoning: 'The error branch has no assertion.',
    suggestedTest: 'Reject the dependency and assert the error response.'
  }],
  coverageEstimate: 80,
  summary: 'The main path is tested; one error branch is missing.'
};

const validRefactoring = {
  file: 'src/example.ts',
  suggestions: [{
    type: 'extract-function' as const,
    location: 'src/example.ts:30-45',
    impact: 'medium' as const,
    description: 'Extract request validation from the handler.',
    before: 'function handle() { /* validation and execution */ }',
    after: 'function validateRequest() { /* validation */ }',
    benefits: 'Separates responsibilities and makes validation testable.'
  }],
  summary: 'One focused extraction is recommended.'
};

const validReport = {
  pullRequest: { owner: 'octocat', repo: 'Hello-World', number: 1 },
  fileReviews: [{
    file: 'src/example.ts',
    codeQuality: validCodeQuality,
    testCoverage: validTestCoverage,
    refactorings: validRefactoring
  }],
  summary: {
    totalFiles: 1,
    overallScore: 75,
    criticalIssues: 0,
    highPriorityTests: 0,
    refactoringOpportunities: 1
  },
  recommendations: [{
    priority: 'high' as const,
    category: 'security',
    description: 'Parameterize the database query.',
    files: ['src/example.ts']
  }],
  metadata: {
    analyzedAt: '2026-07-19T12:00:00.000Z',
    duration: 1500,
    agentVersions: { 'code-quality-analyzer': '1.0.0' }
  }
};

describe('analysis result schemas', () => {
  it.each([
    ['code quality', CodeQualityResultSchema, validCodeQuality],
    ['test coverage', TestCoverageResultSchema, validTestCoverage],
    ['refactoring', RefactoringSuggestionSchema, validRefactoring]
  ])('accepts valid %s data', (_name, schema, data) => {
    expect(() => schema.parse(data)).not.toThrow();
  });

  it.each([
    ['a missing required field', CodeQualityResultSchema, { ...validCodeQuality, summary: undefined }],
    ['a wrong field type', TestCoverageResultSchema, { ...validTestCoverage, hasTests: 'yes' }],
    ['an invalid severity enum', CodeQualityResultSchema, {
      ...validCodeQuality,
      issues: [{ ...validCodeQuality.issues[0], severity: 'urgent' }]
    }],
    ['an invalid refactoring enum', RefactoringSuggestionSchema, {
      ...validRefactoring,
      suggestions: [{ ...validRefactoring.suggestions[0], type: 'rewrite-everything' }]
    }]
  ])('rejects %s with a ZodError', (_name, schema, data) => {
    expect(() => schema.parse(data)).toThrow(ZodError);
  });

  it('accepts empty finding arrays', () => {
    expect(CodeQualityResultSchema.parse({
      ...validCodeQuality,
      issues: []
    }).issues).toEqual([]);
    expect(TestCoverageResultSchema.parse({
      ...validTestCoverage,
      testFiles: [],
      untestedPaths: []
    }).untestedPaths).toEqual([]);
    expect(RefactoringSuggestionSchema.parse({
      ...validRefactoring,
      suggestions: []
    }).suggestions).toEqual([]);
  });

  it.each([0, 100])('accepts score boundary %i', score => {
    expect(CodeQualityResultSchema.parse({
      ...validCodeQuality,
      overallScore: score
    }).overallScore).toBe(score);
    expect(TestCoverageResultSchema.parse({
      ...validTestCoverage,
      coverageEstimate: score
    }).coverageEstimate).toBe(score);
  });

  it.each([-1, 101])('rejects out-of-range score %i', score => {
    expect(() => CodeQualityResultSchema.parse({
      ...validCodeQuality,
      overallScore: score
    })).toThrow(ZodError);
    expect(() => TestCoverageResultSchema.parse({
      ...validTestCoverage,
      coverageEstimate: score
    })).toThrow(ZodError);
  });
});

describe('ReviewReportSchema', () => {
  it('accepts a complete valid report', () => {
    expect(() => ReviewReportSchema.parse(validReport)).not.toThrow();
  });

  it('accepts empty arrays and an empty agent-version record', () => {
    const result = ReviewReportSchema.parse({
      ...validReport,
      fileReviews: [],
      recommendations: [],
      summary: {
        totalFiles: 0,
        overallScore: 100,
        criticalIssues: 0,
        highPriorityTests: 0,
        refactoringOpportunities: 0
      },
      metadata: { ...validReport.metadata, agentVersions: {} }
    });

    expect(result.fileReviews).toEqual([]);
    expect(result.recommendations).toEqual([]);
    expect(result.metadata.agentVersions).toEqual({});
  });

  it('accepts populated agent-version entries', () => {
    const result = ReviewReportSchema.parse(validReport);
    expect(result.metadata.agentVersions['code-quality-analyzer']).toBe('1.0.0');
  });

  it.each([
    ['missing pullRequest', { ...validReport, pullRequest: undefined }],
    ['wrong PR number type', {
      ...validReport,
      pullRequest: { ...validReport.pullRequest, number: '1' }
    }],
    ['invalid recommendation priority', {
      ...validReport,
      recommendations: [{ ...validReport.recommendations[0], priority: 'urgent' }]
    }]
  ])('rejects %s', (_name, data) => {
    expect(() => ReviewReportSchema.parse(data)).toThrow(ZodError);
  });
});

describe('JSON Schema exports', () => {
  it.each([
    ['code quality', CodeQualityResultJSONSchema, ['file', 'issues', 'overallScore', 'summary']],
    ['test coverage', TestCoverageResultJSONSchema, ['file', 'hasTests', 'testFiles', 'untestedPaths', 'coverageEstimate', 'summary']],
    ['refactoring', RefactoringSuggestionJSONSchema, ['file', 'suggestions', 'summary']],
    ['review report', ReviewReportJSONSchema, ['pullRequest', 'fileReviews', 'summary', 'recommendations', 'metadata']]
  ])('exports a valid object schema for %s', (_name, jsonSchema, required) => {
    expect(jsonSchema).toMatchObject({
      type: 'object',
      properties: expect.any(Object),
      required: expect.arrayContaining(required)
    });
    expect(jsonSchema.required).toHaveLength(required.length);
  });

  it('marks nested issue properties as required', () => {
    const properties = CodeQualityResultJSONSchema.properties as Record<string, unknown>;
    const issues = properties.issues as {
      type: string;
      items: { required: string[] };
    };

    expect(issues.type).toBe('array');
    expect(issues.items.required).toEqual(expect.arrayContaining([
      'line',
      'severity',
      'category',
      'description',
      'suggestion'
    ]));
  });
});
