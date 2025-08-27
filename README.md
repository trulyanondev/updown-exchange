# UpDownV2 Server

A modern TypeScript server built with Express.js, featuring the latest development tools and best practices.

## 🚀 Features

- **TypeScript** with strict type checking
- **Express.js** web framework
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
  "message": "UpDownV2 Server API",
  "version": "1.0.0",
  "endpoints": {
    "health": "/health",
    "hello": "/api/hello"
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

### GET `/api/hello`
Main API endpoint that returns "Hello caller".

**Response:**
```json
{
  "message": "Hello caller"
}
```

## 🔧 Configuration

- **Port**: Set via `PORT` environment variable (default: 3001)
- **TypeScript**: Configured in `tsconfig.json`
- **ESLint**: Configured in `.eslintrc.json`
- **Prettier**: Configured in `.prettierrc`

## 📁 Project Structure

```
UpDownV2/
├── src/
│   └── index.ts          # Main server file
├── dist/                 # Build output (generated)
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── .eslintrc.json       # ESLint configuration
├── .prettierrc          # Prettier configuration
└── README.md            # This file
```

## 🚀 Future Enhancements

This server is designed to be easily expandable. You can add:

- Database integration (PostgreSQL, MongoDB, etc.)
- Authentication middleware
- Rate limiting
- Logging (Winston, Pino)
- Testing (Jest, Vitest)
- API documentation (Swagger/OpenAPI)
- Docker containerization
- CI/CD pipeline configuration

## 📝 License

MIT License
