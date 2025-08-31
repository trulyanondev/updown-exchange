import { ToolMessage } from "@langchain/core/messages";
import { type GraphStateType } from "./shared_state.js";
import { executeBulkOrders } from "./utils/bulk-order-execution.js";

// Define the node function for executing pending orders
export async function executeOrdersNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  try {
    const { pendingOrders, walletId } = state;

    // Early return if no pending orders
    if (!pendingOrders || pendingOrders.length === 0) {
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

    // Execute orders using shared helper function
    const execution = await executeBulkOrders(pendingOrders, walletId, "regular orders");

    return {
      orderCreationResults: execution.results,
      pendingOrders: undefined, // Clear all pending orders after execution attempt
      messages: [
        ...state.messages,
        new ToolMessage({
          content: execution.content,
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
        type: "array",
        description: "Array of TradingOrderParams to execute"
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