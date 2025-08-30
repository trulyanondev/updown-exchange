import { ExchangeClient, HttpTransport, OrderParams, OrderResponse, InfoClient, PerpsMeta, AllMids, SuccessResponse } from '@nktkas/hyperliquid';
import PrivyAbstractWallet from '../wallet/privy_abstract_wallet.js';

class HyperliquidService {
  private static transport: HttpTransport = new HttpTransport();
  private static infoClient: InfoClient = new InfoClient({ transport: HyperliquidService.transport });

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

    console.log('createOrder-service', JSON.stringify(orderParams, null, 2));

    try {
      let response = await client.order(orderParams);
      console.log('createOrder-service', JSON.stringify(response, null, 2));
      return response;
    } catch (error) {
      console.error('createOrder-service', error);
      throw error;
    }
  }

  /**
   * Update leverage on Hyperliquid for a specific asset
   */
  async updateLeverage(walletId: string, assetId: number, leverage: number): Promise<SuccessResponse> {
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

  /**
   * Get perpetuals metadata including trading universes and margin tables
   */
  async getPerpetualsMetadata(): Promise<PerpsMeta> {
    return await HyperliquidService.infoClient.meta();
  }

  /**
   * Get all mid prices for all assets
   */
  async getAllMids(): Promise<AllMids> {
    return await HyperliquidService.infoClient.allMids();
  }
}

export default HyperliquidService;