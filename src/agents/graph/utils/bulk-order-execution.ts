import { OrderSuccessResponse } from "@nktkas/hyperliquid";
import TradingService, { TradingOrderParams } from "../../../services/trading.js";
import MarketDataService from "../../../services/marketdata.js";
import { ExchangeClient } from "@nktkas/hyperliquid";

// Helper function for bulk order execution shared between nodes
export async function executeBulkOrders(
  orders: TradingOrderParams[], 
  exchangeClient: ExchangeClient,
  orderType: string = "orders"
): Promise<{
  results: Record<string, { success: boolean; message: string; }>;
}> {
  console.log(`📋 Executing ${orders.length} ${orderType}`);

  // For order creation results, we store both successful and failed results
  const allOrderResults: Record<string, { success: boolean; message: string; }> = {};

  // Get metadata for symbol lookup
  const universeDict = await MarketDataService.getPerpetualsMetadata();

  // Process all orders 
  try {
    const result: OrderSuccessResponse = await TradingService.createBulkOrders(exchangeClient, orders);
    
    // Process each order result
    for (const [i, order] of orders.entries()) {
      const orderResult = result.response.data.statuses[i];
      
      // Find the symbol for this assetId
      const metadata = Object.values(universeDict).find(meta => meta.assetId === order.assetId);
      const symbol = metadata?.name ?? "Unknown";
      
      if (orderResult && 'resting' in orderResult) {
        // Order was placed successfully and is resting (open order)

        let message = '';
        if (order.type === 'takeProfit') { 
          message = `Take profit order of ${symbol} placed at $${order.price} and resting.`;
        } else if (order.type === 'stopLoss') {
          message = `Stop loss order of ${symbol} placed at $${order.price} and resting.`;
        } else if (order.type === 'market') {
          message = `Market order of ${symbol} placed at $${order.price} and resting.`;
        } else if (order.type === 'limit') {
          message = `Limit order of ${symbol} placed at $${order.price} and resting.`;
        }

        allOrderResults[symbol] = {
          success: true,
          message: message,
        };
      } else if (orderResult && 'filled' in orderResult) {
        // Order was filled immediately
        allOrderResults[symbol] = {
          success: true,
          message: `${order.isBuy ? "Buy long" : "Sell short"} order for ${orderResult.filled.totalSz} of ${symbol} filled at $${orderResult.filled.avgPx}`
        };
      } else {
        // Unknown status
        allOrderResults[symbol] = {
          success: false,
          message: "Unknown order status " + orderResult,
        };
      }
    }
  } catch (error) {
    console.error(`❌ ${orderType} execution failed:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    
    // Mark all orders as failed if the bulk operation failed
    for (const order of orders) {
      const metadata = Object.values(universeDict).find(meta => meta.assetId === order.assetId);
      const symbol = metadata?.name || `Asset${order.assetId}`;
      
      allOrderResults[symbol] = {
        success: false,
        message: `Bulk order execution failed: ${errorMessage}`
      };
    }
  }

  console.log(`🔍 All order results:`, allOrderResults);

  return {
    results: allOrderResults,
  };
}