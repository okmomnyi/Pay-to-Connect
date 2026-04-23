/**
 * Tests for AdminAuthService.login
 *
 * The service compares bcrypt hashes, creates sessions in the DB, and logs audit events.
 * We mock the DB and audit service so no real database is required.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();

jest.mock('../database/connection', () => ({
    __esModule: true,
    default: {
        getInstance: () => ({ query: mockQuery }),
    },
}));

jest.mock('../utils/logger', () => ({
    logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../services/auditService', () => ({
    __esModule: true,
    default: {
        logAction: jest.fn().mockResolvedValue(undefined),
        logSecurityEvent: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('../utils/encryption', () => ({
    __esModule: true,
    default: {
        generateToken: jest.fn().mockReturnValue('mock-token-64-chars'),
        hash: jest.fn().mockReturnValue('mock-token-hash'),
    },
}));

// ── Subject under test ────────────────────────────────────────────────────────

import bcrypt from 'bcrypt';
import adminAuthService from './adminAuth';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ADMIN_ID = 'admin-uuid-001';

/** Create a valid bcrypt hash (use a low cost factor for fast tests) */
async function makeAdmin(overrides: Record<string, unknown> = {}) {
    const passwordHash = await bcrypt.hash('Password123!', 4);
    return {
        id: ADMIN_ID,
        username: 'testadmin',
        email: 'admin@example.com',
        full_name: 'Test Admin',
        password_hash: passwordHash,
        active: true,
        locked: false,
        failed_login_attempts: 0,
        permissions: ['admin.view', 'router.view'],
        ...overrides,
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdminAuthService.login', () => {
    const IP = '127.0.0.1';
    const UA = 'TestBrowser/1.0';

    beforeEach(() => {
        mockQuery.mockReset();
        jest.clearAllMocks();
    });

    it('returns success with a token when credentials are correct', async () => {
        const admin = await makeAdmin();

        // First query: SELECT admin user
        mockQuery.mockResolvedValueOnce({ rows: [admin] });
        // Second query: UPDATE failed_login_attempts → reset to 0
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // Third query: INSERT admin_sessions
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await adminAuthService.login('testadmin', 'Password123!', IP, UA);

        expect(result.success).toBe(true);
        expect(result.token).toBe('mock-token-64-chars');
        expect(result.admin?.username).toBe('testadmin');
    });

    it('returns failure when password is wrong', async () => {
        const admin = await makeAdmin();

        mockQuery.mockResolvedValueOnce({ rows: [admin] });
        // UPDATE to increment failed_login_attempts
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await adminAuthService.login('testadmin', 'WrongPassword!', IP, UA);

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/credentials/i);
    });

    it('returns failure for a non-existent username', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] }); // user not found

        const result = await adminAuthService.login('nobody', 'Password123!', IP, UA);

        expect(result.success).toBe(false);
    });

    it('returns failure and a specific message when account is inactive', async () => {
        const admin = await makeAdmin({ active: false });
        mockQuery.mockResolvedValueOnce({ rows: [admin] });

        const result = await adminAuthService.login('testadmin', 'Password123!', IP, UA);

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/inactive/i);
    });

    it('returns failure and a specific message when account is locked', async () => {
        const admin = await makeAdmin({ locked: true });
        mockQuery.mockResolvedValueOnce({ rows: [admin] });

        const result = await adminAuthService.login('testadmin', 'Password123!', IP, UA);

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/locked/i);
    });

    it('locks the account after 5 consecutive wrong passwords', async () => {
        // Admin already has 4 failed attempts — one more wrong password should trigger lock
        const admin = await makeAdmin({ failed_login_attempts: 4 });

        mockQuery.mockResolvedValueOnce({ rows: [admin] }); // SELECT admin
        mockQuery.mockResolvedValueOnce({ rows: [] });       // UPDATE failed_login_attempts + locked

        const result = await adminAuthService.login('testadmin', 'WrongPassword!', IP, UA);

        expect(result.success).toBe(false);
        expect(result.message).toMatch(/locked/i);

        // The UPDATE should have been called with locked = true
        const updateCall = mockQuery.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].includes('locked')
        );
        expect(updateCall).toBeDefined();
        // params: [newFailedAttempts=5, locked=true, adminId]
        expect(updateCall![1]).toContain(true);
    });

    it('returns failure gracefully when the DB throws', async () => {
        mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

        const result = await adminAuthService.login('testadmin', 'Password123!', IP, UA);

        expect(result.success).toBe(false);
    });
});
