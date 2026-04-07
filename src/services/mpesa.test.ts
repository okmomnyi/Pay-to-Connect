/**
 * Tests for M-Pesa callback handling (MpesaService.handleCallback)
 *
 * The service queries the DB — we mock DatabaseConnection to avoid needing a live database.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();

jest.mock('../database/connection', () => ({
    __esModule: true,
    default: {
        getInstance: () => ({ query: mockQuery }),
    },
}));

// Silence logger output during tests
jest.mock('../utils/logger', () => ({
    logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// ── Subject under test ────────────────────────────────────────────────────────

// Import AFTER mocks are set up
import MpesaService from './mpesa';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHECKOUT_ID = 'ws_CO_123456789';
const PAYMENT_ID  = 'payment-uuid-001';

function makeSuccessPayload(checkoutId = CHECKOUT_ID) {
    return {
        Body: {
            stkCallback: {
                CheckoutRequestID: checkoutId,
                ResultCode: 0,
                ResultDesc: 'The service request is processed successfully.',
                CallbackMetadata: {
                    Item: [
                        { Name: 'Amount', Value: 100 },
                        { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
                        { Name: 'TransactionDate', Value: 20231101095836 },
                        { Name: 'PhoneNumber', Value: 254712345678 },
                    ],
                },
            },
        },
    } as any;
}

function makeFailedPayload(checkoutId = CHECKOUT_ID, resultCode = 1032) {
    return {
        Body: {
            stkCallback: {
                CheckoutRequestID: checkoutId,
                ResultCode: resultCode,
                ResultDesc: 'Request cancelled by user',
            },
        },
    } as any;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MpesaService.handleCallback', () => {
    let service: MpesaService;

    beforeEach(() => {
        // MpesaService constructor calls db.query only lazily — safe to create here.
        service = new MpesaService();
        mockQuery.mockReset();
    });

    it('returns success and paymentId when ResultCode is 0 (successful payment)', async () => {
        // First query: find the pending payment record
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: PAYMENT_ID, status: 'pending' }],
        });
        // Second query: UPDATE payment record
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await service.handleCallback(makeSuccessPayload());

        expect(result.success).toBe(true);
        expect(result.paymentId).toBe(PAYMENT_ID);

        // Verify the UPDATE was called with status='success' and a receipt number
        const updateCall = mockQuery.mock.calls[1];
        expect(updateCall[1][0]).toBe('success');
        expect(updateCall[1][1]).toBe('NLJ7RT61SV');
    });

    it('marks payment as failed when ResultCode is non-zero', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: PAYMENT_ID, status: 'pending' }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await service.handleCallback(makeFailedPayload());

        expect(result.success).toBe(true);
        expect(result.paymentId).toBe(PAYMENT_ID);

        const updateCall = mockQuery.mock.calls[1];
        expect(updateCall[1][0]).toBe('failed');
        expect(updateCall[1][1]).toBeNull(); // no receipt for failed payment
    });

    it('returns success immediately when payment was already processed (idempotency)', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: PAYMENT_ID, status: 'success' }],
        });

        const result = await service.handleCallback(makeSuccessPayload());

        expect(result.success).toBe(true);
        expect(result.paymentId).toBe(PAYMENT_ID);
        // No UPDATE should have been issued
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('returns failure when no payment record is found for the CheckoutRequestID', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await service.handleCallback(makeSuccessPayload());

        expect(result.success).toBe(false);
        expect(result.paymentId).toBeUndefined();
    });

    it('returns failure when the DB throws an error', async () => {
        mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

        const result = await service.handleCallback(makeSuccessPayload());

        expect(result.success).toBe(false);
    });
});
