import { ToolMessage } from "@langchain/core/messages";
import { OrderResponse } from "@nktkas/hyperliquid";
import { type GraphStateType } from "./shared_state.js";
import TradingService, { TradingOrderParams } from "../../services/trading.js";
import HyperliquidService from "../../services/hyperliquid.js";
import MarketDataService from "../../services/marketdata.js";

// Define the node function for executing pending orders
export async function executeOrdersNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  try {
    const { pendingOrders, walletId } = state;

    // Early return if no pending orders
    if (!pendingOrders || Object.keys(pendingOrders).length === 0) {
      return {
        messages: [
          ...state.messages,
          new ToolMessage({
            content: "No pending orders to execute",
            tool_call_id: "execute_orders_no_pending"
          })
        ]
      };
    }

    console.log(`📋 Executing ${Object.keys(pendingOrders).length} orders for wallet: ${walletId}`);

    // Create a shared ExchangeClient for all orders to ensure nonce consistency
    const exchangeClient = HyperliquidService.exchangeClient(walletId);

    // Process all orders concurrently
    const orderExecutionPromises = Object.entries(pendingOrders).map(async ([symbol, tradingOrderParams]) => {
      try {
        console.log(`📝 Executing order for ${symbol}:`, tradingOrderParams);

        // Execute order through TradingService
        const result: OrderResponse = await TradingService.createOrder(exchangeClient, tradingOrderParams);

        console.log(`✅ Order execution successful for ${symbol}:`, result);
        
        return [symbol, result];
        
      } catch (error) {
        console.error(`❌ Order execution failed for ${symbol}:`, error);
        return [symbol, error instanceof Error ? error : new Error(String(error))];
      }
    });

    // Wait for all order executions to complete
    const orderExecutionResults = await Promise.all(orderExecutionPromises);
    
    // Separate successful results from errors
    const successfulResults = orderExecutionResults.filter(([_, result]) => !(result instanceof Error)) as [string, OrderResponse][];
    const failedResults = orderExecutionResults.filter(([_, result]) => result instanceof Error) as [string, Error][];
    
    // Convert successful results into record for state storage
    const resultsRecord = Object.fromEntries(successfulResults);
    
    // Count successes and failures
    const successful = successfulResults.length;
    const failed = failedResults.length;
    
    console.log(`📊 Order execution summary: ${successful} successful, ${failed} failed`);
      
    const failedOrders = failedResults
      .map(([symbol, error]) => `❌ ${symbol}: ${error.message}`)
      .join('\n');

    const content = `Summary: ${successful}/${successful + failed} orders executed${failed > 0 ? ` (${failed} failed)` : ' successfully'}${failed > 0 ? `\n\nFailed:\n${failedOrders}` : ''}`;

    // For order creation results, we store both successful and failed results
    // Successful results get the OrderResponse, failed results get error info
    const allOrderResults: Record<string, { success: boolean; message: string; response?: OrderResponse; error?: string }> = {};
    
    // Add successful results
    successfulResults.forEach(([symbol, response]) => {
      allOrderResults[symbol] = {
        success: true,
        message: `Order executed successfully for ${symbol}`,
        response: response
      };
    });
    
    // Add failed results
    failedResults.forEach(([symbol, error]) => {
      allOrderResults[symbol] = {
        success: false,
        message: `Order execution failed for ${symbol}`,
        error: error.message
      };
    });

    return {
      orderCreationResults: allOrderResults,
      pendingOrders: undefined, // Clear all pending orders after execution attempt
      messages: [
        ...state.messages,
        new ToolMessage({
          content,
          tool_call_id: "execute_orders_success"
        })
      ]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error executing orders:`, error);

    return {
      error: errorMessage,
      messages: [
        ...state.messages,
        new ToolMessage({
          content: `Error executing orders: ${errorMessage}`,
          tool_call_id: "execute_orders_error"
        })
      ]
    };
  }
}

// Configuration for the order execution node in LangGraph
export const executeOrdersNodeConfig = {
  name: "execute_orders",
  description: "Executes all pending orders concurrently and stores results in orderCreationResults",
  inputSchema: {
    type: "object" as const,
    properties: {
      pendingOrders: {
        type: "object",
        description: "Record of symbols and their OrderParams to execute"
      },
      walletId: {
        type: "string",
        description: "The wallet ID to execute orders for"
      }
    },
    required: ["walletId"]
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      orderCreationResults: {
        type: "object",
        description: "Results of order execution operations per symbol with success/failure details"
      },
      pendingOrders: {
        type: "undefined",
        description: "Cleared after execution attempt (set to undefined)"
      },
      error: {
        type: "string",
        description: "Error message if the operation failed"
      }
    }
  }
};