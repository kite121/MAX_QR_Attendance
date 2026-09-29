const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');
const demoEnabled = import.meta.env.DEV || import.meta.env.MODE === 'demo';

export const env = {
  apiUrl: apiUrl || (import.meta.env.PROD ? '/api/v1' : 'http://localhost:8000/api/v1'),
  demoEnabled,
  useMockApi: demoEnabled && import.meta.env.VITE_USE_MOCK_API !== 'false',
};
