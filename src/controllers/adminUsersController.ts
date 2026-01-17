import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import DatabaseConnection from '../database/connection';
import auditService from '../services/auditService';
import { logger } from '../utils/logger';

const db = DatabaseConnection.getInstance();
const BCRYPT_ROUNDS = 12;

export const getAllAdmins = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await db.query(
            `SELECT 
                au.id,
                au.username,
                au.email,
                au.full_name,
                au.active,
                au.locked,
                au.last_login_at,
                au.created_at,
                COALESCE(
                    json_agg(
                        json_build_object('id', ar.id, 'name', ar.name)
                    ) FILTER (WHERE ar.id IS NOT NULL),
                    '[]'
                ) as roles
             FROM admin_users au
             LEFT JOIN admin_user_roles aur ON au.id = aur.admin_user_id
             LEFT JOIN admin_roles ar ON aur.role_id = ar.id
             GROUP BY au.id
             ORDER BY au.created_at DESC`
        );

        res.json({
            success: true,
            admins: result.rows
        });
    } catch (error) {
        logger.error('Get all admins error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch admins'
        });
    }
};

export const getAdminById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `SELECT 
                au.id,
                au.username,
                au.email,
                au.full_name,
                au.active,
                au.locked,
                au.last_login_at,
                au.last_login_ip,
                au.created_at,
                get_admin_permissions(au.id) as permissions,
                COALESCE(
                    json_agg(
                        json_build_object('id', ar.id, 'name', ar.name, 'description', ar.description)
                    ) FILTER (WHERE ar.id IS NOT NULL),
                    '[]'
                ) as roles
             FROM admin_users au
             LEFT JOIN admin_user_roles aur ON au.id = aur.admin_user_id
             LEFT JOIN admin_roles ar ON aur.role_id = ar.id
             WHERE au.id = $1
             GROUP BY au.id`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Admin not found'
            });
            return;
        }

        res.json({
            success: true,
            admin: result.rows[0]
        });
    } catch (error) {
        logger.error('Get admin by ID error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch admin'
        });
    }
};

export const createAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const { username, email, password, full_name, role_ids } = req.body;

        if (!username || !email || !password) {
            res.status(400).json({
                success: false,
                error: 'Username, email, and password are required'
            });
            return;
        }

        // Validate password strength
        if (password.length < 8) {
            res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters'
            });
            return;
        }

        // Check if username or email already exists
        const existingResult = await db.query(
            'SELECT id FROM admin_users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existingResult.rows.length > 0) {
            res.status(400).json({
                success: false,
                error: 'Username or email already exists'
            });
            return;
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // Create admin user
        const createResult = await db.query(
            `INSERT INTO admin_users (username, email, password_hash, full_name, created_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, username, email, full_name, active, created_at`,
            [username, email, passwordHash, full_name || null, req.admin!.id]
        );

        const newAdmin = createResult.rows[0];

        // Assign roles
        if (role_ids && Array.isArray(role_ids) && role_ids.length > 0) {
            for (const roleId of role_ids) {
                await db.query(
                    `INSERT INTO admin_user_roles (admin_user_id, role_id, granted_by)
                     VALUES ($1, $2, $3)`,
                    [newAdmin.id, roleId, req.admin!.id]
                );
            }
        }

        // Log action
        await auditService.logAction({
            adminUserId: req.admin!.id,
            username: req.admin!.username,
            actionType: 'admin.create',
            resourceType: 'admin',
            resourceId: newAdmin.id,
            actionDetails: { username, email, role_ids },
            afterState: newAdmin,
            ipAddress: req.ip || undefined,
            userAgent: req.get('User-Agent') || undefined,
            success: true
        });

        res.status(201).json({
            success: true,
            message: 'Admin created successfully',
            admin: newAdmin
        });
    } catch (error) {
        logger.error('Create admin error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create admin'
        });
    }
};

export const updateAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { email, full_name, active, role_ids } = req.body;

        // Get current state
        const beforeResult = await db.query(
            'SELECT * FROM admin_users WHERE id = $1',
            [id]
        );

        if (beforeResult.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Admin not found'
            });
            return;
        }

        const beforeState = beforeResult.rows[0];

        // Update admin
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (email !== undefined) {
            updates.push(`email = $${paramIndex++}`);
            values.push(email);
        }

        if (full_name !== undefined) {
            updates.push(`full_name = $${paramIndex++}`);
            values.push(full_name);
        }

        if (active !== undefined) {
            updates.push(`active = $${paramIndex++}`);
            values.push(active);
        }

        if (updates.length > 0) {
            values.push(id);
            await db.query(
                `UPDATE admin_users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
                values
            );
        }

        // Update roles if provided
        if (role_ids && Array.isArray(role_ids)) {
            // Remove existing roles
            await db.query(
                'DELETE FROM admin_user_roles WHERE admin_user_id = $1',
                [id]
            );

            // Add new roles
            for (const roleId of role_ids) {
                await db.query(
                    `INSERT INTO admin_user_roles (admin_user_id, role_id, granted_by)
                     VALUES ($1, $2, $3)`,
                    [id, roleId, req.admin!.id]
                );
            }
        }

        // Get updated state
        const afterResult = await db.query(
            'SELECT * FROM admin_users WHERE id = $1',
            [id]
        );

        // Log action
        await auditService.logAction({
            adminUserId: req.admin!.id,
            username: req.admin!.username,
            actionType: 'admin.update',
            resourceType: 'admin',
            resourceId: id,
            actionDetails: { email, full_name, active, role_ids },
            beforeState,
            afterState: afterResult.rows[0],
            ipAddress: req.ip || undefined,
            userAgent: req.get('User-Agent') || undefined,
            success: true
        });

        res.json({
            success: true,
            message: 'Admin updated successfully',
            admin: afterResult.rows[0]
        });
    } catch (error) {
        logger.error('Update admin error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update admin'
        });
    }
};

export const deleteAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Prevent self-deletion
        if (id === req.admin!.id) {
            res.status(400).json({
                success: false,
                error: 'Cannot delete your own account'
            });
            return;
        }

        // Get admin before deletion
        const beforeResult = await db.query(
            'SELECT * FROM admin_users WHERE id = $1',
            [id]
        );

        if (beforeResult.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Admin not found'
            });
            return;
        }

        const beforeState = beforeResult.rows[0];

        // Delete admin (cascade will handle roles and sessions)
        await db.query('DELETE FROM admin_users WHERE id = $1', [id]);

        // Log action
        await auditService.logAction({
            adminUserId: req.admin!.id,
            username: req.admin!.username,
            actionType: 'admin.delete',
            resourceType: 'admin',
            resourceId: id,
            beforeState,
            ipAddress: req.ip || undefined,
            userAgent: req.get('User-Agent') || undefined,
            success: true
        });

        res.json({
            success: true,
            message: 'Admin deleted successfully'
        });
    } catch (error) {
        logger.error('Delete admin error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete admin'
        });
    }
};

export const getAllRoles = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await db.query(
            'SELECT id, name, description, permissions FROM admin_roles ORDER BY name'
        );

        res.json({
            success: true,
            roles: result.rows
        });
    } catch (error) {
        logger.error('Get all roles error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch roles'
        });
    }
};
