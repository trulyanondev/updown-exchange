import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import PrivyService from './services/privy.js'
import TradingService, { TradingOrderSchema, TradingLeverageSchema } from './services/trading.js';
import HyperliquidService from './services/hyperliquid.js';
import { LangGraphTradingAgent } from './agents/graph/index.js';
import ChatService from './services/chat.js';
import { AuthenticatedRequest } from './types/express.js';
import { HumanMessage, BaseMessage, AIMessage } from '@langchain/core/messages';
import { langchain_message } from './services/chat.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

/**
 * Authentication middleware to verify Privy JWT tokens
 */
async function authenticateUser(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header required with Bearer token' });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify user authentication
    const userId = await PrivyService.verifyAndGetUserId(token);
    
    // Attach user and token to request object for downstream handlers
    (req as any).userId = userId;
    (req as any).privyToken = token;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    // Handle expired or invalid tokens gracefully
    if (error instanceof Error) {
      if (error.message.includes('expired') || error.message.includes('invalid') || error.message.includes('malformed')) {
        res.status(401).json({ error: 'Invalid or expired authentication token' });
        return;
      }
    }
    
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Create order endpoint
app.post('/api/create_order', authenticateUser, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    
    const wallet = await PrivyService.getDelegatedWallet(userId);
    if (!wallet || !wallet.id) {
      return res.status(400).json({ error: 'User does not have a delegated wallet. The user must delegate the embedded wallet for server signing' });
    }

    // Parse and validate request body with zod - automatically typed!
    const orderParams = TradingOrderSchema.parse(req.body);

    const exchangeClient = HyperliquidService.exchangeClient(wallet.id);
    const result = await TradingService.createOrder(exchangeClient, orderParams);
    
    return res.status(200).json({ 
      success: true,
      result
    });
  } catch (error) {
    console.error('Create order endpoint error:', error);
    
    // Handle zod validation errors
    if (error && typeof error === 'object' && 'issues' in error) {
      return res.status(400).json({ 
        error: 'Invalid order parameters', 
        details: (error as any).issues 
      });
    }
    
    if (error instanceof Error && error.message.includes('Invalid authentication token')) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    if (error instanceof Error && error.message.includes('User does not have a delegated wallet')) {
      return res.status(400).json({ error: 'User does not have a valid wallet' });
    }
    
    return res.status(500).json({ error: 'Failed to create order', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Update leverage endpoint
app.post('/api/update_leverage', authenticateUser, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    
    const wallet = await PrivyService.getDelegatedWallet(userId);
    if (!wallet || !wallet.id) {
      return res.status(400).json({ 
        error: 'User does not have a delegated wallet. The user must delegate the embedded wallet for server signing'
      });
    }

    // Parse and validate request body with zod - automatically typed!
    const leverageParams = TradingLeverageSchema.parse(req.body);

    const result = await TradingService.updateLeverage(wallet.id, leverageParams);
    
    return res.status(200).json({ 
      success: true,
      result
    });
  } catch (error) {
    console.error('Update leverage endpoint error:', error);
    
    // Handle zod validation errors
    if (error && typeof error === 'object' && 'issues' in error) {
      return res.status(400).json({ 
        error: 'Invalid leverage parameters', 
        details: (error as any).issues 
      });
    }
    
    if (error instanceof Error && error.message.includes('Invalid authentication token')) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    if (error instanceof Error && error.message.includes('User does not have a delegated wallet')) {
      return res.status(400).json({ error: 'User does not have a valid wallet' });
    }
    
    return res.status(500).json({ error: 'Failed to update leverage', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Trading agent prompt endpoint
app.post('/api/prompt', authenticateUser, async (req, res) => {

  req.setTimeout(120000);
  try {
    const userId = (req as AuthenticatedRequest).userId;
    
    const wallet = await PrivyService.getDelegatedWallet(userId);
    if (!wallet || !wallet.id) {
      return res.status(400).json({ 
        error: 'User does not have a delegated wallet. The user must delegate the embedded wallet for server signing'
      });
    }

    const { prompt } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid request. Expected: { "prompt": "your trading request" }' 
      });
    }

    // Create LangGraph trading agent and process the prompt
    const agent = new LangGraphTradingAgent();
    const result = await agent.processPrompt({
      prompt,
      walletId: wallet.id,
      walletAddress: wallet.address as `0x${string}`
    });
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Trading agent endpoint error:', error);
    
    return res.status(500).json({ 
      error: 'Failed to process trading prompt', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Trading agent chat endpoint, threads are saved in supabase and context is preserved between requests
app.post('/api/chat', authenticateUser, async (req, res) => {
  req.setTimeout(120000);
  try {
    const userId = (req as AuthenticatedRequest).userId;
    
    const wallet = await PrivyService.getDelegatedWallet(userId);
    if (!wallet || !wallet.id) {
      return res.status(400).json({ 
        error: 'User does not have a delegated wallet. The user must delegate the embedded wallet for server signing'
      });
    }

    const { prompt, thread_id } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid request. Expected: { "prompt": "your trading request" }' 
      });
    }

    let messages: BaseMessage[] = [];
    if (thread_id) {
      messages = (await ChatService.getMessages(thread_id, (req as AuthenticatedRequest).privyToken)).map(message => langchain_message(message));
    }

    // Create LangGraph trading agent and process the prompt
    const agent = new LangGraphTradingAgent();
    const result = await agent.processPrompt({
      prompt,
      walletId: wallet.id,
      walletAddress: wallet.address as `0x${string}`,
      messages: messages
    });

    const messagesToSave = [
      new HumanMessage(prompt),
      new AIMessage(result.message)
    ];

    const saveResult = await ChatService.saveMessages(thread_id, messagesToSave, (req as AuthenticatedRequest).privyToken);
    
    return res.status(200).json({
      success: true,
      thread_id: saveResult.thread_id,
      message: result.message
    });
  } catch (error) {
    console.error('Trading agent endpoint error:', error);
    
    return res.status(500).json({ 
      error: 'Failed to process trading prompt', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'Hyperliquid Exchange Server API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      createOrder: '/api/create_order',
      updateLeverage: '/api/update_leverage',
      prompt: '/api/prompt'
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
