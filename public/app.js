class WiFiPortal {
    constructor() {
        this.currentPackage = null;
        this.checkoutRequestId = null;
        this.statusCheckInterval = null;
        this.macAddress = this.getMacAddress();
        this.userToken = localStorage.getItem('userToken');
        this.userData = JSON.parse(localStorage.getItem('userData') || '{}');
        
        this.initializeElements();
        this.bindEvents();
        this.checkAuthentication();
        this.loadPackages();
        this.checkExistingSession();
    }

    initializeElements() {
        // Main sections
        this.loadingState = document.getElementById('loadingState');
        this.errorState = document.getElementById('errorState');
        this.packagesList = document.getElementById('packagesList');
        this.paymentForm = document.getElementById('paymentForm');
        this.paymentStatus = document.getElementById('paymentStatus');

        // Form elements
        this.phoneInput = document.getElementById('phoneInput');
        this.payButton = document.getElementById('payButton');
        this.backButton = document.getElementById('backButton');

        // Package display elements
        this.selectedPackageName = document.getElementById('selectedPackageName');
        this.selectedPackageDuration = document.getElementById('selectedPackageDuration');
        this.selectedPackagePrice = document.getElementById('selectedPackagePrice');

        // Status elements
        this.paymentPending = document.getElementById('paymentPending');
        this.paymentSuccess = document.getElementById('paymentSuccess');
        this.paymentFailed = document.getElementById('paymentFailed');
        this.checkStatusButton = document.getElementById('checkStatusButton');
        this.retryPaymentButton = document.getElementById('retryPaymentButton');
        this.newSessionButton = document.getElementById('newSessionButton');

        // Terms modal
        this.termsModal = document.getElementById('termsModal');
        this.termsButton = document.getElementById('termsButton');
        this.closeTermsButton = document.getElementById('closeTermsButton');

        // Error message
        this.errorMessage = document.getElementById('errorMessage');
    }

    bindEvents() {
        this.payButton.addEventListener('click', () => this.initiatePayment());
        this.backButton.addEventListener('click', () => this.showPackages());
        this.checkStatusButton.addEventListener('click', () => this.checkPaymentStatus());
        this.retryPaymentButton.addEventListener('click', () => this.showPackages());
        this.newSessionButton.addEventListener('click', () => this.showPackages());
        
        // Terms modal
        this.termsButton.addEventListener('click', () => this.showTerms());
        this.closeTermsButton.addEventListener('click', () => this.hideTerms());
        this.termsModal.addEventListener('click', (e) => {
            if (e.target === this.termsModal) this.hideTerms();
        });

        // Phone input formatting
        this.phoneInput.addEventListener('input', (e) => {
            this.formatPhoneNumber(e.target);
        });

        // Enter key handling
        this.phoneInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.initiatePayment();
            }
        });

        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    }

    checkAuthentication() {
        const userInfo = document.getElementById('userInfo');
        const loginRequired = document.getElementById('loginRequired');
        const userName = document.getElementById('userName');

        if (this.userToken && this.userData.username) {
            // User is logged in
            userName.textContent = this.userData.username;
            userInfo.classList.remove('hidden');
            loginRequired.classList.add('hidden');
            this.loadPackages();
        } else {
            // User not logged in
            userInfo.classList.add('hidden');
            loginRequired.classList.remove('hidden');
            this.hideAllSections();
        }
    }

    logout() {
        localStorage.removeItem('userToken');
        localStorage.removeItem('userData');
        window.location.href = '/login';
    }

    getMacAddress() {
        // In a real captive portal, this would be extracted from the URL parameters
        // or obtained from the router's redirect
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('mac') || this.generateFakeMac();
    }

    generateFakeMac() {
        // Generate a fake MAC address for testing
        return Array.from({length: 6}, () => 
            Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
        ).join(':');
    }

    formatPhoneNumber(input) {
        let value = input.value.replace(/\D/g, '');
        
        if (value.startsWith('254')) {
            value = '+' + value;
        } else if (value.startsWith('0') && value.length > 1) {
            value = '+254' + value.substring(1);
        } else if (value.length > 0 && !value.startsWith('254') && !value.startsWith('0')) {
            value = '+254' + value;
        }
        
        input.value = value;
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorState.classList.remove('hidden');
        setTimeout(() => {
            this.errorState.classList.add('hidden');
        }, 5000);
    }

    hideAllSections() {
        this.loadingState.classList.add('hidden');
        this.errorState.classList.add('hidden');
        this.packagesList.classList.add('hidden');
        this.paymentForm.classList.add('hidden');
        this.paymentStatus.classList.add('hidden');
        this.paymentPending.classList.add('hidden');
        this.paymentSuccess.classList.add('hidden');
        this.paymentFailed.classList.add('hidden');
    }

    showLoading() {
        this.hideAllSections();
        this.loadingState.classList.remove('hidden');
    }

    showPackages() {
        this.hideAllSections();
        this.packagesList.classList.remove('hidden');
        this.currentPackage = null;
        this.checkoutRequestId = null;
        this.clearStatusCheck();
    }

    showPaymentForm() {
        this.hideAllSections();
        this.paymentForm.classList.remove('hidden');
        this.phoneInput.focus();
    }

    showPaymentStatus(status) {
        this.hideAllSections();
        this.paymentStatus.classList.remove('hidden');
        
        if (status === 'pending') {
            this.paymentPending.classList.remove('hidden');
        } else if (status === 'success') {
            this.paymentSuccess.classList.remove('hidden');
        } else if (status === 'failed') {
            this.paymentFailed.classList.remove('hidden');
        }
    }

    showTerms() {
        this.termsModal.classList.remove('hidden');
    }

    hideTerms() {
        this.termsModal.classList.add('hidden');
    }

    async loadPackages() {
        try {
            this.showLoading();
            
            const response = await fetch('/api/portal/packages');
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to load packages');
            }

            this.renderPackages(data.packages);
            this.showPackages();
        } catch (error) {
            console.error('Error loading packages:', error);
            this.showError('Failed to load packages. Please refresh the page.');
        }
    }

    renderPackages(packages) {
        this.packagesList.innerHTML = '';

        packages.forEach(pkg => {
            const packageCard = document.createElement('div');
            packageCard.className = 'bg-white bg-opacity-10 rounded-lg p-4 cursor-pointer hover:bg-opacity-20 transition duration-200 border border-white border-opacity-20';
            
            packageCard.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="text-white font-bold text-lg">${pkg.name}</h3>
                        <p class="text-blue-100 text-sm">${pkg.duration_display}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-white font-bold text-xl">KES ${pkg.price_kes}</p>
                        <button class="bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-1 px-3 rounded mt-1 transition duration-200">
                            Select
                        </button>
                    </div>
                </div>
            `;

            packageCard.addEventListener('click', () => this.selectPackage(pkg));
            this.packagesList.appendChild(packageCard);
        });
    }

    selectPackage(pkg) {
        this.currentPackage = pkg;
        
        this.selectedPackageName.textContent = pkg.name;
        this.selectedPackageDuration.textContent = pkg.duration_display;
        this.selectedPackagePrice.textContent = `KES ${pkg.price_kes}`;
        
        this.showPaymentForm();
    }

    async initiatePayment() {
        if (!this.currentPackage) {
            this.showError('Please select a package first');
            return;
        }

        const phone = this.phoneInput.value.trim();
        if (!phone) {
            this.showError('Please enter your phone number');
            return;
        }

        if (!this.validatePhoneNumber(phone)) {
            this.showError('Please enter a valid Kenyan phone number');
            return;
        }

        try {
            this.payButton.disabled = true;
            this.payButton.innerHTML = '<div class="loading-spinner mr-2"></div>Processing...';

            const response = await fetch('/api/portal/pay', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phone: phone,
                    packageId: this.currentPackage.id,
                    macAddress: this.macAddress
                })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Payment initiation failed');
            }

            this.checkoutRequestId = data.checkoutRequestId;
            
            // Update pending payment display
            document.getElementById('pendingAmount').textContent = `KES ${data.amount}`;
            document.getElementById('pendingPackage').textContent = data.packageName;
            
            this.showPaymentStatus('pending');
            this.startStatusCheck();

        } catch (error) {
            console.error('Payment error:', error);
            this.showError(error.message);
        } finally {
            this.payButton.disabled = false;
            this.payButton.innerHTML = '<i class="fas fa-mobile-alt mr-2"></i>Pay with M-Pesa';
        }
    }

    validatePhoneNumber(phone) {
        // Remove all non-digits
        const digits = phone.replace(/\D/g, '');
        
        // Check various formats
        if (digits.length === 12 && digits.startsWith('254')) {
            return true; // +254XXXXXXXXX
        }
        if (digits.length === 10 && digits.startsWith('07')) {
            return true; // 07XXXXXXXX
        }
        if (digits.length === 9 && digits.startsWith('7')) {
            return true; // 7XXXXXXXX
        }
        
        return false;
    }

    async checkPaymentStatus() {
        if (!this.checkoutRequestId) return;

        try {
            const response = await fetch(`/api/portal/status/${this.checkoutRequestId}`);
            const data = await response.json();

            if (!data.success) {
                console.error('Status check failed:', data.error);
                return;
            }

            if (data.status === 'success' && data.session) {
                this.displaySuccessSession(data.session);
                this.showPaymentStatus('success');
                this.clearStatusCheck();
            } else if (data.status === 'failed' || data.status === 'cancelled') {
                this.showPaymentStatus('failed');
                this.clearStatusCheck();
            }
            // If still pending, continue checking
        } catch (error) {
            console.error('Status check error:', error);
        }
    }

    displaySuccessSession(session) {
        const expiryDate = new Date(session.expiresAt);
        document.getElementById('sessionExpiry').textContent = expiryDate.toLocaleString();
        
        this.updateTimeRemaining(session.remainingSeconds);
        
        // Start countdown timer
        this.startCountdown(session.remainingSeconds);
    }

    updateTimeRemaining(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        let timeString = '';
        if (hours > 0) timeString += `${hours}h `;
        if (minutes > 0) timeString += `${minutes}m `;
        timeString += `${secs}s`;
        
        document.getElementById('timeRemaining').textContent = timeString;
    }

    startCountdown(initialSeconds) {
        let remainingSeconds = initialSeconds;
        
        const countdown = setInterval(() => {
            remainingSeconds--;
            
            if (remainingSeconds <= 0) {
                clearInterval(countdown);
                this.updateTimeRemaining(0);
                this.showError('Your session has expired');
                setTimeout(() => this.showPackages(), 3000);
            } else {
                this.updateTimeRemaining(remainingSeconds);
            }
        }, 1000);
    }

    startStatusCheck() {
        // Check status every 3 seconds
        this.statusCheckInterval = setInterval(() => {
            this.checkPaymentStatus();
        }, 3000);

        // Stop checking after 5 minutes
        setTimeout(() => {
            this.clearStatusCheck();
        }, 300000);
    }

    clearStatusCheck() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
        }
    }

    async checkExistingSession() {
        try {
            const response = await fetch(`/api/portal/device/${encodeURIComponent(this.macAddress)}`);
            const data = await response.json();

            if (data.success && data.hasActiveSession && data.session) {
                this.displaySuccessSession(data.session);
                this.showPaymentStatus('success');
            }
        } catch (error) {
            console.error('Error checking existing session:', error);
            // Continue with normal flow
        }
    }
}

// Initialize the portal when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new WiFiPortal();
});

// Handle page visibility changes to pause/resume status checks
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden, could pause status checks
    } else {
        // Page is visible, resume status checks if needed
    }
});

// Handle network connectivity changes
window.addEventListener('online', () => {
    console.log('Network connection restored');
});

window.addEventListener('offline', () => {
    console.log('Network connection lost');
});
