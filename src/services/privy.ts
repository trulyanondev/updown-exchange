import { PrivyClient, User, AuthTokenClaims } from '@privy-io/server-auth';

class PrivyService {
  private static privyClient: PrivyClient;

  private static getClient(): PrivyClient {
    if (!PrivyService.privyClient) {
      PrivyService.privyClient = new PrivyClient(
        process.env.PRIVY_APP_ID || '',
        process.env.PRIVY_APP_SECRET || '',
      );
    }
    return PrivyService.privyClient;
  }

  /**
   * Verify Privy JWT token
   */
  private static async verifyToken(token: string): Promise<AuthTokenClaims> {
    try {
        const verifiedToken = await PrivyService.getClient().verifyAuthToken(token);
        return verifiedToken;
      } catch (error) {
        console.error('Token verification failed:', error);
        throw new Error('Invalid authentication token');
      }
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Get user from Privy API
   */
  static async getUser(userId: string): Promise<User> {
    try {
      const user = await PrivyService.getClient().getUserById(userId)
      return user;
    } catch (error) {
      console.error('Error fetching user from Privy:', error);
      throw new Error('Failed to fetch user data');
    }
  }

  /**
   * Verify token and get user in one call
   */
  static async verifyAndGetUser(token: string): Promise<User> {
    const verifiedToken = await PrivyService.verifyToken(token);
    const user = await this.getUser(verifiedToken.userId);
    return user;
  }
}

export default PrivyService;
