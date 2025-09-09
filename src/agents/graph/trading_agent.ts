// LangGraph Trading Agent - Full Implementation
// Constructs a StateGraph workflow for trading operations

import { StateGraph, START, END } from "@langchain/langgraph";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import HyperliquidService from "../../services/hyperliquid.js";
import {
  getPerpInfoNode,
  processLeverageUpdatesNode,
  executeOrdersNode,
  executeTpSlOrdersNode,
  cancelOrdersNode,
  summaryNode,
  analyzeIntentPromptsConcurrentlyNode,
  GraphState
} from "./index.js";
import { langchain_message, Message } from "../../services/chat.js";

export interface AgentRequest {
  prompt: string;
  walletId: string;
  walletAddress: `0x${string}`;
  messages?: BaseMessage[];
}

export interface AgentResponse {
  success: boolean;
  message: string;
  actions?: any[];
  error?: string;
}

/**
 * LangGraph Trading Agent - Full Implementation
 * Orchestrates a multi-step trading workflow using StateGraph
 *
 * Workflow Steps:
 * 1. getPerpInfoNode - Fetch all perpetual contract metadata
 * 2. analyzeIntentPromptsConcurrentlyNode - Analyze all user intents concurrently (leverage, orders, TP/SL, cancellations)
 * 3. processLeverageUpdatesNode - Update leverage for symbols that need it
 * 4. executeOrdersNode - Execute all pending regular orders
 * 5. executeTpSlOrdersNode - Execute all pending TP/SL orders after regular orders
 * 6. cancelOrdersNode - Cancel all pending order cancellations
 * 7. summaryNode - Generate contextual summary of operations performed
 */
class LangGraphTradingAgent {
  private workflow: any;

  constructor() {
    console.log('🚀 LangGraph Trading Agent initialized with full workflow');

    // Create the StateGraph with our custom state type using Annotation.Root
    this.workflow = new StateGraph(GraphState)
      // Add nodes to the graph
      .addNode("get_perp_info", getPerpInfoNode)
      .addNode("analyze_intent_prompts_concurrently", analyzeIntentPromptsConcurrentlyNode)
      .addNode("process_leverage_updates", processLeverageUpdatesNode)
      .addNode("execute_orders", executeOrdersNode)
      .addNode("execute_tpsl_orders", executeTpSlOrdersNode)
      .addNode("cancel_orders", cancelOrdersNode)
      .addNode("get_final_perp_info", getPerpInfoNode)
      .addNode("summary", summaryNode)

      // Define the workflow edges (sequential execution)
      .addEdge(START, "get_perp_info")

      // analyze all user intents concurrently in a single node
      .addEdge("get_perp_info", "analyze_intent_prompts_concurrently")

      // process leverage updates after concurrent analysis
      .addEdge("analyze_intent_prompts_concurrently", "process_leverage_updates")

      // execute regular orders, TP/SL orders, and cancel orders concurrently
      .addEdge("process_leverage_updates", "execute_orders")
      .addEdge("process_leverage_updates", "execute_tpsl_orders")
      .addEdge("process_leverage_updates", "cancel_orders")

      // fetch final account info after all actions are performed
      .addEdge("execute_orders", "get_final_perp_info")
      .addEdge("execute_tpsl_orders", "get_final_perp_info")
      .addEdge("cancel_orders", "get_final_perp_info")

      // generate answer and summary of results after all actions are performed
      .addEdge("get_final_perp_info", "summary")
      
      .addEdge("summary", END)
  }

  /**
   * Process a trading prompt using the full LangGraph workflow
   *
   * @param request - The agent request with prompt and wallet ID
   * @returns Promise<AgentResponse> - Response with workflow results
   */
  async processPrompt(request: AgentRequest): Promise<AgentResponse> {
    try {
      console.log('🔄 Starting LangGraph workflow for:', request.prompt);

      // Create shared exchange client to prevent nonce conflicts across concurrent nodes
      const exchangeClient = HyperliquidService.exchangeClient(request.walletId);

      // Initialize the state with required fields including shared exchange client
      const initialState: Partial<typeof GraphState.State> = {
        messages: [...(request.messages ?? []), new HumanMessage(request.prompt)],
        walletAddress: request.walletAddress,
        exchangeClient: exchangeClient,
        currentPrices: {}
      };

      // Compile and execute the workflow
      const app = this.workflow.compile();

      console.log('▶️ Executing workflow...');
      const result = await app.invoke(initialState);

      console.log('✅ Workflow completed successfully');

      // Extract final message content for the response
      const finalMessage = result.messages[result.messages.length - 1];
      const finalMessageContent = finalMessage ? finalMessage.content : 'Workflow completed';

      // Check for errors in the final state
      if (result.error) {
        return {
          success: false,
          message: `Workflow completed with error: ${result.error}`,
          error: result.error,
          actions: [{
            type: 'workflow_error',
            message: result.error,
            finalState: result
          }]
        };
      }

      return {
        success: true,
        message: finalMessageContent,
        actions: [{
          type: 'workflow_completed',
          message: 'Trading workflow completed',
          finalState: result,
          currentPrices: result.currentPrices,
          allPerpMetadata: result.allPerpMetadata,
          leverageUpdateResults: result.leverageUpdateResults,
          orderCreationResults: result.orderCreationResults,
          tpslResults: result.tpslResults,
          orderCancellationResults: result.orderCancellationResults
        }]
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown workflow error';
      console.error('❌ Workflow execution failed:', error);

      return {
        success: false,
        message: `Workflow execution failed: ${errorMessage}`,
        error: errorMessage,
        actions: [{
          type: 'workflow_execution_error',
          message: errorMessage,
          error: error
        }]
      };
    }
  }
}

export default LangGraphTradingAgent;