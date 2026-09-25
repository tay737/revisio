import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Maps `server-only` to an empty module, for scripts only.
 *
 * `import 'server-only'` is a real guard inside the bundle: Next resolves it to
 * an empty module on the server and to a thrower on the client, which is what
 * stops server code being pulled into a client component. Outside the bundler
 * there is no mapping, so the installed package throws and no script can import
 * anything under src/services/. This remaps that one specifier; the app's build
 * is untouched, so the guard keeps working where it matters.
 */
const STUB = pathToFileURL(fileURLToPath(new URL('./empty-module.mjs', import.meta.url))).href;

export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') {
    return { url: STUB, shortCircuit: true, format: 'module' };
  }
  return next(specifier, context);
}
