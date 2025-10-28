Pixora Backend
Overview

Pixora is an AI-powered content creation platform built using the MERN stack.
This backend provides a secure, scalable, and modular foundation for all upcoming milestones including authentication, credit-based payments, AI content generation, and admin analytics.

This repository covers Milestone 1 — the complete backend setup and infrastructure required to start building application features.

Tech Stack

Node.js + Express.js – REST API framework

MongoDB + Mongoose – database and ORM

Helmet, CORS, Compression – security and performance middleware

Winston + Morgan – structured logging

Dotenv – environment configuration

Nodemon – development runtime


server/
│
├── src/
│   ├── app.js                # Express app setup
│   ├── server.js             # Server startup and lifecycle handling
│   │
│   ├── config/
│   │   ├── db.js             # MongoDB connection
│   │   └── env.js            # Environment variables
│   │
│   ├── middleware/
│   │   ├── asyncHandler.js   # Async error wrapper
│   │   ├── corsOptions.js    # CORS configuration
│   │   └── errorHandler.js   # Global error handler
│   │
│   ├── models/
│   │   └── User.js           # User model with credits and security fields
│   │
│   ├── routes/
│   │   ├── index.js          # Route aggregator
│   │   └── healthRoutes.js   # Health check endpoint
│   │
│   ├── utils/
│   │   ├── logger.js         # Winston + Morgan logging utility
│   │   └── response.js       # Unified success/fail responses
│
├── logs/                     # Persistent log files
│   ├── combined.log
│   └── error.log
│
├── .env.example
├── nodemon.json
├── package.json
└── README.md


Installation


Clone the repository
git clone https://github.com/Zaib001/pixora-backend.git
cd pixora-backend/server



Install dependencies
npm install



Set up environment variables
Create a .env file in the root directory based on .env.example:
PORT=5000
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/pixora
JWT_SECRET=your_secret_key
NODE_ENV=development



Run in development
npm run dev



Run in production
npm start




Features Implemented in Milestone 1


Complete Express and MongoDB setup


Centralized configuration for environment variables


Global error and async handling


Security middleware: Helmet, CORS, and JSON limits


Centralized logging using Winston and Morgan


Base User model with authentication and credit fields


Unified API response format


Health check route (GET /api/health)


Graceful server shutdown handling


Ready for upcoming modules (Auth, Payments, AI API)



Logging
Logs are written both to the console (for development) and to files inside the /logs directory.


combined.log – all request and informational logs


error.log – only errors and exceptions


You can adjust logging verbosity using the NODE_ENV variable.

API Endpoints
GET /api/healthHealth check route for uptime and API readiness

Deployment Notes


Compatible with Vercel, Render, Railway, or AWS setups


Gracefully handles process termination (SIGINT, SIGTERM)


Ready for Dockerization or cloud scaling if required


Safe to integrate with future frontend builds or CI/CD pipelines


Author
Developed by Muhammad Salman Shahid
Project: Pixora – AI Content Creation Platform
