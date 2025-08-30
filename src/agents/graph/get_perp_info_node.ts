import { BaseMessage, ToolMessage } from "@langchain/core/messages";
import MarketDataService from "../../services/marketdata.js";
import { GraphState } from "./shared_state.js";

// Define the node function for getting perpetual information
export async function getPerpInfoNode(state: GraphState): Promise<Partial<GraphState>> {
  try {
    console.log(`🔍 Fetching all perpetual metadata`);

    // Get all perpetual metadata using the MarketDataService
    const allPerpMetadata = await MarketDataService.getPerpetualsMetadata();

    const symbolCount = Object.keys(allPerpMetadata).length;
    console.log(`✅ Retrieved perpetual metadata for ${symbolCount} symbols`);

    return {
      allPerpMetadata,
      messages: [
        ...state.messages,
        new ToolMessage({
          content: `Retrieved perpetual metadata for ${symbolCount} symbols: ${JSON.stringify(Object.keys(allPerpMetadata), null, 2)}`,
          tool_call_id: "get_perp_info_success"
        })
      ]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error fetching perpetual metadata:`, error);

    return {
      error: errorMessage,
      messages: [
        ...state.messages,
        new ToolMessage({
          content: `Error retrieving perpetual metadata: ${errorMessage}`,
          tool_call_id: "get_perp_info_error"
        })
      ]
    };
  }
}

// Configuration for the perpetual info node in LangGraph
export const perpInfoNodeConfig = {
  name: "get_perp_info",
  description: "Retrieves all available perpetual contract metadata",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: []
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      allPerpMetadata: {
        type: "object",
        description: "Dictionary of all perpetual metadata keyed by symbol name (lowercase)"
      },
      error: {
        type: "string",
        description: "Error message if the operation failed"
      }
    }
  }
};
