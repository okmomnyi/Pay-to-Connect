/**
 * Tests for MikroTikService
 *
 * Covers the main connection and hotspot operations.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockWrite = jest.fn();
const mockClose = jest.fn();

jest.mock('node-routeros-v2', () => ({
    RouterOSAPI: jest.fn().mockImplementation(() => ({
        connect: mockConnect,
        write: mockWrite,
        close: mockClose,
    })),
}));

jest.mock('../database/connection', () => ({
    __esModule: true,
    default: { getInstance: () => ({ query: mockQuery }) },
}));

jest.mock('../utils/logger', () => ({
    logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/encryption', () => ({
    __esModule: true,
    default: { decrypt: jest.fn().mockReturnValue('decrypted-password') },
}));

jest.mock('./auditService', () => ({
    __esModule: true,
    default: { logRouterOperation: jest.fn().mockResolvedValue(undefined) },
}));

// ── Subject under test ────────────────────────────────────────────────────────

import service from './mikrotikService';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROUTER_ID = 'router-uuid-001';
const ADMIN_ID  = 'admin-uuid-001';

function credRow(overrides: Record<string, any> = {}) {
    return {
        router_id: ROUTER_ID, api_username: 'admin',
        api_password_encrypted: 'enc', encryption_iv: 'iv', encryption_auth_tag: 'tag',
        ip_address: '192.168.88.1', api_port: 8728, connection_timeout: 5000,
        ...overrides,
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MikroTikService', () => {
    beforeEach(() => {
        mockQuery.mockReset();
        mockConnect.mockReset();
        mockWrite.mockReset();
        mockClose.mockReset();
        mockConnect.mockResolvedValue(undefined);
        mockClose.mockResolvedValue(undefined);
        mockQuery.mockResolvedValue({ rows: [] });
    });

    describe('testConnection', () => {
        it('returns success with router identity on a good connection', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [credRow()] });
            mockWrite.mockResolvedValueOnce([{ name: 'SmartWiFi-R1' }]);

            const result = await service.testConnection(ROUTER_ID, ADMIN_ID);

            expect(result.success).toBe(true);
            expect(result.details).toEqual([{ name: 'SmartWiFi-R1' }]);
        });

        it('returns failure when credentials are not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const result = await service.testConnection(ROUTER_ID, ADMIN_ID);

            expect(result.success).toBe(false);
        });

        it('returns failure when the router is unreachable', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [credRow()] });
            mockConnect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

            const result = await service.testConnection(ROUTER_ID, ADMIN_ID);

            expect(result.success).toBe(false);
        });
    });

    describe('createHotspotUser', () => {
        const user = { username: 'alice', password: 'pass123', profile: 'pkg_basic' };

        it('returns success when the user is created on the router', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [credRow()] });
            mockWrite.mockResolvedValueOnce([]);

            const result = await service.createHotspotUser(ROUTER_ID, ADMIN_ID, user);

            expect(result.success).toBe(true);
            expect(mockWrite).toHaveBeenCalledWith('/ip/hotspot/user/add', expect.objectContaining({ name: 'alice' }));
        });

        it('returns failure when the router rejects the command', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [credRow()] });
            mockWrite.mockRejectedValueOnce(new Error('user already exists'));

            const result = await service.createHotspotUser(ROUTER_ID, ADMIN_ID, user);

            expect(result.success).toBe(false);
            expect(result.message).toMatch(/already exists/);
        });
    });

    describe('getSystemInfo', () => {
        it('returns structured info when the router responds', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [credRow()] });
            mockWrite
                .mockResolvedValueOnce([{ name: 'MyRouter' }])
                .mockResolvedValueOnce([{ uptime: '1d', version: '7.10', 'cpu-load': '5',
                    'total-memory': '64000000', 'free-memory': '32000000',
                    'total-hdd-space': '128000000', 'free-hdd-space': '64000000',
                    'board-name': 'hAP ac²', 'architecture-name': 'arm' }])
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ name: 'ether1', type: 'ether', running: 'true', disabled: 'false', 'mac-address': 'AA:BB:CC:DD:EE:FF' }]);

            const result = await service.getSystemInfo(ROUTER_ID);

            expect(result.success).toBe(true);
            expect(result.info?.identity).toBe('MyRouter');
            expect(result.info?.interfaces).toHaveLength(1);
        });

        it('returns failure when the router is unavailable', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const result = await service.getSystemInfo(ROUTER_ID);

            expect(result.success).toBe(false);
        });
    });
});
