import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import Joi from 'joi';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Mock data storage (in production, this would be a database)
const mockUsers: any[] = [];
const mockDevices: any[] = [];

interface User {
    id: string;
    username: string;
    email: string;
    phone: string;
    first_name: string;
    last_name: string;
}

interface AuthRequest extends Request {
    user?: User;
}

class MockUserController {
    public register = async (req: Request, res: Response): Promise<void> => {
        try {
            const schema = Joi.object({
                username: Joi.string().alphanum().min(3).max(30).required(),
                email: Joi.string().email().required(),
                phone: Joi.string().pattern(/^(\+254|0)[17]\d{8}$/).required(),
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
            const existingUser = mockUsers.find(u => 
                u.username === username || u.email === email || u.phone === phone
            );

            if (existingUser) {
                res.status(409).json({
                    success: false,
                    error: 'User with this username, email, or phone already exists'
                });
                return;
            }

            // Hash password
            const passwordHash = await bcrypt.hash(password, 12);

            // Create user
            const user = {
                id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                username,
                email,
                phone,
                password_hash: passwordHash,
                first_name: firstName,
                last_name: lastName,
                active: true,
                created_at: new Date().toISOString()
            };

            mockUsers.push(user);

            // Generate JWT token
            const token = jwt.sign(
                { 
                    userId: user.id, 
                    username: user.username,
                    email: user.email 
                },
                process.env.JWT_SECRET!,
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

            const user = mockUsers.find(u => 
                (u.username === username || u.email === username) && u.active
            );

            if (!user) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
                return;
            }

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
                process.env.JWT_SECRET!,
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
            const userId = req.user?.id;
            const user = mockUsers.find(u => u.id === userId);

            if (!user) {
                res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
                return;
            }

            // Get user's devices
            const userDevices = mockDevices.filter(d => d.user_id === userId);

            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    phone: user.phone,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    createdAt: user.created_at,
                    devices: userDevices
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
            const userId = req.user?.id;

            // Check if user already has this device
            const existingDevice = mockDevices.find(d => 
                d.user_id === userId && d.mac_address === macAddress
            );

            if (existingDevice) {
                res.status(409).json({
                    success: false,
                    error: 'Device already registered to your account'
                });
                return;
            }

            // If this is primary device, unset other primary devices
            if (isPrimary) {
                mockDevices.forEach(d => {
                    if (d.user_id === userId) {
                        d.is_primary = false;
                    }
                });
            }

            // Add device
            const device = {
                id: `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                user_id: userId,
                mac_address: macAddress,
                device_name: deviceName,
                is_primary: isPrimary,
                created_at: new Date().toISOString()
            };

            mockDevices.push(device);

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

export default MockUserController;
