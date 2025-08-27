import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import PrivyService from './privy.js';

interface OrderParams {
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price?: number;
  type?: 'market' | 'limit';
  userId: string;
}

interface OrderResponse {
  success: boolean;
  orderId?: string;
  error?: string;
}

class HyperliquidService {
  private transport: HttpTransport;

  constructor() {
    this.transport = new HttpTransport();
  }

  /**
   * Place an order on Hyperliquid
   */
  async order(params: OrderParams): Promise<OrderResponse> {
    try {
      const { symbol, side, amount, price, type = 'limit', userId } = params;

      if (type === 'limit' && !price) {
        throw new Error('Price is required for limit orders');
      }

      // Get user's wallet from Privy
      const user = await PrivyService.getUser(userId);
      const wallet = user.wallet;
      
      if (!wallet) {
        throw new Error('User does not have a wallet');
      }

      // Create ExchangeClient with user's wallet address from Privy
      // Note: This is a simplified approach - you may need to implement
      // custom signing logic depending on Hyperliquid's requirements
      const client = new ExchangeClient({
        wallet: wallet.address,
        transport: this.transport,
        isTestnet: process.env.NODE_ENV !== 'production'
      });

      const orderParams = {
        orders: [{
          a: 0, // asset index (0 for most assets)
          b: side === 'buy',
          p: type === 'limit' && price ? price.toString() : '0',
          s: amount.toString(),
          r: false, // reduce_only
          t: type === 'limit' ? 
            { limit: { tif: 'Gtc' } } : 
            { market: {} }
        }],
        grouping: 'na'
      };

      const result = await client.order(orderParams);
      
      return {
        success: true,
        orderId: result.response?.data?.statuses?.[0]?.resting?.oid || result.response?.data?.statuses?.[0]?.filled?.oid || 'unknown'
      };
    } catch (error) {
      console.error('Hyperliquid order failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}

export default HyperliquidService;