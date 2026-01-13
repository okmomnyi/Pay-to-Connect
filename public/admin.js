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
        
        // Router wizard elements
        this.routerPrevButton = document.getElementById('routerPrevButton');
        this.routerNextButton = document.getElementById('routerNextButton');
        this.testConnectionButton = document.getElementById('testConnectionButton');
        this.saveRouter = document.getElementById('saveRouter');
        this.toggleRouterPassword = document.getElementById('toggleRouterPassword');

        // Sessions and payments
        this.sessionsTable = document.getElementById('sessionsTable');
        this.paymentsTable = document.getElementById('paymentsTable');
    }

    bindEvents() {
        // Login form
        if (this.loginForm) {
            this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Logout button
        if (this.logoutButton) {
            this.logoutButton.addEventListener('click', () => this.handleLogout());
        }

        // Sidebar toggle
        if (this.sidebarToggle) {
            this.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }

        // Navigation
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                this.showSection(section);
            });
        });

        // Package management
        if (this.addPackageButton) {
            this.addPackageButton.addEventListener('click', () => this.showPackageModal());
        }
        if (this.closePackageModal) {
            this.closePackageModal.addEventListener('click', () => this.hidePackageModal());
        }
        if (this.cancelPackage) {
            this.cancelPackage.addEventListener('click', () => this.hidePackageModal());
        }
        if (this.packageForm) {
            this.packageForm.addEventListener('submit', (e) => this.handlePackageSubmit(e));
        }
        if (this.packageModal) {
            this.packageModal.addEventListener('click', (e) => {
                if (e.target === this.packageModal) this.hidePackageModal();
            });
        }

        // Administrator management
        if (this.addAdministratorButton) {
            this.addAdministratorButton.addEventListener('click', () => this.showAdministratorModal());
        }
        if (this.closeAdministratorModal) {
            this.closeAdministratorModal.addEventListener('click', () => this.hideAdministratorModal());
        }
        if (this.cancelAdministrator) {
            this.cancelAdministrator.addEventListener('click', () => this.hideAdministratorModal());
        }
        if (this.administratorForm) {
            this.administratorForm.addEventListener('submit', (e) => this.handleAdministratorSubmit(e));
        }
        if (this.administratorModal) {
            this.administratorModal.addEventListener('click', (e) => {
                if (e.target === this.administratorModal) this.hideAdministratorModal();
            });
        }

        // Router management
        if (this.addRouterButton) {
            this.addRouterButton.addEventListener('click', () => this.showRouterModal());
        }
        if (this.closeRouterModal) {
            this.closeRouterModal.addEventListener('click', () => this.hideRouterModal());
        }
        if (this.routerNextButton) {
            this.routerNextButton.addEventListener('click', () => this.nextRouterStep());
        }
        if (this.routerPrevButton) {
            this.routerPrevButton.addEventListener('click', () => this.prevRouterStep());
        }
        if (this.testConnectionButton) {
            this.testConnectionButton.addEventListener('click', () => this.testRouterConnection());
        }
        if (this.routerForm) {
            this.routerForm.addEventListener('submit', (e) => this.handleRouterSubmit(e));
        }
        if (this.toggleRouterPassword) {
            this.toggleRouterPassword.addEventListener('click', () => this.togglePasswordVisibility());
        }
        if (this.routerModal) {
            this.routerModal.addEventListener('click', (e) => {
                if (e.target === this.routerModal) this.hideRouterModal();
            });
        }
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

    // Dashboard Methods
    async loadDashboard() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/admin/dashboard');
            const data = await response.json();

            if (data.success) {
                this.updateDashboardStats(data.stats);
                this.renderRecentSessions(data.recentSessions || []);
            }
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            this.showError('Failed to load dashboard data');
        }
    }

    updateDashboardStats(stats) {
        if (this.activeSessions) this.activeSessions.textContent = stats.activeSessions || '0';
        if (this.todayRevenue) this.todayRevenue.textContent = `KES ${stats.todayRevenue || '0.00'}`;
        if (this.totalDevices) this.totalDevices.textContent = stats.totalDevices || '0';
        if (this.totalRevenue) this.totalRevenue.textContent = `KES ${stats.totalRevenue || '0.00'}`;
    }

    renderRecentSessions(sessions) {
        if (!this.recentSessionsTable) return;

        this.recentSessionsTable.innerHTML = '';

        if (sessions.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                    No recent sessions
                </td>
            `;
            this.recentSessionsTable.appendChild(row);
            return;
        }

        sessions.forEach(session => {
            const row = document.createElement('tr');
            row.className = 'table-row';
            
            const statusClass = session.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
            
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${this.escapeHtml(session.deviceMac || 'Unknown')}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${this.escapeHtml(session.packageName || 'N/A')}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    KES ${session.amount || '0.00'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                        ${session.status || 'Unknown'}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${session.createdAt ? new Date(session.createdAt).toLocaleString() : 'N/A'}
                </td>
            `;
            
            this.recentSessionsTable.appendChild(row);
        });
    }

    // Package Management Methods
    async loadPackages() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/admin/packages');
            const data = await response.json();

            if (data.success) {
                this.renderPackages(data.packages || []);
            } else {
                throw new Error(data.error || 'Failed to load packages');
            }
        } catch (error) {
            console.error('Failed to load packages:', error);
            this.showError('Failed to load packages: ' + error.message);
        }
    }

    renderPackages(packages) {
        if (!this.packagesTable) return;

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
            row.className = 'table-row hover:bg-gray-50';
            
            const statusClass = pkg.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
            const statusText = pkg.active ? 'Active' : 'Inactive';
            
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    ${this.escapeHtml(pkg.name)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${this.formatDuration(pkg.durationMinutes)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    KES ${pkg.priceKes}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                        ${statusText}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button class="text-blue-600 hover:text-blue-900 mr-3 edit-package-btn" data-package-id="${pkg.id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="text-${pkg.active ? 'yellow' : 'green'}-600 hover:text-${pkg.active ? 'yellow' : 'green'}-900 mr-3 toggle-package-btn" data-package-id="${pkg.id}" data-active="${pkg.active}">
                        <i class="fas fa-${pkg.active ? 'ban' : 'check'}"></i> ${pkg.active ? 'Disable' : 'Enable'}
                    </button>
                    <button class="text-red-600 hover:text-red-900 delete-package-btn" data-package-id="${pkg.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            `;
            
            this.packagesTable.appendChild(row);
        });

        // Add event listeners for package actions
        this.packagesTable.querySelectorAll('.edit-package-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const packageId = btn.getAttribute('data-package-id');
                this.editPackage(packageId);
            });
        });

        this.packagesTable.querySelectorAll('.toggle-package-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const packageId = btn.getAttribute('data-package-id');
                const isActive = btn.getAttribute('data-active') === 'true';
                this.togglePackageStatus(packageId, !isActive);
            });
        });

        this.packagesTable.querySelectorAll('.delete-package-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const packageId = btn.getAttribute('data-package-id');
                this.deletePackage(packageId);
            });
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
        if (!this.packageModal) return;

        this.editingPackageId = packageData ? packageData.id : null;
        
        if (packageData) {
            this.packageModalTitle.textContent = 'Edit Package';
            document.getElementById('packageName').value = packageData.name || '';
            document.getElementById('packageDescription').value = packageData.description || '';
            document.getElementById('packageType').value = packageData.packageType || 'time';
            document.getElementById('packageDuration').value = packageData.durationMinutes || '';
            document.getElementById('packagePrice').value = packageData.priceKes || '';
        } else {
            this.packageModalTitle.textContent = 'Add Package';
            if (this.packageForm) this.packageForm.reset();
        }
        
        this.packageModal.classList.remove('hidden');
    }

    hidePackageModal() {
        if (this.packageModal) {
            this.packageModal.classList.add('hidden');
        }
        this.editingPackageId = null;
    }

    async handlePackageSubmit(e) {
        e.preventDefault();
        
        const formData = {
            name: document.getElementById('packageName').value.trim(),
            description: document.getElementById('packageDescription').value.trim(),
            packageType: document.getElementById('packageType').value,
            durationMinutes: parseInt(document.getElementById('packageDuration').value),
            priceKes: parseFloat(document.getElementById('packagePrice').value)
        };

        // Validation
        if (!formData.name) {
            this.showError('Package name is required');
            return;
        }
        if (!formData.durationMinutes || formData.durationMinutes < 1) {
            this.showError('Duration must be at least 1 minute');
            return;
        }
        if (!formData.priceKes || formData.priceKes < 0) {
            this.showError('Price must be 0 or greater');
            return;
        }

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
        try {
            const response = await this.makeAuthenticatedRequest(`/api/admin/packages/${packageId}`);
            const data = await response.json();

            if (data.success) {
                this.showPackageModal(data.package);
            } else {
                throw new Error(data.error || 'Failed to load package');
            }
        } catch (error) {
            console.error('Failed to load package:', error);
            this.showError(error.message);
        }
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

    // Utility method to escape HTML
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Administrator Management Methods
    async loadAdministrators() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/admin/administrators');
            const data = await response.json();

            if (data.success) {
                this.renderAdministrators(data.administrators || []);
            } else {
                throw new Error(data.error || 'Failed to load administrators');
            }
        } catch (error) {
            console.error('Failed to load administrators:', error);
            this.showError('Failed to load administrators: ' + error.message);
        }
    }

    renderAdministrators(administrators) {
        if (!this.administratorsTable) return;

        this.administratorsTable.innerHTML = '';

        if (administrators.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                    No administrators found
                </td>
            `;
            this.administratorsTable.appendChild(row);
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
                    <button class="text-blue-600 hover:text-blue-900 mr-3 edit-admin-btn" data-admin-id="${admin.id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="text-red-600 hover:text-red-900 delete-admin-btn" data-admin-id="${admin.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            `;

            this.administratorsTable.appendChild(row);
        });

        // Add event listeners for administrator actions
        this.administratorsTable.querySelectorAll('.edit-admin-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const adminId = btn.getAttribute('data-admin-id');
                this.editAdministrator(adminId);
            });
        });

        this.administratorsTable.querySelectorAll('.delete-admin-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const adminId = btn.getAttribute('data-admin-id');
                this.deleteAdministrator(adminId);
            });
        });
    }

    showAdministratorModal() {
        if (!this.administratorModal) return;
        
        if (this.administratorForm) this.administratorForm.reset();
        this.administratorModal.classList.remove('hidden');
    }

    hideAdministratorModal() {
        if (this.administratorModal) {
            this.administratorModal.classList.add('hidden');
        }
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
        if (username.length < 3) {
            this.showError('Username must be at least 3 characters');
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

        try {
            const response = await this.makeAuthenticatedRequest('/api/admin/administrators', {
                method: 'POST',
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to create administrator');
            }

            this.hideAdministratorModal();
            this.loadAdministrators();
            this.showSuccess('Administrator created successfully');

        } catch (error) {
            console.error('Failed to create administrator:', error);
            this.showError(error.message);
        }
    }

    async editAdministrator(adminId) {
        // Create a proper modal for editing
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
                    body: JSON.stringify(updates)
                });
                
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

    // Router Management Methods (placeholder for now)
    async loadRouters() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/admin/routers');
            const data = await response.json();

            if (data.success) {
                this.renderRouters(data.routers || []);
            } else {
                throw new Error(data.error || 'Failed to load routers');
            }
        } catch (error) {
            console.error('Failed to load routers:', error);
            this.showError('Failed to load routers: ' + error.message);
        }
    }

    renderRouters(routers) {
        if (!this.routersTable) return;

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
            row.className = 'table-row hover:bg-gray-50';
            
            const statusClass = router.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
            const statusText = router.active ? 'Active' : 'Inactive';
            
            const connectionClass = router.connectionStatus === 'connected' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
            const connectionText = router.connectionStatus === 'connected' ? 'Connected' : 'Disconnected';
            
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
                    <button class="text-blue-600 hover:text-blue-900 mr-3 test-router-btn" data-router-id="${router.id}">
                        <i class="fas fa-plug"></i> Test
                    </button>
                    <button class="text-green-600 hover:text-green-900 mr-3 sync-router-btn" data-router-id="${router.id}">
                        <i class="fas fa-sync"></i> Sync
                    </button>
                    <button class="text-red-600 hover:text-red-900 delete-router-btn" data-router-id="${router.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            `;
            
            this.routersTable.appendChild(row);
        });
    }

    // Sessions and Payments (placeholder methods)
    async loadSessions() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/admin/sessions');
            const data = await response.json();

            if (data.success) {
                this.renderSessions(data.sessions || []);
            }
        } catch (error) {
            console.error('Failed to load sessions:', error);
            this.showError('Failed to load sessions');
        }
    }

    renderSessions(sessions) {
        if (!this.sessionsTable) return;

        this.sessionsTable.innerHTML = '';
        
        if (sessions.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="7" class="px-6 py-4 text-center text-gray-500">No active sessions</td>`;
            this.sessionsTable.appendChild(row);
        }
    }

    async loadPayments() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/admin/payments');
            const data = await response.json();

            if (data.success) {
                this.renderPayments(data.payments || []);
            }
        } catch (error) {
            console.error('Failed to load payments:', error);
            this.showError('Failed to load payments');
        }
    }

    renderPayments(payments) {
        if (!this.paymentsTable) return;

        this.paymentsTable.innerHTML = '';
        
        if (payments.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="7" class="px-6 py-4 text-center text-gray-500">No payment history</td>`;
            this.paymentsTable.appendChild(row);
        }
    }

    // Router wizard placeholder methods
    showRouterModal() {
        if (this.routerModal) {
            this.currentRouterStep = 1;
            this.connectionTestPassed = false;
            this.routerData = {};
            this.routerModal.classList.remove('hidden');
            this.updateRouterWizardStep();
        }
    }

    hideRouterModal() {
        if (this.routerModal) {
            this.routerModal.classList.add('hidden');
        }
    }

    nextRouterStep() {
        if (this.currentRouterStep < 3) {
            this.currentRouterStep++;
            this.updateRouterWizardStep();
        }
    }

    prevRouterStep() {
        if (this.currentRouterStep > 1) {
            this.currentRouterStep--;
            this.updateRouterWizardStep();
        }
    }

    updateRouterWizardStep() {
        // Hide all steps
        const steps = ['routerStep1', 'routerStep2', 'routerStep3'];
        steps.forEach(stepId => {
            const step = document.getElementById(stepId);
            if (step) {
                step.classList.remove('active');
                step.style.display = 'none';
            }
        });

        // Show current step
        const currentStep = document.getElementById(`routerStep${this.currentRouterStep}`);
        if (currentStep) {
            currentStep.classList.add('active');
            currentStep.style.display = 'block';
        }

        // Update navigation buttons
        if (this.routerPrevButton) {
            this.routerPrevButton.classList.toggle('hidden', this.currentRouterStep === 1);
        }
        if (this.routerNextButton) {
            this.routerNextButton.classList.toggle('hidden', this.currentRouterStep === 3);
        }
        if (this.testConnectionButton) {
            this.testConnectionButton.classList.toggle('hidden', this.currentRouterStep !== 3);
        }
    }

    togglePasswordVisibility() {
        const passwordInput = document.getElementById('routerApiPassword');
        const toggleIcon = this.toggleRouterPassword?.querySelector('i');
        
        if (passwordInput && toggleIcon) {
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                toggleIcon.className = 'fas fa-eye-slash text-gray-400';
            } else {
                passwordInput.type = 'password';
                toggleIcon.className = 'fas fa-eye text-gray-400';
            }
        }
    }

    async testRouterConnection() {
        this.showInfo('Router connection testing not yet implemented');
    }

    async handleRouterSubmit(e) {
        e.preventDefault();
        this.showInfo('Router creation not yet implemented');
    }
}

// Initialize the admin panel when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.adminPanel = new AdminPanel();
});
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
