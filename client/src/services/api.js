const API_URL = 'http://localhost:3001';

export async function getHealth() {
    try {
        const response = await fetch(`${API_URL}/health`);
        
        if (!response.ok) {
            throw new Error('API unavailable');
        }
        
        return await response.json();
    } catch (error) {
        console.error("Health check failed:", error);
        throw error;
    }
}

export async function authenticatedFetch(endpoint) {
    const token = localStorage.getItem('token');
    
    const response = await fetch(`${API_URL}${endpoint}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (response.status === 401) {
        localStorage.removeItem('token');
        window.location.href = 'index.html';
        return;
    }

    return response.json();
}
