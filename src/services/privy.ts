import { PrivyClient } from '@privy-io/server-auth';

class PrivyService {
  private privyClient: PrivyClient;

  constructor() {
    this.privyClient = new PrivyClient(
        process.env.PRIVY_APP_ID || '',
        process.env.PRIVY_APP_SECRET || '',
    );
  }

  /**
   * Verify Privy JWT token
   */
  async verifyToken(token: string): Promise<any> {
    try {
        const verifiedToken = await this.privyClient.verifyAuthToken(token);
        return verifiedToken;
      } catch (error) {
        console.error('Token verification failed:', error);
        throw new Error('Invalid authentication token');
      }
  }

  /**
   * Get user from Privy API
   */
  async getUser(userId: string): Promise<any> {
    try {
      const user = await this.privyClient.getUserById(userId)
      return user;
    } catch (error) {
      console.error('Error fetching user from Privy:', error);
      throw new Error('Failed to fetch user data');
    }
  }

  /**
   * Verify token and get user in one call
   */
  async verifyAndGetUser(token: string): Promise<any> {
    const verifiedToken = await this.verifyToken(token);
    const user = await this.getUser(verifiedToken.userId);
    return user;
  }
}

export default PrivyService;
