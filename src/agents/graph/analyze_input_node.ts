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
    // console.log(`📊 Available symbols: ${availableSymbols.join(', ')}`);

    const maxLeverageDict = Object.fromEntries(availableSymbols.map(symbol => [symbol, allPerpMetadata[symbol]?.maxLeverage]));

    // Create prompt for GPT to analyze the input
    const analysisPrompt = `
You are a trading assistant analyzing user input to determine:
1. Which trading symbols are mentioned or implied
2. Which of those symbols need orders to be placed (with specific order prompts)
3. Which of those symbols need leverage updates and what is the desired leverage
    a. Do not attempt to update leverage if the user didn't ask for it
    b. leverage should be between 1 and max leverage defined here by symbol: ${JSON.stringify(maxLeverageDict)}

Available trading symbols: ${availableSymbols.join(', ')}

Common symbol mappings:
- Bitcoin = BTC
- Ethereum = ETH
- Solana = SOL
- And many others in the available symbols list

Examples:
- "buy $10 of bitcoin" → BTC symbol, order prompt: "buy $10 of BTC", no leverage update
- "update btc to 22x leverage" → BTC symbol, no order, needs leverage update to 22x
- "sell all my eth" → ETH symbol, order prompt: "sell all ETH", no leverage update
- "show me btc price" → BTC symbol, no order, no leverage update
- "set stop loss on sol to $50" → SOL symbol, order prompt: "set stop loss on SOL at $50", no leverage update
- "close my btc position" → BTC symbol, order prompt: "close BTC position", no leverage update
- "change eth leverage to 10x" → ETH symbol, no order, needs leverage update to 10x
- "set btc to 5x leverage and buy $100" → BTC symbol, order prompt: "buy $100 of BTC", needs leverage update to 5x

Note: All mentioned symbols will automatically have their prices fetched.

Analyze this user input: "${inputPrompt}"

Return a JSON response with:
{
  "mentionedSymbols": ["SYMBOL1", "SYMBOL2"], // symbols explicitly or implicitly mentioned
  "symbolsNeedingOrderPrompts": { "SYMBOL1": "buy $100 of SYMBOL1", "SYMBOL2": "sell all SYMBOL2" }, // subset that need orders with specific prompts
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

    const { mentionedSymbols, symbolsNeedingOrderPrompts, symbolsNeedingLeverageUpdates, reasoning } = analysis;

    console.log(`📝 Analysis Results:`, {
      mentionedSymbols,
      symbolsNeedingOrderPrompts,
      symbolsNeedingLeverageUpdates,
      reasoning
    });

    // Create updated currentPrices record
    const updatedCurrentPrices = { ...(state.currentPrices || {}) };

    // Add all mentioned symbols for price fetching
    let pricesAdded = 0;
    for (const symbol of mentionedSymbols) {
      if (!updatedCurrentPrices.hasOwnProperty(symbol)) {
        updatedCurrentPrices[symbol.toLowerCase()] = undefined;
        pricesAdded++;
      }
    }

    // Create updated pendingOrderPrompts record for symbols that need orders
    const updatedPendingOrderPrompts = { ...(state.pendingOrderPrompts || {}) };
    let orderPromptsAdded = 0;
    
    if (symbolsNeedingOrderPrompts && Object.keys(symbolsNeedingOrderPrompts).length > 0) {
      for (const symbol of Object.keys(symbolsNeedingOrderPrompts)) {
        if (!updatedPendingOrderPrompts.hasOwnProperty(symbol)) {
          updatedPendingOrderPrompts[symbol.toLowerCase()] = symbolsNeedingOrderPrompts[symbol];
          orderPromptsAdded++;
        }
      }
    }

    // Create updated pendingLeverageUpdates record for symbols that need leverage updates
    const updatedPendingLeverageUpdates = { ...(state.pendingLeverageUpdates || {}) };
    let leverageUpdatesAdded = 0;
    
    if (symbolsNeedingLeverageUpdates && Object.keys(symbolsNeedingLeverageUpdates).length > 0) {
      for (const symbol of Object.keys(symbolsNeedingLeverageUpdates)) {
        if (!updatedPendingLeverageUpdates.hasOwnProperty(symbol)) {
          updatedPendingLeverageUpdates[symbol.toLowerCase()] = symbolsNeedingLeverageUpdates[symbol]; // Leverage value will be determined later
          leverageUpdatesAdded++;
        }
      }
    }

    const content = `
Analysis of input: "${inputPrompt}"

📊 Found ${mentionedSymbols.length} mentioned symbols: ${mentionedSymbols.join(', ')}
🤔 Reasoning: ${reasoning}

${pricesAdded > 0 ? `✅ Ready for price fetching for: ${mentionedSymbols.join(', ')}` : 'ℹ️ No price fetching needed'}
${orderPromptsAdded > 0 ? `📋 Ready for order processing for: ${Object.keys(symbolsNeedingOrderPrompts || {}).join(', ')}` : 'ℹ️ No orders needed'}
${leverageUpdatesAdded > 0 ? `🔧 Ready for leverage updates for: ${Object.keys(symbolsNeedingLeverageUpdates).join(', ')}` : 'ℹ️ No leverage updates needed'}
`;

    return {
      currentPrices: updatedCurrentPrices,
      pendingOrderPrompts: Object.keys(updatedPendingOrderPrompts).length > 0 ? updatedPendingOrderPrompts : undefined,
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
  description: "Analyzes user input to determine relevant trading symbols, which need price data, order prompts, and leverage updates",
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
      pendingOrderPrompts: {
        type: "object",
        description: "Updated pendingOrderPrompts record with specific order prompts for symbols needing orders"
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
