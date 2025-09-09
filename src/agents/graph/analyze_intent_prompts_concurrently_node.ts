import { type GraphStateType } from "./shared_state.js";
import { analyzePromptLeverageUpdatesNode } from "./analyze_prompt_leverage_updates_node.js";
import { analyzePromptRegularOrdersNode } from "./analyze_prompt_regular_orders_node.js";
import { analyzePromptTpSlNode } from "./analyze_prompt_tp_sl_node.js";
import { analyzePromptCancelOrdersNode } from "./analyze_prompt_cancel_orders_node.js";

/**
 * Concurrent Analysis Node
 * Runs all 4 analyze_prompt nodes in parallel using Promise.all()
 * This provides true concurrent execution of the OpenAI API calls
 */
export async function analyzeIntentPromptsConcurrentlyNode(state: GraphStateType): Promise<{
  pendingOrders?: any[];
  pendingTakeProfitStopLossOrders?: any[];
  pendingLeverageUpdates?: Record<string, number>;
  pendingOrderCancellations?: string[];
  messages?: any[];
  error?: string;
}> {
  try {
    console.log('🚀 Starting concurrent analysis of all prompt intents...');
    const startTime = Date.now();

    // Run all 4 analyze_prompt nodes concurrently using Promise.all()
    const [
      leverageUpdatesResult,
      regularOrdersResult,
      tpSlResult,
      cancelOrdersResult
    ] = await Promise.all([
      analyzePromptLeverageUpdatesNode(state),
      analyzePromptRegularOrdersNode(state),
      analyzePromptTpSlNode(state),
      analyzePromptCancelOrdersNode(state)
    ]);

    const endTime = Date.now();
    const executionTime = endTime - startTime;
    console.log(`✅ Concurrent analysis completed in ${executionTime}ms`);

    // Combine results from all nodes
    const combinedResult: any = {};

    // Add leverage updates if found
    if (leverageUpdatesResult.pendingLeverageUpdates) {
      combinedResult.pendingLeverageUpdates = leverageUpdatesResult.pendingLeverageUpdates;
    }

    // Add regular orders if found
    if (regularOrdersResult.pendingOrders) {
      combinedResult.pendingOrders = regularOrdersResult.pendingOrders;
    }

    // Add TP/SL orders if found
    if (tpSlResult.pendingTakeProfitStopLossOrders) {
      combinedResult.pendingTakeProfitStopLossOrders = tpSlResult.pendingTakeProfitStopLossOrders;
    }

    // Add order cancellations if found
    if (cancelOrdersResult.pendingOrderCancellations) {
      combinedResult.pendingOrderCancellations = cancelOrdersResult.pendingOrderCancellations;
    }

    // Check for any errors
    const errors = [
      leverageUpdatesResult.error,
      regularOrdersResult.error,
      tpSlResult.error,
      cancelOrdersResult.error
    ].filter(Boolean);

    if (errors.length > 0) {
      combinedResult.error = errors.join('; ');
    }

    // Log summary of what was found
    const summary = {
      leverageUpdates: leverageUpdatesResult.pendingLeverageUpdates ? Object.keys(leverageUpdatesResult.pendingLeverageUpdates).length : 0,
      regularOrders: regularOrdersResult.pendingOrders ? regularOrdersResult.pendingOrders.length : 0,
      tpSlOrders: tpSlResult.pendingTakeProfitStopLossOrders ? tpSlResult.pendingTakeProfitStopLossOrders.length : 0,
      cancellations: cancelOrdersResult.pendingOrderCancellations ? cancelOrdersResult.pendingOrderCancellations.length : 0
    };

    console.log('📊 Analysis Summary:', summary);

    return combinedResult;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error('❌ Error in concurrent analysis:', error);

    return {
      error: errorMessage
    };
  }
}

// Configuration for the concurrent analysis node
export const analyzeIntentPromptsConcurrentlyNodeConfig = {
  name: "analyze_intent_prompts_concurrently",
  description: "Runs all 4 analyze_prompt nodes concurrently using Promise.all() for maximum performance",
  inputSchema: {
    type: "object" as const,
    properties: {
      allPerpMetadata: {
        type: "object",
        description: "Available perpetual contract metadata for all analyses"
      },
      clearinghouseState: {
        type: "object", 
        description: "User's current portfolio state for context"
      },
      openOrders: {
        type: "array",
        description: "User's current open orders for context"
      },
      currentPrices: {
        type: "object",
        description: "Current market prices for all symbols"
      }
    },
    required: ["allPerpMetadata"]
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      pendingOrders: {
        type: "array",
        description: "Regular orders converted to TradingOrderParams format"
      },
      pendingTakeProfitStopLossOrders: {
        type: "array",
        description: "TP/SL orders converted to TradingOrderParams format"
      },
      pendingLeverageUpdates: {
        type: "object",
        description: "Leverage updates for trading symbols"
      },
      pendingOrderCancellations: {
        type: "array",
        description: "Array of order IDs (oids) to be cancelled"
      },
      error: {
        type: "string",
        description: "Error message if the operation failed"
      }
    }
  }
};
