import MarketDataService from "../../services/marketdata.js";
import PortfolioService from "../../services/portfolio.js";
import { type GraphStateType } from "./shared_state.js";
import type { AssetPosition } from '@nktkas/hyperliquid';

// Define the node function for getting perpetual information
export async function getPerpInfoNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  try {
    console.log(`🔍 Fetching perpetual metadata and portfolio data`);

    // Concurrently fetch all required data
    const [allPerpMetadata, currentPerpPrices, clearinghouseState, openOrders] = await Promise.all([
      MarketDataService.getPerpetualsMetadata(),
      MarketDataService.getCurrentPerpPrices(),
      PortfolioService.getClearinghouseState(state.walletAddress),
      PortfolioService.getOpenOrders(state.walletAddress)
    ]);

    const symbolCount = Object.keys(allPerpMetadata).length;
    const positionCount = clearinghouseState.assetPositions.filter((pos: AssetPosition) => parseFloat(pos.position.szi) !== 0).length;
    const openOrderCount = openOrders.length;

    console.log(`✅ Retrieved perpetual metadata for ${symbolCount} symbols`);
    console.log(`✅ Retrieved portfolio data: ${positionCount} positions, ${openOrderCount} open orders`);

    return {
      allPerpMetadata,
      currentPrices: currentPerpPrices,
      clearinghouseState,
      openOrders
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error fetching perpetual metadata and portfolio data:`, error);

    return {
      error: errorMessage
    };
  }
}

// Configuration for the perpetual info node in LangGraph
export const perpInfoNodeConfig = {
  name: "get_perp_info",
  description: "Retrieves all available perpetual contract metadata and user's portfolio data",
  inputSchema: {
    type: "object" as const,
    properties: {
      walletAddress: {
        type: "string",
        description: "User's wallet address for fetching portfolio data"
      }
    },
    required: ["walletAddress"]
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      allPerpMetadata: {
        type: "object",
        description: "Dictionary of all perpetual metadata keyed by symbol name (lowercase)"
      },
      clearinghouseState: {
        type: "object",
        description: "User's complete clearinghouse state including positions and margin info"
      },
      openOrders: {
        type: "array",
        description: "User's open orders"
      },
      error: {
        type: "string",
        description: "Error message if the operation failed"
      }
    }
  }
};
