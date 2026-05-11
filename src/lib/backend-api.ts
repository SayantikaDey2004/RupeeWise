import { supabase } from '@/db/supabase';

export function getApiBaseUrl(): string | undefined {
  const url = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!url) return undefined;
  return url.replace(/\/+$/, '');
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function backendJson<T>(
  path: string,
  init: Omit<RequestInit, 'body'> & { body?: unknown } = {}
): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new Error('VITE_API_BASE_URL is not set');
  }

  const token = await getSupabaseAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}
