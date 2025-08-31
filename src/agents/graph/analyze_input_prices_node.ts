import { BaseMessage, ToolMessage } from "@langchain/core/messages";
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

Available trading symbols: ${availableSymbols.join(', ')}

Common symbol mappings:
- Bitcoin = BTC
- Ethereum = ETH
- Solana = SOL
- And many others in the available symbols list

Examples:
- "buy $10 of bitcoin" → BTC symbol, needs price (to convert $10 to BTC amount)
- "update btc to 22x leverage" → BTC symbol, doesn't need price (just leverage update)
- "sell all my eth" → ETH symbol, might need price (depending on context)
- "show me btc price" → BTC symbol, needs price
- "set stop loss on sol to $50" → SOL symbol, might need price (to calculate position size)

Analyze this user input: "${inputPrompt}"

Return a JSON response with:
{
  "mentionedSymbols": ["SYMBOL1", "SYMBOL2"], // symbols explicitly or implicitly mentioned
  "symbolsNeedingPrices": ["SYMBOL1"], // subset that need current price data
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

    const { mentionedSymbols, symbolsNeedingPrices, reasoning } = analysis;

    console.log(`📝 Analysis Results:`, {
      mentionedSymbols,
      symbolsNeedingPrices,
      reasoning
    });

    // Create updated currentPrices record
    const updatedCurrentPrices = { ...(state.currentPrices || {}) };

    // Add symbols that need prices with undefined values
    let pricesAdded = 0;
    for (const symbol of symbolsNeedingPrices) {
      if (!updatedCurrentPrices.hasOwnProperty(symbol)) {
        updatedCurrentPrices[symbol.toLowerCase()] = undefined;
        pricesAdded++;
      }
    }

    const content = `
Analysis of input: "${inputPrompt}"

📊 Found ${mentionedSymbols.length} mentioned symbols: ${mentionedSymbols.join(', ')}
💰 Added ${pricesAdded} symbols needing prices: ${symbolsNeedingPrices.join(', ')}
🤔 Reasoning: ${reasoning}

${pricesAdded > 0 ? `✅ Ready for price fetching for: ${symbolsNeedingPrices.join(', ')}` : 'ℹ️ No price fetching needed'}
`;

    return {
      currentPrices: updatedCurrentPrices,
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
  description: "Analyzes user input to determine relevant trading symbols and which need price data",
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
      error: {
        type: "string",
        description: "Error message if the operation failed"
      }
    }
  }
};
