class AuthManager {
    constructor() {
        this.currentMode = 'login';
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        // Tab elements
        this.loginTab = document.getElementById('loginTab');
        this.registerTab = document.getElementById('registerTab');
        
        // Form elements
        this.loginForm = document.getElementById('loginForm');
        this.registerForm = document.getElementById('registerForm');
        
        // Header elements
        this.formTitle = document.getElementById('formTitle');
        this.formSubtitle = document.getElementById('formSubtitle');
        
        // Message elements
        this.errorMessage = document.getElementById('errorMessage');
        this.successMessage = document.getElementById('successMessage');
        this.errorText = document.getElementById('errorText');
        this.successText = document.getElementById('successText');
        
        // Button elements
        this.loginButton = document.getElementById('loginButton');
        this.registerButton = document.getElementById('registerButton');
    }

    bindEvents() {
        this.loginTab.addEventListener('click', () => this.switchMode('login'));
        this.registerTab.addEventListener('click', () => this.switchMode('register'));
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        this.registerForm.addEventListener('submit', (e) => this.handleRegister(e));
    }

    switchMode(mode) {
        this.currentMode = mode;
        this.hideMessages();

        if (mode === 'login') {
            // Update tabs
            this.loginTab.classList.add('bg-white', 'bg-opacity-30', 'text-white');
            this.loginTab.classList.remove('text-blue-200');
            this.registerTab.classList.remove('bg-white', 'bg-opacity-30', 'text-white');
            this.registerTab.classList.add('text-blue-200');

            // Update forms
            this.loginForm.classList.remove('hidden');
            this.registerForm.classList.add('hidden');

            // Update header
            this.formTitle.textContent = 'Login to Wi-Fi';
            this.formSubtitle.textContent = 'Access your account to purchase internet';
        } else {
            // Update tabs
            this.registerTab.classList.add('bg-white', 'bg-opacity-30', 'text-white');
            this.registerTab.classList.remove('text-blue-200');
            this.loginTab.classList.remove('bg-white', 'bg-opacity-30', 'text-white');
            this.loginTab.classList.add('text-blue-200');

            // Update forms
            this.registerForm.classList.remove('hidden');
            this.loginForm.classList.add('hidden');

            // Update header
            this.formTitle.textContent = 'Create Account';
            this.formSubtitle.textContent = 'Register to purchase internet for your devices';
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        try {
            this.setLoading(true, 'login');
            this.hideMessages();

            const response = await fetch('/api/user/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Login failed');
            }

            // Store token and user info
            localStorage.setItem('userToken', data.token);
            localStorage.setItem('userData', JSON.stringify(data.user));
            
            this.showSuccess('Login successful! Redirecting...');
            
            // Redirect to portal after short delay
            setTimeout(() => {
                window.location.href = '/portal';
            }, 1500);

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setLoading(false, 'login');
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const formData = {
            username: document.getElementById('registerUsername').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            password: document.getElementById('registerPassword').value,
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value
        };

        try {
            this.setLoading(true, 'register');
            this.hideMessages();

            const response = await fetch('/api/user/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Registration failed');
            }

            // Store token and user info
            localStorage.setItem('userToken', data.token);
            localStorage.setItem('userData', JSON.stringify(data.user));
            
            this.showSuccess('Account created successfully! Redirecting...');
            
            // Redirect to portal after short delay
            setTimeout(() => {
                window.location.href = '/portal';
            }, 1500);

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setLoading(false, 'register');
        }
    }

    setLoading(loading, mode) {
        const button = mode === 'login' ? this.loginButton : this.registerButton;
        const icon = mode === 'login' ? 'fa-sign-in-alt' : 'fa-user-plus';
        const text = mode === 'login' ? 'Login' : 'Create Account';

        if (loading) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';
        } else {
            button.disabled = false;
            button.innerHTML = `<i class="fas ${icon} mr-2"></i>${text}`;
        }
    }

    showError(message) {
        this.errorText.textContent = message;
        this.errorMessage.classList.remove('hidden');
        this.successMessage.classList.add('hidden');
    }

    showSuccess(message) {
        this.successText.textContent = message;
        this.successMessage.classList.remove('hidden');
        this.errorMessage.classList.add('hidden');
    }

    hideMessages() {
        this.errorMessage.classList.add('hidden');
        this.successMessage.classList.add('hidden');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AuthManager();
});
