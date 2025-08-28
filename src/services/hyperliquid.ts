import { ExchangeClient, HttpTransport, ErrorResponse, OrderParams, OrderResponse, TIF } from '@nktkas/hyperliquid';
import PrivyService from './privy.js';
import PrivyAbstractWallet from '../wallet/privy_abstract_wallet.js';
import type { WalletWithMetadata } from '@privy-io/server-auth';

class HyperliquidService {
  private static transport: HttpTransport = new HttpTransport();

  /**
   * Place an order on Hyperliquid
   */
  async createOrder(userId: string, params: OrderParams): Promise<OrderResponse> {
    // Get user's wallet from Privy
    const user = await PrivyService.getClient().getUserById(userId);
    const wallet = user.linkedAccounts?.find(
      account => account.type === 'wallet' && account.id && account.delegated === true
    ) as WalletWithMetadata | undefined;
    
    if (!wallet || !wallet.id) {
      throw new Error('User does not have a wallet with valid ID');
    }

    // Create PrivyAbstractWallet that implements signing with Privy
    const privyWallet = new PrivyAbstractWallet({
      walletId: wallet.id,
      address: wallet.address as `0x${string}`
    });

    // Create ExchangeClient with PrivyAbstractWallet
    const client = new ExchangeClient({
      wallet: privyWallet,
      transport: HyperliquidService.transport,
      isTestnet: process.env.NODE_ENV !== 'production'
    });

    const orderParams: { orders: OrderParams[]; grouping: 'na' | 'normalTpsl' | 'positionTpsl' } = {
      orders: [params],
      grouping: 'na'
    };

    return await client.order(orderParams);
  }
}

// export default HyperliquidService;