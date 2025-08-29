# Trading Client Scripts

Python client for interacting with the Hyperliquid Exchange Trading API.

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Make sure your trading API server is running on port 3030

3. Run the interactive client:
```bash
python trading_client.py
```

## Usage

### Set Authentication Token
```
> token eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Natural Language Trading Commands
```
> Set BTC leverage to 25x
> Buy 0.1 ETH at market price
> Sell 0.05 BTC at 95000
> Change ETH leverage to 15x
```

### Direct API Commands
```
> leverage 0 20    # Set BTC (asset 0) to 20x leverage
> leverage 1 15    # Set ETH (asset 1) to 15x leverage
```

### Other Commands
```
> help    # Show help
> quit    # Exit client
```

## Features

- ✅ Interactive command-line interface
- ✅ Token authentication management
- ✅ Health check for API server
- ✅ Natural language prompt processing via AI agent
- ✅ Direct API calls for testing
- ✅ Pretty-printed responses with status indicators
- ✅ Error handling and user-friendly messages

## Example Session

```
🚀 Hyperliquid Perpetuals Trading Client
==================================================
✅ API server is running

📝 Commands:
  token <jwt_token>     - Set authentication token
  help                  - Show available commands
  leverage <asset> <lev> - Direct leverage update (0=BTC, 1=ETH)
  quit/exit             - Exit the client
  <any other text>      - Send as trading prompt to AI agent

💬 > token eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...
✅ Token set successfully!

💬 > Set BTC leverage to 20x
🤖 Processing: Set BTC leverage to 20x
✅ Successfully updated BTC leverage to 20x

📋 Actions executed:
  1. ✅ update_leverage

💬 > quit
👋 Goodbye!
```