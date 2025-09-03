import HyperliquidService from './hyperliquid.js';
import { OrderParams, OrderSuccessResponse, OrderResponse, SuccessResponse, ExchangeClient, CancelSuccessResponse } from '@nktkas/hyperliquid';
import { z } from 'zod';
import MarketDataService from './marketdata.js';

export const TradingOrderSchema = z.object({
  assetId: z.number(),
  isBuy: z.boolean(),
  price: z.string(),
  type: z.enum(['takeProfit', 'stopLoss', 'market', 'limit']),
  size: z.string(),
  reduceOnly: z.boolean().optional().default(false),
  orderType: z.any()
});

export const TradingLeverageSchema = z.object({
  assetId: z.number(),
  leverage: z.number().min(1).max(50)
});

export type TradingOrderParams = z.infer<typeof TradingOrderSchema>;
export type TradingLeverageParams = z.infer<typeof TradingLeverageSchema>;

class TradingService {
  /**
   * Create a trading order
   */
  static async createOrder(exchangeClient: ExchangeClient, params: TradingOrderParams): Promise<OrderResponse> {
    
    const szDecimals = (await MarketDataService.getPerpMetadataByAssetId(params.assetId)).szDecimals;

    const finalPrice = TradingService.formatPriceForOrder(Number(params.price), szDecimals);
    const finalSize = TradingService.formatSizeForOrder(Number(params.size), szDecimals);

    // Map to Hyperliquid format
    const orderParams: OrderParams = {
        a: params.assetId,
        b: params.isBuy,
        p: finalPrice,
        s: finalSize,
        r: params.reduceOnly,
        t: params.orderType
    };

    // Create order using HyperliquidService
    return await HyperliquidService.createOrder(exchangeClient, orderParams);
  }

  /**
   * Create a trading order
   */
  static async createBulkOrders(exchangeClient: ExchangeClient, params: TradingOrderParams[]): Promise<OrderSuccessResponse> {
    
    const universeDict = await MarketDataService.getPerpetualsMetadata();

    const orderParams: OrderParams[] = await Promise.all(params.map(async (param) => {

      const szDecimals = Object.values(universeDict).find(meta => param.assetId === meta.assetId)?.szDecimals;
      if (szDecimals === undefined) {
        throw new Error(`Perpetual metadata not found for asset ID: ${param.assetId}`);
      }

      const finalPrice = TradingService.formatPriceForOrder(Number(param.price), szDecimals);
      const finalSize = TradingService.formatSizeForOrder(Number(param.size), szDecimals);

      // Map to Hyperliquid format
      const orderParams: OrderParams = {
          a: param.assetId,
          b: param.isBuy,
          p: finalPrice,
          s: finalSize,
          r: param.reduceOnly,
          t: param.orderType
      };

      return orderParams;
    }));

    // Create order using HyperliquidService
    return await HyperliquidService.createBulkOrders(exchangeClient, orderParams);
  }

  static async cancelOrder(exchangeClient: ExchangeClient, assetId: number, orderId: number): Promise<CancelSuccessResponse> {
    return await HyperliquidService.cancelOrder(
      exchangeClient, assetId, orderId
    );
  }

  /**
   * Update leverage for a specific asset
   */
  static async updateLeverage(walletId: string, params: TradingLeverageParams): Promise<SuccessResponse> {
    const exchangeClient = HyperliquidService.exchangeClient(walletId);
    return await HyperliquidService.updateLeverage(exchangeClient, params.assetId, params.leverage);
  }

  static formatPriceForOrder(price: number, szDecimals: number): string {
    const perpDecimalBase = 6;
    const maxPriceDecimals = perpDecimalBase - szDecimals;
    return Number(price.toPrecision(5)).toFixed(maxPriceDecimals);
  }

  static formatSizeForOrder(size: number, szDecimals: number): string {
    return Number(size.toPrecision(5)).toFixed(szDecimals);
  }
}

export default TradingService;