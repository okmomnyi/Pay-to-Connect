// Admin Panel JavaScript - Production Ready
const API_BASE = '/api/admin';
let authToken = null;
let currentAdmin = null;
let dashboardInterval = null;

// =====================================================
// AUTHENTICATION
// =====================================================

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const loginBtn = document.getElementById('login-btn');
    const loginBtnText = document.getElementById('login-btn-text');
    const loginSpinner = document.getElementById('login-spinner');

    loginBtn.disabled = true;
    loginBtnText.textContent = 'Signing in...';
    loginSpinner.classList.remove('hidden');

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        console.log('Login response:', data);

        if (data.success) {
            authToken = data.token;
            currentAdmin = data.admin;
            localStorage.setItem('admin_token', authToken);
            localStorage.setItem('admin_user', JSON.stringify(currentAdmin));

            showToast('Login successful!', 'success');
            showAdminPanel();
        } else {
            showToast(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('Connection error. Please try again.', 'error');
    } finally {
        loginBtn.disabled = false;
        loginBtnText.textContent = 'Sign In';
        loginSpinner.classList.add('hidden');
    }
});

async function logout() {
    try {
        await apiCall('/auth/logout', 'POST');
    } catch (error) {
        // Ignore errors on logout
    }

    authToken = null;
    currentAdmin = null;
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');

    if (dashboardInterval) {
        clearInterval(dashboardInterval);
    }

    document.getElementById('admin-panel').classList.add('hidden');
    document.getElementById('login-page').classList.remove('hidden');
}

function showAdminPanel() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('admin-panel').classList.remove('hidden');
    document.getElementById('admin-name').textContent = currentAdmin.full_name || currentAdmin.username;

    loadDashboard();
    startDashboardRefresh();
}

// Check for existing session on page load
window.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('admin_token');
    const admin = localStorage.getItem('admin_user');

    if (token && admin) {
        authToken = token;
        currentAdmin = JSON.parse(admin);

        try {
            const response = await apiCall('/auth/me');
            if (response.success) {
                currentAdmin = response.admin;
                localStorage.setItem('admin_user', JSON.stringify(currentAdmin));
                showAdminPanel();
            } else {
                logout();
            }
        } catch (error) {
            logout();
        }
    }
});

// =====================================================
// API HELPER
// =====================================================

async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();

    if (response.status === 401) {
        logout();
        throw new Error('Session expired');
    }

    return data;
}

// =====================================================
// NAVIGATION
// =====================================================

function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden');
    });

    // Remove active class from all links
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.remove('active');
    });

    // Show selected section
    document.getElementById(`${sectionName}-section`).classList.remove('hidden');

    // Add active class to clicked link
    event.target.closest('.sidebar-link').classList.add('active');

    // Load section data
    switch (sectionName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'users':
            loadUsers();
            break;
        case 'packages':
            loadPackages();
            break;
        case 'routers':
            loadRouters();
            break;
        case 'sessions':
            loadSessions();
            break;
        case 'payments':
            loadPayments();
            break;
        case 'estates':
            loadEstates();
            break;
        case 'admins':
            loadAdmins();
            break;
        case 'logs':
            loadLogs();
            break;
    }
}

// =====================================================
// DASHBOARD
// =====================================================

async function loadDashboard() {
    try {
        const response = await apiCall('/dashboard/stats');

        if (response.success) {
            const stats = response.stats;

            document.getElementById('stat-total-users').textContent = stats.users.total;
            document.getElementById('stat-active-users').textContent = stats.users.active;
            document.getElementById('stat-revenue-month').textContent = `KES ${stats.revenue.month.toLocaleString()}`;
            document.getElementById('stat-routers-online').textContent = stats.routers.online;

            loadRecentActivity();
        }
    } catch (error) {
        showToast('Failed to load dashboard stats', 'error');
    }
}

async function loadRecentActivity() {
    try {
        const response = await apiCall('/dashboard/activity?limit=10');

        if (response.success) {
            const container = document.getElementById('recent-activity');

            if (response.activities.length === 0) {
                container.innerHTML = '<p class="text-gray-500">No recent activity</p>';
                return;
            }

            container.innerHTML = response.activities.map(activity => `
                <div class="flex items-center justify-between py-2 border-b">
                    <div>
                        <p class="text-sm font-medium">${activity.username} - ${activity.action_type}</p>
                        <p class="text-xs text-gray-500">${activity.resource_type}</p>
                    </div>
                    <div class="text-right">
                        <span class="text-xs ${activity.success ? 'text-green-600' : 'text-red-600'}">
                            ${activity.success ? 'Success' : 'Failed'}
                        </span>
                        <p class="text-xs text-gray-500">${formatDate(activity.created_at)}</p>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to load recent activity:', error);
    }
}

function startDashboardRefresh() {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
    }

    dashboardInterval = setInterval(() => {
        if (!document.getElementById('dashboard-section').classList.contains('hidden')) {
            loadDashboard();
        }
    }, 30000); // Refresh every 30 seconds
}

// =====================================================
// ROUTERS MANAGEMENT
// =====================================================

async function loadRouters() {
    try {
        const response = await apiCall('/routers');

        if (response.success) {
            const grid = document.getElementById('routers-grid');

            if (response.routers.length === 0) {
                grid.innerHTML = '<p class="text-gray-500 col-span-3">No routers found</p>';
                return;
            }

            grid.innerHTML = response.routers.map(router => `
                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-bold">${router.name}</h3>
                        <span class="px-2 py-1 text-xs rounded ${router.connection_status === 'online' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }">
                            ${router.connection_status}
                        </span>
                    </div>
                    <p class="text-sm text-gray-600 mb-2">
                        <i class="fas fa-network-wired mr-2"></i>${router.ip_address}:${router.api_port}
                    </p>
                    <p class="text-sm text-gray-600 mb-2">
                        <i class="fas fa-building mr-2"></i>${router.estate_name || 'No estate'}
                    </p>
                    <p class="text-sm text-gray-600 mb-4">
                        <i class="fas fa-sync mr-2"></i>Last sync: ${router.last_sync_at ? formatDate(router.last_sync_at) : 'Never'}
                    </p>
                    <div class="flex space-x-2">
                        <button onclick="testRouter('${router.id}')" 
                            class="flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700">
                            <i class="fas fa-plug mr-1"></i>Test
                        </button>
                        <button onclick="syncRouter('${router.id}')" 
                            class="flex-1 bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700">
                            <i class="fas fa-sync mr-1"></i>Sync
                        </button>
                        <button onclick="editRouter('${router.id}')" 
                            class="flex-1 bg-gray-600 text-white px-3 py-2 rounded text-sm hover:bg-gray-700">
                            <i class="fas fa-edit mr-1"></i>Edit
                        </button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        showToast('Failed to load routers', 'error');
    }
}

async function testRouter(routerId) {
    showToast('Testing router connection...', 'info');

    try {
        const response = await apiCall(`/routers/${routerId}/test`, 'POST');

        if (response.success) {
            showToast('Router connection successful', 'success');
            loadRouters();
        } else {
            showToast(response.message || 'Connection test failed', 'error');
        }
    } catch (error) {
        showToast('Failed to test router', 'error');
    }
}

async function syncRouter(routerId) {
    showToast('Syncing packages to router...', 'info');

    try {
        const response = await apiCall(`/routers/${routerId}/sync`, 'POST');

        if (response.success) {
            showToast(`Successfully synced ${response.synced} packages`, 'success');
            loadRouters();
        } else {
            showToast(response.message || 'Sync failed', 'error');
        }
    } catch (error) {
        showToast('Failed to sync router', 'error');
    }
}

function showAddRouterModal() {
    const modal = createModal('Add Router', `
        <form id="add-router-form">
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Router Name</label>
                <input type="text" name="name" required class="w-full px-3 py-2 border rounded">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">IP Address</label>
                <input type="text" name="ip_address" required class="w-full px-3 py-2 border rounded">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">API Port</label>
                <input type="number" name="api_port" value="8729" required class="w-full px-3 py-2 border rounded">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">API Username</label>
                <input type="text" name="api_username" required class="w-full px-3 py-2 border rounded">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">API Password</label>
                <input type="password" name="api_password" required class="w-full px-3 py-2 border rounded">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Description</label>
                <textarea name="description" class="w-full px-3 py-2 border rounded"></textarea>
            </div>
            <div class="flex space-x-2">
                <button type="submit" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                    Create Router
                </button>
                <button type="button" onclick="closeModal()" class="flex-1 bg-gray-300 px-4 py-2 rounded hover:bg-gray-400">
                    Cancel
                </button>
            </div>
        </form>
    `);

    document.getElementById('add-router-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);

        try {
            const response = await apiCall('/routers', 'POST', data);

            if (response.success) {
                showToast('Router created successfully', 'success');
                closeModal();
                loadRouters();
            } else {
                showToast(response.error || 'Failed to create router', 'error');
            }
        } catch (error) {
            showToast('Failed to create router', 'error');
        }
    });
}

// =====================================================
// ADMINS MANAGEMENT
// =====================================================

async function loadAdmins() {
    try {
        const response = await apiCall('/admins');

        if (response.success) {
            const tbody = document.getElementById('admins-table-body');

            if (response.admins.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No admins found</td></tr>';
                return;
            }

            tbody.innerHTML = response.admins.map(admin => `
                <tr>
                    <td class="px-6 py-4">${admin.username}</td>
                    <td class="px-6 py-4">${admin.email}</td>
                    <td class="px-6 py-4">
                        ${admin.roles.map(r => `<span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded mr-1">${r.name}</span>`).join('')}
                    </td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 text-xs rounded ${admin.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }">
                            ${admin.active ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <button onclick="editAdmin('${admin.id}')" class="text-blue-600 hover:text-blue-800 mr-2">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${admin.id !== currentAdmin.id ? `
                            <button onclick="deleteAdmin('${admin.id}')" class="text-red-600 hover:text-red-800">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        showToast('Failed to load admins', 'error');
    }
}

function showAddAdminModal() {
    loadRolesForModal().then(roles => {
        const modal = createModal('Add Admin', `
            <form id="add-admin-form">
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Username</label>
                    <input type="text" name="username" required class="w-full px-3 py-2 border rounded">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Email</label>
                    <input type="email" name="email" required class="w-full px-3 py-2 border rounded">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Full Name</label>
                    <input type="text" name="full_name" class="w-full px-3 py-2 border rounded">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Password</label>
                    <input type="password" name="password" required minlength="8" class="w-full px-3 py-2 border rounded">
                    <p class="text-xs text-gray-500 mt-1">Minimum 8 characters</p>
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Roles</label>
                    ${roles.map(role => `
                        <label class="flex items-center mb-2">
                            <input type="checkbox" name="role_ids" value="${role.id}" class="mr-2">
                            <span>${role.name} - ${role.description}</span>
                        </label>
                    `).join('')}
                </div>
                <div class="flex space-x-2">
                    <button type="submit" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                        Create Admin
                    </button>
                    <button type="button" onclick="closeModal()" class="flex-1 bg-gray-300 px-4 py-2 rounded hover:bg-gray-400">
                        Cancel
                    </button>
                </div>
            </form>
        `);

        document.getElementById('add-admin-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = {
                username: formData.get('username'),
                email: formData.get('email'),
                full_name: formData.get('full_name'),
                password: formData.get('password'),
                role_ids: formData.getAll('role_ids')
            };

            try {
                const response = await apiCall('/admins', 'POST', data);

                if (response.success) {
                    showToast('Admin created successfully', 'success');
                    closeModal();
                    loadAdmins();
                } else {
                    showToast(response.error || 'Failed to create admin', 'error');
                }
            } catch (error) {
                showToast('Failed to create admin', 'error');
            }
        });
    });
}

async function loadRolesForModal() {
    try {
        const response = await apiCall('/roles');
        return response.success ? response.roles : [];
    } catch (error) {
        return [];
    }
}

async function deleteAdmin(adminId) {
    if (!confirm('Are you sure you want to delete this admin? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await apiCall(`/admins/${adminId}`, 'DELETE');

        if (response.success) {
            showToast('Admin deleted successfully', 'success');
            loadAdmins();
        } else {
            showToast(response.error || 'Failed to delete admin', 'error');
        }
    } catch (error) {
        showToast('Failed to delete admin', 'error');
    }
}

// =====================================================
// PLACEHOLDER FUNCTIONS (To be implemented)
// =====================================================

async function loadUsers() {
    try {
        const response = await apiCall('/users');

        if (response.success) {
            const users = response.users;
            const tbody = document.getElementById('users-table-body');

            if (users.length === 0) {
                tbody.innerHTML =
                    '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No users found</td></tr>';
                return;
            }

            tbody.innerHTML = users.map(user => `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm font-medium text-gray-900">${user.username}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-gray-900">${user.email}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                            ${user.active ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${user.package_count || 0} packages
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button onclick="toggleUserStatus('${user.id}')" class="text-blue-600 hover:text-blue-800 mr-2">
                            <i class="fas fa-${user.active ? 'ban' : 'check'}"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('users-table-body').innerHTML =
            '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Error loading users</td></tr>';
    }
}

async function loadPackages() {
    try {
        const response = await apiCall('/packages');

        if (response.success) {
            const packages = response.packages;
            const grid = document.getElementById('packages-grid');

            if (packages.length === 0) {
                grid.innerHTML = '<p class="text-gray-500 col-span-3">No packages found</p>';
                return;
            }

            grid.innerHTML = packages.map(pkg => `
                <div class="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                    <div class="flex justify-between items-start mb-4">
                        <h3 class="text-lg font-semibold text-gray-900">${pkg.name}</h3>
                        <span class="px-2 py-1 text-xs font-semibold rounded-full ${pkg.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                            ${pkg.active ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                    <p class="text-gray-600 text-sm mb-4">${pkg.description || 'No description'}</p>
                    <div class="space-y-2 mb-4">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-500">Price:</span>
                            <span class="font-medium">KES ${pkg.price_kes || pkg.price || 0}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-500">Duration:</span>
                            <span class="font-medium">${pkg.duration_minutes || 0} min</span>
                        </div>
                        ${pkg.data_limit_mb ? `
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-500">Data Limit:</span>
                            <span class="font-medium">${pkg.data_limit_mb} MB</span>
                        </div>
                        ` : ''}
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-500">Purchased:</span>
                            <span class="font-medium">${pkg.purchase_count || 0} times</span>
                        </div>
                    </div>
                    <div class="flex space-x-2">
                        <button onclick="editPackage('${pkg.id}')" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded transition duration-200">
                            <i class="fas fa-edit mr-1"></i>Edit
                        </button>
                        <button onclick="togglePackage('${pkg.id}')" class="${pkg.active ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'} text-white text-sm font-medium py-2 px-3 rounded transition duration-200">
                            <i class="fas fa-${pkg.active ? 'pause' : 'play'} mr-1"></i>${pkg.active ? 'Disable' : 'Enable'}
                        </button>
                        <button onclick="deletePackage('${pkg.id}', '${pkg.name}')" class="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-3 rounded transition duration-200">
                            <i class="fas fa-trash mr-1"></i>Delete
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Error loading packages:', error);
        document.getElementById('packages-grid').innerHTML =
            '<p class="text-red-500 col-span-3">Error loading packages</p>';
    }
}

async function loadSessions() {
    try {
        const response = await apiCall('/sessions');

        if (response.success) {
            const sessions = response.sessions;
            const tbody = document.getElementById('sessions-table-body');

            if (!sessions || sessions.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No sessions found</td></tr>';
                return;
            }

            tbody.innerHTML = sessions.map(session => `
                <tr>
                    <td class="px-6 py-4">${session.username || 'Unknown'}</td>
                    <td class="px-6 py-4">${session.package_name || '-'}</td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 text-xs rounded ${session.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                            ${session.active ? 'Active' : 'Ended'}
                        </span>
                    </td>
                    <td class="px-6 py-4">${formatDate(session.start_time)}</td>
                    <td class="px-6 py-4">
                        ${session.active ? `<button onclick="disconnectSession('${session.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-plug"></i></button>` : '-'}
                    </td>
                </tr>
            `).join('');
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
        document.getElementById('sessions-table-body').innerHTML =
            '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Error loading sessions</td></tr>';
    }
}

async function disconnectSession(sessionId) {
    if (!confirm('Are you sure you want to disconnect this session?')) return;

    try {
        const response = await apiCall(`/sessions/${sessionId}/disconnect`, 'POST');
        if (response.success) {
            showToast('Session disconnected', 'success');
            loadSessions();
        } else {
            showToast(response.error || 'Failed to disconnect', 'error');
        }
    } catch (error) {
        showToast('Failed to disconnect session', 'error');
    }
}

async function toggleUserStatus(userId) {
    try {
        const response = await apiCall(`/users/${userId}/toggle`, 'POST');
        if (response.success) {
            showToast(response.message, 'success');
            loadUsers();
        } else {
            showToast(response.error || 'Failed to toggle status', 'error');
        }
    } catch (error) {
        showToast('Failed to toggle user status', 'error');
    }
}

async function loadPayments() {
    try {
        const response = await apiCall('/payments');

        if (response.success) {
            const payments = response.payments;
            const tbody = document.getElementById('payments-table-body');

            if (!payments || payments.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No payments found</td></tr>';
                return;
            }

            tbody.innerHTML = payments.map(payment => `
                <tr>
                    <td class="px-6 py-4">${payment.phone || '-'}</td>
                    <td class="px-6 py-4">KES ${payment.amount || 0}</td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 text-xs rounded ${payment.status === 'completed' ? 'bg-green-100 text-green-800' :
                    payment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                }">
                            ${payment.status}
                        </span>
                    </td>
                    <td class="px-6 py-4">${payment.mpesa_receipt_number || '-'}</td>
                    <td class="px-6 py-4">${formatDate(payment.created_at)}</td>
                </tr>
            `).join('');
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Error loading payments:', error);
        document.getElementById('payments-table-body').innerHTML =
            '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Error loading payments</td></tr>';
    }
}

async function loadEstates() {
    try {
        const response = await apiCall('/estates');

        if (response.success) {
            const estates = response.estates;
            const grid = document.getElementById('estates-grid');

            if (!estates || estates.length === 0) {
                grid.innerHTML = '<p class="text-gray-500 col-span-3">No estates found</p>';
                return;
            }

            grid.innerHTML = estates.map(estate => `
                <div class="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                    <div class="flex justify-between items-start mb-4">
                        <h3 class="text-lg font-semibold text-gray-900">${estate.name}</h3>
                        <span class="px-2 py-1 text-xs font-semibold rounded-full ${estate.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                            ${estate.active ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                    <p class="text-gray-600 text-sm mb-4">${estate.description || 'No description'}</p>
                    <p class="text-sm text-gray-500 mb-4">${estate.address || 'No address'}</p>
                    <div class="flex space-x-2">
                        <button onclick="editEstate('${estate.id}')" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded">
                            <i class="fas fa-edit mr-1"></i>Edit
                        </button>
                        <button onclick="toggleEstate('${estate.id}')" class="flex-1 ${estate.active ? 'bg-yellow-600' : 'bg-green-600'} text-white text-sm font-medium py-2 px-3 rounded">
                            ${estate.active ? 'Disable' : 'Enable'}
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Error loading estates:', error);
        document.getElementById('estates-grid').innerHTML =
            '<p class="text-red-500 col-span-3">Error loading estates</p>';
    }
}

async function toggleEstate(estateId) {
    try {
        const response = await apiCall(`/estates/${estateId}/toggle`, 'POST');
        if (response.success) {
            showToast('Estate status updated', 'success');
            loadEstates();
        } else {
            showToast(response.error || 'Failed to toggle status', 'error');
        }
    } catch (error) {
        showToast('Failed to toggle estate status', 'error');
    }
}

function editEstate(estateId) {
    showToast('Edit estate feature coming soon', 'info');
}

async function loadLogs() {
    try {
        const response = await apiCall('/dashboard/activity?limit=50');

        if (response.success) {
            const logs = response.activities;
            const tbody = document.getElementById('logs-table-body');

            if (!logs || logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No logs found</td></tr>';
                return;
            }

            tbody.innerHTML = logs.map(log => `
                <tr>
                    <td class="px-6 py-4">${log.username || 'System'}</td>
                    <td class="px-6 py-4">${log.action_type || '-'}</td>
                    <td class="px-6 py-4">${log.resource_type || '-'}</td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 text-xs rounded ${log.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                            ${log.success ? 'Success' : 'Failed'}
                        </span>
                    </td>
                    <td class="px-6 py-4">${formatDate(log.created_at)}</td>
                </tr>
            `).join('');
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Error loading logs:', error);
        document.getElementById('logs-table-body').innerHTML =
            '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Error loading logs</td></tr>';
    }
}

function searchUsers() {
    showToast('Search functionality coming soon', 'info');
}

function showAddPackageModal() {
    const modal = createModal('Add Package', `
        <form id="add-package-form">
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Package Name</label>
                <input type="text" name="name" required class="w-full px-3 py-2 border rounded">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Description</label>
                <textarea name="description" class="w-full px-3 py-2 border rounded"></textarea>
            </div>
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium mb-2">Price (KES)</label>
                    <input type="number" name="price_kes" required min="0" class="w-full px-3 py-2 border rounded">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Duration (minutes)</label>
                    <input type="number" name="duration_minutes" required min="1" class="w-full px-3 py-2 border rounded">
                </div>
            </div>
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium mb-2">Speed Limit (Mbps)</label>
                    <input type="number" name="speed_limit_mbps" min="1" class="w-full px-3 py-2 border rounded">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Data Limit (MB)</label>
                    <input type="number" name="data_limit_mb" class="w-full px-3 py-2 border rounded" placeholder="Leave empty for unlimited">
                </div>
            </div>
            <div class="flex space-x-2">
                <button type="submit" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                    Create Package
                </button>
                <button type="button" onclick="closeModal()" class="flex-1 bg-gray-300 px-4 py-2 rounded hover:bg-gray-400">
                    Cancel
                </button>
            </div>
        </form>
    `);

    document.getElementById('add-package-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);

        try {
            const response = await apiCall('/packages', 'POST', data);

            if (response.success) {
                showToast('Package created successfully', 'success');
                closeModal();
                loadPackages();
            } else {
                showToast(response.error || 'Failed to create package', 'error');
            }
        } catch (error) {
            showToast('Failed to create package', 'error');
        }
    });
}

async function editPackage(packageId) {
    try {
        const response = await apiCall(`/packages/${packageId}`);
        if (!response.success) {
            showToast('Failed to load package', 'error');
            return;
        }

        const pkg = response.package;
        const modal = createModal('Edit Package', `
            <form id="edit-package-form">
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Package Name</label>
                    <input type="text" name="name" value="${pkg.name}" required class="w-full px-3 py-2 border rounded">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Description</label>
                    <textarea name="description" class="w-full px-3 py-2 border rounded">${pkg.description || ''}</textarea>
                </div>
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label class="block text-sm font-medium mb-2">Price (KES)</label>
                        <input type="number" name="price_kes" value="${pkg.price_kes || pkg.price || 0}" required min="0" class="w-full px-3 py-2 border rounded">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Duration (minutes)</label>
                        <input type="number" name="duration_minutes" value="${pkg.duration_minutes || 0}" required min="1" class="w-full px-3 py-2 border rounded">
                    </div>
                </div>
                <div class="flex space-x-2">
                    <button type="submit" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                        Update Package
                    </button>
                    <button type="button" onclick="closeModal()" class="flex-1 bg-gray-300 px-4 py-2 rounded hover:bg-gray-400">
                        Cancel
                    </button>
                </div>
            </form>
        `);

        document.getElementById('edit-package-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);

            try {
                const updateResponse = await apiCall(`/packages/${packageId}`, 'PUT', data);

                if (updateResponse.success) {
                    showToast('Package updated successfully', 'success');
                    closeModal();
                    loadPackages();
                } else {
                    showToast(updateResponse.error || 'Failed to update package', 'error');
                }
            } catch (error) {
                showToast('Failed to update package', 'error');
            }
        });
    } catch (error) {
        showToast('Failed to load package details', 'error');
    }
}

async function togglePackage(packageId) {
    try {
        const response = await apiCall(`/packages/${packageId}/toggle`, 'POST');
        if (response.success) {
            showToast(response.message || 'Package status updated', 'success');
            loadPackages();
        } else {
            showToast(response.error || 'Failed to toggle status', 'error');
        }
    } catch (error) {
        showToast('Failed to toggle package status', 'error');
    }
}

async function deletePackage(packageId, packageName) {
    // Show confirmation dialog
    if (!confirm(`Are you sure you want to permanently delete "${packageName}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    try {
        const response = await apiCall(`/packages/${packageId}`, 'DELETE');
        if (response.success) {
            showToast('Package deleted successfully', 'success');
            loadPackages();
        } else {
            showToast(response.error || 'Failed to delete package', 'error');
        }
    } catch (error) {
        showToast('Failed to delete package', 'error');
    }
}

function showAddEstateModal() {
    showToast('Estate management coming soon', 'info');
}

function editRouter(routerId) {
    showToast('Edit functionality coming soon', 'info');
}

function editAdmin(adminId) {
    showToast('Edit functionality coming soon', 'info');
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast px-6 py-4 rounded-lg shadow-lg text-white ${type === 'success' ? 'bg-green-600' :
        type === 'error' ? 'bg-red-600' :
            type === 'warning' ? 'bg-yellow-600' :
                'bg-blue-600'
        }`;
    toast.textContent = message;

    document.getElementById('toast-container').appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 5000);
}

function createModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal active fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
            <h2 class="text-2xl font-bold mb-4">${title}</h2>
            ${content}
        </div>
    `;

    document.getElementById('modal-container').appendChild(modal);
    return modal;
}

function closeModal() {
    document.getElementById('modal-container').innerHTML = '';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString();
}
