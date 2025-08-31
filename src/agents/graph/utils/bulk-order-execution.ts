import { OrderResponse } from "@nktkas/hyperliquid";
import TradingService, { TradingOrderParams } from "../../../services/trading.js";
import HyperliquidService from "../../../services/hyperliquid.js";

// Helper function for bulk order execution shared between nodes
export async function executeBulkOrders(
  orders: TradingOrderParams[], 
  walletId: string,
  orderType: string = "orders"
): Promise<{
  successful: number;
  failed: number;
  results: Record<string, { success: boolean; message: string; response?: OrderResponse; error?: string }>;
  content: string;
}> {
  console.log(`📋 Executing ${orders.length} ${orderType} for wallet: ${walletId}`);

  // Create a shared ExchangeClient for all orders to ensure nonce consistency
  const exchangeClient = HyperliquidService.exchangeClient(walletId);

  // Process all orders concurrently
  const orderExecutionPromises = orders.map(async (tradingOrderParams, index) => {
    try {
      console.log(`📝 Executing ${orderType} ${index + 1}:`, tradingOrderParams);

      // Execute order through TradingService
      const result: OrderResponse = await TradingService.createOrder(exchangeClient, tradingOrderParams);

      console.log(`✅ ${orderType} execution successful:`, result);
      
      return [`${orderType}_${index}`, result];
      
    } catch (error) {
      console.error(`❌ ${orderType} execution failed:`, error);
      return [`${orderType}_${index}`, error instanceof Error ? error : new Error(String(error))];
    }
  });

  // Wait for all order executions to complete
  const orderExecutionResults = await Promise.all(orderExecutionPromises);
  
  // Separate successful results from errors
  const successfulResults = orderExecutionResults.filter(([_, result]) => !(result instanceof Error)) as [string, OrderResponse][];
  const failedResults = orderExecutionResults.filter(([_, result]) => result instanceof Error) as [string, Error][];
  
  // Count successes and failures
  const successful = successfulResults.length;
  const failed = failedResults.length;
  
  console.log(`📊 ${orderType} execution summary: ${successful} successful, ${failed} failed`);
    
  const failedOrders = failedResults
    .map(([orderKey, error]) => `❌ ${orderKey}: ${error.message}`)
    .join('\n');

  const content = `Summary: ${successful}/${successful + failed} ${orderType} executed${failed > 0 ? ` (${failed} failed)` : ' successfully'}${failed > 0 ? `\n\nFailed:\n${failedOrders}` : ''}`;

  // For order creation results, we store both successful and failed results
  const allOrderResults: Record<string, { success: boolean; message: string; response?: OrderResponse; error?: string }> = {};
  
  // Add successful results
  successfulResults.forEach(([orderKey, response]) => {
    allOrderResults[orderKey] = {
      success: true,
      message: `${orderType} executed successfully`,
      response: response
    };
  });
  
  // Add failed results
  failedResults.forEach(([orderKey, error]) => {
    allOrderResults[orderKey] = {
      success: false,
      message: `${orderType} execution failed`,
      error: error.message
    };
  });

  return {
    successful,
    failed,
    results: allOrderResults,
    content
  };
}