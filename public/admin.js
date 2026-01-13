class AdminPanel {
    constructor() {
        this.token = localStorage.getItem('adminToken');
        this.currentSection = 'dashboard';
        this.editingPackageId = null;
        
        // Prevent back button after logout
        window.history.pushState(null, '', window.location.href);
        window.onpopstate = function() {
            if (!localStorage.getItem('adminToken')) {
                window.history.pushState(null, '', window.location.href);
            }
        };
        
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

        // Router elements
        this.addRouterButton = document.getElementById('addRouterButton');
        this.routersTable = document.getElementById('routersTable');
        this.routerModal = document.getElementById('routerModal');
        this.routerForm = document.getElementById('routerForm');
        this.closeRouterModal = document.getElementById('closeRouterModal');
        this.cancelRouter = document.getElementById('cancelRouter');
        this.routerNextButton = document.getElementById('routerNextButton');
        this.routerPrevButton = document.getElementById('routerPrevButton');
        this.testConnectionButton = document.getElementById('testConnectionButton');
        this.saveRouter = document.getElementById('saveRouter');
        this.toggleRouterPassword = document.getElementById('toggleRouterPassword');
        
        // Router wizard state
        this.currentRouterStep = 1;
        this.routerData = {};
        this.connectionTestPassed = false;
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

        // Router management
        this.addRouterButton.addEventListener('click', () => this.showRouterModal());
        this.closeRouterModal.addEventListener('click', () => this.hideRouterModal());
        this.cancelRouter.addEventListener('click', () => this.hideRouterModal());
        this.routerNextButton.addEventListener('click', () => this.nextRouterStep());
        this.routerPrevButton.addEventListener('click', () => this.prevRouterStep());
        this.testConnectionButton.addEventListener('click', () => this.testRouterConnection());
        this.routerForm.addEventListener('submit', (e) => this.handleRouterSubmit(e));
        this.toggleRouterPassword.addEventListener('click', () => this.togglePasswordVisibility());

        // Close router modal on outside click
        this.routerModal.addEventListener('click', (e) => {
            if (e.target === this.routerModal) this.hideRouterModal();
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
        
        // Prevent browser back button from accessing cached pages
        window.history.pushState(null, '', window.location.href);
        window.onpopstate = function() {
            window.history.pushState(null, '', window.location.href);
        };
        
        // Clear the page and redirect
        this.showLoginModal();
        
        // Force reload to clear cache
        setTimeout(() => {
            window.location.replace('/api/admin');
        }, 100);
    }

    showLoginError(message) {
        this.loginError.textContent = message;
        this.loginError.classList.remove('hidden');
    }

    hideLoginError() {
        this.loginError.classList.add('hidden');
    }

    // Toast notification methods
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle',
            warning: 'fa-exclamation-triangle'
        };
        
        toast.innerHTML = `
            <i class="fas ${icons[type]} toast-icon"></i>
            <div class="toast-message">${message}</div>
            <span class="toast-close" onclick="this.parentElement.remove()">×</span>
        `;
        
        container.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showInfo(message) {
        this.showToast(message, 'info');
    }

    showWarning(message) {
        this.showToast(message, 'warning');
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

        this.showInfo('Deleting package...');

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

    async loadRouters() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/admin/routers');
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to load routers');
            }

            this.renderRouters(data.routers);
        } catch (error) {
            console.error('Failed to load routers:', error);
            this.showError('Failed to load routers: ' + error.message);
        }
    }

    async loadSessions() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/admin/sessions');
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to load sessions');
            }

            this.renderSessions(data.sessions);
        } catch (error) {
            console.error('Failed to load sessions:', error);
            this.showError('Failed to load sessions: ' + error.message);
        }
    }

    async loadPayments() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/admin/payments');
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to load payments');
            }

            this.renderPayments(data.payments);
        } catch (error) {
            console.error('Failed to load payments:', error);
            this.showError('Failed to load payments: ' + error.message);
        }
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
        const container = this.administratorsTable;
        if (!container) {
            console.error('Administrators table container not found');
            return;
        }
        
        container.innerHTML = '';

        if (!administrators || administrators.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                    No administrators found
                </td>
            `;
            container.appendChild(row);
            return;
        }

        administrators.forEach(admin => {
            const row = document.createElement('tr');
            row.className = 'table-row hover:bg-gray-50';
            
            const statusClass = admin.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
            const statusText = admin.active ? 'Active' : 'Inactive';
            const createdDate = admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : 'N/A';
            
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    ${this.escapeHtml(admin.username || 'N/A')}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${this.escapeHtml(admin.email || 'N/A')}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                        ${statusText}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${createdDate}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button class="text-blue-600 hover:text-blue-900 mr-3 admin-edit-btn" data-admin-id="${admin.id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="text-red-600 hover:text-red-900 admin-delete-btn" data-admin-id="${admin.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            `;

            container.appendChild(row);
        });
        
        // Add event listeners for edit and delete buttons
        container.querySelectorAll('.admin-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const adminId = btn.getAttribute('data-admin-id');
                this.editAdministrator(adminId);
            });
        });
        
        container.querySelectorAll('.admin-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const adminId = btn.getAttribute('data-admin-id');
                this.deleteAdministrator(adminId);
            });
        });
    }

    async createAdministrator(username, email, password) {
        try {
            console.log('Creating administrator with:', { username, email, password: '***' });
            
            const response = await this.makeAuthenticatedRequest('/api/admin/administrators', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, email, password })
            });

            console.log('Response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.log('Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log('Response data:', data);

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
        // Create a proper modal for editing instead of using prompt
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold">Edit Administrator</h3>
                    <button class="text-gray-500 hover:text-gray-700 close-edit-modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <form class="edit-admin-form">
                    <div class="mb-4">
                        <label class="block text-gray-700 text-sm font-bold mb-2">New Email (optional)</label>
                        <input type="email" class="edit-email w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Leave blank to keep current">
                    </div>
                    <div class="mb-4">
                        <label class="block text-gray-700 text-sm font-bold mb-2">New Password (optional)</label>
                        <input type="password" class="edit-password w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Leave blank to keep current" minlength="8">
                    </div>
                    <div class="flex gap-4">
                        <button type="button" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg close-edit-modal">Cancel</button>
                        <button type="submit" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Update</button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Handle form submission
        modal.querySelector('.edit-admin-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const newEmail = modal.querySelector('.edit-email').value.trim();
            const newPassword = modal.querySelector('.edit-password').value;
            
            if (!newEmail && !newPassword) {
                this.showError('Please provide at least one field to update');
                return;
            }
            
            try {
                const updates = {};
                if (newEmail) updates.email = newEmail;
                if (newPassword) {
                    if (newPassword.length < 8) {
                        this.showError('Password must be at least 8 characters');
                        return;
                    }
                    updates.password = newPassword;
                }
                
                const response = await this.makeAuthenticatedRequest(`/api/admin/administrators/${adminId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updates)
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }
                
                const data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.error || 'Failed to update administrator');
                }
                
                this.showSuccess('Administrator updated successfully');
                this.loadAdministrators();
                document.body.removeChild(modal);
            } catch (error) {
                console.error('Failed to update administrator:', error);
                this.showError(error.message);
            }
        });
        
        // Handle modal close
        modal.querySelectorAll('.close-edit-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        });
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

        const username = document.getElementById('adminUsername').value.trim();
        const email = document.getElementById('adminEmail').value.trim();
        const password = document.getElementById('adminPassword').value;

        // Client-side validation
        if (!username) {
            this.showError('Username is required');
            return;
        }
        if (!email) {
            this.showError('Email is required');
            return;
        }
        if (!password || password.length < 8) {
            this.showError('Password must be at least 8 characters');
            return;
        }

        const success = await this.createAdministrator(username, email, password);
        if (success) {
            this.hideAdministratorModal();
        }
    }

    // Router Management Methods
    renderRouters(routers) {
        this.routersTable.innerHTML = '';

        if (routers.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="6" class="px-6 py-4 text-center text-gray-500">
                    No routers found
                </td>
            `;
            this.routersTable.appendChild(row);
            return;
        }

        routers.forEach(router => {
            const row = document.createElement('tr');
            row.className = 'table-row';
            
            const statusClass = router.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
            const statusText = router.active ? 'Active' : 'Inactive';
            
            const connectionClass = this.getConnectionStatusClass(router.connectionStatus);
            const connectionText = this.getConnectionStatusText(router.connectionStatus);
            
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    ${this.escapeHtml(router.name)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${this.escapeHtml(router.ipAddress)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                        ${statusText}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${connectionClass}">
                        ${connectionText}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${router.lastSyncAt ? new Date(router.lastSyncAt).toLocaleString() : 'Never'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="adminPanel.testConnection('${router.id}')" class="text-blue-600 hover:text-blue-900 mr-3">
                        <i class="fas fa-plug"></i> Test
                    </button>
                    <button onclick="adminPanel.syncPackages('${router.id}')" class="text-green-600 hover:text-green-900 mr-3">
                        <i class="fas fa-sync"></i> Sync
                    </button>
                    <button onclick="adminPanel.viewRouterStats('${router.id}')" class="text-purple-600 hover:text-purple-900 mr-3">
                        <i class="fas fa-chart-bar"></i> Stats
                    </button>
                    <button onclick="adminPanel.editRouter('${router.id}')" class="text-indigo-600 hover:text-indigo-900 mr-3">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button onclick="adminPanel.deleteRouter('${router.id}')" class="text-red-600 hover:text-red-900">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            `;
            
            this.routersTable.appendChild(row);
        });
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getConnectionStatusClass(status) {
        switch (status) {
            case 'connected': return 'bg-green-100 text-green-800';
            case 'failed': return 'bg-red-100 text-red-800';
            case 'timeout': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    getConnectionStatusText(status) {
        switch (status) {
            case 'connected': return 'Connected';
            case 'failed': return 'Failed';
            case 'timeout': return 'Timeout';
            default: return 'Unknown';
        }
    }

    showRouterModal() {
        this.currentRouterStep = 1;
        this.connectionTestPassed = false;
        this.routerData = {};
        
        if (this.routerForm) {
            this.routerForm.reset();
        }
        
        if (this.routerModal) {
            this.routerModal.classList.remove('hidden');
        }
        
        this.updateRouterWizardStep();
    }

    hideRouterModal() {
        if (this.routerModal) {
            this.routerModal.classList.add('hidden');
        }
        this.currentRouterStep = 1;
        this.routerData = {};
        this.connectionTestPassed = false;
    }

    nextRouterStep() {
        if (this.currentRouterStep === 1) {
            // Validate step 1
            const name = document.getElementById('routerName').value;
            const ipAddress = document.getElementById('routerIpAddress').value;
            
            if (!name || !ipAddress) {
                this.showError('Please fill in all required fields');
                return;
            }
            
            // Validate IP address format
            const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            if (!ipRegex.test(ipAddress)) {
                this.showError('Please enter a valid IP address');
                return;
            }
            
            this.routerData.name = name;
            this.routerData.ipAddress = ipAddress;
            this.currentRouterStep = 2;
        } else if (this.currentRouterStep === 2) {
            // Validate step 2
            const apiUsername = document.getElementById('routerApiUsername').value;
            const apiPassword = document.getElementById('routerApiPassword').value;
            const apiPort = document.getElementById('routerApiPort').value;
            
            if (!apiUsername || !apiPassword) {
                this.showError('Please fill in all required fields');
                return;
            }
            
            if (apiUsername === 'admin') {
                this.showError('Do not use the admin account. Create a dedicated API user.');
                return;
            }
            
            this.routerData.apiUsername = apiUsername;
            this.routerData.apiPassword = apiPassword;
            this.routerData.apiPort = parseInt(apiPort) || 8729;
            this.currentRouterStep = 3;
            
            // Update summary
            this.updateRouterSummary();
        }
        
        this.updateRouterWizardStep();
    }

    prevRouterStep() {
        if (this.currentRouterStep > 1) {
            this.currentRouterStep--;
            this.updateRouterWizardStep();
        }
    }

    updateRouterWizardStep() {
        // Hide all steps
        const step1 = document.getElementById('routerStep1');
        const step2 = document.getElementById('routerStep2');
        const step3 = document.getElementById('routerStep3');
        
        if (step1) step1.classList.add('hidden');
        if (step2) step2.classList.add('hidden');
        if (step3) step3.classList.add('hidden');
        
        // Show current step
        const currentStep = document.getElementById(`routerStep${this.currentRouterStep}`);
        if (currentStep) {
            currentStep.classList.remove('hidden');
        }
        
        // Update step indicators
        for (let i = 1; i <= 3; i++) {
            const indicator = document.getElementById(`step${i}Indicator`);
            const progress = document.getElementById(`step${i}Progress`);
            
            if (indicator && progress) {
                if (i < this.currentRouterStep) {
                    // Completed step
                    indicator.className = 'flex items-center justify-center w-8 h-8 bg-green-600 text-white rounded-full text-sm font-medium';
                    indicator.innerHTML = '<i class="fas fa-check"></i>';
                    progress.style.width = '100%';
                } else if (i === this.currentRouterStep) {
                    // Current step
                    indicator.className = 'flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-full text-sm font-medium';
                    indicator.textContent = i;
                    progress.style.width = '50%';
                } else {
                    // Future step
                    indicator.className = 'flex items-center justify-center w-8 h-8 bg-gray-200 text-gray-600 rounded-full text-sm font-medium';
                    indicator.textContent = i;
                    progress.style.width = '0%';
                }
            }
        }
        
        // Update navigation buttons
        if (this.routerPrevButton) this.routerPrevButton.classList.toggle('hidden', this.currentRouterStep === 1);
        if (this.routerNextButton) this.routerNextButton.classList.toggle('hidden', this.currentRouterStep === 3);
        if (this.testConnectionButton) this.testConnectionButton.classList.toggle('hidden', this.currentRouterStep !== 3);
        if (this.saveRouter) this.saveRouter.classList.toggle('hidden', this.currentRouterStep !== 3 || !this.connectionTestPassed);
    }

    updateRouterSummary() {
        document.getElementById('summaryName').textContent = this.routerData.name || '-';
        document.getElementById('summaryIpAddress').textContent = this.routerData.ipAddress || '-';
        document.getElementById('summaryApiUsername').textContent = this.routerData.apiUsername || '-';
        document.getElementById('summaryApiPort').textContent = this.routerData.apiPort || '-';
    }

    togglePasswordVisibility() {
        const passwordInput = document.getElementById('routerApiPassword');
        const toggleIcon = this.toggleRouterPassword.querySelector('i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleIcon.className = 'fas fa-eye-slash text-gray-400';
        } else {
            passwordInput.type = 'password';
            toggleIcon.className = 'fas fa-eye text-gray-400';
        }
    }

    async testRouterConnection() {
        const testButton = this.testConnectionButton;
        const originalText = testButton.innerHTML;
        const resultDiv = document.getElementById('connectionTestResult');
        
        try {
            testButton.disabled = true;
            testButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Testing...';
            
            // Create router first to get ID for testing
            const response = await this.makeAuthenticatedRequest('/api/admin/routers', {
                method: 'POST',
                body: JSON.stringify(this.routerData)
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to create router');
            }
            
            this.routerData.id = data.router.id;
            const connectionTest = data.router.connectionTest;
            
            // Show test results
            resultDiv.classList.remove('hidden');
            
            if (connectionTest.success) {
                resultDiv.innerHTML = `
                    <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <i class="fas fa-check-circle text-green-400"></i>
                            </div>
                            <div class="ml-3">
                                <h3 class="text-sm font-medium text-green-800">Connection Successful!</h3>
                                <div class="mt-2 text-sm text-green-700">
                                    <p>Router Identity: ${connectionTest.details?.identity || 'Unknown'}</p>
                                    <p>Response Time: ${connectionTest.details?.responseTime || 0}ms</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                this.connectionTestPassed = true;
            } else {
                resultDiv.innerHTML = `
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <i class="fas fa-exclamation-circle text-red-400"></i>
                            </div>
                            <div class="ml-3">
                                <h3 class="text-sm font-medium text-red-800">Connection Failed</h3>
                                <div class="mt-2 text-sm text-red-700">
                                    <p>${connectionTest.message}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                this.connectionTestPassed = false;
            }
            
            this.updateRouterWizardStep();
            
        } catch (error) {
            console.error('Connection test failed:', error);
            resultDiv.classList.remove('hidden');
            resultDiv.innerHTML = `
                <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <i class="fas fa-exclamation-circle text-red-400"></i>
                        </div>
                        <div class="ml-3">
                            <h3 class="text-sm font-medium text-red-800">Test Failed</h3>
                            <div class="mt-2 text-sm text-red-700">
                                <p>${error.message}</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            this.connectionTestPassed = false;
            this.updateRouterWizardStep();
        } finally {
            testButton.disabled = false;
            testButton.innerHTML = originalText;
        }
    }

    async handleRouterSubmit(e) {
        e.preventDefault();
        
        if (!this.connectionTestPassed) {
            this.showError('Please test the connection first');
            return;
        }
        
        try {
            this.hideRouterModal();
            this.loadRouters();
            this.showSuccess('Router added successfully');
        } catch (error) {
            console.error('Failed to save router:', error);
            this.showError(error.message);
        }
    }

    async testConnection(routerId) {
        try {
            this.showInfo('Testing router connection...');
            
            const response = await this.makeAuthenticatedRequest(`/api/admin/routers/${routerId}/test-connection`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success && data.connectionTest.success) {
                this.showSuccess(`Connection successful! Identity: ${data.connectionTest.details?.identity || 'Unknown'}`);
            } else {
                this.showError(`Connection failed: ${data.connectionTest?.message || data.error}`);
            }
            
            this.loadRouters(); // Refresh to show updated connection status
        } catch (error) {
            console.error('Failed to test connection:', error);
            this.showError('Failed to test connection: ' + error.message);
        }
    }

    async syncPackages(routerId) {
        try {
            this.showInfo('Syncing packages to router...');
            
            const response = await this.makeAuthenticatedRequest(`/api/admin/routers/${routerId}/sync-packages`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showSuccess(`Packages synced successfully! ${data.syncResult.syncedCount || 0} packages synced.`);
            } else {
                this.showError(`Sync failed: ${data.error}`);
            }
            
            this.loadRouters(); // Refresh to show updated sync status
        } catch (error) {
            console.error('Failed to sync packages:', error);
            this.showError('Failed to sync packages: ' + error.message);
        }
    }

    async viewRouterStats(routerId) {
        try {
            const response = await this.makeAuthenticatedRequest(`/api/admin/routers/${routerId}/stats`);
            const data = await response.json();
            
            if (data.success) {
                const stats = data.stats;
                alert(`Router Statistics:\n\nUptime: ${stats.uptime}\nCPU Load: ${stats.cpuLoad}\nFree Memory: ${stats.freeMemory}\nActive Users: ${stats.activeUsers}`);
            } else {
                this.showError(`Failed to get stats: ${data.error}`);
            }
        } catch (error) {
            console.error('Failed to get router stats:', error);
            this.showError('Failed to get router stats: ' + error.message);
        }
    }

    async editRouter(routerId) {
        this.showInfo('Router editing not yet implemented');
    }

    async deleteRouter(routerId) {
        if (!confirm('Are you sure you want to delete this router? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await this.makeAuthenticatedRequest(`/api/admin/routers/${routerId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to delete router');
            }

            this.loadRouters();
            this.showSuccess('Router deleted successfully');

        } catch (error) {
            console.error('Failed to delete router:', error);
            this.showError(error.message);
        }
    }

    // Session and Payment rendering methods
    renderSessions(sessions) {
        const container = document.getElementById('sessionsTable');
        if (!container) return;

        container.innerHTML = '';

        if (sessions.length === 0) {
            container.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No sessions found</td></tr>';
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
                    ${session.routerName || 'Unknown'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                        ${statusText}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${new Date(session.startTime).toLocaleString()}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${session.endTime ? new Date(session.endTime).toLocaleString() : 'N/A'}
                </td>
            `;

            container.appendChild(row);
        });
    }

    renderPayments(payments) {
        const container = document.getElementById('paymentsTable');
        if (!container) return;

        container.innerHTML = '';

        if (payments.length === 0) {
            container.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No payments found</td></tr>';
            return;
        }

        payments.forEach(payment => {
            const row = document.createElement('tr');
            row.className = 'table-row';

            const statusClass = this.getPaymentStatusClass(payment.status);
            const statusText = payment.status.charAt(0).toUpperCase() + payment.status.slice(1);

            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${payment.phone}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    KES ${payment.amount.toFixed(2)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${payment.mpesaReceipt || 'N/A'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                        ${statusText}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${new Date(payment.createdAt).toLocaleString()}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    ${payment.status === 'pending' ? 
                        `<button onclick="adminPanel.approvePayment('${payment.id}')" class="text-green-600 hover:text-green-900">
                            <i class="fas fa-check"></i> Approve
                        </button>` : 
                        '<span class="text-gray-400">No actions</span>'
                    }
                </td>
            `;

            container.appendChild(row);
        });
    }

    getPaymentStatusClass(status) {
        switch (status) {
            case 'success': return 'bg-green-100 text-green-800';
            case 'failed': return 'bg-red-100 text-red-800';
            case 'pending': return 'bg-yellow-100 text-yellow-800';
            case 'cancelled': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    async approvePayment(paymentId) {
        if (!confirm('Are you sure you want to approve this payment?')) {
            return;
        }

        try {
            const response = await this.makeAuthenticatedRequest(`/api/admin/payments/${paymentId}/approve`, {
                method: 'POST'
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to approve payment');
            }

            this.loadPayments();
            this.showSuccess('Payment approved successfully');

        } catch (error) {
            console.error('Failed to approve payment:', error);
            this.showError(error.message);
        }
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
