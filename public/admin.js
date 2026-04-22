// Admin Panel JavaScript - Production Ready
const API_BASE = '/api/admin';
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

        if (data.success) {
            // Token is stored in an httpOnly cookie by the server — not accessible here
            currentAdmin = data.admin;
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
        // Ignore errors on logout — cookie is still cleared by the server response
    }

    currentAdmin = null;
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

// Check for existing session on page load by verifying the httpOnly cookie with the server
window.addEventListener('DOMContentLoaded', async () => {
    const cached = localStorage.getItem('admin_user');
    if (cached) {
        currentAdmin = JSON.parse(cached);
    }

    try {
        // Cookie is sent automatically — server validates it
        const response = await apiCall('/auth/me');
        if (response.success) {
            currentAdmin = response.admin;
            localStorage.setItem('admin_user', JSON.stringify(currentAdmin));
            showAdminPanel();
        } else {
            localStorage.removeItem('admin_user');
            // Already on login page — do nothing
        }
    } catch (error) {
        localStorage.removeItem('admin_user');
    }
});

// =====================================================
// API HELPER
// =====================================================

async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        credentials: 'same-origin',  // Send httpOnly cookie automatically
        headers: { 'Content-Type': 'application/json' }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();

    if (response.status === 401) {
        localStorage.removeItem('admin_user');
        currentAdmin = null;
        document.getElementById('admin-panel').classList.add('hidden');
        document.getElementById('login-page').classList.remove('hidden');
        showToast('Session expired — please log in again', 'error');
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

let currentRouterId = null;
let currentRouterTab = 'info';

async function loadRouters() {
    try {
        const response = await apiCall('/routers');
        const grid = document.getElementById('routers-grid');

        if (!response.success) throw new Error(response.error);

        if (response.routers.length === 0) {
            grid.innerHTML = '<p class="text-gray-500 col-span-3">No routers found. Click "Add Router" to connect your first MikroTik.</p>';
            return;
        }

        grid.innerHTML = response.routers.map(router => {
            const statusColor = router.connection_status === 'online'
                ? 'bg-green-100 text-green-800'
                : router.connection_status === 'offline'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-600';

            const syncColor = router.sync_status === 'success'
                ? 'text-green-600'
                : router.sync_status === 'failed'
                    ? 'text-red-600'
                    : 'text-gray-400';

            return `
            <div class="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer"
                 onclick="openRouterDetail('${router.id}', '${escapeHtml(router.name)}')">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-lg font-bold text-gray-900 truncate">${escapeHtml(router.name)}</h3>
                    <span class="px-2 py-1 text-xs rounded-full font-medium ${statusColor}">
                        ${router.connection_status || 'unknown'}
                    </span>
                </div>
                <div class="space-y-2 text-sm text-gray-600 mb-4">
                    <p><i class="fas fa-network-wired mr-2 text-blue-500"></i>${escapeHtml(router.ip_address)}:${router.api_port}</p>
                    <p><i class="fas fa-building mr-2 text-purple-500"></i>${escapeHtml(router.estate_name || 'No estate assigned')}</p>
                    <p class="${syncColor}">
                        <i class="fas fa-sync mr-2"></i>
                        ${router.sync_status === 'success' ? `Synced ${router.packages_synced || 0} packages` : router.sync_status === 'failed' ? 'Sync failed' : 'Never synced'}
                        ${router.last_sync_at ? ' · ' + formatDate(router.last_sync_at) : ''}
                    </p>
                </div>
                <div class="flex space-x-2" onclick="event.stopPropagation()">
                    <button onclick="testRouter('${router.id}')"
                        class="flex-1 bg-blue-600 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-700">
                        <i class="fas fa-plug mr-1"></i>Test
                    </button>
                    <button onclick="syncRouter('${router.id}')"
                        class="flex-1 bg-green-600 text-white px-3 py-1.5 rounded text-xs hover:bg-green-700">
                        <i class="fas fa-sync mr-1"></i>Sync
                    </button>
                    <button onclick="openRouterDetail('${router.id}', '${escapeHtml(router.name)}')"
                        class="flex-1 bg-gray-600 text-white px-3 py-1.5 rounded text-xs hover:bg-gray-700">
                        <i class="fas fa-cog mr-1"></i>Manage
                    </button>
                </div>
            </div>`;
        }).join('');
    } catch (error) {
        document.getElementById('routers-grid').innerHTML =
            '<p class="text-red-500 col-span-3">Error loading routers</p>';
        showToast('Failed to load routers', 'error');
    }
}

function openRouterDetail(routerId, routerName) {
    currentRouterId = routerId;
    document.getElementById('router-detail-name').textContent = routerName;
    document.getElementById('routers-grid-view').classList.add('hidden');
    document.getElementById('router-detail-view').classList.remove('hidden');
    showRouterTab('info');
    loadRouterSystemInfo();
}

function closeRouterDetail() {
    currentRouterId = null;
    document.getElementById('router-detail-view').classList.add('hidden');
    document.getElementById('routers-grid-view').classList.remove('hidden');
}

function showRouterTab(tab) {
    currentRouterTab = tab;
    document.querySelectorAll('.router-tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.router-tab-btn').forEach(btn => {
        btn.classList.remove('border-blue-600', 'text-blue-600');
        btn.classList.add('border-transparent', 'text-gray-500');
    });

    document.getElementById(`router-tab-${tab}`).classList.remove('hidden');
    const activeBtn = document.getElementById(`tab-${tab}`);
    activeBtn.classList.add('border-blue-600', 'text-blue-600');
    activeBtn.classList.remove('border-transparent', 'text-gray-500');

    switch (tab) {
        case 'info': loadRouterSystemInfo(); break;
        case 'sessions': refreshRouterSessions(); break;
        case 'hotspot-users': refreshHotspotUsers(); break;
        case 'setup': loadRouterSetupScript(); break;
        case 'logs': loadRouterLogs(); break;
    }
}

async function loadRouterSystemInfo() {
    if (!currentRouterId) return;

    document.getElementById('router-info-system').innerHTML = '<p class="text-gray-400">Connecting...</p>';
    document.getElementById('router-info-resources').innerHTML = '<p class="text-gray-400">Connecting...</p>';
    document.getElementById('router-info-interfaces').innerHTML = '<p class="text-gray-400">Connecting...</p>';

    try {
        const response = await apiCall(`/routers/${currentRouterId}/info`);
        const badge = document.getElementById('router-detail-status-badge');

        if (response.success && response.info) {
            const info = response.info;
            badge.textContent = 'Online';
            badge.className = 'ml-3 px-3 py-1 text-sm rounded-full bg-green-100 text-green-700';

            const memUsed = parseInt(info.memory_total) - parseInt(info.memory_free);
            const memPct = info.memory_total > 0 ? Math.round(memUsed / parseInt(info.memory_total) * 100) : 0;

            document.getElementById('router-info-system').innerHTML = `
                <div class="flex justify-between"><span class="text-gray-500">Identity</span><span class="font-medium">${escapeHtml(info.identity)}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">RouterOS</span><span class="font-medium">${escapeHtml(info.version)}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Board</span><span class="font-medium">${escapeHtml(info.board_name)}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Architecture</span><span class="font-medium">${escapeHtml(info.architecture)}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Uptime</span><span class="font-medium">${escapeHtml(info.uptime)}</span></div>
            `;

            document.getElementById('router-info-resources').innerHTML = `
                <div class="flex justify-between"><span class="text-gray-500">CPU Load</span><span class="font-medium ${parseInt(info.cpu_load) > 80 ? 'text-red-600' : 'text-green-600'}">${info.cpu_load}%</span></div>
                <div class="mb-1"><span class="text-gray-500">RAM Usage</span></div>
                <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div class="bg-blue-600 h-2 rounded-full" style="width:${memPct}%"></div>
                </div>
                <div class="text-xs text-gray-500">${formatBytes(memUsed)} / ${formatBytes(parseInt(info.memory_total))} (${memPct}%)</div>
            `;

            if (info.interfaces && info.interfaces.length > 0) {
                document.getElementById('router-info-interfaces').innerHTML = `
                    <table class="min-w-full text-sm">
                        <thead><tr class="text-left text-gray-500">
                            <th class="py-1 pr-4">Name</th>
                            <th class="py-1 pr-4">Type</th>
                            <th class="py-1 pr-4">MAC</th>
                            <th class="py-1">Status</th>
                        </tr></thead>
                        <tbody>
                            ${info.interfaces.map(iface => `
                                <tr class="border-t border-gray-100">
                                    <td class="py-1 pr-4 font-medium">${escapeHtml(iface.name)}</td>
                                    <td class="py-1 pr-4 text-gray-500">${escapeHtml(iface.type || '-')}</td>
                                    <td class="py-1 pr-4 text-gray-500 font-mono text-xs">${escapeHtml(iface.mac_address || '-')}</td>
                                    <td class="py-1">
                                        <span class="px-1.5 py-0.5 rounded text-xs ${iface.running ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
                                            ${iface.running ? 'Running' : iface.disabled ? 'Disabled' : 'Down'}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>`;
            } else {
                document.getElementById('router-info-interfaces').innerHTML = '<p class="text-gray-400 text-sm">No interfaces found</p>';
            }
        } else {
            badge.textContent = 'Offline';
            badge.className = 'ml-3 px-3 py-1 text-sm rounded-full bg-red-100 text-red-700';
            const errMsg = `<p class="text-red-500 text-sm">${escapeHtml(response.error || 'Connection failed')}</p>`;
            document.getElementById('router-info-system').innerHTML = errMsg;
            document.getElementById('router-info-resources').innerHTML = '<p class="text-gray-400 text-sm">-</p>';
            document.getElementById('router-info-interfaces').innerHTML = '<p class="text-gray-400 text-sm">-</p>';
        }
    } catch (error) {
        document.getElementById('router-info-system').innerHTML = '<p class="text-red-500 text-sm">Failed to load info</p>';
    }
}

let _cachedSetupScript = null;

async function loadRouterSetupScript() {
    if (!currentRouterId) return;

    // Reset UI
    document.getElementById('setup-script-loading').classList.remove('hidden');
    document.getElementById('setup-script-content').classList.add('hidden');
    document.getElementById('setup-script-error').classList.add('hidden');
    _cachedSetupScript = null;

    try {
        const response = await apiCall(`/routers/${currentRouterId}/setup-script`);

        if (response.success) {
            _cachedSetupScript = response.script;
            document.getElementById('setup-script-text').textContent = response.script;
            document.getElementById('setup-script-loading').classList.add('hidden');
            document.getElementById('setup-script-content').classList.remove('hidden');
        } else {
            throw new Error(response.error || 'Failed to generate script');
        }
    } catch (error) {
        document.getElementById('setup-script-loading').classList.add('hidden');
        document.getElementById('setup-script-error-msg').textContent = error.message || 'Failed to generate setup script';
        document.getElementById('setup-script-error').classList.remove('hidden');
    }
}

async function copySetupScript() {
    if (!_cachedSetupScript) return;
    try {
        await navigator.clipboard.writeText(_cachedSetupScript);
        showToast('Script copied to clipboard!', 'success');
    } catch (e) {
        // Fallback for browsers without clipboard API
        const el = document.createElement('textarea');
        el.value = _cachedSetupScript;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        showToast('Script copied!', 'success');
    }
}

async function refreshRouterSessions() {
    if (!currentRouterId) return;
    const tbody = document.getElementById('router-sessions-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-center text-gray-400">Loading...</td></tr>';

    try {
        const response = await apiCall(`/routers/${currentRouterId}/sessions`);

        if (!response.success) throw new Error(response.error);

        if (!response.sessions || response.sessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-center text-gray-500">No active sessions on this router</td></tr>';
            return;
        }

        tbody.innerHTML = response.sessions.map(s => `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm font-medium">${escapeHtml(s.user || '-')}</td>
                <td class="px-4 py-3 text-sm text-gray-600">${escapeHtml(s.address || '-')}</td>
                <td class="px-4 py-3 text-sm font-mono text-xs text-gray-600">${escapeHtml(s.mac_address || '-')}</td>
                <td class="px-4 py-3 text-sm text-gray-600">${escapeHtml(s.uptime || '-')}</td>
                <td class="px-4 py-3 text-sm text-gray-600">
                    ↓ ${formatBytes(parseInt(s.bytes_in) || 0)} / ↑ ${formatBytes(parseInt(s.bytes_out) || 0)}
                </td>
                <td class="px-4 py-3">
                    <button onclick="kickRouterUser('${escapeHtml(s.user)}')"
                        class="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700">
                        <i class="fas fa-times mr-1"></i>Kick
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-3 text-center text-red-500 text-sm">Failed to load sessions</td></tr>';
    }
}

async function refreshHotspotUsers() {
    if (!currentRouterId) return;
    const tbody = document.getElementById('router-hotspot-users-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center text-gray-400">Loading...</td></tr>';

    try {
        const response = await apiCall(`/routers/${currentRouterId}/hotspot-users`);

        if (!response.success) throw new Error(response.error);

        if (!response.users || response.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">No hotspot users on this router</td></tr>';
            return;
        }

        tbody.innerHTML = response.users.map(u => `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm font-medium">${escapeHtml(u.name)}</td>
                <td class="px-4 py-3 text-sm text-gray-600">${escapeHtml(u.profile || '-')}</td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs ${u.disabled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">
                        ${u.disabled ? 'Disabled' : 'Active'}
                    </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-500">${escapeHtml(u.comment || '-')}</td>
                <td class="px-4 py-3">
                    <button onclick="kickRouterUser('${escapeHtml(u.name)}')"
                        class="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700 mr-1">
                        <i class="fas fa-wifi mr-1"></i>Disconnect
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-3 text-center text-red-500 text-sm">Failed to load users</td></tr>';
    }
}

async function loadRouterLogs() {
    if (!currentRouterId) return;
    const tbody = document.getElementById('router-logs-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-4 text-center text-gray-400">Loading...</td></tr>';

    try {
        const response = await apiCall(`/routers/${currentRouterId}/logs?limit=50`);

        if (!response.success) throw new Error(response.error);

        if (!response.logs || response.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-4 text-center text-gray-500">No logs for this router</td></tr>';
            return;
        }

        tbody.innerHTML = response.logs.map(log => `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 text-xs text-gray-500">${formatDate(log.created_at)}</td>
                <td class="px-4 py-3 text-sm">${escapeHtml(log.username || 'System')}</td>
                <td class="px-4 py-3 text-sm text-gray-700">${escapeHtml(log.action_type || '-')}</td>
                <td class="px-4 py-3">
                    <span class="px-1.5 py-0.5 rounded text-xs ${log.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                        ${log.success ? 'OK' : 'Failed'}
                    </span>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-3 text-center text-red-500 text-sm">Failed to load logs</td></tr>';
    }
}

async function kickRouterUser(username) {
    if (!currentRouterId) return;
    if (!confirm(`Disconnect user "${username}" from this router?`)) return;

    try {
        const response = await apiCall(`/routers/${currentRouterId}/disconnect`, 'POST', { username });
        if (response.success) {
            showToast(response.message || 'User disconnected', 'success');
            if (currentRouterTab === 'sessions') refreshRouterSessions();
            if (currentRouterTab === 'hotspot-users') refreshHotspotUsers();
        } else {
            showToast(response.message || 'Failed to disconnect user', 'error');
        }
    } catch (error) {
        showToast('Failed to disconnect user', 'error');
    }
}

function testRouterFromDetail() {
    if (currentRouterId) testRouter(currentRouterId, true);
}

function syncRouterFromDetail() {
    if (currentRouterId) syncRouter(currentRouterId, true);
}

function editRouterFromDetail() {
    if (currentRouterId) editRouter(currentRouterId);
}

function deleteRouterFromDetail() {
    if (currentRouterId) deleteRouter(currentRouterId);
}

async function testRouter(routerId, fromDetail = false) {
    showToast('Testing router connection...', 'info');

    try {
        const response = await apiCall(`/routers/${routerId}/test`, 'POST');
        if (response.success) {
            showToast('Connection successful!', 'success');
        } else {
            showToast(response.message || 'Connection test failed', 'error');
        }
        if (fromDetail) loadRouterSystemInfo();
        else loadRouters();
    } catch (error) {
        showToast('Failed to test router', 'error');
    }
}

async function syncRouter(routerId, fromDetail = false) {
    showToast('Syncing packages to router...', 'info');

    try {
        const response = await apiCall(`/routers/${routerId}/sync`, 'POST');
        if (response.success) {
            showToast(`Synced ${response.synced || 0} packages successfully`, 'success');
        } else {
            showToast(response.message || 'Sync failed', 'error');
        }
        if (!fromDetail) loadRouters();
    } catch (error) {
        showToast('Failed to sync router', 'error');
    }
}

async function deleteRouter(routerId) {
    if (!confirm('Delete this router? This cannot be undone. All associated credentials will be removed.')) return;

    try {
        const response = await apiCall(`/routers/${routerId}`, 'DELETE');
        if (response.success) {
            showToast('Router deleted', 'success');
            closeRouterDetail();
            loadRouters();
        } else {
            showToast(response.error || 'Failed to delete router', 'error');
        }
    } catch (error) {
        showToast('Failed to delete router', 'error');
    }
}

async function editRouter(routerId) {
    // Load current router data
    let router;
    try {
        const response = await apiCall(`/routers/${routerId}`);
        if (!response.success) throw new Error(response.error);
        router = response.router;
    } catch (error) {
        showToast('Failed to load router data', 'error');
        return;
    }

    // Load estates for dropdown
    let estatesOptions = '<option value="">No estate</option>';
    try {
        const estatesResp = await apiCall('/estates');
        if (estatesResp.success) {
            estatesOptions += estatesResp.estates.map(e =>
                `<option value="${e.id}" ${router.estate_id === e.id ? 'selected' : ''}>${escapeHtml(e.name)}</option>`
            ).join('');
        }
    } catch (e) { /* ignore */ }

    createModal('Edit Router', `
        <form id="edit-router-form">
            <div class="mb-4">
                <label class="block text-sm font-medium mb-1">Router Name *</label>
                <input type="text" name="name" value="${escapeHtml(router.name)}" required
                    class="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-1">Description</label>
                <textarea name="description" rows="2"
                    class="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500">${escapeHtml(router.description || '')}</textarea>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-1">Estate</label>
                <select name="estate_id" class="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
                    ${estatesOptions}
                </select>
            </div>
            <hr class="my-4">
            <p class="text-sm text-gray-500 mb-3">Leave password blank to keep existing credentials</p>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-1">API Username</label>
                <input type="text" name="api_username" placeholder="Leave blank to keep current"
                    class="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-1">API Password</label>
                <input type="password" name="api_password" placeholder="Leave blank to keep current"
                    class="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="mb-4">
                <label class="flex items-center">
                    <input type="checkbox" name="active" ${router.active ? 'checked' : ''} class="mr-2">
                    <span class="text-sm font-medium">Router Active</span>
                </label>
            </div>
            <div class="flex space-x-2">
                <button type="submit" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                    Save Changes
                </button>
                <button type="button" onclick="closeModal()" class="flex-1 bg-gray-300 px-4 py-2 rounded hover:bg-gray-400">
                    Cancel
                </button>
            </div>
        </form>
    `);

    document.getElementById('edit-router-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            name: formData.get('name'),
            description: formData.get('description') || null,
            estate_id: formData.get('estate_id') || null,
            active: formData.get('active') === 'on',
        };
        const apiUsername = formData.get('api_username');
        const apiPassword = formData.get('api_password');
        if (apiUsername) data.api_username = apiUsername;
        if (apiPassword) data.api_password = apiPassword;

        try {
            const response = await apiCall(`/routers/${routerId}`, 'PUT', data);
            if (response.success) {
                showToast('Router updated successfully', 'success');
                closeModal();
                if (currentRouterId === routerId) {
                    document.getElementById('router-detail-name').textContent = data.name;
                    loadRouterSystemInfo();
                }
                loadRouters();
            } else {
                showToast(response.error || 'Failed to update router', 'error');
            }
        } catch (error) {
            showToast('Failed to update router', 'error');
        }
    });
}

async function showAddRouterModal() {
    // Load estates for dropdown
    let estatesOptions = '<option value="">No estate</option>';
    try {
        const estatesResp = await apiCall('/estates');
        if (estatesResp.success) {
            estatesOptions += estatesResp.estates.map(e =>
                `<option value="${e.id}">${escapeHtml(e.name)}</option>`
            ).join('');
        }
    } catch (e) { /* ignore */ }

    createModal('Add MikroTik Router', `
        <form id="add-router-form">
            <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="col-span-2">
                    <label class="block text-xs font-semibold uppercase tracking-wider mb-1.5" style="color:#acaab5;">Router Name *</label>
                    <input type="text" name="name" required placeholder="e.g. Block A Router"
                        class="glass-input">
                </div>
                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider mb-1.5" style="color:#acaab5;">IP Address *</label>
                    <input type="text" name="ip_address" required placeholder="Router IP address"
                        class="glass-input">
                </div>
                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider mb-1.5" style="color:#acaab5;">API Port</label>
                    <input type="number" name="api_port" placeholder="8729"
                        class="glass-input">
                    <p class="text-xs mt-1" style="color:#76747f;">Default: 8729 (API-SSL)</p>
                </div>
                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider mb-1.5" style="color:#acaab5;">API Username *</label>
                    <input type="text" name="api_username" required placeholder="admin"
                        class="glass-input">
                </div>
                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider mb-1.5" style="color:#acaab5;">API Password *</label>
                    <input type="password" name="api_password" required placeholder="••••••••"
                        class="glass-input">
                </div>
                <div class="col-span-2">
                    <label class="block text-xs font-semibold uppercase tracking-wider mb-1.5" style="color:#acaab5;">Estate</label>
                    <select name="estate_id" class="glass-input" style="cursor:pointer;">
                        ${estatesOptions}
                    </select>
                </div>
                <div class="col-span-2">
                    <label class="block text-xs font-semibold uppercase tracking-wider mb-1.5" style="color:#acaab5;">Description</label>
                    <textarea name="description" rows="2" placeholder="Optional notes"
                        class="glass-input" style="resize:none;"></textarea>
                </div>
            </div>
            <div class="rounded-xl p-3 mb-5 text-xs" style="background:rgba(194,119,122,0.08);border:1px solid rgba(194,119,122,0.2);color:#acaab5;">
                <strong style="color:#C2777A;">Setup tip:</strong> Enable the RouterOS API service on your MikroTik:
                <code class="block mt-1.5 rounded-lg px-2 py-1" style="background:rgba(0,0,0,0.3);color:#E8A598;font-family:'JetBrains Mono',monospace;">/ip service enable api-ssl</code>
                Make sure the API user has <em>full</em> or <em>write</em> permissions.
            </div>
            <div class="flex gap-2">
                <button type="submit" id="add-router-submit-btn" class="flex-1 btn-gradient font-semibold px-4 py-2.5 rounded-xl text-sm transition-opacity hover:opacity-90">
                    <i class="fas fa-plus mr-2"></i>Add Router
                </button>
                <button type="button" onclick="closeModal()" class="flex-1 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors" style="background:rgba(255,255,255,0.05);border:1px solid rgba(72,71,81,0.35);color:#acaab5;" onmouseover="this.style.background='rgba(255,255,255,0.09)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                    Cancel
                </button>
            </div>
        </form>
    `);

    document.getElementById('add-router-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('add-router-submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Adding...';

        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        if (!data.estate_id) delete data.estate_id;
        if (!data.description) delete data.description;

        try {
            const response = await apiCall('/routers', 'POST', data);
            if (response.success) {
                showToast('Router added successfully!', 'success');
                closeModal();
                loadRouters();
                // Auto-test the new router
                setTimeout(() => testRouter(response.router.id), 500);
            } else {
                showToast(response.error || 'Failed to add router', 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-plus mr-2"></i>Add Router';
            }
        } catch (error) {
            showToast('Failed to add router', 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus mr-2"></i>Add Router';
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

            grid.innerHTML = packages.map(pkg => {
                const durationLabel = pkg.duration_minutes >= 1440
                    ? `${Math.round(pkg.duration_minutes / 1440)} day${pkg.duration_minutes >= 2880 ? 's' : ''}`
                    : pkg.duration_minutes >= 60
                        ? `${Math.round(pkg.duration_minutes / 60)} hr${pkg.duration_minutes >= 120 ? 's' : ''}`
                        : `${pkg.duration_minutes} min`;
                return `
                <div style="background:#191923;border:1px solid rgba(72,71,81,0.35);transition:border-color 0.2s,transform 0.2s;"
                     class="rounded-2xl p-5 flex flex-col gap-0 hover:border-primary"
                     onmouseover="this.style.borderColor='rgba(194,119,122,0.5)';this.style.transform='translateY(-2px)'"
                     onmouseout="this.style.borderColor='rgba(72,71,81,0.35)';this.style.transform='translateY(0)'">

                    <!-- Header -->
                    <div class="flex items-start justify-between mb-3">
                        <div>
                            <h3 style="font-family:'Syne',sans-serif;color:#e7e4f0;" class="text-base font-bold leading-tight">${escapeHtml(pkg.name)}</h3>
                            ${pkg.description ? `<p class="text-xs mt-0.5" style="color:#76747f;">${escapeHtml(pkg.description)}</p>` : ''}
                        </div>
                        <span class="ml-2 shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                              style="${pkg.active
                                  ? 'background:rgba(34,197,94,0.12);color:#4ade80;border:1px solid rgba(34,197,94,0.25);'
                                  : 'background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.25);'}">
                            <span style="width:6px;height:6px;border-radius:50%;background:${pkg.active ? '#4ade80' : '#f87171'};display:inline-block;"></span>
                            ${pkg.active ? 'Active' : 'Disabled'}
                        </span>
                    </div>

                    <!-- Divider -->
                    <div style="height:1px;background:rgba(72,71,81,0.25);margin-bottom:0.875rem;"></div>

                    <!-- Stats -->
                    <div class="flex flex-col gap-2 mb-4 flex-1">
                        <div class="flex items-center justify-between text-sm">
                            <span class="flex items-center gap-1.5" style="color:#76747f;">
                                <span class="material-symbols-outlined" style="font-size:15px;">payments</span>Price
                            </span>
                            <span style="color:#e7e4f0;font-weight:600;">KES ${pkg.price_kes || pkg.price || 0}</span>
                        </div>
                        <div class="flex items-center justify-between text-sm">
                            <span class="flex items-center gap-1.5" style="color:#76747f;">
                                <span class="material-symbols-outlined" style="font-size:15px;">schedule</span>Duration
                            </span>
                            <span style="color:#e7e4f0;font-weight:600;">${durationLabel}</span>
                        </div>
                        ${pkg.data_limit_mb ? `
                        <div class="flex items-center justify-between text-sm">
                            <span class="flex items-center gap-1.5" style="color:#76747f;">
                                <span class="material-symbols-outlined" style="font-size:15px;">data_usage</span>Data
                            </span>
                            <span style="color:#e7e4f0;font-weight:600;">${pkg.data_limit_mb} MB</span>
                        </div>` : ''}
                        <div class="flex items-center justify-between text-sm">
                            <span class="flex items-center gap-1.5" style="color:#76747f;">
                                <span class="material-symbols-outlined" style="font-size:15px;">shopping_cart</span>Purchased
                            </span>
                            <span style="color:#e7e4f0;font-weight:600;">${pkg.purchase_count || 0}<span style="color:#76747f;font-weight:400;"> times</span></span>
                        </div>
                    </div>

                    <!-- Action buttons -->
                    <div class="flex gap-2 pt-1">
                        <button onclick="editPackage('${pkg.id}')"
                            style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 0;border-radius:10px;font-size:0.75rem;font-weight:600;background:rgba(255,255,255,0.04);border:1px solid rgba(72,71,81,0.4);color:#acaab5;transition:all 0.15s;cursor:pointer;"
                            onmouseover="this.style.background='rgba(194,119,122,0.12)';this.style.borderColor='rgba(194,119,122,0.4)';this.style.color='#C2777A'"
                            onmouseout="this.style.background='rgba(255,255,255,0.04)';this.style.borderColor='rgba(72,71,81,0.4)';this.style.color='#acaab5'">
                            <span class="material-symbols-outlined" style="font-size:14px;">edit</span>Edit
                        </button>
                        <button onclick="togglePackage('${pkg.id}')"
                            style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 0;border-radius:10px;font-size:0.75rem;font-weight:600;transition:all 0.15s;cursor:pointer;${pkg.active
                                ? 'background:rgba(255,255,255,0.04);border:1px solid rgba(72,71,81,0.4);color:#acaab5;'
                                : 'background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);color:#4ade80;'}"
                            onmouseover="this.style.background='${pkg.active ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.15)'}';this.style.borderColor='${pkg.active ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.5)'}';this.style.color='${pkg.active ? '#f87171' : '#4ade80'}'"
                            onmouseout="this.style.background='${pkg.active ? 'rgba(255,255,255,0.04)' : 'rgba(34,197,94,0.08)'}';this.style.borderColor='${pkg.active ? 'rgba(72,71,81,0.4)' : 'rgba(34,197,94,0.3)'}';this.style.color='${pkg.active ? '#acaab5' : '#4ade80'}'">
                            <span class="material-symbols-outlined" style="font-size:14px;">${pkg.active ? 'pause_circle' : 'play_circle'}</span>${pkg.active ? 'Disable' : 'Enable'}
                        </button>
                        <button onclick="deletePackage('${pkg.id}', '${pkg.name}')"
                            style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(72,71,81,0.4);color:#76747f;transition:all 0.15s;cursor:pointer;flex-shrink:0;"
                            onmouseover="this.style.background='rgba(239,68,68,0.12)';this.style.borderColor='rgba(239,68,68,0.4)';this.style.color='#f87171'"
                            onmouseout="this.style.background='rgba(255,255,255,0.04)';this.style.borderColor='rgba(72,71,81,0.4)';this.style.color='#76747f'">
                            <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
                        </button>
                    </div>
                </div>`;
            }).join('');
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

async function editEstate(estateId) {
    try {
        const response = await apiCall(`/estates/${estateId}`);
        if (!response.success) {
            showToast('Failed to load estate', 'error');
            return;
        }

        const estate = response.estate;
        createModal('Edit Estate', `
            <form id="edit-estate-form">
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Estate Name *</label>
                    <input type="text" name="name" value="${escapeHtml(estate.name || '')}" required class="w-full px-3 py-2 border rounded">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Location *</label>
                    <input type="text" name="location" value="${escapeHtml(estate.location || '')}" required class="w-full px-3 py-2 border rounded">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Description</label>
                    <textarea name="description" class="w-full px-3 py-2 border rounded" rows="2">${escapeHtml(estate.description || '')}</textarea>
                </div>
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label class="block text-sm font-medium mb-2">Contact Person</label>
                        <input type="text" name="contact_person" value="${escapeHtml(estate.contact_person || '')}" class="w-full px-3 py-2 border rounded">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Contact Phone</label>
                        <input type="text" name="contact_phone" value="${escapeHtml(estate.contact_phone || '')}" class="w-full px-3 py-2 border rounded">
                    </div>
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Contact Email</label>
                    <input type="email" name="contact_email" value="${escapeHtml(estate.contact_email || '')}" class="w-full px-3 py-2 border rounded">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Status</label>
                    <select name="status" class="w-full px-3 py-2 border rounded">
                        <option value="active" ${estate.status === 'active' ? 'selected' : ''}>Active</option>
                        <option value="inactive" ${estate.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>
                <div class="flex space-x-2">
                    <button type="submit" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                        Save Changes
                    </button>
                    <button type="button" onclick="closeModal()" class="flex-1 bg-gray-300 px-4 py-2 rounded hover:bg-gray-400">
                        Cancel
                    </button>
                </div>
            </form>
        `);

        document.getElementById('edit-estate-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);

            try {
                const updateResponse = await apiCall(`/estates/${estateId}`, 'PUT', data);
                if (updateResponse.success) {
                    showToast('Estate updated successfully', 'success');
                    closeModal();
                    loadEstates();
                } else {
                    showToast(updateResponse.error || 'Failed to update estate', 'error');
                }
            } catch (error) {
                showToast('Failed to update estate', 'error');
            }
        });
    } catch (error) {
        showToast('Failed to load estate details', 'error');
    }
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
    createModal('Add Estate', `
        <form id="add-estate-form">
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Estate Name *</label>
                <input type="text" name="name" required class="w-full px-3 py-2 border rounded" placeholder="e.g. Greenview Estate">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Location *</label>
                <input type="text" name="location" required class="w-full px-3 py-2 border rounded" placeholder="e.g. Nairobi, Kenya">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Description</label>
                <textarea name="description" class="w-full px-3 py-2 border rounded" rows="2"></textarea>
            </div>
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium mb-2">Contact Person</label>
                    <input type="text" name="contact_person" class="w-full px-3 py-2 border rounded">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Contact Phone</label>
                    <input type="text" name="contact_phone" class="w-full px-3 py-2 border rounded">
                </div>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Contact Email</label>
                <input type="email" name="contact_email" class="w-full px-3 py-2 border rounded">
            </div>
            <div class="flex space-x-2">
                <button type="submit" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                    Create Estate
                </button>
                <button type="button" onclick="closeModal()" class="flex-1 bg-gray-300 px-4 py-2 rounded hover:bg-gray-400">
                    Cancel
                </button>
            </div>
        </form>
    `);

    document.getElementById('add-estate-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);

        try {
            const response = await apiCall('/estates', 'POST', data);
            if (response.success) {
                showToast('Estate created successfully', 'success');
                closeModal();
                loadEstates();
            } else {
                showToast(response.error || 'Failed to create estate', 'error');
            }
        } catch (error) {
            showToast('Failed to create estate', 'error');
        }
    });
}

async function editAdmin(adminId) {
    try {
        const [adminResponse, rolesResponse] = await Promise.all([
            apiCall(`/admins/${adminId}`),
            apiCall('/roles')
        ]);

        if (!adminResponse.success) {
            showToast('Failed to load admin', 'error');
            return;
        }

        const admin = adminResponse.admin;
        const allRoles = rolesResponse.success ? (rolesResponse.roles || []) : [];
        const adminRoleIds = (admin.roles || []).map(r => r.id);

        const rolesHtml = allRoles.map(role => `
            <label class="flex items-center space-x-2 mb-1">
                <input type="checkbox" name="role_ids" value="${role.id}" ${adminRoleIds.includes(role.id) ? 'checked' : ''} class="rounded">
                <span class="text-sm">${escapeHtml(role.name)}</span>
            </label>
        `).join('');

        createModal('Edit Admin', `
            <form id="edit-admin-form">
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-1">Username</label>
                    <input type="text" value="${escapeHtml(admin.username)}" disabled class="w-full px-3 py-2 border rounded bg-gray-100 text-gray-500">
                    <p class="text-xs text-gray-500 mt-1">Username cannot be changed</p>
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Full Name</label>
                    <input type="text" name="full_name" value="${escapeHtml(admin.full_name || '')}" class="w-full px-3 py-2 border rounded">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Email *</label>
                    <input type="email" name="email" value="${escapeHtml(admin.email || '')}" required class="w-full px-3 py-2 border rounded">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Status</label>
                    <select name="active" class="w-full px-3 py-2 border rounded">
                        <option value="true" ${admin.active ? 'selected' : ''}>Active</option>
                        <option value="false" ${!admin.active ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>
                ${allRoles.length > 0 ? `
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">Roles</label>
                    <div class="border rounded p-3 max-h-32 overflow-y-auto">
                        ${rolesHtml}
                    </div>
                </div>` : ''}
                <div class="flex space-x-2">
                    <button type="submit" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                        Save Changes
                    </button>
                    <button type="button" onclick="closeModal()" class="flex-1 bg-gray-300 px-4 py-2 rounded hover:bg-gray-400">
                        Cancel
                    </button>
                </div>
            </form>
        `);

        document.getElementById('edit-admin-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = {
                email: formData.get('email'),
                full_name: formData.get('full_name'),
                active: formData.get('active') === 'true',
                role_ids: formData.getAll('role_ids')
            };

            try {
                const updateResponse = await apiCall(`/admins/${adminId}`, 'PUT', data);
                if (updateResponse.success) {
                    showToast('Admin updated successfully', 'success');
                    closeModal();
                    loadAdmins();
                } else {
                    showToast(updateResponse.error || 'Failed to update admin', 'error');
                }
            } catch (error) {
                showToast('Failed to update admin', 'error');
            }
        });
    } catch (error) {
        showToast('Failed to load admin details', 'error');
    }
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
    modal.className = 'modal active fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div style="background:#191923;border:1px solid rgba(72,71,81,0.35);color:#e7e4f0;" class="rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <h2 style="font-family:'Syne',sans-serif;color:#e7e4f0;" class="text-xl font-bold mb-5">${title}</h2>
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
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString();
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
