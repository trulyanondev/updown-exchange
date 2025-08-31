import { ToolMessage } from "@langchain/core/messages";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { type GraphStateType } from "./shared_state.js";
import { TradingOrderParams } from "../../services/trading.js";

const openai = new OpenAI();

// Schema for TP/SL analysis
const TakeProfitStopLossSchema = z.object({
  symbol: z.string(),
  type: z.enum(['take_profit', 'stop_loss']),
  trigger_price: z.number()
});

// Schema for TP/SL analysis output
const TpSlAnalysisSchema = z.object({
  take_profit_stop_loss: z.array(TakeProfitStopLossSchema),
  reasoning: z.string()
});

// Export types for use in other modules
export type TakeProfitStopLoss = z.infer<typeof TakeProfitStopLossSchema>;
export type TpSlAnalysis = z.infer<typeof TpSlAnalysisSchema>;

// Define the node function for analyzing TP/SL requirements in user input
export async function analyzePromptTpSlNode(state: GraphStateType): Promise<{
  pendingTakeProfitStopLossOrders?: TradingOrderParams[];
  messages?: any[];
  error?: string;
}> {
  try {
    const { inputPrompt, allPerpMetadata, clearinghouseState, openOrders } = state;

    if (!allPerpMetadata) {
      return {
        error: "No perpetual metadata available for TP/SL analysis",
        messages: [
          ...state.messages,
          new ToolMessage({
            content: "No perpetual metadata available for TP/SL analysis",
            tool_call_id: "analyze_tp_sl_error_no_metadata"
          })
        ]
      };
    }

    console.log(`🎯 Analyzing TP/SL orders in input: "${inputPrompt}"`);

    // Get available symbols for context
    const availableSymbols = Object.keys(allPerpMetadata);

    // Create summary of portfolio state to avoid deep type issues
    const portfolioSummary = clearinghouseState ? 
      `Account Value: ${clearinghouseState.marginSummary.accountValue}, Active Positions: [${clearinghouseState.assetPositions.filter(p => parseFloat(p.position.szi) !== 0).map(p => `${p.position.coin}:${p.position.szi}`).join(', ')}]` :
      "No portfolio data";
    
    const ordersSummary = openOrders ? 
      `Open Orders: ${openOrders.length} orders` :
      "No open orders";

    // Create prompt for GPT to analyze TP/SL requirements
    const analysisPrompt = `
You are a trading assistant analyzing user input to identify take profit and stop loss order requirements ONLY. Do not include regular buy/sell orders.

Available trading symbols: ${availableSymbols.join(', ')}

User's current portfolio summary: ${portfolioSummary}
User's open orders summary: ${ordersSummary}

Rules for TP/SL analysis:
1. Identify only take profit and stop loss orders
2. NO regular buy/sell orders - these are handled separately
3. Extract specific trigger price levels

Take Profit/Stop Loss structure:
- symbol: trading pair symbol  
- type: "take_profit" | "stop_loss"
- trigger_price: price level to trigger at

Examples:
- "set stop loss on sol at $50" → take_profit_stop_loss: [{symbol: "SOL", type: "stop_loss", trigger_price: 50}]
- "take profit on eth at $3000" → take_profit_stop_loss: [{symbol: "ETH", type: "take_profit", trigger_price: 3000}]
- "stop loss btc $45000" → take_profit_stop_loss: [{symbol: "BTC", type: "stop_loss", trigger_price: 45000}]
- "buy $100 of bitcoin" → NO TP/SL (this is regular order)
- "sell 0.1 eth" → NO TP/SL (this is regular order)
- "show me btc price" → NO TP/SL (just information request)

Analyze this user input: "${inputPrompt}"

Identify and structure ONLY take profit and stop loss orders. Do not include regular trading orders.
`;

    // Call OpenAI with structured output
    const response = await openai.responses.parse({
      model: "gpt-5-nano",
      input: [
        { role: "system", content: "You are a trading assistant analyzing user input for take profit and stop loss requirements only." },
        { role: "user", content: analysisPrompt }
      ],
      text: {
        format: zodTextFormat(TpSlAnalysisSchema, "tp_sl_analysis")
      }
    });

    const analysis = response.output_parsed;

    console.log(`🎯 TP/SL Analysis:`, analysis);

    // Handle potentially empty or undefined analysis results
    const tpSlOrders = analysis?.take_profit_stop_loss || [];
    const tpSlCount = tpSlOrders.length;

    const content = `
TP/SL Analysis: "${inputPrompt}"

🎯 Found ${tpSlCount} TP/SL orders
🤔 Reasoning: ${analysis?.reasoning}
`;

    // Convert TP/SL orders to TradingOrderParams and return if we found orders
    if (tpSlCount > 0) {
      const pendingTpSlOrders: TradingOrderParams[] = state.pendingTakeProfitStopLossOrders || [];

      for (const tpsl of tpSlOrders) {
        const metadata = allPerpMetadata[tpsl.symbol.toLowerCase()];
        if (!metadata) {
          console.error(`No metadata found for symbol: ${tpsl.symbol}`);
          continue;
        }

        // For TP/SL orders, we need to determine buy/sell direction based on current position
        let isBuy = false;
        let size = "0";
        
        // Find current position to determine direction and size
        if (clearinghouseState) {
          const position = clearinghouseState.assetPositions.find(
            pos => pos.position.coin.toLowerCase() === tpsl.symbol.toLowerCase()
          );
          
          if (position && parseFloat(position.position.szi) !== 0) {
            const positionSize = parseFloat(position.position.szi);
            // If long position (positive size), TP/SL should be sell (false)
            // If short position (negative size), TP/SL should be buy (true)
            isBuy = positionSize < 0;
            size = Math.abs(positionSize).toString();
          }
        }

        // Convert to TradingOrderParams
        const tradingParams: TradingOrderParams = {
          assetId: metadata.assetId,
          isBuy,
          price: tpsl.trigger_price.toString(),
          size,
          reduceOnly: true, // TP/SL orders are always reduce-only
          orderType: { 
            "trigger": { 
              "isMarket": "true",
              "triggerPx": tpsl.trigger_price.toString(),
              "tpsl": tpsl.type === "take_profit" ? "tp" : "sl"
            }
          }
        };

        pendingTpSlOrders.push(tradingParams);
      }

      const tpSlList = tpSlOrders.map(t => 
        `  • ${t.symbol}: ${t.type.toUpperCase().replace('_', ' ')} at $${t.trigger_price}`
      ).join('\n');

      return {
        pendingTakeProfitStopLossOrders: pendingTpSlOrders,
        messages: [
          ...state.messages,
          new ToolMessage({
            content: content + `✅ Ready for TP/SL order processing:\n${tpSlList}`,
            tool_call_id: "analyze_tp_sl_success"
          })
        ]
      };
    }

    // No TP/SL orders found - don't return any order fields
    return {
      messages: [
        ...state.messages,
        new ToolMessage({
          content: content + 'ℹ️ No TP/SL orders needed',
          tool_call_id: "analyze_tp_sl_success"
        })
      ]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error analyzing TP/SL orders:`, error);

    return {
      error: errorMessage,
      messages: [
        ...state.messages,
        new ToolMessage({
          content: `Error analyzing TP/SL orders: ${errorMessage}`,
          tool_call_id: "analyze_tp_sl_error"
        })
      ]
    };
  }
}

// Configuration for the TP/SL analysis node
export const analyzePromptTpSlNodeConfig = {
  name: "analyze_prompt_tp_sl",
  description: "Analyzes user input to identify take profit and stop loss requirements and converts to TradingOrderParams",
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
        description: "User's current portfolio state for position-based TP/SL calculations"
      },
      openOrders: {
        type: "array",
        description: "User's current open orders for context"
      },
      pendingTakeProfitStopLossOrders: {
        type: "object",
        description: "Existing pending TP/SL orders (optional)"
      }
    },
    required: ["inputPrompt", "allPerpMetadata"]
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      pendingTakeProfitStopLossOrders: {
        type: "object",
        description: "TP/SL orders converted to TradingOrderParams format"
      },
      error: {
        type: "string", 
        description: "Error message if the operation failed"
      }
    }
  }
};