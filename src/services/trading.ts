import HyperliquidService from './hyperliquid.js';
import { OrderParams, OrderResponse, SuccessResponse, ExchangeClient } from '@nktkas/hyperliquid';
import { z } from 'zod';
import MarketDataService from './marketdata.js';

export const TradingOrderSchema = z.object({
  assetId: z.number(),
  isBuy: z.boolean(),
  price: z.string(),
  size: z.string(),
  reduceOnly: z.boolean().optional().default(false),
  orderType: z.any(),
  isMarketOrder: z.boolean(),
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

    const perpDecimalBase = 6;
    const maxPriceDecimals = perpDecimalBase - szDecimals;

    let price = Number(params.price);
    let size = Number(params.size);

    // If the order is a market order, add a 1% buffer to the price to ensure it gets filled
    if (params.isMarketOrder === true) {
      const priceBuffer = 0.01;
      price = params.isBuy ? price * (1 + priceBuffer) : price * (1 - priceBuffer);
      console.log(`🔹 Market order price with buffer: ${price}`);
    }

    const minOrderSize = 10; // $10 is the minimum order size for Hyperliquid
    const minSizeIncrement = (0.1)**szDecimals;

    if ((price * size) < minOrderSize) {
        const newSize = minOrderSize / price;
        if (Math.abs(newSize - size) < minSizeIncrement) {
          size = newSize + minSizeIncrement;
        } else {
          size = newSize;
        }
        console.log(`🔹 Min order size: ${minOrderSize}, adjusted size: ${size}`);
    }

    // Format to expected Hyperliquid precision -- one last check in case rounding errors set this off
    const finalPrice = Number(Number(price.toPrecision(5)).toFixed(maxPriceDecimals));
    let finalSize = Number(Number(size.toPrecision(5)).toFixed(szDecimals));

    if ((finalPrice * finalSize) < minOrderSize) {
      finalSize += minSizeIncrement;
      console.log(`🔹 Adjusted final size: ${finalSize}`);
    }

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
    return await HyperliquidService.createOrder(exchangeClient, orderParams);
  }

  /**
   * Update leverage for a specific asset
   */
  static async updateLeverage(walletId: string, params: TradingLeverageParams): Promise<SuccessResponse> {
    const exchangeClient = HyperliquidService.exchangeClient(walletId);
    return await HyperliquidService.updateLeverage(exchangeClient, params.assetId, params.leverage);
  }
}

export default TradingService;