# Hyperliquid Exchange Server

A modern TypeScript server built with Express.js for Hyperliquid trading integration with Privy authentication and delegated wallet signing.

## 🚀 Features

- **TypeScript** with strict type checking
- **Express.js** web framework with middleware pattern
- **Privy Authentication** with JWT token verification
- **Hyperliquid Trading** integration with delegated wallet signing
- **Grok Code Fast 1** LLM integration for intelligent trading analysis
- **LangGraph** workflow orchestration for trading decisions
- **ES Modules** (ESM) support
- **CORS** enabled for cross-origin requests
- **Helmet** for security headers
- **ESLint** and **Prettier** for code quality
- **tsx** for fast development with hot reload
- **Health check** endpoint
- **Error handling** middleware

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Privy account with app credentials
- Hyperliquid account for trading
- xAI API key for Grok Code Fast 1 LLM

## 🛠️ Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd UpDownV2
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```
PORT=3001
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret
XAI_API_KEY=your_xai_api_key_here
NODE_ENV=development
```

## 🚀 Development

Start the development server with hot reload:
```bash
npm run dev
```

The server will start on `http://localhost:3001`

## 🏗️ Build

Build the project for production:
```bash
npm run build
```

## 🚀 Production

Start the production server:
```bash
npm start
```

## 📚 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm run format` - Format code with Prettier
- `npm run type-check` - Run TypeScript type checking

## 🌐 API Endpoints

### GET `/`
Returns server information and available endpoints.

**Response:**
```json
{
  "message": "Hyperliquid Perpetuals Trading Server API",
  "version": "1.0.0",
  "endpoints": {
    "health": "/health",
    "createOrder": "/api/create_order",
    "updateLeverage": "/api/update_leverage",
    "tradingAgent": "/api/trading_agent",
    "chat": "/api/chat"
  }
}
```

### GET `/health`
Health check endpoint for monitoring.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```


### POST `/api/create_order`
Create a trading order on Hyperliquid using delegated wallet signing.

**Headers:**
```
Authorization: Bearer <privy_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "assetId": 0,
  "isBuy": true,
  "price": "50000",
  "size": "0.1",
  "reduceOnly": false,
  "orderType": {
    "limit": {
      "tif": "Gtc"
    }
  }
}
```

**Parameters:**
- `assetId` (number): Asset ID (e.g., 0 for BTC)
- `isBuy` (boolean): Order direction (true for buy, false for sell)
- `price` (string): Order price
- `size` (string): Order size in base currency
- `reduceOnly` (boolean, optional): Whether this is a reduce-only order (defaults to false)
- `orderType` (object): Order type configuration
  - For limit orders: `{ "limit": { "tif": "Gtc" } }`
  - For market orders: `{ "trigger": { "isMarket": true, "triggerPx": "0", "tpsl": "tp" } }`

**Response:**
```json
{
  "success": true,
  "result": {
    "response": {
      "type": "order",
      "data": {
        "statuses": [...]
      }
    }
  }
}
```

**Error Responses:**
- `401 Unauthorized` - Invalid authentication token
- `400 Bad Request` - User does not have a delegated wallet
- `400 Bad Request` - Invalid order parameters
- `500 Internal Server Error` - Failed to create order

### POST `/api/update_leverage`
Update leverage for a specific asset on Hyperliquid using cross-margin mode.

**Headers:**
```
Authorization: Bearer <privy_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "assetId": 0,
  "leverage": 10
}
```

**Parameters:**
- `assetId` (number): Asset ID (e.g., 0 for BTC)
- `leverage` (number): Desired leverage amount (1-50)

**Response:**
```json
{
  "success": true,
  "result": {
    "response": {
      "type": "default",
      "data": null
    }
  }
}
```

**Error Responses:**
- `401 Unauthorized` - Invalid authentication token
- `400 Bad Request` - User does not have a delegated wallet
- `400 Bad Request` - Invalid leverage parameters or leverage value out of range (1-50)
- `500 Internal Server Error` - Failed to update leverage

### POST `/api/trading_agent`
Process trading requests using the intelligent LangGraph trading agent with Grok Code Fast 1.

**Headers:**
```
Authorization: Bearer <privy_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "buy $100 worth of BTC at market price"
}
```

**Parameters:**
- `prompt` (string): Natural language trading request

**Response:**
```json
{
  "success": true,
  "message": "I've successfully executed a market buy order for $100 worth of BTC at $67,450.",
  "actions": [...]
}
```

**Error Responses:**
- `401 Unauthorized` - Invalid authentication token
- `400 Bad Request` - User does not have a delegated wallet
- `400 Bad Request` - Invalid prompt format
- `500 Internal Server Error` - Failed to process trading prompt

### POST `/api/chat`
Chat with the trading agent with conversation context preservation.

**Headers:**
```
Authorization: Bearer <privy_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "what's the current BTC price?",
  "thread_id": "optional_thread_id"
}
```

**Parameters:**
- `prompt` (string): Natural language message
- `thread_id` (string, optional): Conversation thread ID for context preservation

**Response:**
```json
{
  "success": true,
  "thread_id": "generated_or_provided_thread_id",
  "message": "BTC is currently trading at $67,450."
}
```

**Error Responses:**
- `401 Unauthorized` - Invalid authentication token
- `400 Bad Request` - User does not have a delegated wallet
- `400 Bad Request` - Invalid prompt format
- `500 Internal Server Error` - Failed to process chat message

## 🔧 Configuration

### Environment Variables

- `PORT`: Server port (default: 3001)
- `PRIVY_APP_ID`: Your Privy application ID
- `PRIVY_APP_SECRET`: Your Privy application secret
- `XAI_API_KEY`: Your xAI API key for Grok Code Fast 1 LLM
- `NODE_ENV`: Environment (development/production)

### TypeScript Configuration

- **tsconfig.json**: TypeScript compiler options
- **ESLint**: Configured in `.eslintrc.json`
- **Prettier**: Configured in `.prettierrc`

## 📁 Project Structure

```
UpDownV2/
├── src/
│   ├── index.ts              # Main server file with Express app and routes
│   ├── services/
│   │   ├── privy.ts          # Privy authentication service
│   │   └── hyperliquid.ts    # Hyperliquid trading service
│   └── wallet/
│       └── privy_abstract_wallet.ts  # Privy wallet adapter for Hyperliquid
├── dist/                     # Build output (generated)
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── .eslintrc.json           # ESLint configuration
├── .prettierrc              # Prettier configuration
└── README.md                # This file
```

## 🔐 Authentication & Wallet Setup

This server uses Privy for authentication and delegated wallet signing:

1. **User Authentication**: Users authenticate via Privy JWT tokens
2. **Delegated Wallets**: Users must have a delegated embedded wallet in Privy
3. **Server Signing**: The server signs Hyperliquid transactions on behalf of users using Privy's wallet API

### Wallet Requirements

- Users must have an embedded wallet in Privy
- The wallet must be delegated for server-side signing
- The wallet address is used for Hyperliquid trading operations

## 🏗️ Architecture

### Services

- **PrivyService**: Handles JWT verification, user fetching, and wallet management
- **HyperliquidService**: Manages trading operations and order placement
- **PrivyAbstractWallet**: Adapter that implements Hyperliquid's AbstractWallet interface using Privy's signing API
- **LLMService**: Centralized service for Grok Code Fast 1 LLM integration with structured output generation
- **LangGraphTradingAgent**: Orchestrates trading workflows using LangGraph with intelligent analysis nodes

### Authentication Flow

1. Client sends request with Privy JWT token
2. `authenticateUser` middleware verifies token and fetches user
3. User object is attached to request for downstream handlers
4. Protected routes access user information from request object

### Trading Flow

1. Authenticated user submits order parameters
2. Server validates parameters and maps to Hyperliquid format
3. User's delegated wallet is retrieved from Privy
4. `PrivyAbstractWallet` is created for signing operations
5. `HyperliquidService` places order using delegated signing
6. Result is returned to client

## 🧪 Testing

### Manual Testing

Test order creation:
```bash
curl -X POST \
     -H "Authorization: Bearer <your_privy_jwt>" \
     -H "Content-Type: application/json" \
     -d '{
       "assetId": 0,
       "isBuy": true,
       "price": "50000",
       "size": "0.1",
       "orderType": {
         "limit": {
           "tif": "Gtc"
         }
       }
     }' \
     http://localhost:3001/api/create_order

Test leverage update:
```bash
curl -X POST \
     -H "Authorization: Bearer <your_privy_jwt>" \
     -H "Content-Type: application/json" \
     -d '{
       "assetId": 0,
       "leverage": 10
     }' \
     http://localhost:3001/api/update_leverage
```

## 🚀 Future Enhancements

- **Database Integration**: Add PostgreSQL/MongoDB for order history
- **Rate Limiting**: Implement request rate limiting
- **Logging**: Add structured logging with Winston
- **Testing**: Comprehensive test suite with Jest
- **API Documentation**: OpenAPI/Swagger documentation
- **Docker**: Containerization for deployment
- **CI/CD**: Automated testing and deployment pipeline
- **Portfolio Management**: Add position tracking and portfolio analytics
- **Risk Management**: Implement trading limits and risk controls

## 🛡️ Security Considerations

- JWT tokens are verified on each request
- Private keys are never stored server-side
- All signing operations are delegated to Privy
- CORS and Helmet middleware provide basic security
- Environment variables protect sensitive configuration

## 📝 License

MIT License