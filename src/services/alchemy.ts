import { Alchemy, Network, WebhookType } from 'alchemy-sdk';
import crypto from 'crypto';
import PrivyService from './privy';
import { User } from '@privy-io/server-auth';

// Initialize Alchemy SDK for Arbitrum Mainnet
const alchemy = new Alchemy({
  apiKey: process.env.ALCHEMY_API_KEY!,
  network: Network.ARB_MAINNET,
});

class AlchemyService {
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
  static async handleIncomingTransfer(user: User, usdcValue: Number): Promise<void> {
    
  }

  /**
   * Process webhook activity data
   */
  static async processWebhookActivity(event: any): Promise<void> {
    if (!event?.activity) {
      return;
    }

    const usdcArbContract = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";

    // Process each activity in the webhook
    for (const activity of event.activity) {
      // Check if this is an incoming transfer (external transaction with positive value)
      if (
        activity.category === 'token' && 
        activity.rawContract.toLowerCase() === usdcArbContract.toLowerCase() && 
        parseFloat(activity.value || '0') > 0) 
      {
        const user = await PrivyService.getClient().getUserByWalletAddress(activity.toAddress);
        if (user) {
          await this.handleIncomingTransfer(user, parseFloat(activity.value || '0'));
        } else {
          throw new Error('User not found for webhook activity token transfer address: ' + activity.toAddress);
        }
      } else {
        console.log('⛔️ Received something other than USDC Arbitrum token transfer: ' + activity.asset + ' ' + activity.rawContract + ' ' + activity.value);
      }
    }
  }
}

export default AlchemyService;