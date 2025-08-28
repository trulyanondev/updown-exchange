import { ExchangeClient, HttpTransport, ErrorResponse, OrderParams, OrderResponse, TIF } from '@nktkas/hyperliquid';
import PrivyService from './privy.js';
import PrivyAbstractWallet from '../wallet/privy_abstract_wallet.js';
import type { WalletWithMetadata } from '@privy-io/server-auth';

class HyperliquidService {
  private static transport: HttpTransport = new HttpTransport();

  /**
   * Place an order on Hyperliquid
   */
  async createOrder(userId: string, walletId: string, walletAddress: `0x${string}`, params: OrderParams): Promise<OrderResponse> {
  
    // Create PrivyAbstractWallet that implements signing with Privy
    const privyWallet = new PrivyAbstractWallet({
      walletId: walletId,
      address: walletAddress
    });

    // Create ExchangeClient with PrivyAbstractWallet
    const client = new ExchangeClient({
      wallet: privyWallet,
      transport: HyperliquidService.transport,
      isTestnet: process.env.NODE_ENV !== 'production'
    });

    const orderParams: { orders: OrderParams[]; grouping: 'na' | 'normalTpsl' | 'positionTpsl' } = {
      orders: [params],
      grouping: 'na'
    };

    return await client.order(orderParams);
  }
}

export default HyperliquidService;