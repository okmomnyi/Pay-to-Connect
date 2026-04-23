class WiFiPortal {
    constructor() {
        this.currentPackage = null;
        this.checkoutRequestId = null;
        this.statusCheckInterval = null;
        this.macAddress = this.getMacAddress();
        this.routerId = this.getRouterId();
        this.userToken = localStorage.getItem('userToken');
        this.userData = JSON.parse(localStorage.getItem('userData') || '{}');

        // Carousel state
        this.packages = [];
        this.activeIndex = 0;
        this._dragStartX = 0;
        this._isDragging = false;

        this.initializeElements();
        this.bindEvents();
        this.checkAuthentication();
        if (this.userToken) {
            this.checkExistingSession();
            this.recoverPendingPayment();
        }
    }

    initializeElements() {
        this.loadingState    = document.getElementById('loadingState');
        this.errorState      = document.getElementById('errorState');
        this.carouselSection = document.getElementById('carouselSection');
        this.paymentForm     = document.getElementById('paymentForm');
        this.paymentStatus   = document.getElementById('paymentStatus');

        this.phoneInput      = document.getElementById('phoneInput');
        this.payButton       = document.getElementById('payButton');
        this.backButton      = document.getElementById('backButton');

        this.selectedPackageName     = document.getElementById('selectedPackageName');
        this.selectedPackageDuration = document.getElementById('selectedPackageDuration');
        this.selectedPackagePrice    = document.getElementById('selectedPackagePrice');

        this.paymentPending     = document.getElementById('paymentPending');
        this.paymentSuccess     = document.getElementById('paymentSuccess');
        this.paymentFailed      = document.getElementById('paymentFailed');
        this.checkStatusButton  = document.getElementById('checkStatusButton');
        this.retryPaymentButton = document.getElementById('retryPaymentButton');
        this.newSessionButton   = document.getElementById('newSessionButton');

        this.termsModal       = document.getElementById('termsModal');
        this.termsButton      = document.getElementById('termsButton');
        this.closeTermsButton = document.getElementById('closeTermsButton');
        this.errorMessage     = document.getElementById('errorMessage');
    }

    bindEvents() {
        this.payButton.addEventListener('click', () => this.initiatePayment());

        this.backButton.addEventListener('click', () => {
            this.paymentForm.classList.add('hidden');
            this.currentPackage = null;
            document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected-card'));
        });

        this.checkStatusButton.addEventListener('click', () => this.checkPaymentStatus());
        this.retryPaymentButton.addEventListener('click', () => this.showPackages());
        this.newSessionButton.addEventListener('click', () => this.showPackages());

        this.termsButton.addEventListener('click', () => this.showTerms());
        this.closeTermsButton.addEventListener('click', () => this.hideTerms());
        this.termsModal.addEventListener('click', e => {
            if (e.target === this.termsModal) this.hideTerms();
        });

        this.phoneInput.addEventListener('input', e => this.formatPhoneNumber(e.target));
        this.phoneInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') this.initiatePayment();
        });

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());

        // Carousel arrow buttons
        document.getElementById('prevCard').addEventListener('click', () => this.prevCard());
        document.getElementById('nextCard').addEventListener('click', () => this.nextCard());

        // Keyboard navigation
        document.addEventListener('keydown', e => {
            if (!this.carouselSection.classList.contains('hidden')) {
                if (e.key === 'ArrowLeft')  this.prevCard();
                if (e.key === 'ArrowRight') this.nextCard();
            }
        });

        // Swipe / drag on viewport
        const vp = document.getElementById('carouselViewport');
        this.setupPointerDrag(vp);
    }

    setupPointerDrag(el) {
        const THRESHOLD = 50;

        // Touch
        el.addEventListener('touchstart', e => {
            this._dragStartX = e.touches[0].clientX;
        }, { passive: true });

        el.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - this._dragStartX;
            if (Math.abs(dx) > THRESHOLD) {
                dx < 0 ? this.nextCard() : this.prevCard();
            }
        }, { passive: true });

        // Mouse drag
        el.addEventListener('mousedown', e => {
            this._isDragging = true;
            this._dragStartX = e.clientX;
        });
        el.addEventListener('mouseup', e => {
            if (!this._isDragging) return;
            this._isDragging = false;
            const dx = e.clientX - this._dragStartX;
            if (Math.abs(dx) > THRESHOLD) {
                dx < 0 ? this.nextCard() : this.prevCard();
            }
        });
        el.addEventListener('mouseleave', () => { this._isDragging = false; });
    }

    // ── Authentication ──────────────────────────────────────────────────────

    checkAuthentication() {
        const userInfo     = document.getElementById('userInfo');
        const loginRequired = document.getElementById('loginRequired');
        const userName     = document.getElementById('userName');

        if (this.userToken && this.userData.username) {
            userName.textContent = this.userData.username;
            userInfo.classList.remove('hidden');
            loginRequired.classList.add('hidden');
            this.loadPackages();
        } else {
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

    // ── Helpers ─────────────────────────────────────────────────────────────

    getMacAddress() {
        const p = new URLSearchParams(window.location.search);
        return p.get('mac') || this.generateFakeMac();
    }

    getRouterId() {
        const p = new URLSearchParams(window.location.search);
        return p.get('router') || p.get('routerId') || p.get('router_id') || null;
    }

    generateFakeMac() {
        return Array.from({ length: 6 }, () =>
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
        setTimeout(() => this.errorState.classList.add('hidden'), 5000);
    }

    showTerms() { this.termsModal.classList.remove('hidden'); }
    hideTerms() { this.termsModal.classList.add('hidden'); }

    // ── Section visibility ──────────────────────────────────────────────────

    hideAllSections() {
        [this.loadingState, this.errorState, this.carouselSection,
         this.paymentForm, this.paymentStatus,
         this.paymentPending, this.paymentSuccess, this.paymentFailed]
            .forEach(el => el && el.classList.add('hidden'));
    }

    showLoading() {
        this.hideAllSections();
        this.loadingState.classList.remove('hidden');
    }

    showPackages() {
        this.hideAllSections();
        this.carouselSection.classList.remove('hidden');
        this.currentPackage = null;
        this.checkoutRequestId = null;
        this.clearStatusCheck();
        document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected-card'));
        // Recompute positions now that the section is in the paint tree
        requestAnimationFrame(() => this.updateCarousel());
    }

    showPaymentStatus(status) {
        this.hideAllSections();
        this.paymentStatus.classList.remove('hidden');
        if (status === 'pending') this.paymentPending.classList.remove('hidden');
        else if (status === 'success') this.paymentSuccess.classList.remove('hidden');
        else if (status === 'failed') this.paymentFailed.classList.remove('hidden');
    }

    // ── Carousel ────────────────────────────────────────────────────────────

    renderCarousel(packages) {
        this.packages    = packages;
        this.activeIndex = 0;

        const track = document.getElementById('carouselTrack');
        const dots  = document.getElementById('carouselDots');
        track.innerHTML = '';
        dots.innerHTML  = '';

        packages.forEach((pkg, i) => {
            const card = document.createElement('div');
            card.className = 'plan-card';
            card.dataset.index = i;
            card.innerHTML = this.cardTemplate(pkg);

            card.querySelector('.plan-select-btn').addEventListener('click', e => {
                e.stopPropagation();
                if (i === this.activeIndex) {
                    this.selectPackage(pkg);
                } else {
                    this.goToCard(i);
                }
            });

            card.addEventListener('click', () => {
                if (i !== this.activeIndex) this.goToCard(i);
            });

            track.appendChild(card);

            const dot = document.createElement('button');
            dot.className = 'carousel-dot';
            dot.setAttribute('aria-label', `Plan ${i + 1}`);
            dot.addEventListener('click', () => this.goToCard(i));
            dots.appendChild(dot);
        });

        this.updateCarousel();
        this.updateArrows();
    }

    cardTemplate(pkg) {
        const badge = pkg.name.toUpperCase();
        const speed = pkg.description || 'High-speed access';
        return `
            <div class="plan-badge">${badge}</div>
            <div class="plan-duration">${pkg.duration_display}</div>
            <div class="plan-speed">${speed}</div>
            <div class="plan-price-label">Price</div>
            <div class="plan-price-amount">
                <span class="price-currency">KES</span>${pkg.price_kes}
            </div>
            <button class="plan-select-btn">Select Plan</button>
        `;
    }

    goToCard(index) {
        this.activeIndex = Math.max(0, Math.min(index, this.packages.length - 1));
        this.updateCarousel();
        this.updateArrows();
        // Collapse payment panel when switching plans
        if (this.currentPackage) {
            this.paymentForm.classList.add('hidden');
            this.currentPackage = null;
            document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected-card'));
        }
    }

    nextCard() { this.goToCard(this.activeIndex + 1); }
    prevCard() { this.goToCard(this.activeIndex - 1); }

    updateCarousel() {
        const cards = document.querySelectorAll('.plan-card');
        const dots  = document.querySelectorAll('.carousel-dot');
        if (!cards.length) return;

        // Match CSS clamp(260px, 76vw, 330px) — works even when section is hidden
        const cardWidth = Math.min(330, Math.max(260, window.innerWidth * 0.76));
        const gap = cardWidth * 0.9;

        cards.forEach((card, i) => {
            const offset    = i - this.activeIndex;
            const absOffset = Math.abs(offset);

            const translateX = offset * gap;
            const scale   = absOffset === 0 ? 1 : absOffset === 1 ? 0.84 : 0.72;
            const opacity = absOffset === 0 ? 1 : absOffset === 1 ? 0.48 : 0;
            const zIndex  = 10 - absOffset;

            card.style.transform    = `translate(calc(-50% + ${translateX}px), -50%) scale(${scale})`;
            card.style.opacity      = opacity;
            card.style.zIndex       = zIndex;
            card.style.pointerEvents = absOffset > 1 ? 'none' : 'auto';

            card.classList.toggle('active-card', offset === 0);
        });

        dots.forEach((dot, i) => {
            dot.classList.toggle('dot-active', i === this.activeIndex);
        });
    }

    updateArrows() {
        const prev = document.getElementById('prevCard');
        const next = document.getElementById('nextCard');
        if (prev) prev.disabled = this.activeIndex === 0;
        if (next) next.disabled = this.activeIndex === this.packages.length - 1;
    }

    // ── Package loading & selection ─────────────────────────────────────────

    async loadPackages() {
        try {
            this.showLoading();
            const response = await fetch('/api/portal/packages');
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Failed to load packages');
            this.renderCarousel(data.packages);
            this.showPackages();
        } catch (error) {
            console.error('Error loading packages:', error);
            this.showError('Failed to load packages. Please refresh the page.');
        }
    }

    selectPackage(pkg) {
        this.currentPackage = pkg;

        this.selectedPackageName.textContent     = pkg.name;
        this.selectedPackageDuration.textContent = pkg.duration_display;
        this.selectedPackagePrice.textContent    = `KES ${pkg.price_kes}`;

        // Mark selected card visually
        document.querySelectorAll('.plan-card').forEach((c, i) => {
            c.classList.toggle('selected-card', i === this.activeIndex);
        });

        // Show payment panel below carousel
        this.paymentForm.classList.remove('hidden');
        setTimeout(() => {
            this.paymentForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            this.phoneInput.focus();
        }, 80);
    }

    // ── Payment ─────────────────────────────────────────────────────────────

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

            const headers = { 'Content-Type': 'application/json' };
            if (this.userToken) headers['Authorization'] = `Bearer ${this.userToken}`;

            const response = await fetch('/api/portal/pay', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    phone,
                    packageId:  this.currentPackage.id,
                    macAddress: this.macAddress,
                    routerId:   this.routerId
                })
            });

            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Payment initiation failed');

            this.checkoutRequestId = data.checkoutRequestId;

            localStorage.setItem('pendingPayment', JSON.stringify({
                checkoutRequestId: data.checkoutRequestId,
                amount:      data.amount,
                packageName: data.packageName,
                timestamp:   Date.now()
            }));

            document.getElementById('pendingAmount').textContent  = `KES ${data.amount}`;
            document.getElementById('pendingPackage').textContent = data.packageName;

            this.showPaymentStatus('pending');
            await this.checkPaymentStatus();
            this.startStatusCheck();

        } catch (error) {
            console.error('Payment error:', error);
            this.showError(error.message);
            this.payButton.disabled = false;
            this.payButton.innerHTML = '<span class="material-symbols-outlined text-base" style="font-variation-settings:\'FILL\' 1">smartphone</span> Pay with M-Pesa';
        }
    }

    validatePhoneNumber(phone) {
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('254')) return true;
        if (digits.length === 10 && digits.startsWith('07'))  return true;
        if (digits.length === 9  && digits.startsWith('7'))   return true;
        return false;
    }

    async checkPaymentStatus() {
        if (!this.checkoutRequestId) return;
        try {
            const headers = {};
            if (this.userToken) headers['Authorization'] = `Bearer ${this.userToken}`;
            const response = await fetch(`/api/portal/status/${this.checkoutRequestId}`, { headers });
            const data = await response.json();

            if (!data.success) { console.error('Status check failed:', data.error); return; }

            if (data.status === 'success' && data.session) {
                this.displaySuccessSession(data.session);
                this.showPaymentStatus('success');
                this.clearStatusCheck();
                localStorage.removeItem('pendingPayment');
            } else if (data.status === 'failed' || data.status === 'cancelled') {
                this.showPaymentStatus('failed');
                this.clearStatusCheck();
                localStorage.removeItem('pendingPayment');
            }
        } catch (error) {
            console.error('Status check error:', error);
        }
    }

    displaySuccessSession(session) {
        const expiryDate = new Date(session.expiresAt);
        document.getElementById('sessionExpiry').textContent = expiryDate.toLocaleString();
        this.updateTimeRemaining(session.remainingSeconds);
        this.startCountdown(session.remainingSeconds);
    }

    updateTimeRemaining(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        let t = '';
        if (h > 0) t += `${h}h `;
        if (m > 0) t += `${m}m `;
        t += `${s}s`;
        document.getElementById('timeRemaining').textContent = t;
    }

    startCountdown(initialSeconds) {
        let remaining = initialSeconds;
        let warningShown = false;
        const countdown = setInterval(() => {
            remaining--;
            if (remaining === 300 && !warningShown) {
                this.showError('Your session will expire in 5 minutes');
                warningShown = true;
            }
            if (remaining <= 0) {
                clearInterval(countdown);
                this.updateTimeRemaining(0);
                this.showError('Your session has expired. Redirecting...');
                localStorage.removeItem('pendingPayment');
                setTimeout(() => { this.showPackages(); window.location.reload(); }, 3000);
            } else {
                this.updateTimeRemaining(remaining);
            }
        }, 1000);
    }

    startStatusCheck() {
        this.statusCheckInterval = setInterval(() => this.checkPaymentStatus(), 6000);
        setTimeout(() => this.clearStatusCheck(), 300000);
    }

    clearStatusCheck() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
        }
    }

    async checkExistingSession() {
        try {
            const headers = {};
            if (this.userToken) headers['Authorization'] = `Bearer ${this.userToken}`;
            const response = await fetch(`/api/portal/device/${encodeURIComponent(this.macAddress)}`, { headers });
            const data = await response.json();
            if (data.success && data.hasActiveSession && data.session) {
                this.displaySuccessSession(data.session);
                this.showPaymentStatus('success');
            }
        } catch (error) {
            console.error('Error checking existing session:', error);
        }
    }

    recoverPendingPayment() {
        try {
            const raw = localStorage.getItem('pendingPayment');
            if (!raw) return;
            const payment = JSON.parse(raw);
            if (Date.now() - payment.timestamp < 600000) {
                this.checkoutRequestId = payment.checkoutRequestId;
                const amountEl  = document.getElementById('pendingAmount');
                const packageEl = document.getElementById('pendingPackage');
                if (amountEl)  amountEl.textContent  = `KES ${payment.amount}`;
                if (packageEl) packageEl.textContent  = payment.packageName;
                this.showPaymentStatus('pending');
                this.startStatusCheck();
            } else {
                localStorage.removeItem('pendingPayment');
            }
        } catch (error) {
            console.error('Error recovering pending payment:', error);
            localStorage.removeItem('pendingPayment');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const portal = new WiFiPortal();
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => portal.updateCarousel(), 120);
    });
});

document.addEventListener('visibilitychange', () => {});
window.addEventListener('online',  () => {});
window.addEventListener('offline', () => {});
