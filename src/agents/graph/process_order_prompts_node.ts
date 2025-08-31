import { ToolMessage } from "@langchain/core/messages";
import { openai } from "@ai-sdk/openai";
import { xai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { OrderParams } from "@nktkas/hyperliquid";
import { type GraphStateType } from "./shared_state.js";
import { TradingOrderParams } from "../../services/trading.js";

// Define the node function for processing pending order prompts
export async function processOrderPromptsNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  try {
    const { pendingOrderPrompts, allPerpMetadata, currentPrices } = state;

    // Early return if no pending order prompts
    if (!pendingOrderPrompts || Object.keys(pendingOrderPrompts).length === 0) {
      return {
        messages: [
          ...state.messages,
          new ToolMessage({
            content: "No pending order prompts to process",
            tool_call_id: "process_order_prompts_no_pending"
          })
        ]
      };
    }

    if (!allPerpMetadata) {
      return {
        error: "No perpetual metadata available for order processing",
        messages: [
          ...state.messages,
          new ToolMessage({
            content: "No perpetual metadata available for order processing",
            tool_call_id: "process_order_prompts_no_metadata"
          })
        ]
      };
    }

    console.log(`📋 Processing ${Object.keys(pendingOrderPrompts).length} order prompts`);

    // Get available symbols and their asset IDs for context
    const availableSymbols = Object.keys(allPerpMetadata);
    const symbolAssetIdMap = Object.fromEntries(
      availableSymbols.map(symbol => [symbol, allPerpMetadata[symbol]?.assetId])
    );

    // Process all order prompts concurrently
    const orderPromptProcessingPromises = Object.entries(pendingOrderPrompts).map(async ([symbol, orderPrompt]): Promise<[string, TradingOrderParams | Error]> => {
      try {
        console.log(`📝 Processing order prompt for ${symbol}: "${orderPrompt}"`);

        // Get current price for context
        const currentPrice = currentPrices && currentPrices[symbol] ? currentPrices[symbol] : "not available";
        
        // Create prompt for GPT to extract order parameters
        const extractionPrompt = `
You are a trading order parameter extractor. Convert this human-readable order prompt into structured trading parameters.

Order Prompt: "${orderPrompt}"
Symbol: ${symbol}
Current Price: ${currentPrice}

Available Order Types (market order is default if not specified):
- IMPORTANT: If user does not mention an order type, use this one: {'limit': {'tif': 'Ioc'}} for market orders (THIS IS THE DEFAULT IF ORDER TYPE IS NOT SPECIFIED)
- {'limit': {'tif': 'Ioc'}} for Immediate or Cancel limit orders
- {'limit': {'tif': 'Gtc'}} for Good Till Canceled limit orders  
- {'limit': {'tif': 'Alo'}} for Add Liquidity Only limit orders
- {'trigger': {'isMarket': true, 'triggerPx': '123.45', 'tpsl': 'sl'}} for stop loss orders (executes at market price once hit)
- {'trigger': {'isMarket': true, 'triggerPx': '123.45', 'tpsl': 'tp'}} for take profit orders (executes at market price once hit)

Extract the following parameters:
1. isBuy: true for buy orders, false for sell orders
2. price: price as string (use current price for market orders, specified price for limit/stop orders)
3. isMarketOrder: true for market orders, false for limit/stop orders
4. size: order size as string (in base currency units)
5. orderType: object matching one of the available order types above
6. reduceOnly: true for closing positions, false for opening positions

Examples:
- "buy $100 of BTC" → isBuy: true, size calculated from $100/current_price, isMarketOrder: true, orderType: {'trigger': {'isMarket': true, 'triggerPx': '0', 'tpsl': 'tp'}}
- "buy BTC at $65000" → isBuy: true, price: "65000", isMarketOrder: false, orderType: {'limit': {'tif': 'Gtc'}}
- "set stop loss on SOL at $150" → isBuy: false, price: "150", isMarketOrder: false, reduceOnly: true, orderType: {'trigger': {'isMarket': true, 'triggerPx': '150', 'tpsl': 'sl'}}
- "set take profit on BTC at $110000" → isBuy: true, price: "110000", isMarketOrder: true, orderType: {'trigger': {'isMarket': true, 'triggerPx': '110000', 'tpsl': 'tp'}}

Return ONLY a valid JSON object with these exact fields:
{
  "isBuy": boolean,
  "price": "string",
  "isMarketOrder": boolean,
  "size": "string", 
  "reduceOnly": boolean,
  "orderType": object
}
`;

        // Call GPT for order parameter extraction
        const { text: extractionResult } = await generateText({
          model: xai("grok-code-fast-1"),
          prompt: extractionPrompt,
          temperature: 0.1, // Low temperature for consistent extraction
        });

        console.log(`🤖 GPT Extraction Result for ${symbol}:`, extractionResult);

        // Parse the JSON response
        let orderParams;
        try {
          orderParams = JSON.parse(extractionResult);
        } catch (parseError) {
          console.error(`❌ Failed to parse GPT response for ${symbol}:`, parseError);
          throw new Error(`Failed to parse order parameters: ${extractionResult}`);
        }

        // Validate required fields
        const requiredFields = ['isBuy', 'price', 'size', 'orderType'];
        for (const field of requiredFields) {
          if (orderParams[field] === undefined) {
            throw new Error(`Missing required field: ${field}`);
          }
        }

        // Get assetId from our symbol mapping
        const assetId = symbolAssetIdMap[symbol];
        if (assetId === undefined) {
          throw new Error(`No asset ID found for symbol: ${symbol}`);
        }

        // Convert to Hyperliquid OrderParams format
        const hyperliquidOrderParams: TradingOrderParams = {
          assetId: assetId,
          isBuy: orderParams.isBuy,
          price: orderParams.price,
          size: orderParams.size,
          reduceOnly: orderParams.reduceOnly || false,
          orderType: orderParams.orderType,
          isMarketOrder: orderParams.isMarketOrder
        };

        console.log(`✅ Order parameters constructed for ${symbol}:`, hyperliquidOrderParams);
        
        return [symbol, hyperliquidOrderParams];
        
      } catch (error) {
        console.error(`❌ Order prompt processing failed for ${symbol}:`, error);
        return [symbol, error instanceof Error ? error : new Error(String(error))];
      }
    });

    // Wait for all order prompt processing to complete
    const orderPromptResults = await Promise.all(orderPromptProcessingPromises);
    
    // Separate successful results from errors
    const successfulResults = orderPromptResults.filter(([_, result]) => !(result instanceof Error)) as [string, TradingOrderParams][];
    const failedResults = orderPromptResults.filter(([_, result]) => result instanceof Error) as [string, Error][];
    
    // Convert successful results into record for state storage
    const ordersRecord = Object.fromEntries(successfulResults);
    
    // Count successes and failures
    const successful = successfulResults.length;
    const failed = failedResults.length;
    
    console.log(`📊 Order prompt processing summary: ${successful} successful, ${failed} failed`);

    const failedOrders = failedResults
      .map(([symbol, error]) => `❌ ${symbol}: ${error.message}`)
      .join('\n');

    // Create updated pendingOrderPrompts by removing successful entries
    const remainingPendingOrderPrompts = { ...pendingOrderPrompts };
    successfulResults.forEach(([symbol]) => {
      delete remainingPendingOrderPrompts[symbol];
    });
    
    // Return undefined if no entries remain, otherwise return the filtered object
    const finalPendingOrderPrompts = Object.keys(remainingPendingOrderPrompts).length > 0 
      ? remainingPendingOrderPrompts 
      : undefined;

    const content = `Summary: ${successful}/${successful + failed} order prompts processed${failed > 0 ? ` (${failed} failed)` : ' successfully'}${failed > 0 ? `\n\nFailed:\n${failedOrders}` : ''}`;

    return {
      pendingOrders: Object.keys(ordersRecord).length > 0 ? ordersRecord : undefined,
      pendingOrderPrompts: finalPendingOrderPrompts, // Keep only failed ones for potential retry
      messages: [
        ...state.messages,
        new ToolMessage({
          content,
          tool_call_id: "process_order_prompts_success"
        })
      ]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error processing order prompts:`, error);

    return {
      error: errorMessage,
      messages: [
        ...state.messages,
        new ToolMessage({
          content: `Error processing order prompts: ${errorMessage}`,
          tool_call_id: "process_order_prompts_error"
        })
      ]
    };
  }
}

// Configuration for the order prompt processing node in LangGraph
export const processOrderPromptsNodeConfig = {
  name: "process_order_prompts",
  description: "Processes pending order prompts through GPT to construct OrderParams and stores them in pendingOrders",
  inputSchema: {
    type: "object" as const,
    properties: {
      pendingOrderPrompts: {
        type: "object",
        description: "Record of symbols and their human-readable order prompts to process"
      },
      allPerpMetadata: {
        type: "object",
        description: "Available perpetual contract metadata for symbol and asset ID mapping"
      },
      currentPrices: {
        type: "object",
        description: "Current prices for context in order parameter calculation"
      }
    },
    required: ["pendingOrderPrompts", "allPerpMetadata"]
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      pendingOrders: {
        type: "object",
        description: "Constructed OrderParams objects for symbols with successfully processed prompts"
      },
      pendingOrderPrompts: {
        type: "object",
        description: "Remaining order prompts that failed processing (for retry)"
      },
      error: {
        type: "string",
        description: "Error message if the operation failed"
      }
    }
  }
};