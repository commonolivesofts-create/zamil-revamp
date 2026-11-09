// Scene order. Each scene is its own file so it can be edited and re-rendered on its own.
import intro from './01-intro.js';
import problem from './02-problem.js';
import capture from './03-capture.js';
import policy from './04-policy.js';
import report from './05-report.js';
import approval from './06-approval.js';
import audit from './07-audit.js';
import payables from './08-payables.js';
import paid from './09-paid.js';
import dashboards from './10-dashboards.js';
import integration from './11-integration.js';
import closing from './12-closing.js';

export const SCENES = [intro, problem, capture, policy, report, approval, audit, payables, paid, dashboards, integration, closing];
