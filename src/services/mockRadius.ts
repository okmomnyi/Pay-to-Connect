import { logger } from '../utils/logger';

interface MockSessionResult {
    success: boolean;
    sessionId?: string;
    error?: string;
}

interface MockSession {
    id: string;
    macAddress: string;
    packageId: string;
    paymentId: string;
    startTime: Date;
    endTime: Date;
    active: boolean;
}

class MockRadiusService {
    private mockSessions: Map<string, MockSession> = new Map();
    private mockPackages: Map<string, any> = new Map();

    constructor() {
        logger.info('Using Mock RADIUS Service for serverless environment');
        this.initializeMockPackages();
    }

    private initializeMockPackages() {
        // Initialize test packages
        const packages = [
            { id: '550e8400-e29b-41d4-a716-446655440001', name: '1 Hour Basic', duration_minutes: 60, price_kes: 10 },
            { id: '550e8400-e29b-41d4-a716-446655440002', name: '3 Hours Standard', duration_minutes: 180, price_kes: 25 },
            { id: '550e8400-e29b-41d4-a716-446655440003', name: '24 Hours Premium', duration_minutes: 1440, price_kes: 50 },
            { id: '550e8400-e29b-41d4-a716-446655440004', name: '7 Days Unlimited', duration_minutes: 10080, price_kes: 200 }
        ];

        packages.forEach(pkg => {
            this.mockPackages.set(pkg.id, pkg);
        });
    }

    public async createSession(macAddress: string, packageId: string, paymentId: string, routerIp: string): Promise<MockSessionResult> {
        try {
            const packageData = this.mockPackages.get(packageId);
            if (!packageData) {
                return {
                    success: false,
                    error: 'Package not found'
                };
            }

            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const startTime = new Date();
            const endTime = new Date(startTime.getTime() + (packageData.duration_minutes * 60 * 1000));

            const session: MockSession = {
                id: sessionId,
                macAddress,
                packageId,
                paymentId,
                startTime,
                endTime,
                active: true
            };

            this.mockSessions.set(macAddress, session);

            logger.info(`Mock session created: ${sessionId} for MAC: ${macAddress}, expires: ${endTime.toISOString()}`);

            return {
                success: true,
                sessionId
            };
        } catch (error) {
            logger.error('Failed to create mock session:', error);
            return {
                success: false,
                error: 'Failed to create session'
            };
        }
    }

    public async getActiveSession(macAddress: string): Promise<MockSession | null> {
        const session = this.mockSessions.get(macAddress);
        
        if (!session || !session.active || new Date() > session.endTime) {
            return null;
        }

        return session;
    }

    public async expireOldSessions(): Promise<void> {
        const now = new Date();
        for (const [macAddress, session] of this.mockSessions.entries()) {
            if (session.active && now > session.endTime) {
                session.active = false;
                logger.info(`Mock session expired: ${session.id} for MAC: ${macAddress}`);
            }
        }
    }

    public startRadiusServer(port: number): void {
        logger.info(`Mock RADIUS server started on port ${port} (simulation only)`);
    }

    public async authenticateDevice(macAddress: string): Promise<boolean> {
        const session = await this.getActiveSession(macAddress);
        return session !== null;
    }
}

export default MockRadiusService;
