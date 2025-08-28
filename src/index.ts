import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import PrivyService from './services/privy.js'
import HyperliquidService from './services/hyperliquid.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

/**
 * Authentication middleware to verify Privy JWT tokens
 */
async function authenticateUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Authorization header required with Bearer token');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify user authentication
    const user = await PrivyService.verifyAndGetUser(token);
    
    // Attach user to request object for downstream handlers
    (req as any).user = user;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error instanceof Error && error.message.includes('Invalid authentication token')) {
      throw new Error('Invalid authentication token');
    }
    
    if (error instanceof Error && error.message.includes('Authorization header required')) {
      throw new Error(error.message);
    }
    
    throw new Error('Authentication failed');
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Main API endpoint
app.get('/api/hello', (req, res) => {
  res.status(200).json({ message: 'Hello caller' });
});

// Privy user endpoint
app.get('/api/user', authenticateUser, async (req, res) => {
  try {
    const user = (req as any).user;
    
    return res.status(200).json({ 
      success: true,
      user 
    });
  } catch (error) {
    console.error('Privy user endpoint error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Create order endpoint
app.post('/api/create_order', authenticateUser, async (req, res) => {
  try {
    const user = (req as any).user;
    
    // Extract and validate order parameters, then map to Hyperliquid format
    const orderParams = mapToOrderParams(req.body);
    
    // Create HyperliquidService instance and place order
    const hyperliquidService = new HyperliquidService();
    const result = await hyperliquidService.createOrder(user.id, orderParams);
    
    return res.status(200).json({ 
      success: true,
      result
    });
  } catch (error) {
    console.error('Create order endpoint error:', error);
    
    if (error instanceof Error && error.message.includes('Invalid authentication token')) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    if (error instanceof Error && error.message.includes('User does not have a wallet')) {
      return res.status(400).json({ error: 'User does not have a valid wallet' });
    }
    
    return res.status(500).json({ error: 'Failed to create order', details: error instanceof Error ? error.message : 'Unknown error' });
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
      privyUser: '/api/user',
      createOrder: '/api/create_order'
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

/**
 * Helper function to extract, validate, and map order parameters to Hyperliquid format
 */
function mapToOrderParams(body: any) {
  const { 
    assetId, 
    isBuy, 
    price, 
    size, 
    reduceOnly = false, 
    orderType 
  } = body;
  
  // Validate required parameters and throw error if invalid
  if (typeof assetId !== 'number' || typeof isBuy !== 'boolean' || 
      typeof price !== 'string' || typeof size !== 'string' || 
      typeof reduceOnly !== 'boolean' || !orderType) {
    throw new Error('Invalid order parameters. Expected: assetId (number), isBuy (boolean), price (string), size (string), reduceOnly (boolean, optional), orderType (object)');
  }

  return {
    a: assetId,
    b: isBuy,
    p: price,
    s: size,
    r: reduceOnly,
    t: orderType
  };
}

export default app;
