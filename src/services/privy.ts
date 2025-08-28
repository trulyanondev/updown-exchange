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
    const fullUserId = verifiedToken.userId;
    
    // Extract the actual user ID from the DID format (did:privy:actual_id)
    if (fullUserId.startsWith('did:privy:')) {
      return fullUserId.substring('did:privy:'.length);
    }
    
    return fullUserId;
  }

  static async getDelegatedWallet(userId: string): Promise<WalletWithMetadata | undefined> {
    const user = await PrivyService.getClient().getUserById(userId);
    return user.linkedAccounts?.find(
      account => account.type === 'wallet' && account.id && account.delegated === true
    ) as WalletWithMetadata | undefined;
  }
}

export default PrivyService;
