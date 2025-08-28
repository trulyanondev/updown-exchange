import { PrivyClient, User, AuthTokenClaims } from '@privy-io/server-auth';

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
  static async verifyAndGetUser(token: string): Promise<User> {
    const verifiedToken = await PrivyService.getClient().verifyAuthToken(token);
    const user = await PrivyService.getClient().getUserById(verifiedToken.userId);
    return user;
  }
}

export default PrivyService;
