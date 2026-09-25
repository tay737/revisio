/**
 * Registers the stub resolver below. Used as:
 *
 *   NODE_OPTIONS="--import ./scripts/register-stub-loader.mjs" npx tsx script.ts
 *
 * `--import` only runs a file for its side effects; the hook has to be
 * registered explicitly, which is what this does.
 */
import { register } from 'node:module';

register('./stub-server-only.mjs', import.meta.url);
