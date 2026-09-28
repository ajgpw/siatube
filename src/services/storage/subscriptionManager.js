import { proxiedRequestUrl } from '../network/requestProxy.js';

const STORAGE_KEY = 'subscriptions_v1';

function safeGet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('subscriptionManager: read error', e);
    return [];
  }
}

function safeSet(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('subscriptionManager: write error', e);
  }
}

export function getSubscriptions() {
  return safeGet();
}

export function isSubscribed(id) {
  if (!id) return false;
  return safeGet().some((s) => s.id === id);
}

export function addSubscription({ id, name, icon }) {
  if (!id) return;
  const list = safeGet();
  const exists = list.find((s) => s.id === id);
  if (exists) return;
  list.push({ id, name: name || '', icon: icon || '', addedAt: Date.now() });
  safeSet(list);
  try { window.dispatchEvent(new CustomEvent('subscriptions-changed')); } catch (e) {}
}

export function removeSubscription(id) {
  if (!id) return;
  const list = safeGet().filter((s) => s.id !== id);
  safeSet(list);
  try { window.dispatchEvent(new CustomEvent('subscriptions-changed')); } catch (e) {}
}

export function updateSubscription(id, patch) {
  if (!id) return;
  const list = safeGet();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  safeSet(list);
  try { window.dispatchEvent(new CustomEvent('subscriptions-changed')); } catch (e) {}
}

export async function fetchImageAsBase64(url) {
  if (!url) return null;
  try {
    // If already a data URL, return as-is
    if (typeof url === 'string' && url.startsWith('data:')) return url;
    // Only attempt to fetch http/https URLs
    if (typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) return null;
    const res = await fetch(proxiedRequestUrl(url));
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('fetchImageAsBase64 error', e);
    return null;
  }
}

export default {
  getSubscriptions,
  isSubscribed,
  addSubscription,
  removeSubscription,
  fetchImageAsBase64,
};
