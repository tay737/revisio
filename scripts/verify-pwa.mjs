import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const offlineHtml = await readFile(new URL('../public/offline.html', import.meta.url), 'utf8');
const listeners = new Map();
const cacheStore = new Map();
const fetchLog = [];
const deleted = [];
let networkOffline = false;

function cacheFor(name) {
  if (!cacheStore.has(name)) {
    const values = new Map();
    cacheStore.set(name, {
      async addAll(paths) {
        for (const path of paths) {
          const response = await mockFetch(`https://app.test${path}`);
          values.set(`https://app.test${path}`, response.clone());
        }
      },
      async put(request, response) {
        values.set(typeof request === 'string' ? request : request.url, response);
      },
      async match(request) {
        const key = typeof request === 'string' ? new URL(request, 'https://app.test').toString() : request.url;
        return values.get(key)?.clone();
      },
    });
  }
  return cacheStore.get(name);
}

const mockFetch = async (request) => {
  const url = typeof request === 'string' ? request : request.url;
  fetchLog.push(url);
  if (networkOffline) throw new TypeError('offline');
  const pathname = new URL(url).pathname;
  if (pathname === '/offline.html') {
    return new Response(offlineHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  const isDocument = pathname.endsWith('.html') || pathname === '/dashboard';
  return new Response(isDocument ? '<!doctype html><title>network response</title>' : 'asset', {
    status: 200,
    headers: { 'content-type': isDocument ? 'text/html' : 'image/png' },
  });
};

const context = {
  URL,
  Request,
  Response,
  self: {
    location: { origin: 'https://app.test' },
    addEventListener: (type, callback) => listeners.set(type, callback),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  },
  caches: {
    open: async (name) => cacheFor(name),
    keys: async () => [...cacheStore.keys()],
    match: async (request) => {
      for (const cache of cacheStore.values()) {
        if (typeof cache.match !== 'function') continue;
        const response = await cache.match(request);
        if (response) return response;
      }
      return undefined;
    },
    delete: async (name) => {
      deleted.push(name);
      return cacheStore.delete(name);
    },
  },
  fetch: mockFetch,
  console,
};

vm.runInNewContext(source, context, { filename: 'public/sw.js' });

async function dispatch(type, event) {
  event.waits ??= [];
  event.waitUntil = (promise) => event.waits.push(promise);
  listeners.get(type)(event);
  await Promise.all(event.waits);
  return event.response;
}

await dispatch('install', {});
cacheStore.set('revisio-old', new Map());
cacheStore.set('unrelated-cache', new Map());
await dispatch('activate', {});
assert(!cacheStore.has('revisio-old'), 'activation removes the previous Revisio cache');
assert(cacheStore.has('unrelated-cache'), 'activation leaves unrelated origin caches alone');

const currentCacheName = [...cacheStore.keys()].find((name) => name.startsWith('revisio-'));
assert(currentCacheName, 'install creates a versioned Revisio cache');

async function fetchEvent(url, { mode = 'cors', method = 'GET', headers = {} } = {}) {
  const request = { url, method, headers, mode, clone() { return this; } };
  let response;
  const waits = [];
  const event = {
    request,
    respondWith: (promise) => { response = Promise.resolve(promise); },
    waitUntil: (promise) => waits.push(promise),
  };
  await listeners.get('fetch')(event);
  await Promise.all(waits);
  return response ? response : null;
}

const dynamicResponse = await fetchEvent('https://app.test/dashboard', { mode: 'navigate' });
assert(dynamicResponse, 'navigation is handled for offline fallback');
assert.equal(dynamicResponse.status, 200, 'online navigation still returns the network response');
assert(!await (await cacheFor(currentCacheName)).match('https://app.test/dashboard'), 'authenticated/dynamic HTML is never cached');

assert.equal(await fetchEvent('https://app.test/api/v1/me'), null, 'API responses bypass the worker cache');
assert.equal(await fetchEvent('https://app.test/dashboard?_rsc=abc'), null, 'RSC payloads bypass the worker cache');
assert.equal(await fetchEvent('https://cdn.test/image.png'), null, 'cross-origin resources bypass the worker cache');

const cachedStatic = await fetchEvent('https://app.test/_next/static/chunks/app.js');
assert(cachedStatic, 'Next static assets are handled');
await cachedStatic;
assert(await (await cacheFor(currentCacheName)).match('https://app.test/_next/static/chunks/app.js'), 'successful static assets are cached');

networkOffline = true;
const offlineNavigation = await fetchEvent('https://app.test/review', { mode: 'navigate' });
assert(offlineNavigation, 'offline navigation has a response');
const offlineResponse = await offlineNavigation;
assert.equal(offlineResponse.headers.get('content-type'), 'text/html; charset=utf-8', 'offline navigation gets HTML');
assert.match(await offlineResponse.text(), /You’re offline|You are offline/i, 'fallback explains the offline state');

const missingAsset = await fetchEvent('https://app.test/assets/missing.css');
assert.equal(missingAsset, null, 'failed assets are not replaced with offline HTML');
const cachedAsset = await fetchEvent('https://app.test/_next/static/chunks/app.js');
assert(cachedAsset, 'cached static assets are available offline');
assert.equal((await cachedAsset).status, 200, 'cached asset response is returned');

const post = await fetchEvent('https://app.test/anything', { method: 'POST' });
assert.equal(post, null, 'non-GET requests bypass the cache');

console.log('PWA service-worker contracts passed (cache privacy, offline navigation, static assets, activation cleanup).');
