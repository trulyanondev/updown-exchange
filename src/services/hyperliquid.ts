import { ExchangeClient, HttpTransport, OrderParams, OrderResponse, InfoClient, PerpsMeta, AllMids, SuccessResponse } from '@nktkas/hyperliquid';
import PrivyAbstractWallet from '../wallet/privy_abstract_wallet.js';

class HyperliquidService {
  private static transport: HttpTransport = new HttpTransport();
  private static infoClient: InfoClient = new InfoClient({ transport: HyperliquidService.transport });

  static exchangeClient(walletId: string): ExchangeClient {
    const privyWallet = new PrivyAbstractWallet(walletId);
    return new ExchangeClient({
      wallet: privyWallet,
      transport: HyperliquidService.transport,
      isTestnet: process.env.NODE_ENV !== 'production'
    });
  }
  
  /**
   * Place an order on Hyperliquid
   */
  static async createOrder(exchangeClient: ExchangeClient, params: OrderParams): Promise<OrderResponse> {

    const orderParams: { orders: OrderParams[]; grouping: 'na' | 'normalTpsl' | 'positionTpsl' } = {
      orders: [params],
      grouping: 'na'
    };

    console.log('createOrder-service', JSON.stringify(orderParams, null, 2));

    try {
      let response = await exchangeClient.order(orderParams);
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
  static async updateLeverage(exchangeClient: ExchangeClient, assetId: number, leverage: number): Promise<SuccessResponse> {

    // Update leverage parameters
    const leverageParams = {
      asset: assetId,
      isCross: true,
      leverage: leverage
    };

    return await exchangeClient.updateLeverage(leverageParams);
  }

  /**
   * Get perpetuals metadata including trading universes and margin tables
   */
  static async getPerpetualsMetadata(): Promise<PerpsMeta> {
    return await HyperliquidService.infoClient.meta();
  }

  /**
   * Get all mid prices for all assets
   */
  static async getAllMids(): Promise<AllMids> {
    return await HyperliquidService.infoClient.allMids();
  }
}

export default HyperliquidService;