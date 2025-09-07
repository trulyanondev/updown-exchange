import { PrivyClient, WalletWithMetadata, User } from '@privy-io/server-auth';

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
   * Verify token and get userId in one call
   */
  static async verifyAndGetUserId(token: string): Promise<String> {
    const verifiedToken = await PrivyService.getClient().verifyAuthToken(token);   
    return verifiedToken.userId;
  }

  static async getDelegatedWallet(userId: string, address: `0x${string}` | undefined = undefined): Promise<WalletWithMetadata | undefined> {
    const user = await PrivyService.getClient().getUserById(userId);
    return PrivyService.getDelegatedWalletForUser(user, address);
  }

  static getDelegatedWalletForUser(user: User, address: `0x${string}` | undefined = undefined): WalletWithMetadata | undefined {
    return user.linkedAccounts?.find(
      account => account.type === 'wallet' && account.id && account.delegated === true && (address ? account.address === address : true)
    ) as WalletWithMetadata | undefined;
  }
}

export default PrivyService;
