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
    switch(sectionName) {
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
                        <span class="px-2 py-1 text-xs rounded ${
                            router.connection_status === 'online' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
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
                        <span class="px-2 py-1 text-xs rounded ${
                            admin.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
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
    document.getElementById('users-table-body').innerHTML = 
        '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">User management coming soon</td></tr>';
}

async function loadPackages() {
    document.getElementById('packages-grid').innerHTML = 
        '<p class="text-gray-500 col-span-3">Package management coming soon</p>';
}

async function loadSessions() {
    document.getElementById('sessions-table-body').innerHTML = 
        '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Session management coming soon</td></tr>';
}

async function loadPayments() {
    document.getElementById('payments-table-body').innerHTML = 
        '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Payment management coming soon</td></tr>';
}

async function loadEstates() {
    document.getElementById('estates-grid').innerHTML = 
        '<p class="text-gray-500 col-span-3">Estate management coming soon</p>';
}

async function loadLogs() {
    document.getElementById('logs-table-body').innerHTML = 
        '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Audit logs coming soon</td></tr>';
}

function searchUsers() {
    showToast('Search functionality coming soon', 'info');
}

function showAddPackageModal() {
    showToast('Package management coming soon', 'info');
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
    toast.className = `toast px-6 py-4 rounded-lg shadow-lg text-white ${
        type === 'success' ? 'bg-green-600' :
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
