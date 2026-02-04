// API client utilities with automatic JWT token injection

export function getAuthHeaders(): HeadersInit {
  if (typeof window === 'undefined') return {};
  
  const token = localStorage.getItem('token');
  if (!token) return {};
  
  return {
    'Authorization': `Bearer ${token}`,
  };
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const authHeaders = getAuthHeaders();
  
  Object.entries(authHeaders).forEach(([key, value]) => {
    if (value) {
      headers.set(key, value);
    }
  });
  
  return fetch(url, {
    ...options,
    headers,
  });
}

