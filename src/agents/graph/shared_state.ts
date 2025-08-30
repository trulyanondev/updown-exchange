import { BaseMessage } from "@langchain/core/messages";
import { PerpetualsUniverseDict } from "../../services/marketdata.js";
import { OrderParams } from "@nktkas/hyperliquid";
import { Annotation } from "@langchain/langgraph";

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
  // Trading orders
  pendingOrders: Annotation<Record<string, OrderParams> | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  // Leverage updates
  pendingLeverageUpdates: Annotation<Record<string, number> | undefined>({
    reducer: (x, y) => y ?? x,
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
