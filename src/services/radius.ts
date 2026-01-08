import * as dgram from 'dgram';
import * as crypto from 'crypto';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';

interface RadiusPacket {
    code: number;
    identifier: number;
    length: number;
    authenticator: Buffer;
    attributes: RadiusAttribute[];
}

interface RadiusAttribute {
    type: number;
    length: number;
    value: Buffer;
}

interface RouterConfig {
    id: string;
    ip: string;
    secret: string;
}

interface SessionData {
    username: string;
    sessionTimeout: number;
    macAddress: string;
    ipAddress?: string;
}

class RadiusService {
    private db: DatabaseConnection;
    private routers: Map<string, RouterConfig> = new Map();

    // RADIUS Packet Types
    private readonly RADIUS_CODES = {
        ACCESS_REQUEST: 1,
        ACCESS_ACCEPT: 2,
        ACCESS_REJECT: 3,
        ACCOUNTING_REQUEST: 4,
        ACCOUNTING_RESPONSE: 5,
        ACCESS_CHALLENGE: 11,
        STATUS_SERVER: 12,
        STATUS_CLIENT: 13
    };

    // RADIUS Attribute Types
    private readonly RADIUS_ATTRIBUTES = {
        USER_NAME: 1,
        USER_PASSWORD: 2,
        CHAP_PASSWORD: 3,
        NAS_IP_ADDRESS: 4,
        NAS_PORT: 5,
        SERVICE_TYPE: 6,
        FRAMED_PROTOCOL: 7,
        FRAMED_IP_ADDRESS: 8,
        FRAMED_IP_NETMASK: 9,
        FRAMED_ROUTING: 10,
        FILTER_ID: 11,
        FRAMED_MTU: 12,
        FRAMED_COMPRESSION: 13,
        LOGIN_IP_HOST: 14,
        LOGIN_SERVICE: 15,
        LOGIN_TCP_PORT: 16,
        REPLY_MESSAGE: 18,
        CALLBACK_NUMBER: 19,
        CALLBACK_ID: 20,
        FRAMED_ROUTE: 22,
        FRAMED_IPX_NETWORK: 23,
        STATE: 24,
        CLASS: 25,
        VENDOR_SPECIFIC: 26,
        SESSION_TIMEOUT: 27,
        IDLE_TIMEOUT: 28,
        TERMINATION_ACTION: 29,
        CALLED_STATION_ID: 30,
        CALLING_STATION_ID: 31,
        NAS_IDENTIFIER: 32,
        PROXY_STATE: 33,
        LOGIN_LAT_SERVICE: 34,
        LOGIN_LAT_NODE: 35,
        LOGIN_LAT_GROUP: 36,
        FRAMED_APPLETALK_LINK: 37,
        FRAMED_APPLETALK_NETWORK: 38,
        FRAMED_APPLETALK_ZONE: 39,
        ACCT_STATUS_TYPE: 40,
        ACCT_DELAY_TIME: 41,
        ACCT_INPUT_OCTETS: 42,
        ACCT_OUTPUT_OCTETS: 43,
        ACCT_SESSION_ID: 44,
        ACCT_AUTHENTIC: 45,
        ACCT_SESSION_TIME: 46,
        ACCT_INPUT_PACKETS: 47,
        ACCT_OUTPUT_PACKETS: 48,
        ACCT_TERMINATE_CAUSE: 49,
        ACCT_MULTI_SESSION_ID: 50,
        ACCT_LINK_COUNT: 51,
        CHAP_CHALLENGE: 60,
        NAS_PORT_TYPE: 61,
        PORT_LIMIT: 62,
        LOGIN_LAT_PORT: 63
    };

    constructor() {
        this.db = DatabaseConnection.getInstance();
        this.loadRouters();
    }

    private async loadRouters(): Promise<void> {
        try {
            const result = await this.db.query(
                'SELECT id, ip_address, shared_secret FROM routers WHERE active = true'
            );

            this.routers.clear();
            result.rows.forEach((router: any) => {
                this.routers.set(router.ip_address, {
                    id: router.id,
                    ip: router.ip_address,
                    secret: router.shared_secret
                });
            });

            logger.info(`Loaded ${this.routers.size} active routers`);
        } catch (error) {
            logger.error('Failed to load routers:', error);
        }
    }

    private createRadiusPacket(code: number, identifier: number, authenticator: Buffer, attributes: RadiusAttribute[]): Buffer {
        let totalLength = 20; // Header length
        attributes.forEach(attr => {
            totalLength += attr.length;
        });

        const packet = Buffer.alloc(totalLength);
        let offset = 0;

        // Header
        packet.writeUInt8(code, offset++);
        packet.writeUInt8(identifier, offset++);
        packet.writeUInt16BE(totalLength, offset);
        offset += 2;
        authenticator.copy(packet, offset);
        offset += 16;

        // Attributes
        attributes.forEach(attr => {
            packet.writeUInt8(attr.type, offset++);
            packet.writeUInt8(attr.length, offset++);
            attr.value.copy(packet, offset);
            offset += attr.value.length;
        });

        return packet;
    }

    private parseRadiusPacket(buffer: Buffer): RadiusPacket {
        const packet: RadiusPacket = {
            code: buffer.readUInt8(0),
            identifier: buffer.readUInt8(1),
            length: buffer.readUInt16BE(2),
            authenticator: buffer.slice(4, 20),
            attributes: []
        };

        let offset = 20;
        while (offset < packet.length) {
            const type = buffer.readUInt8(offset);
            const length = buffer.readUInt8(offset + 1);
            const value = buffer.slice(offset + 2, offset + length);

            packet.attributes.push({ type, length, value });
            offset += length;
        }

        return packet;
    }

    private createAttribute(type: number, value: Buffer | string | number): RadiusAttribute {
        let valueBuffer: Buffer;

        if (Buffer.isBuffer(value)) {
            valueBuffer = value;
        } else if (typeof value === 'string') {
            valueBuffer = Buffer.from(value, 'utf8');
        } else if (typeof value === 'number') {
            valueBuffer = Buffer.alloc(4);
            valueBuffer.writeUInt32BE(value, 0);
        } else {
            throw new Error('Invalid attribute value type');
        }

        return {
            type,
            length: valueBuffer.length + 2,
            value: valueBuffer
        };
    }

    private calculateResponseAuthenticator(packet: Buffer, requestAuthenticator: Buffer, secret: string): Buffer {
        const hash = crypto.createHash('md5');
        hash.update(packet.slice(0, 4)); // Code, Identifier, Length
        hash.update(requestAuthenticator);
        hash.update(packet.slice(20)); // Attributes
        hash.update(secret);
        return hash.digest();
    }

    public async authorizeDevice(macAddress: string, nasIpAddress: string): Promise<{ authorized: boolean; sessionTimeout?: number; sessionId?: string }> {
        try {
            // Check if device has active session
            const sessionResult = await this.db.query(`
                SELECT s.id, s.end_time, p.name as package_name, 
                       EXTRACT(EPOCH FROM (s.end_time - NOW()))::INTEGER as remaining_seconds
                FROM sessions s
                JOIN packages p ON s.package_id = p.id
                JOIN devices d ON s.device_id = d.id
                WHERE d.mac_address = $1 AND s.active = true AND s.end_time > NOW()
                ORDER BY s.created_at DESC
                LIMIT 1
            `, [macAddress]);

            if (sessionResult.rows.length === 0) {
                logger.info(`No active session found for MAC: ${macAddress}`);
                return { authorized: false };
            }

            const session = sessionResult.rows[0];
            const sessionTimeout = Math.max(session.remaining_seconds, 60); // Minimum 1 minute

            logger.info(`Device ${macAddress} authorized with ${sessionTimeout} seconds remaining`);

            return {
                authorized: true,
                sessionTimeout,
                sessionId: session.id
            };
        } catch (error) {
            logger.error('Failed to authorize device:', error);
            return { authorized: false };
        }
    }

    public async createSession(deviceMacAddress: string, packageId: string, paymentId: string, routerIp: string): Promise<{ success: boolean; sessionId?: string; error?: string }> {
        try {
            return await this.db.transaction(async (client) => {
                // Get or create device
                let deviceResult = await client.query(
                    'SELECT id FROM devices WHERE mac_address = $1',
                    [deviceMacAddress]
                );

                let deviceId: string;
                if (deviceResult.rows.length === 0) {
                    const newDevice = await client.query(
                        'INSERT INTO devices (mac_address) VALUES ($1) RETURNING id',
                        [deviceMacAddress]
                    );
                    deviceId = newDevice.rows[0].id;
                } else {
                    deviceId = deviceResult.rows[0].id;
                    // Update last seen
                    await client.query(
                        'UPDATE devices SET last_seen = NOW() WHERE id = $1',
                        [deviceId]
                    );
                }

                // Get package details
                const packageResult = await client.query(
                    'SELECT duration_minutes FROM packages WHERE id = $1 AND active = true',
                    [packageId]
                );

                if (packageResult.rows.length === 0) {
                    return { success: false, error: 'Package not found or inactive' };
                }

                const durationMinutes = packageResult.rows[0].duration_minutes;

                // Get router ID
                const routerResult = await client.query(
                    'SELECT id FROM routers WHERE ip_address = $1 AND active = true',
                    [routerIp]
                );

                if (routerResult.rows.length === 0) {
                    return { success: false, error: 'Router not found or inactive' };
                }

                const routerId = routerResult.rows[0].id;

                // Deactivate any existing sessions for this device
                await client.query(
                    'UPDATE sessions SET active = false WHERE device_id = $1 AND active = true',
                    [deviceId]
                );

                // Create new session
                const endTime = new Date(Date.now() + durationMinutes * 60 * 1000);
                const sessionResult = await client.query(`
                    INSERT INTO sessions (device_id, package_id, payment_id, router_id, end_time)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id
                `, [deviceId, packageId, paymentId, routerId, endTime]);

                const sessionId = sessionResult.rows[0].id;

                logger.info(`Created session ${sessionId} for device ${deviceMacAddress}, expires at ${endTime.toISOString()}`);

                return { success: true, sessionId };
            });
        } catch (error) {
            logger.error('Failed to create session:', error);
            return { success: false, error: 'Failed to create session' };
        }
    }

    public async handleRadiusRequest(buffer: Buffer, remoteAddress: string): Promise<Buffer | null> {
        try {
            const router = this.routers.get(remoteAddress);
            if (!router) {
                logger.warn(`RADIUS request from unknown router: ${remoteAddress}`);
                return null;
            }

            const packet = this.parseRadiusPacket(buffer);
            
            if (packet.code === this.RADIUS_CODES.ACCESS_REQUEST) {
                return await this.handleAccessRequest(packet, router);
            } else if (packet.code === this.RADIUS_CODES.ACCOUNTING_REQUEST) {
                return await this.handleAccountingRequest(packet, router);
            }

            return null;
        } catch (error) {
            logger.error('Failed to handle RADIUS request:', error);
            return null;
        }
    }

    private async handleAccessRequest(packet: RadiusPacket, router: RouterConfig): Promise<Buffer> {
        try {
            // Extract username (MAC address) from attributes
            const userNameAttr = packet.attributes.find(attr => attr.type === this.RADIUS_ATTRIBUTES.USER_NAME);
            const callingStationAttr = packet.attributes.find(attr => attr.type === this.RADIUS_ATTRIBUTES.CALLING_STATION_ID);

            let macAddress = '';
            if (userNameAttr) {
                macAddress = userNameAttr.value.toString('utf8');
            } else if (callingStationAttr) {
                macAddress = callingStationAttr.value.toString('utf8');
            }

            if (!macAddress) {
                logger.warn('No MAC address found in RADIUS request');
                return this.createAccessReject(packet, router.secret);
            }

            // Normalize MAC address format
            macAddress = macAddress.toLowerCase().replace(/[:-]/g, '');
            macAddress = macAddress.match(/.{2}/g)?.join(':') || macAddress;

            const authResult = await this.authorizeDevice(macAddress, router.ip);

            if (authResult.authorized && authResult.sessionTimeout) {
                return this.createAccessAccept(packet, router.secret, authResult.sessionTimeout);
            } else {
                return this.createAccessReject(packet, router.secret);
            }
        } catch (error) {
            logger.error('Failed to handle access request:', error);
            return this.createAccessReject(packet, router.secret);
        }
    }

    private async handleAccountingRequest(packet: RadiusPacket, router: RouterConfig): Promise<Buffer> {
        try {
            // For now, just acknowledge accounting requests
            // In production, you might want to log session start/stop events
            
            const attributes: RadiusAttribute[] = [];
            
            const responsePacket = this.createRadiusPacket(
                this.RADIUS_CODES.ACCOUNTING_RESPONSE,
                packet.identifier,
                Buffer.alloc(16), // Will be replaced with proper authenticator
                attributes
            );

            // Calculate response authenticator
            const authenticator = this.calculateResponseAuthenticator(
                responsePacket,
                packet.authenticator,
                router.secret
            );
            authenticator.copy(responsePacket, 4);

            return responsePacket;
        } catch (error) {
            logger.error('Failed to handle accounting request:', error);
            throw error;
        }
    }

    private createAccessAccept(packet: RadiusPacket, secret: string, sessionTimeout: number): Buffer {
        const attributes: RadiusAttribute[] = [
            this.createAttribute(this.RADIUS_ATTRIBUTES.SESSION_TIMEOUT, sessionTimeout),
            this.createAttribute(this.RADIUS_ATTRIBUTES.SERVICE_TYPE, 1), // Framed
        ];

        const responsePacket = this.createRadiusPacket(
            this.RADIUS_CODES.ACCESS_ACCEPT,
            packet.identifier,
            Buffer.alloc(16), // Will be replaced with proper authenticator
            attributes
        );

        // Calculate response authenticator
        const authenticator = this.calculateResponseAuthenticator(
            responsePacket,
            packet.authenticator,
            secret
        );
        authenticator.copy(responsePacket, 4);

        return responsePacket;
    }

    private createAccessReject(packet: RadiusPacket, secret: string): Buffer {
        const attributes: RadiusAttribute[] = [
            this.createAttribute(this.RADIUS_ATTRIBUTES.REPLY_MESSAGE, 'Access denied - no valid session')
        ];

        const responsePacket = this.createRadiusPacket(
            this.RADIUS_CODES.ACCESS_REJECT,
            packet.identifier,
            Buffer.alloc(16), // Will be replaced with proper authenticator
            attributes
        );

        // Calculate response authenticator
        const authenticator = this.calculateResponseAuthenticator(
            responsePacket,
            packet.authenticator,
            secret
        );
        authenticator.copy(responsePacket, 4);

        return responsePacket;
    }

    public startRadiusServer(port: number = 1812): void {
        const server = dgram.createSocket('udp4');

        server.on('message', async (msg, rinfo) => {
            try {
                const response = await this.handleRadiusRequest(msg, rinfo.address);
                if (response) {
                    server.send(response, rinfo.port, rinfo.address);
                }
            } catch (error) {
                logger.error('Error processing RADIUS message:', error);
            }
        });

        server.on('listening', () => {
            const address = server.address();
            logger.info(`RADIUS server listening on ${address?.address}:${address?.port}`);
        });

        server.on('error', (err) => {
            logger.error('RADIUS server error:', err);
        });

        server.bind(port);
    }

    public async expireOldSessions(): Promise<void> {
        try {
            const result = await this.db.query(`
                UPDATE sessions 
                SET active = false 
                WHERE active = true AND end_time <= NOW()
                RETURNING id
            `);

            if (result.rows.length > 0) {
                logger.info(`Expired ${result.rows.length} sessions`);
            }
        } catch (error) {
            logger.error('Failed to expire old sessions:', error);
        }
    }

    public async disconnectDevice(macAddress: string): Promise<void> {
        try {
            logger.info(`Disconnecting device: ${macAddress}`);
            
            // Update session to inactive
            await this.db.query(`
                UPDATE sessions s
                SET active = false
                FROM devices d
                WHERE s.device_id = d.id 
                AND d.mac_address = $1 
                AND s.active = true
            `, [macAddress]);

            // In a real implementation, this would send a RADIUS Disconnect-Request
            // to the NAS/router to immediately terminate the user's session
            logger.info(`Device ${macAddress} disconnected successfully`);
        } catch (error) {
            logger.error(`Failed to disconnect device ${macAddress}:`, error);
            throw error;
        }
    }
}

export default RadiusService;
