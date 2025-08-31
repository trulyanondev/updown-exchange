import { BaseMessage } from "@langchain/core/messages";
import { PerpetualsUniverseDict } from "../../services/marketdata.js";
import { OrderResponse, SuccessResponse } from "@nktkas/hyperliquid";
import { Annotation } from "@langchain/langgraph";
import { TradingOrderParams } from "../../services/trading.js";

// Shared state definition using Annotation.Root for modern StateGraph
export const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  // Input and identification (required)
  inputPrompt: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  walletId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  // Perpetual info properties
  allPerpMetadata: Annotation<PerpetualsUniverseDict | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  // Current price properties
  currentPrices: Annotation<Record<string, number | undefined>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({})
  }),
  // Trading order prompts (intent before parameter assembly)
  pendingOrderPrompts: Annotation<Record<string, string> | undefined>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => undefined
  }),
  // Trading orders (assembled parameters)
  pendingOrders: Annotation<Record<string, TradingOrderParams> | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  // Leverage updates
  pendingLeverageUpdates: Annotation<Record<string, number> | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  // Results of leverage update operations
  leverageUpdateResults: Annotation<Record<string, SuccessResponse> | undefined>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => undefined
  }),
  // Results of order creation operations
  orderCreationResults: Annotation<Record<string, { success: boolean; message: string; response?: OrderResponse; error?: string }> | undefined>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => undefined
  }),
  // Error handling
  error: Annotation<string | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  })
});

// State type for node functions - inferred from Annotation.Root
export type GraphStateType = typeof GraphState.State;
