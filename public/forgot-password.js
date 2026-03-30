// Forgot Password JavaScript
const API_BASE = '/api/public';

let currentStep = 1;
let securityQuestions = [];
let resetToken = null;

// Initialize forgot password page
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Identity form
    document.getElementById('identity-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await verifyIdentity();
    });

    // Security form
    document.getElementById('security-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await verifySecurityAnswers();
    });

    // Reset form
    document.getElementById('reset-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await resetPassword();
    });
}

// Verify identity
async function verifyIdentity() {
    try {
        const identifier = document.getElementById('identifier').value.trim();
        
        if (!identifier) {
            showAlert('Please enter your username, email, or phone number', 'error');
            return;
        }

        // Show loading
        const submitBtn = document.querySelector('#identity-form button');
        const originalText = submitBtn.textContent;
        submitBtn.innerHTML = '<span class="loading"></span> Verifying...';
        submitBtn.disabled = true;

        // Get user's security questions
        const response = await fetch(`${API_BASE}/security-answers/forgot`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ identifier })
        });

        submitBtn.textContent = originalText;
        submitBtn.disabled = false;

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'User not found or security questions not set');
        }

        const data = await response.json();
        
        if (data.questions.length < 3) {
            showAlert('Security questions not set up for this account. Please contact support.', 'error');
            return;
        }

        // Show security questions step
        showSecurityQuestions(data.questions);

    } catch (error) {
        console.error('Error verifying identity:', error);
        showAlert(error.message || 'Error verifying identity', 'error');
    }
}

// Show security questions
function showSecurityQuestions(questions) {
    const container = document.getElementById('security-questions-container');
    container.innerHTML = '';

    questions.forEach((question, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'sq-block form-group';
        questionDiv.innerHTML = `
            <label class="form-label">${question.question}</label>
            <input type="text" id="answer-${index}" class="form-input" required placeholder="Your answer">
            <input type="hidden" id="question-id-${index}" value="${question.question_id}">
        `;
        container.appendChild(questionDiv);
    });

    // Move to step 2
    moveToStep(2);
}

// Verify security answers
async function verifySecurityAnswers() {
    try {
        const identifier = document.getElementById('identifier').value.trim();
        const answers = [];

        // Collect answers
        const questionInputs = document.querySelectorAll('[id^="question-id-"]');
        questionInputs.forEach((input, index) => {
            const questionId = input.value;
            const answer = document.getElementById(`answer-${index}`).value.trim();
            
            if (!answer) {
                throw new Error('Please answer all security questions');
            }
            
            answers.push({ question_id: questionId, answer });
        });

        // Show loading
        const submitBtn = document.querySelector('#security-form button');
        const originalText = submitBtn.textContent;
        submitBtn.innerHTML = '<span class="loading"></span> Verifying...';
        submitBtn.disabled = true;

        // Verify answers and get reset token
        const response = await fetch(`${API_BASE}/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ identifier, answers })
        });

        submitBtn.textContent = originalText;
        submitBtn.disabled = false;

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Security answers verification failed');
        }

        const data = await response.json();
        resetToken = data.token;

        // Move to step 3
        moveToStep(3);
        showAlert('Identity verified! Please set your new password.', 'success');

    } catch (error) {
        console.error('Error verifying security answers:', error);
        showAlert(error.message || 'Error verifying security answers', 'error');
    }
}

// Reset password
async function resetPassword() {
    try {
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (newPassword !== confirmPassword) {
            showAlert('Passwords do not match', 'error');
            return;
        }

        if (newPassword.length < 8) {
            showAlert('Password must be at least 8 characters long', 'error');
            return;
        }

        // Show loading
        const submitBtn = document.querySelector('#reset-form button');
        const originalText = submitBtn.textContent;
        submitBtn.innerHTML = '<span class="loading"></span> Resetting...';
        submitBtn.disabled = true;

        const response = await fetch(`${API_BASE}/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                token: resetToken, 
                new_password: newPassword 
            })
        });

        submitBtn.textContent = originalText;
        submitBtn.disabled = false;

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Password reset failed');
        }

        showAlert('Password reset successfully! Redirecting to login...', 'success');
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
            window.location.href = '/login';
        }, 2000);

    } catch (error) {
        console.error('Error resetting password:', error);
        showAlert(error.message || 'Error resetting password', 'error');
    }
}

// Move to specific step
function moveToStep(step) {
    // Hide all steps
    document.querySelectorAll('.step-content').forEach(content => {
        content.classList.add('hidden');
    });

    // Show current step
    document.getElementById(`step-${step}-content`).classList.remove('hidden');

    // Update step indicators
    for (let i = 1; i <= 3; i++) {
        const stepIndicator = document.getElementById(`step-${i}`);
        stepIndicator.classList.remove('active', 'completed');

        if (i < step) {
            stepIndicator.classList.add('completed');
        } else if (i === step) {
            stepIndicator.classList.add('active');
        }
    }

    // Update connector lines
    const line1 = document.getElementById('line-1');
    const line2 = document.getElementById('line-2');
    if (line1) line1.classList.toggle('done', step > 1);
    if (line2) line2.classList.toggle('done', step > 2);

    currentStep = step;
}

// Show alert
function showAlert(message, type) {
    const container = document.getElementById('alert-container');
    const iconMap = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle', warning: 'exclamation-triangle' };
    const icon = iconMap[type] || 'info-circle';

    const alertEl = document.createElement('div');
    alertEl.className = `alert alert-${type}`;
    alertEl.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
    container.innerHTML = '';
    container.appendChild(alertEl);

    setTimeout(() => alertEl.remove(), 6000);
}

// Clear alerts
function clearAlerts() {
    const container = document.getElementById('alert-container');
    container.innerHTML = '';
}
