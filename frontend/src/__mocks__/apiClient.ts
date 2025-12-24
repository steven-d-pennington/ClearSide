import { vi } from 'vitest';

export const apiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
};

/**
 * Helper to mock a successful API response
 */
export function mockApiResponse<T>(data: T, delay = 0): Promise<{ data: T }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ data });
    }, delay);
  });
}

/**
 * Helper to mock an API error
 */
export function mockApiError(message: string, status = 500, delay = 0): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const error = new Error(message) as Error & { status: number };
      error.status = status;
      reject(error);
    }, delay);
  });
}

/**
 * Reset all API mocks
 */
export function resetApiMocks() {
  apiClient.get.mockReset();
  apiClient.post.mockReset();
  apiClient.put.mockReset();
  apiClient.delete.mockReset();
  apiClient.patch.mockReset();
}
