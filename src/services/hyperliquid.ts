import { ExchangeClient, HttpTransport, OrderParams, OrderSuccessResponse, OrderResponse, InfoClient, PerpsMeta, AllMids, SuccessResponse, CancelSuccessResponse } from '@nktkas/hyperliquid';
import PrivyAbstractWallet from '../wallet/privy_abstract_wallet.js';
import PrivyService from './privy.js';
import { User } from '@privy-io/server-auth';
import TransferService from './transfer.js';
import Constants from '../constants/constants.js';
import { Network } from 'alchemy-sdk';

class HyperliquidService {
  private static transport: HttpTransport = new HttpTransport();
  private static infoClient: InfoClient = new InfoClient({ transport: HyperliquidService.transport });

  static get infoClientInstance(): InfoClient {
    return HyperliquidService.infoClient;
  }

  static exchangeClient(walletId: string): ExchangeClient {
    const privyWallet = new PrivyAbstractWallet(walletId);
    return new ExchangeClient({
      wallet: privyWallet,
      transport: HyperliquidService.transport,
      isTestnet: process.env.NODE_ENV !== 'production'
    });
  }
  
  /**
   * Place an order on Hyperliquid
   */
  static async createOrder(exchangeClient: ExchangeClient, params: OrderParams): Promise<OrderResponse> {

    const orderParams: { orders: OrderParams[]; grouping: 'na' | 'normalTpsl' | 'positionTpsl' } = {
      orders: [params],
      grouping: 'na'
    };

    return await exchangeClient.order(orderParams);
  }

  /**
   * Place an order on Hyperliquid
   */
  static async createBulkOrders(exchangeClient: ExchangeClient, params: OrderParams[]): Promise<OrderSuccessResponse> {

    const orderParams: { orders: OrderParams[]; grouping: 'na' | 'normalTpsl' | 'positionTpsl' } = {
      orders: params,
      grouping: 'na'
    };

    return await exchangeClient.order(orderParams);
  }

  static async cancelOrder(exchangeClient: ExchangeClient, assetId: number, oid: number): Promise<CancelSuccessResponse> {
    return await exchangeClient.cancel({ cancels: [{ a: assetId, o: oid }] });
  }

  /**
   * Deposit USDC Arbitrum to Hyperliquid exchange
   */
  static async depositToHyperliquidExchange(user: User, address: `0x${string}`, amount: number): Promise<void> {
    const wallet = PrivyService.getDelegatedWalletForUser(user, address);

    if (!wallet) {
      console.log(`User: ${JSON.stringify(user)}`);

      throw new Error('Wallet not found for user: ' + user.id + ' and address: ' + address);
    }

    if (amount < Constants.MIN_HYPERLIQUID_DEPOSIT_AMOUNT) {
      console.log(
        `${address} deposited amount: (${amount}) less than minimum deposit amount: ${Constants.MIN_HYPERLIQUID_DEPOSIT_AMOUNT}`
      );
      return;
    }

    const hyperliquidContract = Constants.HYPERLIQUID_CONTRACT;

    await TransferService.send({
      toAddress: hyperliquidContract,
      fromWallet: wallet,
      tokenContractAddress: Constants.USDC_ARB_CONTRACT,
      network: Network.ARB_MAINNET,
      amount: null // send full balance
    });
  }

  /**
   * Update leverage on Hyperliquid for a specific asset
   */
  static async updateLeverage(exchangeClient: ExchangeClient, assetId: number, leverage: number): Promise<SuccessResponse> {

    // Update leverage parameters
    const leverageParams = {
      asset: assetId,
      isCross: true,
      leverage: leverage
    };

    return await exchangeClient.updateLeverage(leverageParams);
  }

  /**
   * Get perpetuals metadata including trading universes and margin tables
   */
  static async getPerpetualsMetadata(): Promise<PerpsMeta> {
    return await HyperliquidService.infoClient.meta();
  }

  /**
   * Get all mid prices for all assets
   */
  static async getAllMids(): Promise<AllMids> {
    return await HyperliquidService.infoClient.allMids();
  }
}

export default HyperliquidService;