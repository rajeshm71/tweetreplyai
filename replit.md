# TweetReply - AI Reply Generation Platform

## Overview

TweetReply is an AI-powered platform designed to generate authentic, human-like replies to Twitter/X posts. The system consists of a full-stack web application built with React and Express, a Chrome browser extension, and paid subscription services powered by Stripe. Users can generate contextual replies either through the web interface or directly on Twitter/X through the browser extension, with usage tracked through a tiered subscription model.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The client is built with React 18 using TypeScript and Vite as the build tool. The UI framework leverages Shadcn/ui components built on top of Radix UI primitives with Tailwind CSS for styling. State management is handled through TanStack Query for server state and React's built-in hooks for local state. The application uses Wouter for client-side routing instead of React Router for a lighter footprint.

Key architectural decisions:
- **Component Structure**: Follows the Shadcn/ui pattern with separate ui components and higher-level feature components
- **State Management**: TanStack Query provides caching, background refetching, and optimistic updates for server data
- **Styling Approach**: Utility-first CSS with Tailwind, using CSS variables for theming and consistent design tokens

### Backend Architecture
The server is an Express.js application written in TypeScript using ES modules. It follows a layered architecture with clear separation between routes, services, and data access. The application uses session-based authentication with Replit's OAuth integration.

Core architectural patterns:
- **Service Layer Pattern**: Business logic is encapsulated in service classes (OpenAI, Stripe, Usage services)
- **Repository Pattern**: Database operations are abstracted through a storage interface with concrete implementation
- **Middleware Chain**: Request logging, authentication, and error handling are implemented as Express middleware

### Database Design
The system uses PostgreSQL with Drizzle ORM for type-safe database operations. The schema supports multi-tenant usage tracking, subscription management, and user analytics.

Key tables and relationships:
- **Users**: Core user profiles with OAuth integration
- **Subscriptions**: Stripe subscription tracking with plan details and billing periods
- **Usage Counters**: Time-windowed usage tracking for quota enforcement
- **Sessions**: Secure session storage for authentication state

### Authentication System
Authentication is handled through Replit's OAuth service using the OpenID Connect protocol. The system maintains sessions in PostgreSQL and supports both web and extension authentication flows.

Design decisions:
- **Session-based Auth**: More secure for web applications than JWT tokens
- **OAuth Integration**: Leverages Replit's identity provider for simplified user management
- **Extension Auth**: Uses message passing between content scripts and background workers

### AI Integration
The system integrates with OpenAI's GPT models for reply generation, with intelligent model routing based on tweet complexity and user preferences.

Architecture decisions:
- **Model Selection**: Automatic routing between GPT-4 and GPT-4-mini based on content analysis
- **Usage Tracking**: Precise token counting for billing and quota management
- **Response Caching**: Not implemented currently, but architecture supports future caching layer

### Browser Extension
The Chrome extension consists of content scripts that inject UI into Twitter/X pages and background workers that handle authentication and API communication.

Key components:
- **Content Scripts**: Inject reply suggestion buttons into tweet interfaces
- **Background Service Worker**: Manages authentication state and API requests
- **Popup Interface**: Provides settings and usage dashboard

## External Dependencies

### Third-Party Services
- **OpenAI API**: GPT model access for reply generation with automatic fallback between model tiers
- **Stripe**: Subscription billing, webhook processing, and customer management
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Replit OAuth**: Identity provider using OpenID Connect protocol

### Development Tools
- **Vite**: Frontend build tool with React plugin and TypeScript support
- **Drizzle Kit**: Database migration management and schema generation
- **TanStack Query**: Declarative data fetching with caching and synchronization
- **Radix UI**: Headless component primitives for accessibility-first UI development

### Key Libraries
- **Zod**: Runtime schema validation for API requests and database operations
- **class-variance-authority**: Type-safe variant API for component styling
- **date-fns**: Date manipulation and formatting utilities
- **Wouter**: Minimalist client-side routing library