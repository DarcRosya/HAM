const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function getHealth() {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) {
    throw new Error('API unavailable');
  }
  return response.json();
}
