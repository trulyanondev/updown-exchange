import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import PrivyService from './services/privy.js'
import AlchemyService from './services/alchemy.js'
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
    return;
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

// Coinbase session token endpoint
app.post('/api/coinbase/session', authenticateUser, async (req, res) => {
  try {
    const { addresses, assets } = req.body;

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request. Expected: { "addresses": ["wallet_address"], "assets": ["asset_list"] }' 
      });
    }

    // Get Coinbase CDP API credentials from environment
    const COINBASE_CDP_API_KEY = process.env.COINBASE_CDP_API_KEY;
    const COINBASE_CDP_PRIVATE_KEY = process.env.COINBASE_CDP_PRIVATE_KEY;
    
    if (!COINBASE_CDP_API_KEY || !COINBASE_CDP_PRIVATE_KEY) {
      return res.status(500).json({ 
        error: 'Coinbase CDP API credentials not configured' 
      });
    }

    // Handle ECDSA private key format (ES256 required by Coinbase CDP)
    let privateKeyPem: string;
    try {
      if (COINBASE_CDP_PRIVATE_KEY.includes('-----BEGIN')) {
        // Already in PEM format
        privateKeyPem = COINBASE_CDP_PRIVATE_KEY.replace(/\\n/g, '\n');
      } else {
        // ECDSA key - wrap in proper PEM format
        const cleanKey = COINBASE_CDP_PRIVATE_KEY.replace(/\s+/g, '');
        const keyLines = cleanKey.match(/.{1,64}/g) || [cleanKey];
        privateKeyPem = `-----BEGIN EC PRIVATE KEY-----\n${keyLines.join('\n')}\n-----END EC PRIVATE KEY-----`;
      }
    } catch (error) {
      console.error('Error formatting private key:', error);
      return res.status(500).json({ 
        error: 'Invalid private key format' 
      });
    }

    // Generate JWT token for Coinbase CDP API authentication with ES256 (ECDSA)
    const now = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString('hex');
    
    const jwtPayload = {
      iss: "coinbase-cloud",
      sub: COINBASE_CDP_API_KEY,
      iat: now,
      exp: now + 120, // 2 minutes from now
      uri: "POST api.developer.coinbase.com/onramp/v1/token",
      nonce: nonce
    };

    const jwtToken = jwt.sign(jwtPayload, privateKeyPem, { 
      algorithm: 'ES256',
      header: { 
        alg: 'ES256',
        kid: COINBASE_CDP_API_KEY
      }
    });

    // Call Coinbase CDP API to create session token
    const response = await fetch('https://api.developer.coinbase.com/onramp/v1/token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        addresses,
        assets
      })
    });

    if (!response.ok) {
      throw new Error(`Coinbase API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
  
    return res.status(200).json({ 
      success: true,
      token: data.token 
    });
  } catch (error) {
    console.error('Coinbase session token endpoint error:', error);
    
    // Handle JWT errors
    if (error instanceof Error && error.message.includes('jwt')) {
      return res.status(500).json({ 
        error: 'Failed to generate authentication token',
        details: error.message 
      });
    }
    
    // Handle Coinbase API errors
    if (error instanceof Error && error.message.includes('Coinbase API error')) {
      return res.status(502).json({ 
        error: 'Coinbase API request failed',
        details: error.message 
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to generate session token', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Alchemy webhook endpoint for monitoring wallet activity
app.post('/api/webhook/wallet-activity', express.json(), async (req, res) => {
  try {
    // Get the webhook signature from headers and ID from body
    const receivedSignature = req.headers['x-alchemy-signature'] as string;
    const { webhookId, id: notificationId, createdAt, type, event } = req.body;
    
    if (!receivedSignature) {
      console.error('Missing required header: x-alchemy-signature');
      return res.status(401).json({ error: 'Missing signature header' });
    }

    if (!webhookId) {
      console.error('Missing webhookId in request body');
      return res.status(400).json({ error: 'Missing webhookId in body' });
    }

    const signatureIsValid = await AlchemyService.verifyWebhookSignature(webhookId, req.body, receivedSignature);

    if (!signatureIsValid) {
      console.error('Failed to verify webhook signature.  Possible invalid signature');
      return res.status(401).json({ error: 'Failed to verify signature' });
    }
    
    console.log('Alchemy webhook received:', {
      webhookId,
      notificationId,
      createdAt,
      type,
      activity: JSON.stringify(event?.activity)
    });

    // Process webhook activity using the service
    await AlchemyService.processWebhookActivity(event);

    return res.status(200).json({ success: true, processed: true });
  } catch (error) {
    console.error('Alchemy webhook processing error:', error);
    return res.status(500).json({ error: 'Error processing webhook' });
  }
});

// HLP vault deposit endpoint
app.post('/api/vault/hlp/deposit', authenticateUser, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    
    const wallet = await PrivyService.getDelegatedWallet(userId);
    if (!wallet || !wallet.id) {
      return res.status(400).json({ 
        error: 'User does not have a delegated wallet. The user must delegate the embedded wallet for server signing'
      });
    }

    const { amount } = req.body;
    
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ 
        error: 'Invalid request. Expected: { "amount": <number> } where amount is in USDC' 
      });
    }

    const exchangeClient = HyperliquidService.exchangeClient(wallet.id);
    const result = await HyperliquidService.transferToVault(exchangeClient, amount);
    
    return res.status(200).json({ 
      success: true,
      result
    });
  } catch (error) {
    console.error('HLP vault deposit endpoint error:', error);
    
    if (error instanceof Error && error.message.includes('Invalid authentication token')) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    if (error instanceof Error && error.message.includes('User does not have a delegated wallet')) {
      return res.status(400).json({ error: 'User does not have a valid wallet' });
    }
    
    return res.status(500).json({ 
      error: 'Failed to deposit to HLP vault', 
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
      prompt: '/api/prompt',
      chat: '/api/chat',
      coinbaseSession: '/api/coinbase/session',
      alchemyWebhook: '/api/webhook/wallet-activity',
      hlpVaultDeposit: '/api/vault/hlp/deposit',
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
