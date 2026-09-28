const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');

export const env = {
  apiUrl: apiUrl || 'http://localhost:8000/api/v1',
  useMockApi:
    import.meta.env.VITE_USE_MOCK_API === 'true' ||
    (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_API !== 'false'),
};
