import { ApiResponse } from '@load-shedding/shared';

/**
 * Resolves the active backend API base URL:
 * 1. Checks explicit NEXT_PUBLIC_API_URL environment variable.
 * 2. In browser on localhost or 127.0.0.1, defaults to local Express server at http://localhost:4000.
 * 3. Falls back to production cloud deployment at https://load-shading-balance.onrender.com.
 */
export const getApiBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:4000';
    }
  }
  return 'https://load-shading-balance.onrender.com';
};

export class ApiClient {
  private static getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
  }

  static async request<T = any>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>)
    };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const baseUrl = getApiBaseUrl();
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'omit' // We pass token explicitly in Authorization header
      });

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        return data as ApiResponse<T>;
      }

      // Handle non-JSON responses (e.g. 502/503 HTML gateway pages)
      const text = await response.text();
      if (!response.ok) {
        return {
          success: false,
          data: null,
          error: {
            code: `HTTP_${response.status}`,
            message: `API server returned ${response.status} (${response.statusText || 'Error'}). Service may be starting up.`
          },
          timestamp: new Date().toISOString()
        };
      }

      return {
        success: true,
        data: text as unknown as T,
        error: null,
        timestamp: new Date().toISOString()
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        error: {
          code: 'NETWORK_ERROR',
          message: err.message || 'Failed to connect to API server'
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  static get<T = any>(path: string) {
    return this.request<T>(path, { method: 'GET' });
  }

  static post<T = any>(path: string, body?: any) {
    return this.request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body)
    });
  }

  static patch<T = any>(path: string, body?: any) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body)
    });
  }

  static delete<T = any>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}
