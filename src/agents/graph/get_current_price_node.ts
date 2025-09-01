import { BaseMessage, ToolMessage } from "@langchain/core/messages";
import MarketDataService from "../../services/marketdata.js";
import { type GraphStateType } from "./shared_state.js";

// Define the node function for getting current prices
export async function getCurrentPriceNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  try {
    const { currentPrices } = state;

    // Extract symbols from currentPrices record keys, or initialize empty if none exist
    const symbolsToFetch = currentPrices ? Object.keys(currentPrices) : [];

    if (symbolsToFetch.length === 0) {
      return {};
    }

    console.log(`💰 Fetching current prices for symbols: ${symbolsToFetch.join(', ')}`);

    console.log(`🚀 Starting concurrent price fetch for ${symbolsToFetch.length} symbols`);

    // Create promises for all symbol fetches
    const pricePromises = symbolsToFetch.map(async (symbol) => {
      try {
        const price = await MarketDataService.getCurrentPrice(symbol);
        console.log(`✅ Retrieved price for ${symbol}: $${price}`);
        return { symbol, price, success: true };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.error(`❌ Error fetching price for ${symbol}:`, errorMsg);
        return { symbol, price: 0, success: false, error: errorMsg };
      }
    });

    // Wait for all promises to settle (concurrent execution)
    const results = await Promise.allSettled(pricePromises);

    // Create a copy of currentPrices to modify
    const updatedCurrentPrices = { ...currentPrices };

    // Process results
    const successfulResults: string[] = [];
    const failedResults: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { symbol, price, success } = result.value;
        updatedCurrentPrices[symbol.toLowerCase()] = price;

        if (success) {
          successfulResults.push(`${symbol}: $${price}`);
        } else {
          failedResults.push(symbol);
        }
      } else {
        // This shouldn't happen with our try-catch, but handle it just in case
        if (index < symbolsToFetch.length) {
          const symbol = symbolsToFetch[index]!;
          console.error(`💥 Promise rejected for ${symbol}:`, result.reason);
          updatedCurrentPrices[symbol.toLowerCase()] = 0;
          failedResults.push(symbol);
        } else {
          console.error(`💥 Promise rejected for unknown symbol at index ${index}:`, result.reason);
        }
      }
    });

    console.log(`📊 Completed concurrent fetch: ${successfulResults.length} successful, ${failedResults.length} failed`);

    let content = `Updated current prices for ${successfulResults.length} symbols: `;
    content += successfulResults.join(', ');

    if (failedResults.length > 0) {
      content += `\nFailed to retrieve prices for: ${failedResults.join(', ')}`;
    }

    return {
      currentPrices: updatedCurrentPrices
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error fetching current prices:`, error);

    return {
      error: errorMessage
    };
  }
}

// Configuration for the current price node in LangGraph
export const currentPriceNodeConfig = {
  name: "get_current_price",
  description: "Retrieves and updates current market prices for symbols in the currentPrices record",
  inputSchema: {
    type: "object" as const,
    properties: {
      currentPrices: {
        type: "object",
        description: "Record of symbols to their current prices - keys will be used to fetch updated prices"
      }
    },
    required: ["currentPrices"]
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      currentPrices: {
        type: "object",
        description: "Updated map of symbol to current price with fetched values"
      },
      error: {
        type: "string",
        description: "Error message if the operation failed"
      }
    }
  }
};
