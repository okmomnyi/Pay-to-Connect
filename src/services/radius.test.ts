/**
 * Tests for RADIUS access-request handling (RadiusService)
 *
 * Focuses on:
 *  - Access-Request from a known router with an active session  → Access-Accept
 *  - Access-Request from a known router with no session          → Access-Reject
 *  - Packet from an unknown (not in DB) router IP                → null (drop)
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

// ── Subject under test ────────────────────────────────────────────────────────

import RadiusService from './radius';
import * as crypto from 'crypto';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROUTER_IP  = '192.168.1.1';
const ROUTER_ID  = 'router-uuid-001';
const RADIUS_SECRET = 'test-radius-secret';
const MAC_ADDRESS   = 'aa:bb:cc:dd:ee:ff';

/** Build a minimal RADIUS Access-Request buffer */
function buildAccessRequest(macAddress: string, identifier = 1): Buffer {
    // User-Name attribute (type 1)
    const macBuf = Buffer.from(macAddress, 'utf8');
    const attrLen = 2 + macBuf.length;
    const totalLen = 20 + attrLen;

    const pkt = Buffer.alloc(totalLen);
    pkt.writeUInt8(1, 0);                  // Code: Access-Request
    pkt.writeUInt8(identifier, 1);         // Identifier
    pkt.writeUInt16BE(totalLen, 2);        // Length

    // Random 16-byte request authenticator
    const auth = crypto.randomBytes(16);
    auth.copy(pkt, 4);

    // User-Name attribute
    pkt.writeUInt8(1, 20);                 // Type: User-Name
    pkt.writeUInt8(attrLen, 21);           // Length
    macBuf.copy(pkt, 22);

    return pkt;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RadiusService.handleRadiusRequest', () => {
    let service: RadiusService;

    beforeEach(() => {
        process.env.RADIUS_SECRET = RADIUS_SECRET;
        mockQuery.mockReset();

        // loadRouters() is called in constructor — resolve with one known router
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: ROUTER_ID, ip_address: ROUTER_IP }],
        });

        service = new RadiusService();
    });

    it('returns Access-Accept (code 2) when the device has an active session', async () => {
        // authorizeDevice query — active session found
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'session-uuid-001',
                remaining_seconds: 3600,
                package_name: 'Basic'
            }],
        });

        const request = buildAccessRequest(MAC_ADDRESS);
        const response = await service.handleRadiusRequest(request, ROUTER_IP);

        expect(response).not.toBeNull();
        expect(response!.readUInt8(0)).toBe(2); // Access-Accept
    });

    it('returns Access-Reject (code 3) when the device has no active session', async () => {
        // authorizeDevice query — no session
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const request = buildAccessRequest(MAC_ADDRESS);
        const response = await service.handleRadiusRequest(request, ROUTER_IP);

        expect(response).not.toBeNull();
        expect(response!.readUInt8(0)).toBe(3); // Access-Reject
    });

    it('returns null for requests from unknown router IPs', async () => {
        const request = buildAccessRequest(MAC_ADDRESS);
        const response = await service.handleRadiusRequest(request, '10.0.0.99');

        expect(response).toBeNull();
    });

    it('includes Session-Timeout attribute in Access-Accept', async () => {
        const EXPECTED_TIMEOUT = 7200;

        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'session-uuid-002',
                remaining_seconds: EXPECTED_TIMEOUT,
                package_name: 'Premium'
            }],
        });

        const request = buildAccessRequest(MAC_ADDRESS);
        const response = await service.handleRadiusRequest(request, ROUTER_IP);

        expect(response).not.toBeNull();
        expect(response!.readUInt8(0)).toBe(2); // Access-Accept

        // Parse attributes starting at offset 20
        let offset = 20;
        let foundSessionTimeout = false;
        while (offset + 2 <= response!.length) {
            const type = response!.readUInt8(offset);
            const len  = response!.readUInt8(offset + 1);
            if (type === 27 && len === 6) { // Session-Timeout (27), 4-byte value
                const value = response!.readUInt32BE(offset + 2);
                expect(value).toBe(EXPECTED_TIMEOUT);
                foundSessionTimeout = true;
                break;
            }
            offset += Math.max(len, 2);
        }
        expect(foundSessionTimeout).toBe(true);
    });
});
