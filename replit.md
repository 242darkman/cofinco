# COFIN - Microfinance Platform

## Overview

COFIN is a comprehensive microfinance management platform designed for the Republic of Congo. The application handles credit management, savings accounts, tontines (rotating savings groups), field agent operations, and full accounting capabilities. Built as a full-stack TypeScript application with a React frontend and Express backend, it provides role-based access control for different user types including administrators, cashiers, field agents, and managers.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with custom theme configuration supporting dark/light modes
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **State Management**: React Query for server state, React Context for theme and language
- **Routing**: Single-page application with module-based navigation
- **Build Tool**: Vite with custom plugins for meta images and Replit integration

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful endpoints under `/api/*` prefix
- **Session Management**: Express-session with PostgreSQL session store (connect-pg-simple)
- **Authentication**: Custom session-based auth with bcrypt password hashing
- **Development**: Hot module replacement via Vite middleware in development

### Database Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` - shared between frontend and backend
- **Migrations**: Drizzle Kit with `db:push` command for schema synchronization
- **Connection**: Node-postgres (pg) with connection pooling

### Project Structure
```
├── client/           # React frontend application
│   └── src/
│       ├── components/  # UI components (100+ modules)
│       ├── contexts/    # Theme and Language providers
│       └── lib/         # Utilities, API clients, Supabase config
├── server/           # Express backend
│   ├── routes.ts     # API route definitions
│   ├── storage.ts    # Database operations layer
│   ├── auth.ts       # Authentication middleware
│   └── db.ts         # Database connection
├── shared/           # Shared TypeScript types and schemas
│   └── schema.ts     # Drizzle schema definitions
└── migrations/       # Database migrations
```

### Authentication & Authorization
- Session-based authentication stored in PostgreSQL
- Role-based access control with roles: admin, agent, chef_agence, comptable, gestionnaire_credit, superviseur
- Middleware functions `requireAuth` and `requireRole` for route protection
- Default admin user seeded via `seed-admin.ts` script

### Security Features (Bank-Grade)
- **HTTP Security Headers**: Helmet with CSP, HSTS, X-XSS-Protection, X-Content-Type-Options
- **Rate Limiting**: 
  - General API: 500 requests per 15 minutes
  - Authentication: 10 attempts per 15 minutes
  - Sensitive operations (credits, transactions): 10 per minute
- **Password Policy**: Minimum 8 characters, uppercase, lowercase, numbers, special characters required
- **Account Lockout**: Automatic lockout after 5 failed login attempts (15-minute window)
- **Audit Logging**: Full trail of login/logout, user creation, and sensitive operations
- **Login Attempt Tracking**: All login attempts logged with IP address and user agent
- **Session Security**: HTTP-only cookies, secure flag in production, SameSite=Lax

### Key Domain Modules
- **Clients**: Customer management with KYC, scoring, and segmentation
- **Credits**: Loan management with application workflow and repayment tracking
- **Épargnes**: Savings accounts with transaction history
- **Tontines**: Rotating savings groups with member management and contributions
- **Caisse**: Cash register operations with session management
- **Agent Terrain**: Field agent tracking, visits, collections, and performance
- **Comptabilité**: OHADA-compliant accounting with Sage integration

## External Dependencies

### Database
- **PostgreSQL**: Primary database via `DATABASE_URL` environment variable
- **Drizzle ORM**: Schema management and query building

### Authentication Services
- **Supabase** (optional): Integration exists in `lib/supabase.ts` for extended features
- Session storage uses PostgreSQL via connect-pg-simple

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string (required)
- `SESSION_SECRET`: Secret for session encryption (defaults to development value)

### SMS Notification System (Optional)
The platform supports automatic SMS notifications for:
- **Payment reminders**: "Bonjour, nous vous rappelons votre échéance de paiement du..."
- **Credit approval**: "Félicitations! Votre demande de crédit a été approuvée."
- **Savings confirmation**: "Votre épargne a bien été enregistrée."
- **Tontine reminders**: "Rappel: Réunion tontine prévue le..."

**Supported SMS Providers** (configure one):
- **Twilio**: Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- **Africa's Talking**: Set `AFRICAS_TALKING_API_KEY`, `AFRICAS_TALKING_USERNAME`, `AFRICAS_TALKING_SENDER_ID`
- **BulkSMS**: Set `BULKSMS_API_TOKEN`, `BULKSMS_SENDER_ID`

SMS service is in `server/sms-service.ts`. Templates are stored in `sms_templates` table.

### Third-Party Libraries
- **bcrypt**: Password hashing
- **express-session**: Session management
- **connect-pg-simple**: PostgreSQL session store
- **@tanstack/react-query**: Server state management
- **date-fns**: Date manipulation
- **zod**: Schema validation with drizzle-zod integration

### Build & Development
- **Vite**: Frontend bundler with React plugin
- **esbuild**: Server bundling for production
- **tsx**: TypeScript execution for development