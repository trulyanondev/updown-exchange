import { ExchangeClient, HttpTransport, ErrorResponse, OrderParams, OrderResponse, TIF } from '@nktkas/hyperliquid';
import PrivyService from './privy.js';
import PrivyAbstractWallet from '../wallet/privy_abstract_wallet.js';

class HyperliquidService {
  private static transport: HttpTransport = new HttpTransport();

  /**
   * Place an order on Hyperliquid
   */
  async createOrder(walletId: string, params: OrderParams): Promise<OrderResponse> {
  
    // Create PrivyAbstractWallet that implements signing with Privy
    const privyWallet = new PrivyAbstractWallet(walletId);

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

  /**
   * Update leverage on Hyperliquid for a specific asset
   */
  async updateLeverage(walletId: string, assetId: number, leverage: number) {
    // Create PrivyAbstractWallet that implements signing with Privy
    const privyWallet = new PrivyAbstractWallet(walletId);

    // Create ExchangeClient with PrivyAbstractWallet
    const client = new ExchangeClient({
      wallet: privyWallet,
      transport: HyperliquidService.transport,
      isTestnet: process.env.NODE_ENV !== 'production'
    });

    // Update leverage parameters
    const leverageParams = {
      asset: assetId,
      isCross: true,
      leverage: leverage
    };

    return await client.updateLeverage(leverageParams);
  }
}

export default HyperliquidService;