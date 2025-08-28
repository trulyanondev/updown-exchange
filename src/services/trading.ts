import HyperliquidService from './hyperliquid.js';
import { OrderParams, OrderResponse } from '@nktkas/hyperliquid';
import { z } from 'zod';

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
    // Map to Hyperliquid format
    const orderParams: OrderParams = {
        a: params.assetId,
        b: params.isBuy,
        p: params.price,
        s: params.size,
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
  static async updateLeverage(walletId: string, params: TradingLeverageParams): Promise<any> {
    const hyperliquidService = new HyperliquidService();
    return await hyperliquidService.updateLeverage(walletId, params.assetId, params.leverage);
  }
}

export default TradingService;