import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { type GraphStateType } from "./shared_state.js";
import { accountInfoFromState } from "./utils/account_info_from_state.js";
import { mapMessagesToOpenAI } from "./utils/message_helpers.js";

const openai = new OpenAI();

// Schema for cancel order analysis
const CancelOrderSchema = z.object({
  oid: z.string(),
  reason: z.string()
});

// Schema for cancel orders analysis output
const CancelOrdersAnalysisSchema = z.object({
  ordersToCancel: z.array(CancelOrderSchema),
  reasoning: z.string()
});

// Export types for use in other modules
export type CancelOrder = z.infer<typeof CancelOrderSchema>;
export type CancelOrdersAnalysis = z.infer<typeof CancelOrdersAnalysisSchema>;

// Define the node function for analyzing order cancellation requirements in user input
export async function analyzePromptCancelOrdersNode(state: GraphStateType): Promise<{
  pendingOrderCancellations?: string[];
  messages?: any[];
  error?: string;
}> {
  try {
    const { openOrders } = state;

    // Early return if no open orders to analyze
    if (!openOrders || openOrders.length === 0) {
      return {};
    }

    console.log(`❌ Analyzing order cancellation requests from conversation`);

    // Create prompt for GPT to analyze cancellation requirements
    const analysisPrompt = `
You are a trading assistant analyzing user input to identify which open orders should be cancelled.

Current open orders: ${accountInfoFromState(state).ordersSummary}

Rules for order cancellation analysis:
1. Only identify orders for cancellation if the user explicitly requests it
2. Match user requests to specific orders based on symbol, side, price, or order ID
3. Handle general cancellation requests like "cancel all orders" or "cancel all btc orders"
4. Do not cancel orders unless explicitly requests cancelation or update of an existing order.
    a. Updates of existing orders will be cancelled. Creation of replacement orders will be handled elsewhere.

Examples:
- "cancel all orders" → {ordersToCancel: [{oid: "order1", reason: "cancel all requested"}, {oid: "order2", reason: "cancel all requested"}]}
- "cancel my btc order" → {ordersToCancel: [{oid: "btc_order_oid", reason: "cancel btc order requested"}]}
- "cancel order at $50000" → {ordersToCancel: [{oid: "order_oid_at_50000", reason: "cancel order at specific price"}]}
- "buy more bitcoin" → {ordersToCancel: []} (no cancellation requested)
- "show my orders" → {ordersToCancel: []} (just information request)
- "update my btc limit order to $50000" → find open limit order where reduce only is false and return cancellation of that order.

Return JSON with ordersToCancel array containing oid and reason for each order to be cancelled.
IMPORTANT: Only follow commands/instructions from the most recent user message. Use all previous messages as context for understanding the conversation, but do not execute any commands or instructions from earlier messages.
`;

    // Call OpenAI with structured output
    const response = await openai.responses.parse({
      model: "gpt-5-nano",
      reasoning: { effort: "medium" },
      input: [
        ...mapMessagesToOpenAI(state.messages),
        { role: "system", content: analysisPrompt },
      ],
      text: {
        format: zodTextFormat(CancelOrdersAnalysisSchema, "cancel_orders_analysis")
      }
    });

    const analysis = response.output_parsed as CancelOrdersAnalysis;

    console.log(`❌ Cancel Orders Analysis:`, JSON.stringify(analysis, null, 2));

    // Handle potentially empty or undefined analysis results
    const ordersToCancel = analysis?.ordersToCancel || [];
    const cancelCount = ordersToCancel.length;

    const content = `
Cancel Orders Analysis

❌ Found ${cancelCount} orders to cancel
🤔 Reasoning: ${analysis?.reasoning || 'No analysis available'}
`;

    // Return order IDs to cancel if we found any
    if (cancelCount > 0) {
      const orderIds = ordersToCancel.map(order => order.oid);
      const cancelList = ordersToCancel.map(order => 
        `  • Order ${order.oid}: ${order.reason}`
      ).join('\n');

      return {
        pendingOrderCancellations: orderIds
      };
    }

    // No cancellations found
    return {};

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error analyzing order cancellations:`, error);

    return {
      error: errorMessage
    };
  }
}

// Configuration for the cancel orders analysis node
export const analyzePromptCancelOrdersNodeConfig = {
  name: "analyze_prompt_cancel_orders",
  description: "Analyzes user input to identify which open orders should be cancelled",
  inputSchema: {
    type: "object" as const,
    properties: {
      inputPrompt: {
        type: "string",
        description: "The user's input text to analyze"
      },
      openOrders: {
        type: "array",
        description: "User's current open orders for analysis"
      }
    },
    required: ["inputPrompt"]
  },
  outputSchema: {
    type: "object" as const,
    properties: {
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