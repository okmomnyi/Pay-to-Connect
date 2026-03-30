// Profile Management JavaScript
const API_BASE = '/api/user/profile';

let currentUser = null;
let securityQuestions = [];

// Initialize profile page
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadUserProfile();
        await loadSecurityQuestions();
        await loadPurchaseHistory(); // Auto-load history
        setupEventListeners();
    } catch (error) {
        console.error('Error initializing profile:', error);
        showAlert('Error loading profile', 'error');
    }
});

// Load user profile
async function loadUserProfile() {
    try {
        const token = localStorage.getItem('userToken');
        if (!token) {
            window.location.href = '/portal';
            return;
        }

        // Try to fetch profile
        let response = await fetch(`${API_BASE}/`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            // Fallback to /api/user/profile (without trailing slash) or /api/user/me
            console.log('Retrying profile fetch...');
            response = await fetch('/api/user/profile', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }

        if (!response.ok) {
            if (response.status === 401) {
                logout();
                return;
            }
            throw new Error(`Failed to load profile: ${response.status}`);
        }

        const data = await response.json();

        if (!data.profile && !data.user) {
            throw new Error('Invalid profile data format');
        }

        currentUser = data.profile || data.user;

        // Update basic info
        displayProfile(currentUser);
        updateStatusBadges();

    } catch (error) {
        console.error('Error loading profile:', error);
        document.getElementById('profile-name').textContent = 'Error loading profile';
        document.getElementById('profile-email').textContent = 'Please try refreshing';
        showAlert('Error connection to server: ' + error.message, 'error');
    }
}

function displayProfile(profile) {
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username || 'User';
    const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

    document.getElementById('avatar').textContent = initials;
    document.getElementById('profile-name').textContent = fullName;
    document.getElementById('profile-email').textContent = profile.email || 'No email';
    document.getElementById('username').textContent = profile.username || '-';
    document.getElementById('phone').textContent = profile.phone || '-';

    const createdDate = profile.created_at
        ? new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : '-';
    document.getElementById('member-since').textContent = createdDate;

    if (profile.last_login) {
        document.getElementById('last-login').textContent = new Date(profile.last_login).toLocaleString();
    } else {
        document.getElementById('last-login').textContent = 'Never';
    }
}

// Load security questions
async function loadSecurityQuestions() {
    try {
        const token = localStorage.getItem('userToken');
        const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

        let response = await fetch(`${API_BASE}/security-questions`, { headers: authHeaders });

        if (!response.ok) {
            response = await fetch('/api/user/security-questions', { headers: authHeaders });
        }

        if (!response.ok) throw new Error('Failed to load security questions');

        const data = await response.json();
        securityQuestions = data.questions || [];

        if (securityQuestions.length === 0) {
            console.warn('No security questions found in DB');
        }

        renderSecurityQuestionsForm();
    } catch (error) {
        console.error('Error loading security questions:', error);
    }
}

// Render Security Questions Inputs (Static 3 questions)
function renderSecurityQuestionsForm() {
    const container = document.getElementById('security-questions-container');
    container.innerHTML = '';

    for (let i = 0; i < 3; i++) {
        const div = document.createElement('div');
        div.className = 'space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-100';
        div.innerHTML = `
            <label class="block text-sm font-medium text-gray-700">Question ${i + 1}</label>
            <select id="question-${i}" required class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500">
                <option value="">Select a question...</option>
                ${securityQuestions.map(q => `<option value="${q.id}">${q.question}</option>`).join('')}
            </select>
            <input type="text" id="answer-${i}" required placeholder="Your answer" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500 mt-2">
        `;
        container.appendChild(div);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Security questions form
    const securityForm = document.getElementById('security-form');
    if (securityForm) {
        securityForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveSecurityQuestions();
        });
    }

    // Password form
    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await changePassword();
        });
    }
}

// Save security questions
async function saveSecurityQuestions() {
    try {
        const token = localStorage.getItem('userToken');
        const answers = [];

        for (let i = 0; i < 3; i++) {
            const questionId = document.getElementById(`question-${i}`).value;
            const answer = document.getElementById(`answer-${i}`).value;

            if (!questionId || !answer) {
                showAlert('Please fill in all security questions', 'error');
                return;
            }
            answers.push({ question_id: questionId, answer: answer });
        }

        const response = await fetch(`${API_BASE}/security-answers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ answers })
        });

        if (!response.ok) throw new Error('Failed to save security questions');

        showAlert('Security questions saved successfully', 'success');
        // Close accordion
        document.getElementById('security-section').classList.remove('active');
        document.getElementById('security-icon').classList.remove('active');

        await loadUserProfile(); // Reload to update status badge

    } catch (error) {
        console.error('Error saving security questions:', error);
        showAlert('Error saving security questions', 'error');
    }
}

// Change password
async function changePassword() {
    try {
        const token = localStorage.getItem('userToken');
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (newPassword !== confirmPassword) {
            showAlert('New passwords do not match', 'error');
            return;
        }

        if (newPassword.length < 8) {
            showAlert('Password must be at least 8 characters long', 'error');
            return;
        }

        const response = await fetch(`${API_BASE}/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                currentPassword: currentPassword,
                newPassword: newPassword,
                confirmPassword: confirmPassword
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to change password');
        }

        showAlert('Password changed successfully', 'success');
        document.getElementById('password-form').reset();

        // Close accordion
        document.getElementById('password-section').classList.remove('active');
        document.getElementById('password-icon').classList.remove('active');

    } catch (error) {
        console.error('Error changing password:', error);
        showAlert(error.message || 'Error changing password', 'error');
    }
}

// Load Purchase History
async function loadPurchaseHistory() {
    try {
        const token = localStorage.getItem('userToken');
        const response = await fetch('/api/user/purchase/history?limit=10', { // Fixed absolute path
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        const container = document.getElementById('purchase-history');

        if (data.success && data.history.length > 0) {
            container.innerHTML = data.history.map(item => `
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div>
                        <div class="font-bold text-gray-700">${item.package_name}</div>
                        <div class="text-xs text-gray-500">
                            ${new Date(item.purchase_date).toLocaleDateString()} 
                            ${item.mpesa_receipt ? '• ' + item.mpesa_receipt : ''}
                        </div>
                    </div>
                    <div class="font-bold text-indigo-600">KES ${parseFloat(item.amount_paid).toFixed(0)}</div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="text-center text-gray-500 py-4">No purchase history yet</p>';
        }
    } catch (error) {
        console.error('Error loading history:', error);
        document.getElementById('purchase-history').innerHTML = '<p class="text-center text-red-400 py-4">Failed to load history</p>';
    }
}


// Update status badges
function updateStatusBadges() {
    // Profile status (simplified check)
    const profileStatus = document.getElementById('profile-status');
    const isComplete = currentUser.first_name && currentUser.last_name;

    profileStatus.className = isComplete
        ? 'px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold'
        : 'px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold';
    profileStatus.textContent = isComplete ? 'Profile Complete' : 'Profile Incomplete';

    // Security status
    const securityStatus = document.getElementById('security-status');
    const securityHeaderBadge = document.getElementById('security-badge-header');
    const isSet = currentUser.security_questions_set;

    const setClass = 'px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold';
    const unsetClass = 'px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold';

    securityStatus.className = isSet ? setClass : unsetClass;
    securityStatus.textContent = isSet ? 'Security Secure' : 'Security at Risk';

    if (securityHeaderBadge) {
        securityHeaderBadge.className = isSet ? 'ml-3 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full' : 'ml-3 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full';
        securityHeaderBadge.textContent = isSet ? 'Active' : 'Not Set';
    }
}

// Tailwind Alert System
function showAlert(message, type) {
    const container = document.getElementById('alert-container');
    const alert = document.createElement('div');

    // Green for success, Red for error
    const bgClass = type === 'success' ? 'bg-green-500' : 'bg-red-500';

    alert.className = `${bgClass} text-white px-6 py-3 rounded-lg shadow-lg flex items-center transform transition-all duration-500 translate-y-0 opacity-100`;
    alert.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-3"></i>
        <span>${message}</span>
    `;

    container.appendChild(alert);

    // Auto-remove
    setTimeout(() => {
        alert.classList.add('opacity-0', 'translate-y-[-10px]');
        setTimeout(() => alert.remove(), 300);
    }, 4000);
}

function logout() {
    localStorage.removeItem('userToken');
    localStorage.removeItem('userData');
    window.location.href = '/portal';
}

function logoutAllSessions() {
    if (confirm('Are you sure you want to log out of all devices?')) {
        const token = localStorage.getItem('userToken');
        fetch(`${API_BASE}/logout-all`, { // Check API endpoint, usually standard logout is enough or specific endpoint needed
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).finally(() => logout());
    }
}
