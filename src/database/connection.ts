import { Pool, PoolClient } from 'pg';
import { createClient, RedisClientType } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

class DatabaseConnection {
    private static instance: DatabaseConnection;
    private pool: Pool;
    private redisClient: RedisClientType | null = null;
    private redisEnabled: boolean = false;

    private constructor() {
        this.pool = new Pool({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
            ssl: {
                rejectUnauthorized: false
            }
        });

        // Make Redis optional - only initialize if explicitly enabled
        if (process.env.REDIS_ENABLED === 'true') {
            try {
                this.redisClient = createClient({
                    url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
                    password: process.env.REDIS_PASSWORD || undefined,
                });

                this.redisClient.on('error', (err) => {
                    console.warn('Redis Client Error (Redis is optional):', err);
                });

                this.redisClient.connect()
                    .then(() => {
                        this.redisEnabled = true;
                        console.log('Redis connected successfully');
                    })
                    .catch((err) => {
                        console.warn('Redis connection failed, continuing without Redis:', err);
                        this.redisClient = null;
                    });
            } catch (error) {
                console.warn('Failed to initialize Redis, continuing without it:', error);
                this.redisClient = null;
            }
        } else {
            console.log('Redis is disabled, using PostgreSQL only');
        }
    }

    public static getInstance(): DatabaseConnection {
        if (!DatabaseConnection.instance) {
            DatabaseConnection.instance = new DatabaseConnection();
        }
        return DatabaseConnection.instance;
    }

    public getPool(): Pool {
        return this.pool;
    }

    public getRedisClient(): RedisClientType | null {
        return this.redisClient;
    }

    public isRedisEnabled(): boolean {
        return this.redisEnabled && this.redisClient !== null;
    }

    public async getClient(): Promise<PoolClient> {
        return this.pool.connect();
    }

    public async query(text: string, params?: any[]): Promise<any> {
        return this.pool.query(text, params);
    }

    public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    public async close(): Promise<void> {
        await this.pool.end();
        if (this.redisClient && this.redisEnabled) {
            await this.redisClient.quit();
        }
    }
}

export default DatabaseConnection;
