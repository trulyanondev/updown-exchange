import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { type GraphStateType } from "./shared_state.js";
import { accountInfoFromState } from "./utils/account_info_from_state.js";
import { mapMessagesToOpenAI } from "./utils/message_helpers.js";

const openai = new OpenAI();

// Schema for symbols analysis output
const SymbolsAnalysisSchema = z.object({
  mentionedSymbols: z.array(z.string()),
  reasoning: z.string()
});

// Define the node function for analyzing symbols mentioned in user input
export async function analyzePromptSymbolsNode(state: GraphStateType): Promise<{
  mentionedSymbols?: string[];
  currentPrices?: Record<string, number | undefined>;
  messages?: any[];
  error?: string;
}> {
  try {
    const { allPerpMetadata } = state;

    if (!allPerpMetadata) {
      return {
        error: "No perpetual metadata available for symbol analysis"
      };
    }

    console.log(`🔍 Analyzing symbols from conversation`);

    // Get available symbols for context
    const availableSymbols = Object.keys(allPerpMetadata);

    // Create prompt for GPT to analyze symbols
    const analysisPrompt = `
You are a trading assistant analyzing user input to identify which trading symbols are mentioned or implied.

Available trading symbols: ${availableSymbols.join(', ')}

User's current positions summary: ${accountInfoFromState(state).positionsSummary}

Common symbol mappings:
- Bitcoin = BTC
- Ethereum = ETH  
- Solana = SOL
- And many others in the available symbols list

Examples:
- "buy bitcoin" → BTC
- "eth price" → ETH
- "close my btc position" → BTC
- "solana to the moon" → SOL
- "set stop loss on sol" → SOL


Identify ALL symbols that are explicitly mentioned or clearly implied in the input.  Symbols can be implied if the prompt suggests a symbol in the user's positions.
`;

    // Call OpenAI with structured output
    const response = await openai.responses.parse({
      model: "gpt-5-nano",
      reasoning: { effort: "low" },
      input: [
        ...mapMessagesToOpenAI(state.messages),
        { role: "system", content: analysisPrompt },
      ],
      text: {
        format: zodTextFormat(SymbolsAnalysisSchema, "symbols_analysis")
      }
    });

    const analysis = response.output_parsed as z.infer<typeof SymbolsAnalysisSchema>;

    console.log(`📝 Symbols Analysis:`, analysis);

    // Handle potentially empty or undefined analysis results
    const mentionedSymbols = analysis?.mentionedSymbols || [];
    const symbolCount = mentionedSymbols.length;
    const symbolsList = mentionedSymbols.join(', ');

    const content = `
Symbols Analysis

📊 Found ${symbolCount} mentioned symbols: ${symbolsList || 'none'}
🤔 Reasoning: ${analysis?.reasoning || 'No analysis available'}
`;

    // Only return currentPrices if we found symbols
    if (symbolCount > 0) {
      const updatedCurrentPrices = { ...(state.currentPrices || {}) };
      let pricesAdded = 0;

      for (const symbol of mentionedSymbols) {
        if (!updatedCurrentPrices.hasOwnProperty(symbol.toLowerCase())) {
          updatedCurrentPrices[symbol.toLowerCase()] = undefined;
          pricesAdded++;
        }
      }

      return {
        mentionedSymbols: mentionedSymbols,
        currentPrices: updatedCurrentPrices
      };
    }

    // No symbols found - don't return currentPrices field
    return {};

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error analyzing symbols:`, error);

    return {
      error: errorMessage
    };
  }
}

// Configuration for the symbols analysis node
export const analyzePromptSymbolsNodeConfig = {
  name: "analyze_prompt_symbols",
  description: "Analyzes user input to identify mentioned trading symbols and prepares them for price fetching",
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
        description: "Updated currentPrices record with undefined values for symbols needing prices"
      },
      error: {
        type: "string",
        description: "Error message if the operation failed"
      }
    }
  }
};