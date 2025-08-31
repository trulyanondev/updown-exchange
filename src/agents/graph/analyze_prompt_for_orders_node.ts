import { ToolMessage } from "@langchain/core/messages";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { type GraphStateType } from "./shared_state.js";

const openai = new OpenAI();

// Schema for orders analysis output
const OrdersAnalysisSchema = z.object({
  symbolsNeedingOrderPrompts: z.record(z.string()),
  reasoning: z.string()
});

// Define the node function for analyzing order requirements in user input
export async function analyzePromptForOrdersNode(state: GraphStateType): Promise<{
  pendingOrderPrompts?: Record<string, string>;
  messages?: any[];
  error?: string;
}> {
  try {
    const { inputPrompt, allPerpMetadata, clearinghouseState, openOrders } = state;

    if (!allPerpMetadata) {
      return {
        error: "No perpetual metadata available for order analysis",
        messages: [
          ...state.messages,
          new ToolMessage({
            content: "No perpetual metadata available for order analysis",
            tool_call_id: "analyze_orders_error_no_metadata"
          })
        ]
      };
    }

    console.log(`📋 Analyzing order requirements in input: "${inputPrompt}"`);

    // Get available symbols for context
    const availableSymbols = Object.keys(allPerpMetadata);

    // Create summary of portfolio state to avoid deep type issues
    const portfolioSummary = clearinghouseState ? 
      `Account Value: ${clearinghouseState.marginSummary.accountValue}, Active Positions: [${clearinghouseState.assetPositions.filter(p => parseFloat(p.position.szi) !== 0).map(p => `${p.position.coin}:${p.position.szi}`).join(', ')}]` :
      "No portfolio data";
    
    const ordersSummary = openOrders ? 
      `Open Orders: ${openOrders.length} orders` :
      "No open orders";

    // Create prompt for GPT to analyze order requirements
    const analysisPrompt = `
You are a trading assistant analyzing user input to determine which symbols need orders placed and what the specific order prompts should be.

Available trading symbols: ${availableSymbols.join(', ')}

User's current portfolio summary: ${portfolioSummary}
User's open orders summary: ${ordersSummary}

Rules for order prompts:
1. Order prompts should be take profit/stop loss OR orders with specific size in USD or asset size
2. NO vague amounts like "sell all" or "buy all" without converting to specific amounts
3. For "close position" or "sell all", convert to specific asset amounts based on current positions
4. For "buy all" or similar, you need a specific USD amount or percentage of available balance

Examples:
- "buy $10 of bitcoin" → BTC order prompt: "buy $10 of BTC"
- "sell 0.1 eth" → ETH order prompt: "sell 0.1 ETH"
- "set stop loss on sol to $50" → SOL order prompt: "set stop loss on SOL at $50"
- "close my btc position" (if user has 0.0001 BTC long) → BTC order prompt: "sell 0.0001 BTC"
- "sell all my eth" (if user has 0.1 ETH short) → ETH order prompt: "buy 0.1 ETH"
- "buy bitcoin" (without amount) → NO order prompt (too vague)
- "show me btc price" → NO order prompt (just information request)

Analyze this user input: "${inputPrompt}"

Identify symbols that need orders placed with SPECIFIC order prompts. Convert vague instructions like "close position" to specific amounts based on current portfolio.
`;

    // Call OpenAI with structured output
    const response = await openai.responses.parse({
      model: "gpt-5-nano",
      input: [
        { role: "system", content: "You are a trading assistant analyzing user input for specific order requirements." },
        { role: "user", content: analysisPrompt }
      ],
      text: {
        format: zodTextFormat(OrdersAnalysisSchema, "orders_analysis")
      }
    });

    const analysis = response.output_parsed;

    console.log(`📋 Orders Analysis:`, analysis);

    // Handle potentially empty or undefined analysis results
    const symbolsNeedingOrderPrompts = analysis?.symbolsNeedingOrderPrompts || {};
    const orderCount = Object.keys(symbolsNeedingOrderPrompts).length;
    const orderList = Object.entries(symbolsNeedingOrderPrompts).map(([sym, prompt]) => `  • ${sym}: ${prompt}`).join('\n');

    const content = `
Orders Analysis: "${inputPrompt}"

📋 Found ${orderCount} symbols needing orders
🤔 Reasoning: ${analysis?.reasoning}
`;

    // Only return pendingOrderPrompts if we found orders
    if (orderCount > 0) {
      const updatedPendingOrderPrompts = { ...(state.pendingOrderPrompts || {}) };
      let orderPromptsAdded = 0;

      for (const [symbol, orderPrompt] of Object.entries(symbolsNeedingOrderPrompts)) {
        if (!updatedPendingOrderPrompts.hasOwnProperty(symbol.toLowerCase())) {
          updatedPendingOrderPrompts[symbol.toLowerCase()] = orderPrompt;
          orderPromptsAdded++;
        }
      }

      return {
        pendingOrderPrompts: updatedPendingOrderPrompts,
        messages: [
          ...state.messages,
          new ToolMessage({
            content: content + `✅ Ready for order processing:\n${orderList}`,
            tool_call_id: "analyze_orders_success"
          })
        ]
      };
    }

    // No orders found - don't return pendingOrderPrompts field
    return {
      messages: [
        ...state.messages,
        new ToolMessage({
          content: content + 'ℹ️ No specific orders needed',
          tool_call_id: "analyze_orders_success"
        })
      ]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error analyzing orders:`, error);

    return {
      error: errorMessage,
      messages: [
        ...state.messages,
        new ToolMessage({
          content: `Error analyzing orders: ${errorMessage}`,
          tool_call_id: "analyze_orders_error"
        })
      ]
    };
  }
}

// Configuration for the orders analysis node
export const analyzePromptForOrdersNodeConfig = {
  name: "analyze_prompt_for_orders",
  description: "Analyzes user input to identify specific order requirements and generates order prompts",
  inputSchema: {
    type: "object" as const,
    properties: {
      inputPrompt: {
        type: "string",
        description: "The user's input text to analyze"
      },
      allPerpMetadata: {
        type: "object",
        description: "Available perpetual contract metadata for symbol matching"
      },
      clearinghouseState: {
        type: "object", 
        description: "User's current portfolio state for position-based order calculations"
      },
      openOrders: {
        type: "array",
        description: "User's current open orders for context"
      },
      pendingOrderPrompts: {
        type: "object",
        description: "Existing pending order prompts (optional)"
      }
    },
    required: ["inputPrompt", "allPerpMetadata"]
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      pendingOrderPrompts: {
        type: "object",
        description: "Updated pendingOrderPrompts record with specific order instructions"
      },
      error: {
        type: "string", 
        description: "Error message if the operation failed"
      }
    }
  }
};