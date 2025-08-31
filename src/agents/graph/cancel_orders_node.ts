import { ToolMessage } from "@langchain/core/messages";
import { CancelSuccessResponse } from "@nktkas/hyperliquid";
import { type GraphStateType } from "./shared_state.js";
import TradingService from "../../services/trading.js";
import HyperliquidService from "../../services/hyperliquid.js";
import MarketDataService from "../../services/marketdata.js";

// Define the node function for cancelling pending orders
export async function cancelOrdersNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  try {
    const { pendingOrderCancellations, openOrders } = state;

    // Early return if no pending cancellations
    if (!pendingOrderCancellations || pendingOrderCancellations.length === 0) {
      return {
        messages: [
          ...state.messages,
          new ToolMessage({
            content: "No pending order cancellations to execute",
            tool_call_id: "cancel_orders_no_pending"
          })
        ]
      };
    }

    // Early return if no open orders available
    if (!openOrders || openOrders.length === 0) {
      return {
        messages: [
          ...state.messages,
          new ToolMessage({
            content: "No open orders available for cancellation",
            tool_call_id: "cancel_orders_no_open_orders"
          })
        ]
      };
    }

    console.log(`❌ Cancelling ${pendingOrderCancellations.length} orders`);

    // Use the shared ExchangeClient from state to prevent nonce conflicts
    const { exchangeClient } = state;

    // Create a map of order IDs to order details for quick lookup
    const orderMap = new Map(openOrders.map(order => [order.oid.toString(), order]));

    // Process all cancellations concurrently
    const cancellationPromises = pendingOrderCancellations.map(async (orderId) => {
      try {
        console.log(`🗑️ Cancelling order: ${orderId}`);

        // Find the order details
        const orderDetails = orderMap.get(orderId);
        if (!orderDetails) {
          throw new Error(`Order ${orderId} not found in open orders`);
        }

        // Get assetId from the coin symbol
        const metadata = await MarketDataService.getPerpMetadata(orderDetails.coin.toLowerCase());
        if (!metadata) {
          throw new Error(`No metadata found for coin: ${orderDetails.coin}`);
        }

        // Cancel order through TradingService
        const result: CancelSuccessResponse = await TradingService.cancelOrder(
          exchangeClient, 
          metadata.assetId,
          orderDetails.oid // oid is already a number in the order object
        );

        console.log(`✅ Order cancellation successful for ${orderId}:`, result);
        
        return [orderId, result];
        
      } catch (error) {
        console.error(`❌ Order cancellation failed for ${orderId}:`, error);
        return [orderId, error instanceof Error ? error : new Error(String(error))];
      }
    });

    // Wait for all cancellations to complete
    const cancellationResults = await Promise.all(cancellationPromises);
    
    // Separate successful results from errors
    const successfulResults = cancellationResults.filter(([_, result]) => !(result instanceof Error)) as [string, CancelSuccessResponse][];
    const failedResults = cancellationResults.filter(([_, result]) => result instanceof Error) as [string, Error][];
    
    // Count successes and failures
    const successful = successfulResults.length;
    const failed = failedResults.length;
    
    console.log(`📊 Order cancellation summary: ${successful} successful, ${failed} failed`);
      
    const failedOrders = failedResults
      .map(([orderId, error]) => `❌ Order ${orderId}: ${error.message}`)
      .join('\n');

    const content = `Summary: ${successful}/${successful + failed} order cancellations executed${failed > 0 ? ` (${failed} failed)` : ' successfully'}${failed > 0 ? `\n\nFailed:\n${failedOrders}` : ''}`;

    // Store both successful and failed results
    const allCancellationResults: Record<string, { success: boolean; message: string; response?: CancelSuccessResponse; error?: string }> = {};
    
    // Add successful results
    successfulResults.forEach(([orderId, response]) => {
      allCancellationResults[orderId] = {
        success: true,
        message: `Order cancellation successful for ${orderId}`,
        response: response
      };
    });
    
    // Add failed results
    failedResults.forEach(([orderId, error]) => {
      allCancellationResults[orderId] = {
        success: false,
        message: `Order cancellation failed for ${orderId}`,
        error: error.message
      };
    });

    // Only keep failed cancellations in the pending array
    const failedCancellations = pendingOrderCancellations.filter(orderId => {
      return !allCancellationResults[orderId]?.success;
    });

    return {
      orderCancellationResults: allCancellationResults,
      pendingOrderCancellations: failedCancellations.length > 0 ? failedCancellations : undefined, // Clear successful cancellations, keep failed ones
      messages: [
        ...state.messages,
        new ToolMessage({
          content,
          tool_call_id: "cancel_orders_success"
        })
      ]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error cancelling orders:`, error);

    return {
      error: errorMessage,
      messages: [
        ...state.messages,
        new ToolMessage({
          content: `Error cancelling orders: ${errorMessage}`,
          tool_call_id: "cancel_orders_error"
        })
      ]
    };
  }
}

// Configuration for the order cancellation node in LangGraph
export const cancelOrdersNodeConfig = {
  name: "cancel_orders",
  description: "Cancels all pending order cancellations concurrently and stores results in orderCancellationResults",
  inputSchema: {
    type: "object" as const,
    properties: {
      pendingOrderCancellations: {
        type: "array",
        description: "Array of order IDs (oids) to cancel"
      },
      openOrders: {
        type: "array",
        description: "Current open orders for order lookup"
      }
    },
    required: []
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      orderCancellationResults: {
        type: "object",
        description: "Results of order cancellation operations per order ID with success/failure details"
      },
      pendingOrderCancellations: {
        type: "array",
        description: "Updated array with only failed cancellations remaining"
      },
      error: {
        type: "string",
        description: "Error message if the operation failed"
      }
    }
  }
};