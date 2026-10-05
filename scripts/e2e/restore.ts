/**
 * Re-apply the newest restore plan the harness wrote.
 *
 *   npm run e2e:restore
 *
 * A browser run can be killed — a closed terminal, an emptied disk, a deploy
 * that needs the machine — and a `finally` does not run when a process dies.
 * So before the harness touches anything it writes down what the probe account
 * looked like; this is the "undo" button for the case where the run never got
 * to press it.
 */
import { restoreFromDisk } from './lib/probe';

await restoreFromDisk();