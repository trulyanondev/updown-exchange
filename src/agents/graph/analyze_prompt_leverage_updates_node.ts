import { ToolMessage } from "@langchain/core/messages";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { type GraphStateType } from "./shared_state.js";

const openai = new OpenAI();

// Schema for leverage analysis output
const LeverageAnalysisSchema = z.object({
  symbolsNeedingLeverageUpdates: z.record(z.number()),
  reasoning: z.string()
});

// Define the node function for analyzing leverage updates in user input
export async function analyzePromptLeverageUpdatesNode(state: GraphStateType): Promise<{
  pendingLeverageUpdates?: Record<string, number>;
  messages?: any[];
  error?: string;
}> {
  try {
    const { inputPrompt, allPerpMetadata } = state;

    if (!allPerpMetadata) {
      return {
        error: "No perpetual metadata available for leverage analysis",
        messages: [
          ...state.messages,
          new ToolMessage({
            content: "No perpetual metadata available for leverage analysis",
            tool_call_id: "analyze_leverage_error_no_metadata"
          })
        ]
      };
    }

    console.log(`🔧 Analyzing leverage updates in input: "${inputPrompt}"`);

    // Get available symbols and their max leverage for context
    const availableSymbols = Object.keys(allPerpMetadata);
    const maxLeverageDict = Object.fromEntries(
      availableSymbols.map(symbol => [symbol, allPerpMetadata[symbol]?.maxLeverage])
    );

    // Create prompt for GPT to analyze leverage updates  
    const portfolioSummary = state.clearinghouseState ? 
      `Account Value: ${state.clearinghouseState.marginSummary.accountValue}, Active Positions: ${state.clearinghouseState.assetPositions.filter(p => parseFloat(p.position.szi) !== 0).length}` :
      "No portfolio data";

    const analysisPrompt = `
You are a trading assistant analyzing user input to determine which symbols need leverage updates and what the desired leverage should be.

Available trading symbols with max leverage: ${Object.entries(maxLeverageDict).map(([sym, lev]) => `${sym}:${lev}x`).join(', ')}

User's current portfolio summary: ${portfolioSummary}

Rules:
1. Only identify leverage updates if the user explicitly requests them
2. Leverage should be between 1 and the max leverage for each symbol
3. Do not infer leverage changes from general trading requests

Examples:
- "update btc to 22x leverage" → BTC needs leverage update to 22x
- "change eth leverage to 10x" → ETH needs leverage update to 10x  
- "set btc to 5x leverage and buy $100" → BTC needs leverage update to 5x
- "buy bitcoin" → NO leverage update needed
- "sell eth" → NO leverage update needed
- "close my position" → NO leverage update needed

Analyze this user input: "${inputPrompt}"

Identify ONLY symbols where leverage updates are explicitly requested.
`;

    // Call OpenAI with structured output
    const response = await openai.responses.parse({
      model: "gpt-5-nano", 
      input: [
        { role: "system", content: "You are a trading assistant analyzing user input for leverage update requests." },
        { role: "user", content: analysisPrompt }
      ],
      text: {
        format: zodTextFormat(LeverageAnalysisSchema, "leverage_analysis")
      }
    });

    const analysis = response.output_parsed;

    console.log(`🔧 Leverage Analysis:`, analysis);

    // Handle potentially empty or undefined analysis results
    const symbolsNeedingLeverageUpdates = analysis?.symbolsNeedingLeverageUpdates || {};
    const leverageCount = Object.keys(symbolsNeedingLeverageUpdates).length;
    const leverageList = Object.entries(symbolsNeedingLeverageUpdates).map(([sym, lev]) => `${sym}:${lev}x`).join(', ');

    const content = `
Leverage Analysis: "${inputPrompt}"

🔧 Found ${leverageCount} symbols needing leverage updates
🤔 Reasoning: ${analysis?.reasoning}
`;

    // Only return pendingLeverageUpdates if we found updates
    if (leverageCount > 0) {
      const updatedPendingLeverageUpdates = { ...(state.pendingLeverageUpdates || {}) };
      let leverageUpdatesAdded = 0;

      for (const [symbol, leverage] of Object.entries(symbolsNeedingLeverageUpdates)) {
        if (!updatedPendingLeverageUpdates.hasOwnProperty(symbol.toLowerCase())) {
          updatedPendingLeverageUpdates[symbol.toLowerCase()] = leverage;
          leverageUpdatesAdded++;
        }
      }

      return {
        pendingLeverageUpdates: updatedPendingLeverageUpdates,
        messages: [
          ...state.messages,
          new ToolMessage({
            content: content + `✅ Ready for leverage updates: ${leverageList}`,
            tool_call_id: "analyze_leverage_success"
          })
        ]
      };
    }

    // No leverage updates found - don't return pendingLeverageUpdates field
    return {
      messages: [
        ...state.messages,
        new ToolMessage({
          content: content + 'ℹ️ No leverage updates needed',
          tool_call_id: "analyze_leverage_success"
        })
      ]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error analyzing leverage updates:`, error);

    return {
      error: errorMessage,
      messages: [
        ...state.messages,
        new ToolMessage({
          content: `Error analyzing leverage updates: ${errorMessage}`,
          tool_call_id: "analyze_leverage_error"
        })
      ]
    };
  }
}

// Configuration for the leverage analysis node
export const analyzePromptLeverageUpdatesNodeConfig = {
  name: "analyze_prompt_leverage_updates",
  description: "Analyzes user input to identify requested leverage updates for trading symbols",
  inputSchema: {
    type: "object" as const,
    properties: {
      inputPrompt: {
        type: "string",
        description: "The user's input text to analyze"
      },
      allPerpMetadata: {
        type: "object",
        description: "Available perpetual contract metadata with max leverage limits"
      },
      clearinghouseState: {
        type: "object",
        description: "User's current portfolio state for context"
      },
      pendingLeverageUpdates: {
        type: "object",
        description: "Existing pending leverage updates (optional)"
      }
    },
    required: ["inputPrompt", "allPerpMetadata"]
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      pendingLeverageUpdates: {
        type: "object",
        description: "Updated pendingLeverageUpdates record with desired leverage values"
      },
      error: {
        type: "string",
        description: "Error message if the operation failed"
      }
    }
  }
};