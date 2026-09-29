import { NextRequest } from 'next/server';
import { ok } from '@/services/api';
import pkg from '../../../../../package.json';

/**
 * GET /version — what the newest clients are, so an old install can say so.
 *
 * The web app always *is* the latest version (it deploys with every push), so
 * this endpoint exists for the native clients: on launch each app asks for this
 * document and compares `latest` against its own compiled-in version. A client
 * that is behind shows an update prompt; a client that is current never sees a
 * flicker. The endpoint is additive and unauthenticated — it changes no
 * behaviour for the web app, the backend or an old client that never calls it,
 * which is what makes the rollout downtime-free.
 *
 * `minBuild` is a floor, not a target: when a change *forces* an update (an API
 * the old build calls stops existing, say), a release raises it and every older
 * build prompts "required" instead of "available". Today nothing forces it, so
 * it stays at zero. The build number is the same monotonic integer the release
 * stamps into the apps (`scripts/native/set-version.mjs`), so the comparison is
 * against something the binary actually knows about itself.
 */
export const revalidate = 0;

const [major, minor, patch] = String(pkg.version).split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);

export const GET = (_req: NextRequest) =>
  ok({
    latest: pkg.version,
    build: major * 10000 + minor * 100 + patch,
    minBuild: 0,
  });
