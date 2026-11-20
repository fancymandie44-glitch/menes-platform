const KEY = "ledger_session";

export function saveToken(token: string) {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* ignore */
  }
}

export function readToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = readToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers, credentials: "include" });
}
