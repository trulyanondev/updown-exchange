import { PrivyClient, User, AuthTokenClaims, WalletWithMetadata } from '@privy-io/server-auth';
import { getDelegatedWallet as getDelegatedWalletRequest } from './requests/privy/wallets.js';

class PrivyService {

  private static privyClient: PrivyClient;

  static getClient(): PrivyClient {
    if (!PrivyService.privyClient) {
      PrivyService.privyClient = new PrivyClient(
        process.env.PRIVY_APP_ID || '',
        process.env.PRIVY_APP_SECRET || '',
      );
    }
    return PrivyService.privyClient;
  }

  /**
   * Verify token and get user in one call
   */
  static async verifyAndGetUserId(token: string): Promise<String> {
    const verifiedToken = await PrivyService.getClient().verifyAuthToken(token);
    return verifiedToken.userId;
  }

  static async getDelegatedWallet(userId: string): Promise<WalletWithMetadata | undefined> {
    return await getDelegatedWalletRequest(userId) as WalletWithMetadata | undefined;
  }
}

export default PrivyService;
