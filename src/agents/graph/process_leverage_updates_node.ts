import { SuccessResponse } from "@nktkas/hyperliquid";
import { type GraphStateType } from "./shared_state.js";
import MarketDataService from "../../services/marketdata.js";
import HyperliquidService from "../../services/hyperliquid.js";

// Define the node function for processing pending leverage updates
export async function processLeverageUpdatesNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  try {
    const { pendingLeverageUpdates } = state;

    // Early return if no pending leverage updates
    if (!pendingLeverageUpdates || Object.keys(pendingLeverageUpdates).length === 0) {
      return {};
    }

    console.log(`🔧 Processing ${Object.keys(pendingLeverageUpdates).length} leverage updates`);

    // Use the shared ExchangeClient from state to prevent nonce conflicts
    const { exchangeClient } = state;

    // Process all leverage updates concurrently
    const leverageUpdatePromises = Object.entries(pendingLeverageUpdates).map(async ([symbol, leverage]): Promise<[string, SuccessResponse | Error]> => {
      try {
        console.log(`⚡ Updating leverage for ${symbol} to ${leverage}x`);
        
        // Get asset metadata to get assetId
        const metadata = await MarketDataService.getPerpMetadata(symbol);
        const assetId = metadata.assetId;

        // Execute leverage update using shared exchange client
        const result: SuccessResponse = await HyperliquidService.updateLeverage(exchangeClient, assetId, leverage);

        console.log(`✅ Leverage update successful for ${symbol}: ${leverage}x`, result);
        
        return [symbol, result];
        
      } catch (error) {
        console.error(`❌ Leverage update failed for ${symbol}:`, error);
        return [symbol, error instanceof Error ? error : new Error(String(error))];
      }
    });

    // Wait for all leverage updates to complete
    const leverageUpdateResults = await Promise.all(leverageUpdatePromises);
    
    // Separate successful results from errors
    const successfulResults = leverageUpdateResults.filter(([_, result]) => !(result instanceof Error)) as [string, SuccessResponse][];
    const failedResults = leverageUpdateResults.filter(([_, result]) => result instanceof Error) as [string, Error][];
    
    // Convert successful results into record for state storage
    const resultsRecord = Object.fromEntries(successfulResults);
    
    // Count successes and failures
    const successful = successfulResults.length;
    const failed = failedResults.length;
    
    console.log(`📊 Leverage update summary: ${successful} successful, ${failed} failed`);
      
    const failedUpdates = failedResults
      .map(([symbol, error]) => `❌ ${symbol}: ${error.message}`)
      .join('\n');

    const content = `Summary: ${successful}/${successful + failed} leverage updates completed${failed > 0 ? ` (${failed} failed)` : ' successfully'}${failed > 0 ? `\n\nFailed:\n${failedUpdates}` : ''}`;

    // Create updated pendingLeverageUpdates by removing successful entries
    const remainingPendingUpdates = { ...pendingLeverageUpdates };
    successfulResults.forEach(([symbol]) => {
      delete remainingPendingUpdates[symbol];
    });
    
    // Return undefined if no entries remain, otherwise return the filtered object
    const finalPendingUpdates = Object.keys(remainingPendingUpdates).length > 0 
      ? remainingPendingUpdates 
      : undefined;

    return {
      leverageUpdateResults: resultsRecord,
      pendingLeverageUpdates: finalPendingUpdates, // Keep only failed ones for potential retry / reporting
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error processing leverage updates:`, error);

    return {
      error: errorMessage
    };
  }
}

// Configuration for the leverage update processing node in LangGraph
export const processLeverageUpdatesNodeConfig = {
  name: "process_leverage_updates",
  description: "Processes pending leverage updates concurrently and stores results in leverageUpdateResults",
  inputSchema: {
    type: "object" as const,
    properties: {
      pendingLeverageUpdates: {
        type: "object",
        description: "Record of symbols and their target leverage values to update"
      }
    },
    required: []
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      leverageUpdateResults: {
        type: "object",
        description: "Results of leverage update operations per symbol"
      },
      pendingLeverageUpdates: {
        type: "undefined",
        description: "Cleared after processing (set to undefined)"
      },
      error: {
        type: "string",
        description: "Error message if the operation failed"
      }
    }
  }
};