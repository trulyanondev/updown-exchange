import { ToolMessage } from "@langchain/core/messages";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { type GraphStateType } from "./shared_state.js";
import { TradingOrderParams } from "../../services/trading.js";
import { accountInfoFromState } from "./utils/account_info_from_state.js";
import { mapMessagesToOpenAI } from "./utils/message_helpers.js";

const openai = new OpenAI();

// Schemas for regular order analysis
const OrderAmountSchema = z.object({
  type: z.enum(['usd', 'token_quantity']),
  value: z.number()
});

const OrderPriceSchema = z.object({
  type: z.enum(['limit', 'market']),
  value: z.number().nullable() // null for market orders
});

const RegularOrderSchema = z.object({
  symbol: z.string(),
  amount: OrderAmountSchema,
  isBuy: z.boolean(),
  price: OrderPriceSchema
});

// Schema for regular orders analysis output
const RegularOrdersAnalysisSchema = z.object({
  orders: z.array(RegularOrderSchema),
  reasoning: z.string()
});

// Export types for use in other modules
export type RegularOrder = z.infer<typeof RegularOrderSchema>;
export type RegularOrdersAnalysis = z.infer<typeof RegularOrdersAnalysisSchema>;

// Define the node function for analyzing regular order requirements in user input
export async function analyzePromptRegularOrdersNode(state: GraphStateType): Promise<{
  pendingOrders?: TradingOrderParams[];
  messages?: any[];
  error?: string;
}> {
  try {
    const { allPerpMetadata, clearinghouseState, openOrders } = state;

    if (!allPerpMetadata) {
      return {
        error: "No perpetual metadata available for order analysis",
        messages: [
          ...state.messages,
          new ToolMessage({
            content: "No perpetual metadata available for order analysis",
            tool_call_id: "analyze_regular_orders_error_no_metadata"
          })
        ]
      };
    }

    console.log(`📋 Analyzing regular orders from conversation messages`);

    // Get available symbols for context
    const availableSymbols = Object.keys(allPerpMetadata);

    // Create prompt for GPT to analyze regular order requirements
    const analysisPrompt = `
You are a trading assistant analyzing user input to identify regular limit/market order requirements ONLY. Do not include take profit or stop loss orders.

Available trading symbols: ${availableSymbols.join(', ')}

User's current portfolio summary: ${accountInfoFromState(state).positionsSummary}
User's open orders summary: ${accountInfoFromState(state).ordersSummary}

Rules for regular order analysis:
1. Identify only regular BUY/SELL orders (limit or market)
2. NO take profit or stop loss orders - these are handled separately
3. NO vague amounts - convert "sell all" to specific token quantities, "buy all" to specific USD amounts
4. For "close position", convert to specific buy/sell orders based on current positions
5. Any update order requests should be converted to a new limit order with the new requirements.  Existing order will be handled elsewhere.

Regular Order structure:
- symbol: trading pair symbol
- amount: {type: "usd" | "token_quantity", value: number}
- isBuy: true for buy orders, false for sell orders
- price: {type: "market" | "limit", value: number | null (null for market orders)}

Examples:
- "buy $100 of bitcoin" → orders: [{symbol: "BTC", amount: {type: "usd", value: 100}, isBuy: true, price: {type: "market", value: null}}]
- "sell 0.1 eth at $2000" → orders: [{symbol: "ETH", amount: {type: "token_quantity", value: 0.1}, isBuy: false, price: {type: "limit", value: 2000}}]
- "close my btc position" (if user has 0.0001 BTC long) → orders: [{symbol: "BTC", amount: {type: "token_quantity", value: 0.0001}, isBuy: false, price: {type: "market", value: null}}]
- "set stop loss on sol at $50" → NO orders (this is TP/SL, not regular order)
- "buy bitcoin" (without amount) → treat as a market order buy for $11 of the requested token [{symbol: "BTC", amount: {type: "usd", value: 11}, isBuy: true, price: {type: "market", value: null}}]
- "show me btc price" → NO orders (just information request)
- "update my btc limit order to $50000" → if an open order exists for BTC with reduce only false, create a new limit order with the new price.

Identify and structure ONLY regular trading orders. Do not include take profit or stop loss orders.
`;

    // Call OpenAI with structured output
    const response = await openai.responses.parse({
      model: "gpt-5-nano",
      input: [
        { role: "system", content: analysisPrompt },
        ...mapMessagesToOpenAI(state.messages)
      ],
      text: {
        format: zodTextFormat(RegularOrdersAnalysisSchema, "regular_orders_analysis")
      }
    });

    const analysis = response.output_parsed as RegularOrdersAnalysis;

    console.log(`📋 Regular Orders Analysis:`, JSON.stringify(analysis, null, 2));

    // Handle potentially empty or undefined analysis results
    const orders = analysis?.orders || [];
    const orderCount = orders.length;

    const content = `
Regular Orders Analysis

📋 Found ${orderCount} regular orders
🤔 Reasoning: ${analysis?.reasoning}
`;

    // Convert orders to TradingOrderParams and return if we found orders
    if (orderCount > 0) {
      const pendingOrders: TradingOrderParams[] = state.pendingOrders || [];

      for (const order of orders) {
        const metadata = allPerpMetadata[order.symbol.toLowerCase()];
        if (!metadata) {
          console.error(`No metadata found for symbol: ${order.symbol}`);
          continue;
        }
        const currentPrice = state.currentPrices?.[order.symbol.toLowerCase()];

        const isMarketOrder = order.price.type === "market";
        if (!currentPrice && isMarketOrder) {
          console.error(`No current price found for symbol: ${order.symbol}`);
          continue;
        }

        const buffer = 0.02;
        const marketPrice = (currentPrice || 0);
        const adjustedMarketPrice = marketPrice * (order.isBuy ? (1 + buffer) : (1 - buffer));

        const nominalFinalPrice = isMarketOrder ? marketPrice : (order.price.value ?? marketPrice);
        const adjustedFinalPrice = isMarketOrder ? adjustedMarketPrice : (order.price.value ?? adjustedMarketPrice);

        if (nominalFinalPrice !== 0) {
          let size = order.amount.type === "usd" ? (order.amount.value / nominalFinalPrice) : order.amount.value;
      
          if (order.amount.type === "usd" && size * nominalFinalPrice < 10.5) {
            console.log(`🚨 Size is too close to minimum order size for ${order.symbol}. Setting size to $10.50 min order size`);
            size = 10.5 / nominalFinalPrice;
          }

          // Convert to TradingOrderParams
          const tradingParams: TradingOrderParams = {
            assetId: metadata.assetId,
            isBuy: order.isBuy,
            price: adjustedFinalPrice.toString(),
            size: size.toString(),
            reduceOnly: false,
            orderType: { 
              "limit": { 
                "tif": order.price.type === "limit" ? "Gtc" : "Ioc" // Market orders are Ioc limit orders
              }
            }
          };

          pendingOrders.push(tradingParams);
        }
      }

      const ordersList = orders.map(o => 
        `  • ${o.symbol}: ${o.isBuy ? 'BUY' : 'SELL'} ${o.amount.type === 'usd' ? '$' + o.amount.value : o.amount.value + ' tokens'} ${o.price.type === 'limit' ? 'at $' + o.price.value : 'at market'}`
      ).join('\n');

      return {
        pendingOrders,
        messages: [
          ...state.messages,
          new ToolMessage({
            content: content + `✅ Ready for regular order processing:\n${ordersList}`,
            tool_call_id: "analyze_regular_orders_success"
          })
        ]
      };
    }

    // No orders found - don't return any order fields
    return {
      messages: [
        ...state.messages,
        new ToolMessage({
          content: content + 'ℹ️ No regular orders needed',
          tool_call_id: "analyze_regular_orders_success"
        })
      ]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error analyzing regular orders:`, error);

    return {
      error: errorMessage,
      messages: [
        ...state.messages,
        new ToolMessage({
          content: `Error analyzing regular orders: ${errorMessage}`,
          tool_call_id: "analyze_regular_orders_error"
        })
      ]
    };
  }
}

// Configuration for the regular orders analysis node
export const analyzePromptRegularOrdersNodeConfig = {
  name: "analyze_prompt_regular_orders",
  description: "Analyzes user input to identify regular limit/market order requirements and converts to TradingOrderParams",
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
      pendingOrders: {
        type: "object",
        description: "Existing pending orders (optional)"
      }
    },
    required: ["inputPrompt", "allPerpMetadata"]
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      pendingOrders: {
        type: "object",
        description: "Regular orders converted to TradingOrderParams format"
      },
      error: {
        type: "string", 
        description: "Error message if the operation failed"
      }
    }
  }
};