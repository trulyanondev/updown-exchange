import { Alchemy, Network, WebhookType } from 'alchemy-sdk';
import crypto from 'crypto';
import PrivyService from './privy.js';
import { User } from '@privy-io/server-auth';
import TransferService from './transfer.js';

// Initialize Alchemy SDK for Arbitrum Mainnet
const alchemy = new Alchemy({
  apiKey: process.env.ALCHEMY_API_KEY!,
  network: Network.ARB_MAINNET,
});

class AlchemyService {

  static usdcArbContract = "0xaf88d065e77c8cc2239327c5edb3a432268e5831" as `0x${string}`;

  /**
   * Verify Alchemy webhook signature for security
   */
  static verifyWebhookSignature(body: any, signature: string): boolean {
    if (!signature || !process.env.ALCHEMY_WEBHOOK_SIGNING_KEY) {
      return false;
    }
    
    try {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.ALCHEMY_WEBHOOK_SIGNING_KEY)
        .update(JSON.stringify(body))
        .digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('Webhook signature verification error:', error);
      return false;
    }
  }

  /**
   * Process incoming transfer notification
   */
  static async handleIncomingTransfer(user: User, usdcValue: number, address: `0x${string}`): Promise<void> {
    const wallet = await PrivyService.getDelegatedWallet(user.id, address);

    if (!wallet) {
      throw new Error('Wallet not found for user: ' + user.id + ' and address: ' + address);
    }

    const hyperliquidContract = '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7';

    await TransferService.send({
      toAddress: hyperliquidContract,
      fromWallet: wallet,
      tokenContractAddress: AlchemyService.usdcArbContract,
      network: Network.ARB_MAINNET,
      amount: usdcValue
    });
  }

  /**
   * Process webhook activity data
   */
  static async processWebhookActivity(event: any): Promise<void> {
    if (!event?.activity) {
      return;
    }

    // Process each activity in the webhook
    for (const activity of event.activity) {
      // Check if this is an incoming transfer (external transaction with positive value)
      if (
        activity.category === 'token' && 
        activity.rawContract.address.toLowerCase() === AlchemyService.usdcArbContract.toLowerCase() && 
        parseFloat(activity.value || '0') > 0) 
      {
        const userAddress = activity.toAddress;
        const user = await PrivyService.getClient().getUserByWalletAddress(userAddress);
        if (user) {
          await this.handleIncomingTransfer(user, parseFloat(activity.value || '0'), userAddress as `0x${string}`);
        } else {
          throw new Error('User not found for webhook activity token transfer address: ' + userAddress);
        }
      } else {
        console.log('⛔️ Received something other than USDC Arbitrum token transfer: ' + activity.asset + ' ' + activity.rawContract + ' ' + activity.value);
      }
    }
  }
}

export default AlchemyService;