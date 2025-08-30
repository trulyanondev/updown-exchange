import { ToolMessage } from "@langchain/core/messages";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { type GraphStateType } from "./shared_state.js";

// Define the node function for analyzing input and determining required symbols/prices
export async function analyzeInputNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  try {
    const { inputPrompt, allPerpMetadata } = state;

    if (!allPerpMetadata) {
      return {
        error: "No perpetual metadata available for symbol analysis",
        messages: [
          ...state.messages,
          new ToolMessage({
            content: "No perpetual metadata available for symbol analysis",
            tool_call_id: "analyze_input_error_no_metadata"
          })
        ]
      };
    }

    console.log(`🔍 Analyzing input: "${inputPrompt}"`);

    // Get available symbols for context
    const availableSymbols = Object.keys(allPerpMetadata);
    console.log(`📊 Available symbols: ${availableSymbols.join(', ')}`);

    // Create prompt for GPT to analyze the input
    const analysisPrompt = `
You are a trading assistant analyzing user input to determine:
1. Which trading symbols are mentioned or implied
2. Which of those symbols need current price data for the user's request
3. Which of those symbols need orders to be placed (buy/sell/close operations)
4. Which of those symbols need leverage updates and what is the desired leverage

Available trading symbols: ${availableSymbols.join(', ')}

Common symbol mappings:
- Bitcoin = BTC
- Ethereum = ETH
- Solana = SOL
- And many others in the available symbols list

Examples:
- "buy $10 of bitcoin" → BTC symbol, needs price (to convert $10 to BTC amount), needs order, no leverage update
- "update btc to 22x leverage" → BTC symbol, doesn't need price, doesn't need order, needs leverage update
- "sell all my eth" → ETH symbol, might need price (depending on context), needs order, no leverage update
- "show me btc price" → BTC symbol, needs price, doesn't need order, no leverage update
- "set stop loss on sol to $50" → SOL symbol, might need price (to calculate position size), needs order, no leverage update
- "close my btc position" → BTC symbol, doesn't need price, needs order, no leverage update
- "change eth leverage to 10x" → ETH symbol, doesn't need price, doesn't need order, needs leverage update
- "set btc to 5x leverage and buy $100" → BTC symbol, needs price, needs order, needs leverage update

Analyze this user input: "${inputPrompt}"

Return a JSON response with:
{
  "mentionedSymbols": ["SYMBOL1", "SYMBOL2"], // symbols explicitly or implicitly mentioned
  "symbolsNeedingPrices": ["SYMBOL1"], // subset that need current price data
  "symbolsNeedingOrders": ["SYMBOL1"], // subset that need orders to be placed
  "symbolsNeedingLeverageUpdates": { "SYMBOL1" : 10, "SYMBOL2" : 20 }, // subset that need leverage updates, with desired leverage
  "reasoning": "brief explanation of your analysis"
}
`;

    // Call GPT for analysis
    const { text: analysisResult } = await generateText({
      model: openai("gpt-5-mini"),
      prompt: analysisPrompt,
      temperature: 0.1, // Low temperature for consistent analysis
    });

    console.log(`🤖 GPT Analysis Result:`, analysisResult);

    // Parse the JSON response
    let analysis;
    try {
      analysis = JSON.parse(analysisResult);
    } catch (parseError) {
      console.error(`❌ Failed to parse GPT response:`, parseError);
      return {
        error: "Failed to parse AI analysis response",
        messages: [
          ...state.messages,
          new ToolMessage({
            content: `Failed to parse AI analysis response: ${analysisResult}`,
            tool_call_id: "analyze_input_error_parse"
          })
        ]
      };
    }

    const { mentionedSymbols, symbolsNeedingPrices, symbolsNeedingOrders, symbolsNeedingLeverageUpdates, reasoning } = analysis;

    console.log(`📝 Analysis Results:`, {
      mentionedSymbols,
      symbolsNeedingPrices,
      symbolsNeedingOrders,
      symbolsNeedingLeverageUpdates,
      reasoning
    });

    // Create updated currentPrices record
    const updatedCurrentPrices = { ...(state.currentPrices || {}) };

    // Add symbols that need prices with undefined values
    let pricesAdded = 0;
    for (const symbol of symbolsNeedingPrices) {
      if (!updatedCurrentPrices.hasOwnProperty(symbol)) {
        updatedCurrentPrices[symbol] = undefined;
        pricesAdded++;
      }
    }

    // Create updated pendingOrders record for symbols that need orders
    const updatedPendingOrders = { ...(state.pendingOrders || {}) };
    let ordersAdded = 0;
    
    if (symbolsNeedingOrders && symbolsNeedingOrders.length > 0) {
      for (const symbol of symbolsNeedingOrders) {
        if (!updatedPendingOrders.hasOwnProperty(symbol)) {
          updatedPendingOrders[symbol] = null as any; // OrderParams will be assembled later
          ordersAdded++;
        }
      }
    }

    // Create updated pendingLeverageUpdates record for symbols that need leverage updates
    const updatedPendingLeverageUpdates = { ...(state.pendingLeverageUpdates || {}) };
    let leverageUpdatesAdded = 0;
    
    if (symbolsNeedingLeverageUpdates && Object.keys(symbolsNeedingLeverageUpdates).length > 0) {
      for (const symbol of Object.keys(symbolsNeedingLeverageUpdates)) {
        if (!updatedPendingLeverageUpdates.hasOwnProperty(symbol)) {
          updatedPendingLeverageUpdates[symbol] = symbolsNeedingLeverageUpdates[symbol]; // Leverage value will be determined later
          leverageUpdatesAdded++;
        }
      }
    }

    const content = `
Analysis of input: "${inputPrompt}"

📊 Found ${mentionedSymbols.length} mentioned symbols: ${mentionedSymbols.join(', ')}
🤔 Reasoning: ${reasoning}

${pricesAdded > 0 ? `✅ Ready for price fetching for: ${symbolsNeedingPrices.join(', ')}` : 'ℹ️ No price fetching needed'}
${ordersAdded > 0 ? `📋 Ready for order assembly for: ${symbolsNeedingOrders?.join(', ')}` : 'ℹ️ No orders needed'}
${leverageUpdatesAdded > 0 ? `🔧 Ready for leverage updates for: ${Object.keys(symbolsNeedingLeverageUpdates).join(', ')}` : 'ℹ️ No leverage updates needed'}
`;

    return {
      currentPrices: updatedCurrentPrices,
      pendingOrders: Object.keys(updatedPendingOrders).length > 0 ? updatedPendingOrders : undefined,
      pendingLeverageUpdates: Object.keys(updatedPendingLeverageUpdates).length > 0 ? updatedPendingLeverageUpdates : undefined,
      messages: [
        ...state.messages,
        new ToolMessage({
          content,
          tool_call_id: "analyze_input_success"
        })
      ]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error analyzing input:`, error);

    return {
      error: errorMessage,
      messages: [
        ...state.messages,
        new ToolMessage({
          content: `Error analyzing input: ${errorMessage}`,
          tool_call_id: "analyze_input_error"
        })
      ]
    };
  }
}

// Configuration for the input analysis node in LangGraph
export const analyzeInputNodeConfig = {
  name: "analyze_input",
  description: "Analyzes user input to determine relevant trading symbols, which need price data, orders, and leverage updates",
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
      currentPrices: {
        type: "object",
        description: "Existing current prices record (optional)"
      }
    },
    required: ["inputPrompt", "allPerpMetadata"]
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      currentPrices: {
        type: "object",
        description: "Updated currentPrices record with null values for symbols needing prices"
      },
      pendingOrders: {
        type: "object",
        description: "Updated pendingOrders record with null values for symbols needing orders"
      },
      pendingLeverageUpdates: {
        type: "object",
        description: "Updated pendingLeverageUpdates record with placeholder values for symbols needing leverage updates"
      },
      error: {
        type: "string",
        description: "Error message if the operation failed"
      }
    }
  }
};
