import 'dotenv/config';
import { Orchestrator } from './orchestrator.js';

const orchestrator = new Orchestrator();
const result = await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);

console.log(JSON.stringify(result, null, 2));
