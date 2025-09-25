class NextCloudAIAPI {
    constructor() {
        this.baseURL = 'http://localhost:3000/api'; // سيتم تغييرها عند النشر
        this.token = localStorage.getItem('ncai_token');
    }

    async request(endpoint, options = {}) {
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        };

        if (this.token) {
            config.headers.Authorization = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // المصادقة
    async login(email, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });

        this.token = data.token;
        localStorage.setItem('ncai_token', data.token);
        return data;
    }

    async register(name, email, password) {
        const data = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password }),
        });

        this.token = data.token;
        localStorage.setItem('ncai_token', data.token);
        return data;
    }

    // النماذج
    async getModels() {
        return await this.request('/models');
    }

    async createModel(modelData) {
        return await this.request('/models', {
            method: 'POST',
            body: JSON.stringify(modelData),
        });
    }

    // النشر
    async createDeployment(modelId, name) {
        return await this.request('/deployments', {
            method: 'POST',
            body: JSON.stringify({ model_id: modelId, name }),
        });
    }

    // الإحصائيات
    async getStats() {
        return await this.request('/stats');
    }
}

// التصدير للاستخدام العالمي
window.NextCloudAI = new NextCloudAIAPI();
