class Dashboard {
    constructor() {
        this.api = window.NextCloudAI;
        this.init();
    }

    async init() {
        await this.loadStats();
        await this.loadModels();
        this.setupEventListeners();
    }

    async loadStats() {
        try {
            const { stats } = await this.api.getStats();
            this.updateStatsUI(stats);
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }

    async loadModels() {
        try {
            const { models } = await this.api.getModels();
            this.renderModels(models);
        } catch (error) {
            console.error('Failed to load models:', error);
        }
    }

    updateStatsUI(stats) {
        document.getElementById('total-models').textContent = stats.total_models;
        document.getElementById('running-deployments').textContent = stats.running_deployments;
        document.getElementById('total-requests').textContent = stats.total_requests.toLocaleString();
        document.getElementById('avg-response-time').textContent = `${stats.avg_response_time}ms`;
    }

    renderModels(models) {
        const container = document.getElementById('models-container');
        container.innerHTML = models.map(model => `
            <div class="project-card" data-model-id="${model.id}">
                <div class="project-header">
                    <div class="project-icon">
                        <i class="fas fa-brain"></i>
                    </div>
                    <span class="project-status status-${model.status}">${this.getStatusText(model.status)}</span>
                </div>
                <h3>${model.name}</h3>
                <p>${model.description || 'No description'}</p>
                <div class="project-stats">
                    <span><i class="fas fa-chart-line"></i> ${model.accuracy}% Accuracy</span>
                    <span><i class="fas fa-calendar"></i> ${new Date(model.created_at).toLocaleDateString()}</span>
                </div>
                <div class="project-actions">
                    <button class="btn-deploy" onclick="dashboard.deployModel(${model.id})">Deploy</button>
                    <button class="btn-edit" onclick="dashboard.editModel(${model.id})">Edit</button>
                </div>
            </div>
        `).join('');
    }

    async deployModel(modelId) {
        try {
            const name = prompt('Enter deployment name:');
            if (!name) return;

            const { deployment } = await this.api.createDeployment(modelId, name);
            alert(`Deployment created!\nAPI Key: ${deployment.api_key}\nEndpoint: ${deployment.endpoint_url}`);
            await this.loadStats();
        } catch (error) {
            alert('Deployment failed: ' + error.message);
        }
    }

    getStatusText(status) {
        const statusMap = {
            'draft': 'Draft',
            'training': 'Training',
            'running': 'Running',
            'stopped': 'Stopped'
        };
        return statusMap[status] || status;
    }

    setupEventListeners() {
        // إضافة نموذج جديد
        document.getElementById('create-model-btn').addEventListener('click', () => {
            this.showCreateModelModal();
        });
    }

    showCreateModelModal() {
        const modal = `
            <div class="modal">
                <h3>Create New AI Model</h3>
                <form id="create-model-form">
                    <input type="text" name="name" placeholder="Model Name" required>
                    <select name="type" required>
                        <option value="">Select Type</option>
                        <option value="nlp">Natural Language Processing</option>
                        <option value="vision">Computer Vision</option>
                        <option value="audio">Audio Processing</option>
                    </select>
                    <textarea name="description" placeholder="Description"></textarea>
                    <button type="submit">Create Model</button>
                </form>
            </div>
        `;
        // تنفيذ Modal UI
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();
});
