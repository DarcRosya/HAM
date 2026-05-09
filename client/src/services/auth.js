const BASE_URL = 'http://localhost:3001/api/auth';

export const authService = {
    register: async (userData) => {
        const response = await fetch(`${BASE_URL}/register`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(userData)
        });

        const isJson = response.headers.get('content-type')?.includes('application/json');
        const data = isJson ? await response.json() : null;

        if (!response.ok) {
            throw new Error(data?.message || `Registration failed: ${response.status}`);
        }
        window.location.hash = '#login';
        return data;
    },

    login: async (credentials) => {
        const response = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(credentials)
        });

        const isJson = response.headers.get('content-type')?.includes('application/json');
        const data = isJson ? await response.json() : null;

        if (!response.ok) {
            throw new Error(data?.message || `Login failed: ${response.status}`);
        }

        if (data?.token) {
            localStorage.setItem('token', data.token);
            window.location.hash = '#homepage';
        }
        
        return data;
    },

    logout: () => {
        localStorage.removeItem('token');
        window.location.hash = '#menu';
    }
};
