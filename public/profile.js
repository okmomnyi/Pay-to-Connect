// Profile Management JavaScript
const API_BASE = '/api/user/profile';

let currentUser = null;
let securityQuestions = [];

// Initialize profile page
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadUserProfile();
        await loadSecurityQuestions();
        setupEventListeners();
    } catch (error) {
        console.error('Error initializing profile:', error);
        showAlert('Error loading profile', 'error');
    }
});

// Load user profile
async function loadUserProfile() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login';
            return;
        }

        const response = await fetch(`${API_BASE}/`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load profile');
        }

        const data = await response.json();
        currentUser = data.profile;

        // Update form fields
        document.getElementById('username').value = currentUser.username;
        document.getElementById('email').value = currentUser.email;
        document.getElementById('first-name').value = currentUser.first_name || '';
        document.getElementById('last-name').value = currentUser.last_name || '';
        document.getElementById('phone').value = currentUser.phone || '';

        // Update status badges
        updateStatusBadges();

        // Update account information
        document.getElementById('created-at').textContent = new Date(currentUser.created_at).toLocaleDateString();
        document.getElementById('last-login').textContent = currentUser.last_login ? 
            new Date(currentUser.last_login).toLocaleString() : 'Never';
        document.getElementById('profile-completed').textContent = currentUser.profile_completed ? 'Yes' : 'No';
        document.getElementById('security-questions-set').textContent = currentUser.security_questions_set ? 'Yes' : 'No';

    } catch (error) {
        console.error('Error loading profile:', error);
        showAlert('Error loading profile', 'error');
    }
}

// Load security questions
async function loadSecurityQuestions() {
    try {
        const response = await fetch(`${API_BASE}/security-questions`);
        
        if (!response.ok) {
            throw new Error('Failed to load security questions');
        }

        const data = await response.json();
        securityQuestions = data.questions;
    } catch (error) {
        console.error('Error loading security questions:', error);
        showAlert('Error loading security questions', 'error');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Profile form
    document.getElementById('profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateProfile();
    });

    // Security questions form
    document.getElementById('security-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveSecurityQuestions();
    });

    // Password form
    document.getElementById('password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await changePassword();
    });
}

// Update profile
async function updateProfile() {
    try {
        const token = localStorage.getItem('token');
        const profileData = {
            first_name: document.getElementById('first-name').value,
            last_name: document.getElementById('last-name').value,
            phone: document.getElementById('phone').value
        };

        const response = await fetch(`${API_BASE}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(profileData)
        });

        if (!response.ok) {
            throw new Error('Failed to update profile');
        }

        const data = await response.json();
        currentUser = data.profile;
        updateStatusBadges();
        showAlert('Profile updated successfully', 'success');

    } catch (error) {
        console.error('Error updating profile:', error);
        showAlert('Error updating profile', 'error');
    }
}

// Show security questions modal
function showSecurityQuestionsModal() {
    const container = document.getElementById('security-questions-container');
    container.innerHTML = '';

    // Create 3 security question inputs
    for (let i = 0; i < 3; i++) {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'security-question';
        questionDiv.innerHTML = `
            <label>Security Question ${i + 1}</label>
            <select id="question-${i}" required>
                <option value="">Select a question...</option>
                ${securityQuestions.map(q => `<option value="${q.id}">${q.question}</option>`).join('')}
            </select>
            <label style="margin-top: 10px;">Answer</label>
            <input type="text" id="answer-${i}" required placeholder="Enter your answer">
        `;
        container.appendChild(questionDiv);
    }

    document.getElementById('security-modal').style.display = 'block';
}

// Close security modal
function closeSecurityModal() {
    document.getElementById('security-modal').style.display = 'none';
}

// Save security questions
async function saveSecurityQuestions() {
    try {
        const token = localStorage.getItem('token');
        const answers = [];

        for (let i = 0; i < 3; i++) {
            const questionId = document.getElementById(`question-${i}`).value;
            const answer = document.getElementById(`answer-${i}`).value;

            if (!questionId || !answer) {
                showAlert('Please fill in all security questions', 'error');
                return;
            }

            answers.push({
                question_id: parseInt(questionId),
                answer: answer
            });
        }

        const response = await fetch(`${API_BASE}/security-answers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ answers })
        });

        if (!response.ok) {
            throw new Error('Failed to save security questions');
        }

        showAlert('Security questions saved successfully', 'success');
        closeSecurityModal();
        await loadUserProfile(); // Reload to update status

    } catch (error) {
        console.error('Error saving security questions:', error);
        showAlert('Error saving security questions', 'error');
    }
}

// Show change password modal
function showChangePasswordModal() {
    document.getElementById('password-modal').style.display = 'block';
}

// Close password modal
function closePasswordModal() {
    document.getElementById('password-modal').style.display = 'none';
    document.getElementById('password-form').reset();
}

// Change password
async function changePassword() {
    try {
        const token = localStorage.getItem('token');
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
                current_password: currentPassword,
                new_password: newPassword
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to change password');
        }

        showAlert('Password changed successfully', 'success');
        closePasswordModal();

    } catch (error) {
        console.error('Error changing password:', error);
        showAlert(error.message || 'Error changing password', 'error');
    }
}

// Update status badges
function updateStatusBadges() {
    // Profile status
    const profileStatus = document.getElementById('profile-status');
    if (currentUser.first_name && currentUser.last_name && currentUser.phone) {
        profileStatus.className = 'status-badge status-complete';
        profileStatus.textContent = 'Complete';
    } else {
        profileStatus.className = 'status-badge status-incomplete';
        profileStatus.textContent = 'Incomplete';
    }

    // Security status
    const securityStatus = document.getElementById('security-status');
    if (currentUser.security_questions_set) {
        securityStatus.className = 'status-badge status-complete';
        securityStatus.textContent = 'Set';
    } else {
        securityStatus.className = 'status-badge status-incomplete';
        securityStatus.textContent = 'Not Set';
    }
}

// Show alert
function showAlert(message, type) {
    const container = document.getElementById('alert-container');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    container.appendChild(alert);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// Navigation functions
function goToPortal() {
    window.location.href = '/portal';
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

// Close modals when clicking outside
window.onclick = function(event) {
    const securityModal = document.getElementById('security-modal');
    const passwordModal = document.getElementById('password-modal');
    
    if (event.target === securityModal) {
        closeSecurityModal();
    }
    if (event.target === passwordModal) {
        closePasswordModal();
    }
}
