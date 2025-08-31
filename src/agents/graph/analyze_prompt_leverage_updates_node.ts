import { ToolMessage } from "@langchain/core/messages";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { type GraphStateType } from "./shared_state.js";
import { accountInfoFromState } from "./utils/account_info_from_state.js";

const openai = new OpenAI();

// Schema for leverage update item
const LeverageUpdateSchema = z.object({
  symbol: z.string(),
  leverage: z.number()
});

// Schema for leverage analysis output
const LeverageAnalysisSchema = z.object({
  leverageUpdates: z.array(LeverageUpdateSchema),
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

    const analysisPrompt = `
You are a trading assistant analyzing user input to determine which symbols need leverage updates and what the desired leverage should be.

Available trading symbols with max leverage: ${Object.entries(maxLeverageDict).map(([sym, lev]) => `${sym}:${lev}x`).join(', ')}

User's current positions summary: ${accountInfoFromState(state).positionsSummary}

Rules:
1. Only identify leverage updates if the user explicitly requests them
2. Leverage should be between 1 and the max leverage for each symbol
3. Leverage value should be a whole number integer
4. Do not infer leverage changes from general trading requests

Examples:
- "update btc to 22x leverage" → {leverageUpdates: [{symbol: "BTC", leverage: 22}]}
- "change eth leverage to 10x" → {leverageUpdates: [{symbol: "ETH", leverage: 10}]}
- "set btc to 5x leverage and buy $100" → {leverageUpdates: [{symbol: "BTC", leverage: 5}]}
- "buy bitcoin" → {leverageUpdates: []} (no leverage update needed)
- "sell eth" → {leverageUpdates: []} (no leverage update needed)
- "close my position" → {leverageUpdates: []} (no leverage update needed)

Return JSON with leverageUpdates array containing symbol and leverage pairs for explicitly requested leverage changes.
`;

    // Call OpenAI with structured output
    const response = await openai.responses.parse({
      model: "gpt-5-nano", 
      input: [
        { role: "system", content: analysisPrompt },
        { role: "user", content: inputPrompt }
      ],
      text: {
        format: zodTextFormat(LeverageAnalysisSchema, "leverage_analysis")
      }
    });

    const analysis = response.output_parsed;

    console.log(`🔧 Leverage Analysis:`, analysis);

    // Handle potentially empty or undefined analysis results
    const leverageUpdates = analysis?.leverageUpdates || [];
    const leverageCount = leverageUpdates.length;
    const leverageList = leverageUpdates.map(update => `${update.symbol}:${update.leverage}x`).join(', ');

    const content = `
Leverage Analysis: "${inputPrompt}"

🔧 Found ${leverageCount} symbols needing leverage updates
🤔 Reasoning: ${analysis?.reasoning}
`;

    // Only return pendingLeverageUpdates if we found updates
    if (leverageCount > 0) {
      const updatedPendingLeverageUpdates = { ...(state.pendingLeverageUpdates || {}) };
      let leverageUpdatesAdded = 0;

      for (const update of leverageUpdates) {
        const { symbol, leverage } = update;
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