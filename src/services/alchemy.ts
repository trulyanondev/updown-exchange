import { Alchemy, Network, WebhookType } from 'alchemy-sdk';
import crypto from 'crypto';

// Initialize Alchemy SDK for Arbitrum Mainnet
const alchemy = new Alchemy({
  apiKey: process.env.ALCHEMY_API_KEY!,
  network: Network.ARB_MAINNET,
});

export interface IncomingTransfer {
  toAddress: string;
  fromAddress: string;
  value: string;
  hash: string;
  blockNum: string;
  asset: string;
  rawContract?: any;
}

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
  static async handleIncomingTransfer(transfer: IncomingTransfer): Promise<void> {
    try {
      console.log('Processing incoming transfer:', {
        to: transfer.toAddress,
        from: transfer.fromAddress,
        value: transfer.value,
        hash: transfer.hash,
        asset: transfer.asset
      });

      // TODO: Find user by wallet address in your database
      // const user = await getUserByWalletAddress(transfer.toAddress);
      
      // For now, just log the transfer details
      console.log('✅ Incoming transfer detected:', {
        recipient: transfer.toAddress,
        sender: transfer.fromAddress,
        amount: transfer.value,
        txHash: transfer.hash,
        blockNumber: transfer.blockNum,
        asset: transfer.asset
      });

      // TODO: Implement your business logic here:
      // - Update user balance
      // - Send notification to user
      // - Trigger any business logic (unlock features, etc.)
      // - Store transaction record
      
      // Example implementation:
      /*
      if (user) {
        // Update user's balance
        await updateUserBalance(user.id, transfer.value);
        
        // Send notification to user
        await notifyUser(user.id, {
          type: 'incoming_transfer',
          amount: transfer.value,
          from: transfer.fromAddress,
          txHash: transfer.hash,
          asset: transfer.asset
        });
        
        // Process any business logic
        await processIncomingPayment(user.id, transfer);
      }
      */

    } catch (error) {
      console.error('Error handling incoming transfer:', error);
    }
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
      if (activity.category === 'external' && parseFloat(activity.value || '0') > 0) {
        await this.handleIncomingTransfer({
          toAddress: activity.toAddress,
          fromAddress: activity.fromAddress,
          value: activity.value,
          hash: activity.hash,
          blockNum: activity.blockNum,
          asset: activity.asset,
          rawContract: activity.rawContract,
        });
      }
    }
  }
}

export default AlchemyService;