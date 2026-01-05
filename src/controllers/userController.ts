import { Request, Response } from 'express';
import DatabaseConnection from '../database/connection';
import { logger } from '../utils/logger';
import Joi from 'joi';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

interface User {
    userId: string;
    username: string;
    email: string;
}

interface AuthRequest extends Request {
    user?: User;
}

class UserController {
    private db: DatabaseConnection;

    constructor() {
        this.db = DatabaseConnection.getInstance();
    }

    public register = async (req: Request, res: Response): Promise<void> => {
        try {
            // Validate JWT_SECRET exists
            if (!process.env.JWT_SECRET) {
                logger.error('JWT_SECRET not configured');
                res.status(500).json({
                    success: false,
                    error: 'Server configuration error'
                });
                return;
            }

            const schema = Joi.object({
                username: Joi.string().alphanum().min(3).max(30).required(),
                email: Joi.string().email().required(),
                phone: Joi.string().pattern(/^(\+254|0)[17]\d{7,9}$/).required(),
                password: Joi.string().min(6).required(),
                firstName: Joi.string().min(2).max(50).required(),
                lastName: Joi.string().min(2).max(50).required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const { username, email, phone, password, firstName, lastName } = value;

            // Check if user already exists
            const existingUser = await this.db.query(
                'SELECT id FROM users WHERE username = $1 OR email = $2 OR phone = $3',
                [username, email, phone]
            );

            if (existingUser.rows.length > 0) {
                res.status(409).json({
                    success: false,
                    error: 'User with this username, email, or phone already exists'
                });
                return;
            }

            // Hash password
            const passwordHash = await bcrypt.hash(password, 12);

            // Create user
            const result = await this.db.query(
                `INSERT INTO users (username, email, phone, password_hash, first_name, last_name)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, username, email, phone, first_name, last_name`,
                [username, email, phone, passwordHash, firstName, lastName]
            );

            const user = result.rows[0];

            // Generate JWT token
            const token = jwt.sign(
                { 
                    userId: user.id, 
                    username: user.username,
                    email: user.email 
                },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.status(201).json({
                success: true,
                message: 'Account created successfully',
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    phone: user.phone,
                    firstName: user.first_name,
                    lastName: user.last_name
                }
            });
        } catch (error) {
            logger.error('User registration failed:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public login = async (req: Request, res: Response): Promise<void> => {
        try {
            // Validate JWT_SECRET exists
            if (!process.env.JWT_SECRET) {
                logger.error('JWT_SECRET not configured');
                res.status(500).json({
                    success: false,
                    error: 'Server configuration error'
                });
                return;
            }

            const schema = Joi.object({
                username: Joi.string().required(),
                password: Joi.string().required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const { username, password } = value;

            const result = await this.db.query(
                `SELECT id, username, email, phone, password_hash, first_name, last_name 
                 FROM users WHERE (username = $1 OR email = $1) AND active = true`,
                [username]
            );

            if (result.rows.length === 0) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
                return;
            }

            const user = result.rows[0];
            const isValidPassword = await bcrypt.compare(password, user.password_hash);

            if (!isValidPassword) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
                return;
            }

            const token = jwt.sign(
                { 
                    userId: user.id, 
                    username: user.username,
                    email: user.email 
                },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    phone: user.phone,
                    firstName: user.first_name,
                    lastName: user.last_name
                }
            });
        } catch (error) {
            logger.error('User login failed:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.userId;

            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
                return;
            }

            const result = await this.db.query(
                `SELECT id, username, email, phone, first_name, last_name, created_at
                 FROM users WHERE id = $1`,
                [userId]
            );

            if (result.rows.length === 0) {
                res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
                return;
            }

            const user = result.rows[0];

            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    phone: user.phone,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    createdAt: user.created_at
                }
            });
        } catch (error) {
            logger.error('Get user profile failed:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };

    public addDevice = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const schema = Joi.object({
                macAddress: Joi.string().pattern(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/).required(),
                deviceName: Joi.string().min(2).max(50).required(),
                isPrimary: Joi.boolean().default(false)
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
                return;
            }

            const { macAddress, deviceName, isPrimary } = value;
            const userId = req.user?.userId;

            // Check if device already exists
            let deviceResult = await this.db.query(
                'SELECT id FROM devices WHERE mac_address = $1',
                [macAddress]
            );

            let deviceId;
            if (deviceResult.rows.length === 0) {
                // Create new device
                const newDeviceResult = await this.db.query(
                    'INSERT INTO devices (mac_address) VALUES ($1) RETURNING id',
                    [macAddress]
                );
                deviceId = newDeviceResult.rows[0].id;
            } else {
                deviceId = deviceResult.rows[0].id;
            }

            // Check if user already has this device
            const existingUserDevice = await this.db.query(
                'SELECT id FROM user_devices WHERE user_id = $1 AND device_id = $2',
                [userId, deviceId]
            );

            if (existingUserDevice.rows.length > 0) {
                res.status(409).json({
                    success: false,
                    error: 'Device already registered to your account'
                });
                return;
            }

            // If this is primary device, unset other primary devices
            if (isPrimary) {
                await this.db.query(
                    'UPDATE user_devices SET is_primary = false WHERE user_id = $1',
                    [userId]
                );
            }

            // Add device to user
            await this.db.query(
                'INSERT INTO user_devices (user_id, device_id, device_name, is_primary) VALUES ($1, $2, $3, $4)',
                [userId, deviceId, deviceName, isPrimary]
            );

            res.json({
                success: true,
                message: 'Device added successfully'
            });
        } catch (error) {
            logger.error('Add device failed:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };
}

export default UserController;
