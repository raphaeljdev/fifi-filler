// Loads the classic extension libs into globalThis with an in-memory chrome.storage.
import { createRequire } from 'node:module';

function area() {
  let data = {};
  return {
    async get(keys) {
      if (keys === null || keys === undefined) return structuredClone(data);
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      return Object.fromEntries(list.filter(k => k in data).map(k => [k, structuredClone(data[k])]));
    },
    async set(obj) {
      data = { ...data, ...structuredClone(obj) };
    },
    async remove(keys) {
      for (const k of [].concat(keys)) delete data[k];
    },
    _reset(init = {}) {
      data = structuredClone(init);
    },
  };
}

globalThis.chrome = { storage: { local: area(), session: area() } };

const require = createRequire(import.meta.url);
for (const f of ['br', 'fields', 'fake', 'crypto', 'store']) require(`../../lib/${f}.js`);

export function resetStorage(local = {}) {
  chrome.storage.local._reset(local);
  chrome.storage.session._reset();
}

export const FF = globalThis.FF;
