import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

const memory = new Map();
const fakeLocalStorage = {
  getItem: (key) => (memory.has(key) ? String(memory.get(key)) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear(),
};

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: fakeLocalStorage, configurable: true });
}
if (typeof globalThis !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: fakeLocalStorage, configurable: true });
}

afterEach(() => {
  cleanup();
  fakeLocalStorage.clear();
});
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
}
