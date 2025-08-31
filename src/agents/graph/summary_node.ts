import { AIMessage } from "@langchain/core/messages";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { type GraphStateType } from "./shared_state.js";

// Define the node function for generating final summary
export async function summaryNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  try {
    const { 
      inputPrompt, 
      currentPrices, 
      leverageUpdateResults, 
      orderCreationResults,
      tpslResults,
      clearinghouseState,
      openOrders
    } = state;

    console.log(`📄 Generating summary for prompt: "${inputPrompt}"`);

    // Analyze the state to understand what operations were performed
    const pricesCount = currentPrices ? Object.keys(currentPrices).length : 0;
    const leverageUpdatesCount = leverageUpdateResults ? Object.keys(leverageUpdateResults).length : 0;
    const orderResultsCount = orderCreationResults ? Object.keys(orderCreationResults).length : 0;
    const tpslResultsCount = tpslResults ? Object.keys(tpslResults).length : 0;

    // Extract successful and failed operations
    const successfulLeverageUpdates = leverageUpdateResults 
      ? Object.entries(leverageUpdateResults).filter(([_, result]) => result.status === "ok")
      : [];
    
    const successfulRegularOrders = orderCreationResults
      ? Object.entries(orderCreationResults).filter(([_, result]) => result.success)
      : [];
    
    const failedRegularOrders = orderCreationResults
      ? Object.entries(orderCreationResults).filter(([_, result]) => !result.success)
      : [];

    const successfulTpSlOrders = tpslResults ? Object.entries(tpslResults).filter(([_, result]) => result.success) : [];
    const failedTpSlOrders = tpslResults ? Object.entries(tpslResults).filter(([_, result]) => !result.success) : [];
    
    interface Position {
      symbol: string;
      size: number;
      usdValue: number;
      longOrShort: "long" | "short";
    }
    
    const portfolioPositions: Position[] = clearinghouseState ? clearinghouseState.assetPositions.filter(p => parseFloat(p.position.szi) !== 0).map(p => (
      { 
        symbol: p.position.coin, 
        size: parseFloat(p.position.szi), 
        usdValue: parseFloat(p.position.positionValue), 
        longOrShort: parseFloat(p.position.szi) > 0 ? "long" : "short" 
      }
    )) : [];

    // Create summary of portfolio state to avoid deep type issues
    const portfolioSummary = clearinghouseState ? 
      `Active Positions: [${portfolioPositions.join(', ')}]` :
      "No portfolio data";
    
    const ordersSummary = openOrders ? 
      `Open Orders: ${openOrders.length} orders` :
      "No open orders";

    // Create context-aware summary prompt
    const summaryPrompt = `
You are a helpful trading assistant providing a final summary to a user based on their request and what actions were performed.

Original User Request: "${inputPrompt}"

User's current portfolio summary after all actions: ${portfolioSummary}
User's open orders summary after all actions: ${ordersSummary}
User's overall account value in USD: $${clearinghouseState ? clearinghouseState.marginSummary.accountValue : 'unknown'}

Context of what happened:
${pricesCount > 0 ? `- Fetched current prices for ${pricesCount} symbols: ${Object.keys(currentPrices || {}).join(', ')}` : '- No prices were fetched'}
${leverageUpdatesCount > 0 ? `- Processed ${leverageUpdatesCount} leverage updates (${successfulLeverageUpdates.length} successful)` : '- No leverage updates were performed'}
${orderResultsCount > 0 ? `- Processed ${orderResultsCount} orders (${successfulRegularOrders.length} successful, ${failedRegularOrders.length} failed)` : '- No orders were processed'}
${tpslResultsCount > 0 ? `- Processed ${tpslResultsCount} TP/SL orders (${successfulTpSlOrders.length} successful, ${failedTpSlOrders.length} failed)` : '- No TP/SL orders were processed'}

Current Prices: ${currentPrices ? JSON.stringify(currentPrices, null, 2) : 'None fetched'}

Leverage Update Results: ${leverageUpdateResults ? JSON.stringify(leverageUpdateResults, null, 2) : 'None performed'}

Order Results: ${orderCreationResults ? JSON.stringify(orderCreationResults, null, 2) : 'None processed'}

Your task is to:
1. If the user asked a question (like "what's the BTC price?"), answer it directly using the data gathered
2. If the user requested actions (like "buy BTC" or "set leverage"), summarize what was accomplished
3. Be concise but informative (2-4 sentences max)
4. Use a helpful, professional tone
5. Include specific numbers/prices when relevant
6. If something failed, mention it briefly but stay positive

Examples of good responses:
- "BTC is currently trading at $67,450." (when user asked for a price, just answer the question)
- "I've successfully updated your BTC leverage to 10x and executed a buy order for $100 worth of BTC at $67,450."
- "Your BTC leverage has been updated to 5x. However, the buy order for $100 failed due to insufficient balance."
- "BTC price: $67,450, ETH price: $3,420." (when user asked for prices, just answer the question)

Notes:
- DO not mention anything about what was not asked for. For example, if the user did not ask for leverage updates or account value, do not mention them.
- Be brief and to the point. Only mention what was asked for.  Don't repeat any information inside your summary.
- If an order exists in the order results for a symbol, that means it succeeded (take profit order, stop loss order, limit order, market order, etc.)
- If any order quantity is requested in a US dollar amount and it is less than $10, mention that it is below the minimum order size and may not execute.
- Do not offer to complete any follow up actions. Just summarize the results.

Provide your response:`;

    // Call GPT for summary generation
    const { text: summaryResult } = await generateText({
      model: openai("gpt-5-nano"),
      prompt: summaryPrompt,
      temperature: 0.1,
    });

    console.log(`📋 Generated summary:`, summaryResult);

    // Create final message content
    const content = summaryResult.trim();

    return {
      messages: [
        ...state.messages,
        new AIMessage(content)
      ]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`❌ Error generating summary:`, error);

    // Fallback summary if GPT fails
    const fallbackSummary = `I've processed your request: "${state.inputPrompt}". ${
      state.currentPrices ? `Fetched prices for ${Object.keys(state.currentPrices).length} symbols. ` : ''
    }${
      state.leverageUpdateResults ? `Updated leverage for ${Object.keys(state.leverageUpdateResults).length} symbols. ` : ''
    }${
      state.orderCreationResults ? `Processed ${Object.keys(state.orderCreationResults).length} orders. ` : ''
    }See the detailed results above.`;

    return {
      error: errorMessage,
      messages: [
        ...state.messages,
        new AIMessage(fallbackSummary)
      ]
    };
  }
}

// Configuration for the summary node in LangGraph
export const summaryNodeConfig = {
  name: "summary",
  description: "Generates a contextual summary of the trading workflow results based on user input and final state",
  inputSchema: {
    type: "object" as const,
    properties: {
      inputPrompt: {
        type: "string",
        description: "The original user request to provide context for the summary"
      },
      currentPrices: {
        type: "object",
        description: "Current prices fetched during the workflow"
      },
      leverageUpdateResults: {
        type: "object",
        description: "Results of leverage update operations"
      },
      orderCreationResults: {
        type: "object",
        description: "Results of order creation operations"
      },
      allPerpMetadata: {
        type: "object",
        description: "Perpetual contract metadata for context"
      }
    },
    required: ["inputPrompt"]
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      messages: {
        type: "array",
        description: "Updated messages array with the final summary message"
      },
      error: {
        type: "string",
        description: "Error message if summary generation failed"
      }
    }
  }
};