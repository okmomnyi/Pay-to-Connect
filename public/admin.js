class AdminPanel {
    constructor() {
        this.token = localStorage.getItem('adminToken');
        this.currentSection = 'dashboard';
        this.editingPackageId = null;
        
        this.initializeElements();
        this.bindEvents();
        
        if (this.token) {
            this.showAdminPanel();
            this.loadDashboard();
        } else {
            this.showLoginModal();
        }
    }

    initializeElements() {
        // Login elements
        this.loginModal = document.getElementById('loginModal');
        this.loginForm = document.getElementById('loginForm');
        this.loginError = document.getElementById('loginError');
        this.loginButton = document.getElementById('loginButton');

        // Main app elements
        this.adminApp = document.getElementById('adminApp');
        this.sidebar = document.getElementById('sidebar');
        this.sidebarToggle = document.getElementById('sidebarToggle');
        this.logoutButton = document.getElementById('logoutButton');
        this.adminUsername = document.getElementById('adminUsername');

        // Navigation
        this.navLinks = document.querySelectorAll('.nav-link');
        this.sections = document.querySelectorAll('.section');

        // Dashboard elements
        this.activeSessions = document.getElementById('activeSessions');
        this.todayRevenue = document.getElementById('todayRevenue');
        this.totalDevices = document.getElementById('totalDevices');
        this.totalRevenue = document.getElementById('totalRevenue');
        this.recentSessionsTable = document.getElementById('recentSessionsTable');

        // Package elements
        this.addPackageButton = document.getElementById('addPackageButton');
        this.packagesTable = document.getElementById('packagesTable');
        this.packageModal = document.getElementById('packageModal');
        this.packageForm = document.getElementById('packageForm');
        this.packageModalTitle = document.getElementById('packageModalTitle');
        this.closePackageModal = document.getElementById('closePackageModal');
        this.cancelPackage = document.getElementById('cancelPackage');

        // Administrator elements
        this.addAdministratorButton = document.getElementById('addAdministratorButton');
        this.administratorsTable = document.getElementById('administratorsTable');
        this.administratorModal = document.getElementById('administratorModal');
        this.administratorForm = document.getElementById('administratorForm');
        this.closeAdministratorModal = document.getElementById('closeAdministratorModal');
        this.cancelAdministrator = document.getElementById('cancelAdministrator');
    }

    bindEvents() {
        // Login form
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));

        // Logout
        this.logoutButton.addEventListener('click', () => this.handleLogout());

        // Sidebar toggle
        this.sidebarToggle.addEventListener('click', () => this.toggleSidebar());

        // Navigation
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                this.showSection(section);
            });
        });

        // Package management
        this.addPackageButton.addEventListener('click', () => this.showPackageModal());
        this.closePackageModal.addEventListener('click', () => this.hidePackageModal());
        this.cancelPackage.addEventListener('click', () => this.hidePackageModal());
        this.packageForm.addEventListener('submit', (e) => this.handlePackageSubmit(e));

        // Close modal on outside click
        this.packageModal.addEventListener('click', (e) => {
            if (e.target === this.packageModal) this.hidePackageModal();
        });

        // Administrator management
        this.addAdministratorButton.addEventListener('click', () => this.showAdministratorModal());
        this.closeAdministratorModal.addEventListener('click', () => this.hideAdministratorModal());
        this.cancelAdministrator.addEventListener('click', () => this.hideAdministratorModal());
        this.administratorForm.addEventListener('submit', (e) => this.handleAdministratorSubmit(e));

        // Close administrator modal on outside click
        this.administratorModal.addEventListener('click', (e) => {
            if (e.target === this.administratorModal) this.hideAdministratorModal();
        });
    }

    showLoginModal() {
        this.loginModal.classList.remove('hidden');
        this.adminApp.classList.add('hidden');
    }

    showAdminPanel() {
        this.loginModal.classList.add('hidden');
        this.adminApp.classList.remove('hidden');
        
        // Set username if available
        const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
        if (user.username) {
            this.adminUsername.textContent = user.username;
        }
        
        // Show dashboard section by default
        this.showSection('dashboard');
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        console.log('Login attempt for username:', username);

        try {
            this.loginButton.disabled = true;
            this.loginButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Logging in...';
            this.hideLoginError();

            console.log('Sending login request...');
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            console.log('Response status:', response.status);
            const data = await response.json();
            console.log('Response data:', data);

            if (!data.success) {
                console.error('Login failed:', data.error);
                throw new Error(data.error || 'Login failed');
            }

            // Store token and user info
            console.log('Storing token and user info...');
            localStorage.setItem('adminToken', data.token);
            localStorage.setItem('adminUser', JSON.stringify(data.user));
            
            this.token = data.token;
            console.log('Showing admin panel...');
            this.showAdminPanel();
            console.log('Loading dashboard...');
            this.loadDashboard();
            console.log('Login complete!');

        } catch (error) {
            console.error('Login error:', error);
            this.showLoginError(error.message);
        } finally {
            this.loginButton.disabled = false;
            this.loginButton.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Login';
        }
    }

    handleLogout() {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        this.token = null;
        this.showLoginModal();
    }

    showLoginError(message) {
        this.loginError.textContent = message;
        this.loginError.classList.remove('hidden');
    }

    hideLoginError() {
        this.loginError.classList.add('hidden');
    }

    toggleSidebar() {
        this.sidebar.classList.toggle('-translate-x-full');
    }

    showSection(sectionName) {
        // Update navigation
        this.navLinks.forEach(link => {
            if (link.dataset.section === sectionName) {
                link.classList.add('bg-gray-700');
            } else {
                link.classList.remove('bg-gray-700');
            }
        });

        // Show/hide sections
        this.sections.forEach(section => {
            section.classList.add('hidden');
        });

        const targetSection = document.getElementById(`${sectionName}Section`);
        if (targetSection) {
            targetSection.classList.remove('hidden');
        }

        this.currentSection = sectionName;

        // Load section data
        switch (sectionName) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'packages':
                this.loadPackages();
                break;
            case 'routers':
                this.loadRouters();
                break;
            case 'sessions':
                this.loadSessions();
                break;
            case 'payments':
                this.loadPayments();
                break;
            case 'administrators':
                this.loadAdministrators();
                break;
        }

        // Close sidebar on mobile
        if (window.innerWidth < 1024) {
            this.sidebar.classList.add('-translate-x-full');
        }
    }

    async makeAuthenticatedRequest(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            }
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        const response = await fetch(url, mergedOptions);
        
        if (response.status === 401) {
            this.handleLogout();
            throw new Error('Session expired');
        }

        return response;
    }

    async loadDashboard() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/admin/dashboard');
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to load dashboard');
            }

            // Update statistics
            this.activeSessions.textContent = data.stats.activeSessions;
            this.todayRevenue.textContent = `KES ${data.stats.todayPayments.amount.toFixed(2)}`;
            this.totalDevices.textContent = data.stats.totalDevices;
            this.totalRevenue.textContent = `KES ${data.stats.totalRevenue.toFixed(2)}`;

            // Update recent sessions table
            this.renderRecentSessions(data.recentSessions);

        } catch (error) {
            console.error('Failed to load dashboard:', error);
            // Show mock data if API fails
            this.activeSessions.textContent = '0';
            this.todayRevenue.textContent = 'KES 0.00';
            this.totalDevices.textContent = '5';
            this.totalRevenue.textContent = 'KES 0.00';
            this.renderRecentSessions([]);
        }
    }

    renderRecentSessions(sessions) {
        this.recentSessionsTable.innerHTML = '';

        if (sessions.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                    No recent sessions found
                </td>
            `;
            this.recentSessionsTable.appendChild(row);
            return;
        }

        sessions.forEach(session => {
            const row = document.createElement('tr');
            row.className = 'table-row';
            
            const statusClass = session.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
            const statusText = session.active ? 'Active' : 'Expired';
            
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${session.macAddress}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${session.packageName}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    KES ${session.price.toFixed(2)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                        ${statusText}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${new Date(session.startTime).toLocaleString()}
                </td>
            `;
            
            this.recentSessionsTable.appendChild(row);
        });
    }

    async loadPackages() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/admin/packages');
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to load packages');
            }

            this.renderPackages(data.packages);

        } catch (error) {
            console.error('Failed to load packages:', error);
            this.showError('Failed to load packages');
        }
    }

    renderPackages(packages) {
        this.packagesTable.innerHTML = '';

        if (packages.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                    No packages found
                </td>
            `;
            this.packagesTable.appendChild(row);
            return;
        }

        packages.forEach(pkg => {
            const row = document.createElement('tr');
            row.className = 'table-row';
            
            const statusClass = pkg.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
            const statusText = pkg.active ? 'Active' : 'Inactive';
            
            const durationDisplay = this.formatDuration(pkg.durationMinutes);
            
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    ${pkg.name}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${durationDisplay}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${pkg.priceKes.toFixed(2)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                        ${statusText}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="adminPanel.editPackage('${pkg.id}')" class="text-indigo-600 hover:text-indigo-900 mr-3">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button onclick="adminPanel.togglePackageStatus('${pkg.id}', ${!pkg.active})" class="text-${pkg.active ? 'red' : 'green'}-600 hover:text-${pkg.active ? 'red' : 'green'}-900 mr-3">
                        <i class="fas fa-${pkg.active ? 'ban' : 'check'}"></i> ${pkg.active ? 'Disable' : 'Enable'}
                    </button>
                    <button onclick="adminPanel.deletePackage('${pkg.id}')" class="text-red-600 hover:text-red-900">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            `;
            
            this.packagesTable.appendChild(row);
        });
    }

    formatDuration(minutes) {
        if (minutes < 60) {
            return `${minutes} minutes`;
        } else if (minutes < 1440) {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            if (remainingMinutes === 0) {
                return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
            }
            return `${hours}h ${remainingMinutes}m`;
        } else {
            const days = Math.floor(minutes / 1440);
            const remainingHours = Math.floor((minutes % 1440) / 60);
            if (remainingHours === 0) {
                return `${days} ${days === 1 ? 'day' : 'days'}`;
            }
            return `${days}d ${remainingHours}h`;
        }
    }

    showPackageModal(packageData = null) {
        this.editingPackageId = packageData ? packageData.id : null;
        
        if (packageData) {
            this.packageModalTitle.textContent = 'Edit Package';
            document.getElementById('packageName').value = packageData.name;
            document.getElementById('packageDuration').value = packageData.durationMinutes;
            document.getElementById('packagePrice').value = packageData.priceKes;
        } else {
            this.packageModalTitle.textContent = 'Add Package';
            this.packageForm.reset();
        }
        
        this.packageModal.classList.remove('hidden');
    }

    hidePackageModal() {
        this.packageModal.classList.add('hidden');
        this.editingPackageId = null;
    }

    async handlePackageSubmit(e) {
        e.preventDefault();
        
        const formData = {
            name: document.getElementById('packageName').value,
            durationMinutes: parseInt(document.getElementById('packageDuration').value),
            priceKes: parseFloat(document.getElementById('packagePrice').value)
        };

        try {
            const url = this.editingPackageId 
                ? `/api/admin/packages/${this.editingPackageId}`
                : '/api/admin/packages';
            
            const method = this.editingPackageId ? 'PUT' : 'POST';
            
            const response = await this.makeAuthenticatedRequest(url, {
                method,
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to save package');
            }

            this.hidePackageModal();
            this.loadPackages();
            this.showSuccess(this.editingPackageId ? 'Package updated successfully' : 'Package created successfully');

        } catch (error) {
            console.error('Failed to save package:', error);
            this.showError(error.message);
        }
    }

    async editPackage(packageId) {
        // Find package data and show modal
        // In a real implementation, you might fetch the specific package data
        this.showPackageModal({ id: packageId });
    }

    async togglePackageStatus(packageId, active) {
        try {
            const response = await this.makeAuthenticatedRequest(`/api/admin/packages/${packageId}`, {
                method: 'PUT',
                body: JSON.stringify({ active })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to update package status');
            }

            this.loadPackages();
            this.showSuccess(`Package ${active ? 'enabled' : 'disabled'} successfully`);

        } catch (error) {
            console.error('Failed to update package status:', error);
            this.showError(error.message);
        }
    }

    async deletePackage(packageId) {
        if (!confirm('Are you sure you want to delete this package? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await this.makeAuthenticatedRequest(`/api/admin/packages/${packageId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to delete package');
            }

            this.loadPackages();
            this.showSuccess('Package deleted successfully');

        } catch (error) {
            console.error('Failed to delete package:', error);
            this.showError(error.message);
        }
    }

    loadRouters() {
        // Placeholder for router management
        console.log('Loading routers...');
    }

    loadSessions() {
        // Placeholder for session monitoring
        console.log('Loading sessions...');
    }

    loadPayments() {
        // Placeholder for payment history
        console.log('Loading payments...');
    }

    async loadAdministrators() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/admin/administrators');
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to load administrators');
            }

            this.renderAdministrators(data.administrators);
        } catch (error) {
            console.error('Failed to load administrators:', error);
            this.showError('Failed to load administrators');
        }
    }

    renderAdministrators(administrators) {
        const container = document.getElementById('administratorsTable');
        if (!container) return;

        container.innerHTML = '';

        if (administrators.length === 0) {
            container.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No administrators found</td></tr>';
            return;
        }

        administrators.forEach(admin => {
            const row = document.createElement('tr');
            row.className = 'table-row';

            const statusClass = admin.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
            const statusText = admin.active ? 'Active' : 'Inactive';

            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    ${admin.username}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${admin.email}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                        ${statusText}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${new Date(admin.created_at).toLocaleDateString()}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="adminPanel.editAdministrator('${admin.id}')" class="text-indigo-600 hover:text-indigo-900 mr-3">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button onclick="adminPanel.deleteAdministrator('${admin.id}')" class="text-red-600 hover:text-red-900">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            `;

            container.appendChild(row);
        });
    }

    async createAdministrator(username, email, password) {
        try {
            const response = await this.makeAuthenticatedRequest('/api/admin/administrators', {
                method: 'POST',
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to create administrator');
            }

            this.showSuccess('Administrator created successfully');
            this.loadAdministrators();
            return true;
        } catch (error) {
            console.error('Failed to create administrator:', error);
            this.showError(error.message);
            return false;
        }
    }

    async editAdministrator(adminId) {
        const newEmail = prompt('Enter new email (leave blank to skip):');
        const newPassword = prompt('Enter new password (leave blank to skip):');

        if (!newEmail && !newPassword) {
            return;
        }

        try {
            const updates = {};
            if (newEmail) updates.email = newEmail;
            if (newPassword) updates.password = newPassword;

            const response = await this.makeAuthenticatedRequest(`/api/admin/administrators/${adminId}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to update administrator');
            }

            this.showSuccess('Administrator updated successfully');
            this.loadAdministrators();
        } catch (error) {
            console.error('Failed to update administrator:', error);
            this.showError(error.message);
        }
    }

    async deleteAdministrator(adminId) {
        if (!confirm('Are you sure you want to deactivate this administrator?')) {
            return;
        }

        try {
            const response = await this.makeAuthenticatedRequest(`/api/admin/administrators/${adminId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to delete administrator');
            }

            this.showSuccess('Administrator deactivated successfully');
            this.loadAdministrators();
        } catch (error) {
            console.error('Failed to delete administrator:', error);
            this.showError(error.message);
        }
    }

    showAdministratorModal() {
        this.administratorForm.reset();
        this.administratorModal.classList.remove('hidden');
    }

    hideAdministratorModal() {
        this.administratorModal.classList.add('hidden');
    }

    async handleAdministratorSubmit(e) {
        e.preventDefault();

        const username = document.getElementById('adminUsername').value;
        const email = document.getElementById('adminEmail').value;
        const password = document.getElementById('adminPassword').value;

        const success = await this.createAdministrator(username, email, password);
        if (success) {
            this.hideAdministratorModal();
        }
    }

    showError(message) {
        // Simple error notification - in production, use a proper notification system
        alert(`Error: ${message}`);
    }

    showSuccess(message) {
        // Simple success notification - in production, use a proper notification system
        alert(`Success: ${message}`);
    }
}

// Initialize admin panel
let adminPanel;
document.addEventListener('DOMContentLoaded', () => {
    adminPanel = new AdminPanel();
});

// Handle window resize for sidebar
window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
        document.getElementById('sidebar').classList.remove('-translate-x-full');
    }
});
