import HyperliquidService from './hyperliquid.js';
import { OrderParams, OrderResponse, SuccessResponse } from '@nktkas/hyperliquid';
import { z } from 'zod';
import MarketDataService from './marketdata.js';

export const TradingOrderSchema = z.object({
  assetId: z.number(),
  isBuy: z.boolean(),
  price: z.string(),
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
  static async createOrder(walletId: string, params: TradingOrderParams): Promise<OrderResponse> {
    
    const szDecimals = (await MarketDataService.getPerpMetadataByAssetId(params.assetId)).szDecimals;

    const perpDecimalBase = 6;
    const maxPriceDecimals = perpDecimalBase - szDecimals;

    const price = Number(params.price);
    let size = Number(params.size);

    const minOrderSize = 10.01;

    if (price * size < minOrderSize) {
        size = minOrderSize / price;
    }

    // Format to expected Hyperliquid precision
    const finalPrice = Number(price.toPrecision(5)).toFixed(maxPriceDecimals);
    const finalSize = Number(size.toPrecision(5)).toFixed(szDecimals);

    // Map to Hyperliquid format
    const orderParams: OrderParams = {
        a: params.assetId,
        b: params.isBuy,
        p: finalPrice.toString(),
        s: finalSize.toString(),
        r: params.reduceOnly,
        t: params.orderType
    };

    // Create order using HyperliquidService
    const hyperliquidService = new HyperliquidService();
    return await hyperliquidService.createOrder(walletId, orderParams);
  }

  /**
   * Update leverage for a specific asset
   */
  static async updateLeverage(walletId: string, params: TradingLeverageParams): Promise<SuccessResponse> {
    const hyperliquidService = new HyperliquidService();
    return await hyperliquidService.updateLeverage(walletId, params.assetId, params.leverage);
  }
}

export default TradingService;