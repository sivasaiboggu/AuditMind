import { supabase } from './supabase';
import { workspaceGuard } from './workspace-guard';

export async function accessToken(): Promise<string> {
  if (!supabase) throw new Error('Authentication is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Please sign in again.');
  return data.session.access_token;
}

export async function authenticatedFetch(url: string, init: RequestInit = {}) {
  const current = workspaceGuard();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${await accessToken()}`);
  if (!current()) throw new Error('Account changed before request.');
  return fetch(url, { ...init, headers });
}

export async function sendAuthenticated(ws: WebSocket, payload: Record<string, unknown>) {
  const current = workspaceGuard();
  const token = await accessToken();
  if (!current()) throw new Error('Account changed before request.');
  if (ws.readyState !== WebSocket.OPEN) throw new Error('Connection is not open.');
  ws.send(JSON.stringify({ ...payload, accessToken: token }));
}
