import { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import portalRoutes from '../src/routes/portal';
import adminRoutes from '../src/routes/admin';
import enhancedAdminRoutes from '../src/routes/enhancedAdmin';
import userRoutes from '../src/routes/user';
import DatabaseConnection from '../src/database/connection';

// Load environment variables
dotenv.config();

// Create Express app for this serverless function
const app = express();

// Setup middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable CSP for Vercel compatibility
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api/portal', portalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const db = DatabaseConnection.getInstance();
    await db.query('SELECT 1');
    
    let redisStatus = 'disabled';
    if (db.isRedisEnabled()) {
      try {
        const redisClient = db.getRedisClient();
        await redisClient!.ping();
        redisStatus = 'connected';
      } catch (redisError) {
        redisStatus = 'disconnected';
      }
    }

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: redisStatus
      }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Service unavailable'
    });
  }
});

// Default handler
app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found'
  });
});

export default app;
