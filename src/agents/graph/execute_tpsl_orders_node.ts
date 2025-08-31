import { ToolMessage } from "@langchain/core/messages";
import { type GraphStateType } from "./shared_state.js";
import { executeBulkOrders } from "./utils/bulk-order-execution.js";

// Define the node function for executing pending TP/SL orders
export async function executeTpSlOrdersNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  try {
    const { pendingTakeProfitStopLossOrders, exchangeClient } = state;

    // Early return if no pending TP/SL orders
    if (!pendingTakeProfitStopLossOrders || pendingTakeProfitStopLossOrders.length === 0) {
      return {
        messages: [
          ...state.messages,
          new ToolMessage({
            content: "No pending TP/SL orders to execute",
            tool_call_id: "execute_tpsl_orders_no_pending"
          })
        ]
      };
    }

    // Execute TP/SL orders using shared helper function with shared exchange client
    const execution = await executeBulkOrders(pendingTakeProfitStopLossOrders, exchangeClient, "TP/SL orders");

    return {
      tpslResults: execution.results,
      pendingTakeProfitStopLossOrders: undefined,
      messages: [
        ...state.messages,
        new ToolMessage({
          content: execution.content,
          tool_call_id: "execute_tpsl_orders_success"
        })
      ]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error executing TP/SL orders:`, error);

    return {
      error: errorMessage,
      messages: [
        ...state.messages,
        new ToolMessage({
          content: `Error executing TP/SL orders: ${errorMessage}`,
          tool_call_id: "execute_tpsl_orders_error"
        })
      ]
    };
  }
}

// Configuration for the TP/SL order execution node in LangGraph
export const executeTpSlOrdersNodeConfig = {
  name: "execute_tpsl_orders",
  description: "Executes all pending TP/SL orders concurrently and stores results in tpslResults",
  inputSchema: {
    type: "object" as const,
    properties: {
      pendingTakeProfitStopLossOrders: {
        type: "array",
        description: "Array of TradingOrderParams for TP/SL orders to execute"
      }
    },
    required: []
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      tpslResults: {
        type: "object",
        description: "Results of TP/SL order execution operations"
      },
      pendingTakeProfitStopLossOrders: {
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