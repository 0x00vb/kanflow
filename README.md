# KanFlow

Real-Time Collaborative Task Management Board built with NextJS, demonstrating full-stack backend engineering skills.

## 🚀 Features

- **Real-Time Collaboration**: See task changes instantly across all connected clients
- **Drag & Drop Interface**: Intuitive task movement between columns
- **User Presence**: Know who's online and actively working
- **Activity Feed**: Track all changes and team activity
- **Role-Based Access**: Owner, Admin, Member, and Viewer permissions
- **Caching & Performance**: Redis-powered caching with intelligent invalidation
- **Observability**: Structured logging, metrics, and monitoring
- **WebSocket Communication**: Real-time updates with cross-instance synchronization

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   NextJS App    │    │   WebSocket     │    │   API Routes    │
│   (Frontend)    │◄──►│   Server (ws)   │◄──►│   (/api/*)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Redis       │    │     Redis       │    │   PostgreSQL    │
│   Pub/Sub       │    │    Cache        │    │   + Prisma      │
│   (Real-time)   │    │   (Performance) │    │   (Data)        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🛠️ Tech Stack

- **Frontend**: NextJS 14, React, TypeScript, Tailwind CSS
- **Backend**: NextJS API Routes, Node.js, Custom WebSocket Server
- **Database**: PostgreSQL with Prisma ORM
- **Caching**: Redis (caching + pub/sub)
- **Real-Time**: WebSocket (ws library)
- **Authentication**: JWT with bcrypt password hashing
- **Validation**: Zod schemas with class-validator
- **Logging**: Pino with structured logging
- **Metrics**: Prometheus client
- **Testing**: Jest, React Testing Library, Supertest
- **Security**: Helmet, CORS, Rate Limiting

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- Docker (optional, for local development)

## 🚀 Getting Started

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd kanflow
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

3. **Set up the database:**
   ```bash
   # Generate Prisma client
   npm run db:generate

   # Run database migrations
   npm run db:migrate

   # (Optional) Seed the database
   npm run db:seed
   ```

4. **Start development servers:**
   ```bash
   # Start the application with WebSocket support
   npm run dev

   # In another terminal, start Redis (if not using Docker)
   redis-server

   # In another terminal, start PostgreSQL (if not using Docker)
   # PostgreSQL should be running on your system
   ```

5. **Access the application:**
   - Frontend: http://localhost:3000
   - Health Check: http://localhost:3000/api/health
   - WebSocket: ws://localhost:3000/ws

## 📁 Project Structure

```
kanflow/
├── prisma/
│   └── schema.prisma          # Database schema
├── public/                     # Static assets
├── src/
│   ├── app/                    # NextJS App Router
│   │   ├── api/                # API routes
│   │   ├── globals.css         # Global styles
│   │   └── layout.tsx          # Root layout
│   ├── components/             # React components
│   │   ├── ui/                 # Reusable UI components
│   │   ├── layout/             # Layout components
│   │   └── forms/              # Form components
│   ├── lib/                    # Core libraries
│   │   ├── auth/               # Authentication utilities
│   │   ├── cache/              # Redis cache management
│   │   ├── database/           # Prisma database client
│   │   ├── logger/             # Logging configuration
│   │   ├── metrics/            # Prometheus metrics
│   │   ├── validation/         # Input validation schemas
│   │   └── websocket/          # WebSocket server
│   ├── middleware/             # NextJS middleware
│   ├── types/                  # TypeScript type definitions
│   ├── utils/                  # Utility functions
│   ├── hooks/                  # React hooks
│   ├── constants/              # Application constants
│   └── tests/                  # Test files and setup
├── server.js                   # Custom server with WebSocket support
├── next.config.mjs             # NextJS configuration
├── tailwind.config.ts          # Tailwind CSS configuration
├── tsconfig.json               # TypeScript configuration
└── package.json                # Dependencies and scripts
```

## 🔧 Available Scripts

```bash
# Development
npm run dev              # Start development server with WebSocket
npm run build            # Build for production
npm run start            # Start production server
npm run server           # Start custom server directly

# Database
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Run database migrations
npm run db:push          # Push schema changes to database
npm run db:studio        # Open Prisma Studio
npm run db:seed          # Seed database with test data

# Testing
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report

# Code Quality
npm run lint             # Run ESLint
npm run type-check       # Run TypeScript type checking
```

## 🔒 Security Features

- **Authentication**: JWT-based authentication with secure password hashing
- **Authorization**: Role-based access control (RBAC) for boards and tasks
- **Input Validation**: Comprehensive input validation using Zod schemas
- **Rate Limiting**: Request rate limiting to prevent abuse
- **Security Headers**: Helmet.js for security headers
- **CORS**: Configured Cross-Origin Resource Sharing
- **SQL Injection Prevention**: Prisma ORM prevents SQL injection
- **XSS Protection**: Content Security Policy and input sanitization

## 📊 Monitoring & Observability

- **Structured Logging**: Pino logger with request IDs and correlation
- **Metrics**: Prometheus metrics for performance monitoring
- **Health Checks**: Application health endpoints
- **Error Tracking**: Comprehensive error handling and logging

## 🧪 Testing Strategy

- **Unit Tests**: Core business logic and utilities
- **Integration Tests**: API endpoints and database operations
- **End-to-End Tests**: Full user workflows
- **Performance Tests**: Load testing and benchmarking

## 🚢 Deployment

### Development
```bash
# Using Docker Compose (recommended)
docker-compose up -d

# Manual setup
npm run build
npm run start
```

### Production
- **Frontend**: Vercel, Netlify
- **Backend**: Railway, Fly.io, AWS ECS
- **Database**: Supabase, PlanetScale, AWS RDS
- **Cache**: Redis Cloud, AWS ElastiCache
- **Monitoring**: DataDog, New Relic, Prometheus + Grafana

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built as part of the Gomry practice guide
- Demonstrates enterprise-grade backend engineering patterns
- Real-world application with production-ready architecture
