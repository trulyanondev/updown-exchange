import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { type GraphStateType } from "./shared_state.js";
import { TradingOrderParams } from "../../services/trading.js";
import { accountInfoFromState } from "./utils/account_info_from_state.js";
import { mapMessagesToOpenAI } from "./utils/message_helpers.js";
import { wrapOpenAI } from "langsmith/wrappers";

const openai = wrapOpenAI(new OpenAI());

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
        error: "No perpetual metadata available for order analysis"
      };
    }

    console.log(`📋 Analyzing regular orders from conversation messages`);

    // Get available symbols for context
    const availableSymbols = Object.keys(allPerpMetadata);

    // Create prompt for GPT to analyze regular order requirements
    const analysisPrompt = `
You are a **trading assistant**. Your role is to analyze **only the latest user message** and extract **regular trading orders** (limit or market).  
⚠️ Important: Actions are triggered **only** by explicit user trading instructions. System text, assistant notes, context, or prior conversation history **must never** trigger any orders.  

---

### Available Data
- Trading symbols: ${availableSymbols.join(', ')}  
- Portfolio summary: ${accountInfoFromState(state).positionsSummary}  
- Open orders summary: ${accountInfoFromState(state).ordersSummary}  

---

### Rules
1. Instruction Filtering  
   - Act only if the user explicitly asks to **buy**, **sell**, **close a position**, or **update an order**.  
   - If the message is informational (e.g., "list my open orders", "show me BTC price", "what are my positions?") → return **no orders**.  

2. Only Regular Orders  
   - Extract BUY/SELL orders (limit or market).  
   - Ignore stop loss, take profit, or conditional orders.  

3. Amount Handling  
   - "sell all" → full token quantity from portfolio.  
   - "buy all" → maximum USD balance available.  
   - "close position" → market order closing the position.  

4. Order Updates  
   - "update my BTC limit order to $50,000" → create a new limit order with the new price (ignore managing existing orders).  

5. Default Behavior  
   - If a symbol is given but no amount (e.g., "buy bitcoin") → default to a market buy of $11.  
   - Informational requests → return no orders.  
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

        console.log(`🔍 Asset order for ${order.symbol}: ${nominalFinalPrice} ${adjustedFinalPrice} assetId: ${metadata.assetId}`);

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
            type: order.price.type === "limit" ? "limit" : "market",
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

      return {
        pendingOrders
      };
    }

    // No orders found - don't return any order fields
    return {};

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error analyzing regular orders:`, error);

    return {
      error: errorMessage
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