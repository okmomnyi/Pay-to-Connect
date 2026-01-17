import crypto from 'crypto';
import { logger } from './logger';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

class EncryptionService {
    private encryptionKey: Buffer;

    constructor() {
        const key = process.env.ENCRYPTION_KEY;
        
        if (!key) {
            throw new Error('ENCRYPTION_KEY environment variable is required');
        }

        if (key.length < 32) {
            throw new Error('ENCRYPTION_KEY must be at least 32 characters');
        }

        this.encryptionKey = crypto.scryptSync(key, 'salt', KEY_LENGTH);
    }

    encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
        try {
            const iv = crypto.randomBytes(IV_LENGTH);
            const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
            
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();

            return {
                encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex')
            };
        } catch (error) {
            logger.error('Encryption failed:', error);
            throw new Error('Failed to encrypt data');
        }
    }

    decrypt(encrypted: string, iv: string, authTag: string): string {
        try {
            const decipher = crypto.createDecipheriv(
                ALGORITHM,
                this.encryptionKey,
                Buffer.from(iv, 'hex')
            );
            
            decipher.setAuthTag(Buffer.from(authTag, 'hex'));
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            logger.error('Decryption failed:', error);
            throw new Error('Failed to decrypt data');
        }
    }

    hash(text: string): string {
        return crypto.createHash('sha256').update(text).digest('hex');
    }

    generateToken(length: number = 32): string {
        return crypto.randomBytes(length).toString('hex');
    }
}

export default new EncryptionService();
