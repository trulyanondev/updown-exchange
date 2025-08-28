import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import PrivyService from './services/privy.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Main API endpoint
app.get('/api/hello', (req, res) => {
  res.status(200).json({ message: 'Hello caller' });
});

// Privy user endpoint
app.get('/api/user', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required with Bearer token' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    const user = await PrivyService.verifyAndGetUser(token);
    
    return res.status(200).json({ 
      success: true,
      user 
    });
  } catch (error) {
    console.error('Privy user endpoint error:', error);
    
    if (error instanceof Error && error.message.includes('Invalid authentication token')) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    if (error instanceof Error && error.message.includes('Failed to fetch user data')) {
      return res.status(500).json({ error: 'Failed to fetch user data from Privy' });
    }
    
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'UpDown Server API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      hello: '/api/hello',
      privyUser: '/api/user'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📖 API Documentation available at http://localhost:${PORT}`);
  console.log(`💚 Health check at http://localhost:${PORT}/health`);
});

export default app;
