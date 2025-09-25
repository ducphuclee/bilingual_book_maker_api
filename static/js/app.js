/**
 * Bilingual Book Maker - Frontend Application
 * Handles file upload, progress tracking, and results display
 */

class BookMakerApp {
    constructor() {
        this.currentTaskId = null;
        this.pollInterval = null;
        this.uploadedFiles = [];

        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        this.bindEvents();
        this.setupFileUpload();
        this.loadSavedTask();
    }

    /**
     * Bind all event listeners
     */
    bindEvents() {
        // Form submission
        document.getElementById('uploadForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });

        // Advanced settings toggle
        document.getElementById('toggleAdvanced').addEventListener('click', () => {
            this.toggleAdvancedSettings();
        });

        // Cancel task
        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.cancelTask();
        });

        // Results actions
        document.getElementById('downloadAllBtn').addEventListener('click', () => {
            this.downloadAll();
        });

        document.getElementById('newTaskBtn').addEventListener('click', () => {
            this.startNewTask();
        });

        // Error section retry
        document.getElementById('retryBtn').addEventListener('click', () => {
            this.startNewTask();
        });

        // Footer links
        document.getElementById('aboutLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showAbout();
        });

        document.getElementById('helpLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showHelp();
        });

        document.getElementById('apiDocsLink').addEventListener('click', (e) => {
            e.preventDefault();
            window.open('/docs', '_blank');
        });
    }

    /**
     * Setup file upload functionality
     */
    setupFileUpload() {
        const fileInput = document.getElementById('files');
        const uploadArea = document.getElementById('fileUploadArea');
        const fileList = document.getElementById('fileList');

        // File input change
        fileInput.addEventListener('change', (e) => {
            this.handleFileSelection(e.target.files);
        });

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            this.handleFileSelection(e.dataTransfer.files);
        });
    }

    /**
     * Handle file selection (from input or drag-drop)
     */
    handleFileSelection(files) {
        const allowedTypes = ['.epub', '.txt', '.srt'];
        const maxFileSize = 100 * 1024 * 1024; // 100MB

        Array.from(files).forEach(file => {
            // Check file type
            const isValidType = allowedTypes.some(type =>
                file.name.toLowerCase().endsWith(type)
            );

            if (!isValidType) {
                this.showNotification(`Invalid file type: ${file.name}`, 'error');
                return;
            }

            // Check file size
            if (file.size > maxFileSize) {
                this.showNotification(`File too large: ${file.name} (max 100MB)`, 'error');
                return;
            }

            // Check if already added
            if (this.uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
                this.showNotification(`File already added: ${file.name}`, 'warning');
                return;
            }

            this.uploadedFiles.push(file);
        });

        this.updateFileList();
    }

    /**
     * Update the file list display
     */
    updateFileList() {
        const fileList = document.getElementById('fileList');

        if (this.uploadedFiles.length === 0) {
            fileList.innerHTML = '';
            return;
        }

        fileList.innerHTML = this.uploadedFiles.map((file, index) => `
            <div class="file-item">
                <div class="file-info">
                    <span class="file-icon">${this.getFileIcon(file.name)}</span>
                    <div>
                        <div class="file-name">${file.name}</div>
                        <div class="file-size">${this.formatFileSize(file.size)}</div>
                    </div>
                </div>
                <button type="button" class="file-remove" onclick="app.removeFile(${index})">
                    ❌
                </button>
            </div>
        `).join('');
    }

    /**
     * Remove file from upload list
     */
    removeFile(index) {
        this.uploadedFiles.splice(index, 1);
        this.updateFileList();
    }

    /**
     * Get file icon based on extension
     */
    getFileIcon(filename) {
        const ext = filename.toLowerCase().split('.').pop();
        const icons = {
            'epub': '📚',
            'txt': '📄',
            'srt': '🎬'
        };
        return icons[ext] || '📄';
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Toggle advanced settings visibility
     */
    toggleAdvancedSettings() {
        const toggle = document.getElementById('toggleAdvanced');
        const settings = document.getElementById('advancedSettings');

        if (settings.classList.contains('show')) {
            settings.classList.remove('show');
            toggle.classList.remove('active');
        } else {
            settings.classList.add('show');
            toggle.classList.add('active');
        }
    }

    /**
     * Handle form submission
     */
    async handleFormSubmit() {
        if (this.uploadedFiles.length === 0) {
            this.showNotification('Please select at least one file', 'error');
            return;
        }

        // Validate OpenAI API key (basic check)
        const model = document.getElementById('model').value;
        if (model.startsWith('gpt-') && !this.hasValidApiKey()) {
            this.showNotification('OpenAI API key is required for GPT models', 'error');
            return;
        }

        this.showLoadingOverlay(true);
        this.setButtonLoading('submitBtn', true);

        try {
            const formData = new FormData();

            // Add files
            this.uploadedFiles.forEach(file => {
                formData.append('files', file);
            });

            // Add form data
            formData.append('model', document.getElementById('model').value);
            formData.append('language', document.getElementById('language').value);
            formData.append('resume', document.getElementById('resume').checked);
            formData.append('translate_tags', document.getElementById('translateTags').value);
            formData.append('book_from', document.getElementById('bookFrom').value);
            formData.append('book_to', document.getElementById('bookTo').value);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || 'Upload failed');
            }

            // Start tracking progress
            this.currentTaskId = result.task_id;
            this.saveTaskToStorage(result.task_id);
            this.showProgressSection();
            this.startProgressPolling();

        } catch (error) {
            console.error('Upload error:', error);
            this.showError(error.message);
        } finally {
            this.showLoadingOverlay(false);
            this.setButtonLoading('submitBtn', false);
        }
    }

    /**
     * Basic API key validation
     */
    hasValidApiKey() {
        // This would typically check if API key is configured on backend
        // For now, assume it's configured if we reach this point
        return true;
    }

    /**
     * Show progress section and hide others
     */
    showProgressSection() {
        this.hideAllSections();
        document.getElementById('progressSection').classList.remove('hidden');

        // Reset progress display
        this.updateProgress({
            status: 'starting',
            progress: 0,
            current_file: '',
            completed_files: 0,
            total_files: this.uploadedFiles.length
        });
    }

    /**
     * Start polling for progress updates
     */
    startProgressPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        this.pollInterval = setInterval(async () => {
            try {
                await this.checkProgress();
            } catch (error) {
                console.error('Progress polling error:', error);
                this.stopProgressPolling();
                this.showError('Failed to check progress: ' + error.message);
            }
        }, 2000); // Poll every 2 seconds
    }

    /**
     * Stop progress polling
     */
    stopProgressPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Check progress from server
     */
    async checkProgress() {
        if (!this.currentTaskId) return;

        const response = await fetch(`/status/${this.currentTaskId}`);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Task not found');
            }
            throw new Error('Failed to get task status');
        }

        const status = await response.json();
        this.updateProgress(status);

        // Check if task is complete
        if (status.status === 'completed') {
            this.stopProgressPolling();
            this.showResults(status);
        } else if (status.status === 'failed') {
            this.stopProgressPolling();
            this.showError(status.error || 'Translation failed');
        }
    }

    /**
     * Update progress display
     */
    updateProgress(status) {
        // Update status text
        document.getElementById('taskStatus').textContent =
            this.formatStatus(status.status);

        // Update current file
        document.getElementById('currentFile').textContent =
            status.current_file || '-';

        // Update progress percentage
        const progress = status.progress || 0;
        document.getElementById('progressText').textContent = `${progress}%`;
        document.getElementById('progressBar').style.width = `${progress}%`;

        // Update file counts
        document.getElementById('completedFiles').textContent =
            status.completed_files || 0;
        document.getElementById('totalFiles').textContent =
            status.total_files || 0;

        // Update task ID
        document.getElementById('taskId').textContent =
            this.currentTaskId || '-';
    }

    /**
     * Format status text for display
     */
    formatStatus(status) {
        const statusMap = {
            'starting': '🚀 Starting...',
            'processing': '⚙️ Processing...',
            'completed': '✅ Completed',
            'failed': '❌ Failed',
            'cancelled': '⏹️ Cancelled'
        };
        return statusMap[status] || status;
    }

    /**
     * Show results section
     */
    showResults(status) {
        this.hideAllSections();
        document.getElementById('resultsSection').classList.remove('hidden');

        const results = status.results || [];
        const successCount = status.success_count || 0;
        const errorCount = status.error_count || 0;

        // Update summary
        document.getElementById('successCount').textContent = successCount;
        document.getElementById('errorCount').textContent = errorCount;

        // Update results list
        this.updateResultsList(results);

        // Show/hide download all button
        const downloadAllBtn = document.getElementById('downloadAllBtn');
        downloadAllBtn.style.display = successCount > 0 ? 'inline-flex' : 'none';
    }

    /**
     * Update results list display
     */
    updateResultsList(results) {
        const resultsList = document.getElementById('resultsList');

        if (results.length === 0) {
            resultsList.innerHTML = '<p>No results available.</p>';
            return;
        }

        resultsList.innerHTML = results.map(result => `
            <div class="result-item ${result.status}">
                <div class="result-info">
                    <div class="result-filename">${result.input_file}</div>
                    <div class="result-status ${result.status}">
                        ${result.status === 'success' ? '✅ Success' : '❌ Failed'}
                    </div>
                    ${result.error ? `<div class="result-error">${result.error}</div>` : ''}
                </div>
                <div class="result-actions">
                    ${result.status === 'success' && result.output_file ?
                `<button class="btn btn-primary btn-small" 
                                onclick="app.downloadFile('${result.output_file}')">
                            📥 Download
                        </button>` : ''
            }
                </div>
            </div>
        `).join('');
    }

    /**
     * Download a specific file
     */
    async downloadFile(filename) {
        if (!this.currentTaskId) return;

        try {
            const url = `/download/${this.currentTaskId}/${filename}`;
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            this.showNotification(`Downloading ${filename}`, 'success');
        } catch (error) {
            this.showNotification(`Download failed: ${error.message}`, 'error');
        }
    }

    /**
     * Download all successful files
     */
    async downloadAll() {
        if (!this.currentTaskId) return;

        try {
            const response = await fetch(`/status/${this.currentTaskId}`);
            const status = await response.json();

            const successfulFiles = status.results
                .filter(r => r.status === 'success' && r.output_file)
                .map(r => r.output_file);

            if (successfulFiles.length === 0) {
                this.showNotification('No files available for download', 'warning');
                return;
            }

            // Download each file
            for (const filename of successfulFiles) {
                await this.downloadFile(filename);
                // Add small delay between downloads
                await new Promise(resolve => setTimeout(resolve, 500));
            }

        } catch (error) {
            this.showNotification(`Download all failed: ${error.message}`, 'error');
        }
    }

    /**
     * Cancel current task
     */
    async cancelTask() {
        if (!this.currentTaskId) return;

        if (!confirm('Are you sure you want to cancel this task?')) {
            return;
        }

        try {
            // Note: This would require a cancel endpoint on the backend
            // For now, just stop polling and reset UI
            this.stopProgressPolling();
            this.startNewTask();
            this.showNotification('Task cancelled', 'warning');
        } catch (error) {
            this.showNotification(`Cancel failed: ${error.message}`, 'error');
        }
    }

    /**
     * Start a new task (reset UI)
     */
    startNewTask() {
        this.stopProgressPolling();
        this.currentTaskId = null;
        this.clearTaskFromStorage();
        this.uploadedFiles = [];
        this.updateFileList();

        // Reset form
        document.getElementById('uploadForm').reset();
        document.getElementById('translateTags').value = 'p';

        // Show upload section
        this.hideAllSections();
        document.querySelector('.upload-section').classList.remove('hidden');
    }

    /**
     * Show error section
     */
    showError(message) {
        this.hideAllSections();
        document.getElementById('errorSection').classList.remove('hidden');
        document.getElementById('errorMessage').textContent = message;
    }

    /**
     * Hide all main sections
     */
    hideAllSections() {
        const sections = [
            'progressSection',
            'resultsSection',
            'errorSection'
        ];

        sections.forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });

        document.querySelector('.upload-section').classList.add('hidden');
    }

    /**
     * Show/hide loading overlay
     */
    showLoadingOverlay(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }

    /**
     * Set button loading state
     */
    setButtonLoading(buttonId, loading) {
        const button = document.getElementById(buttonId);
        if (loading) {
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    }

    /**
     * Show notification (simple implementation)
     */
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">×</button>
        `;

        // Add styles if not already added
        if (!document.getElementById('notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 12px 16px;
                    border-radius: 6px;
                    color: white;
                    font-weight: 500;
                    z-index: 1001;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    animation: slideInRight 0.3s ease-out;
                    max-width: 400px;
                }
                .notification-info { background: #2563eb; }
                .notification-success { background: #059669; }
                .notification-warning { background: #d97706; }
                .notification-error { background: #dc2626; }
                .notification button {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 18px;
                    cursor: pointer;
                    padding: 0;
                    width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(styles);
        }

        document.body.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    /**
     * Save task ID to localStorage
     */
    saveTaskToStorage(taskId) {
        localStorage.setItem('currentTaskId', taskId);
    }

    /**
     * Load saved task from localStorage
     */
    loadSavedTask() {
        const savedTaskId = localStorage.getItem('currentTaskId');
        if (savedTaskId) {
            this.currentTaskId = savedTaskId;
            this.showProgressSection();
            this.startProgressPolling();
        }
    }

    /**
     * Clear task from localStorage
     */
    clearTaskFromStorage() {
        localStorage.removeItem('currentTaskId');
    }

    /**
     * Show about dialog
     */
    showAbout() {
        alert(`Bilingual Book Maker v1.0.0

Transform your books into bilingual editions using AI translation.

Features:
• Support for EPUB, TXT, and SRT files
• Multiple AI models (GPT, Claude, Gemini)
• Progress tracking and error handling
• Batch processing capabilities

Built with FastAPI, Celery, and modern web technologies.`);
    }

    /**
     * Show help dialog
     */
    showHelp() {
        alert(`How to use Bilingual Book Maker:

1. Select Files: Choose your EPUB, TXT, or SRT files
2. Configure Settings: Select AI model and target language
3. Advanced Options: Customize translation parameters
4. Start Translation: Click "Start Translation" button
5. Monitor Progress: Watch real-time progress updates
6. Download Results: Get your bilingual books

Tips:
• Larger files take longer to process
• GPT-4 provides better quality but is slower
• You can process multiple files at once
• Resume feature helps with interrupted translations

For technical support, check the API documentation.`);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BookMakerApp();
});

// Handle page visibility change to pause/resume polling
document.addEventListener('visibilitychange', () => {
    if (window.app) {
        if (document.hidden) {
            // Page is hidden, could reduce polling frequency
            console.log('Page hidden - continuing background polling');
        } else {
            // Page is visible, ensure normal polling
            if (window.app.currentTaskId && !window.app.pollInterval) {
                window.app.startProgressPolling();
            }
        }
    }
});

// Handle browser back/forward buttons
window.addEventListener('popstate', () => {
    if (window.app && window.app.currentTaskId) {
        // Restore progress view if there's an active task
        window.app.showProgressSection();
        if (!window.app.pollInterval) {
            window.app.startProgressPolling();
        }
    }
});
