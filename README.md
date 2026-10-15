# Call Center QA Random Sampling & Approval System

A full-stack web application for Call Center Quality Assurance (QA) Sampling with atomic call assignment, skip workflows, and supervisor approval.

## Tech Stack

- **Backend**: Node.js (Express), PostgreSQL, JWT Authentication
- **Frontend**: React (Vite), React Router, Axios
- **Database**: PostgreSQL with `FOR UPDATE SKIP LOCKED` for atomic call assignment

## Features

### QA Worker
- Search calls by Account Name, Line of Business, Agent Name
- Atomic random call sampling with `FOR UPDATE SKIP LOCKED`
- View assigned call with External System Call ID
- Copy Call ID to clipboard for external system access
- Complete review or Skip with justification
- Auto-assignment of replacement call after skip

### Supervisor
- View all pending skip requests
- Approve skips (marks call as DISCARDED)
- Reject skips (returns call to QA worker)
- Dashboard with statistics

### System
- Background sweeper releases abandoned calls after 30 minutes
- JWT-based authentication with role-based access control
- Secure password hashing with bcrypt

## Project Structure

```
qa-system/
├── backend/
│   ├── src/
│   │   ├── config/db.js          # PostgreSQL connection pool
│   │   ├── controllers/          # Route controllers
│   │   ├── middleware/auth.js    # JWT authentication
│   │   ├── routes/               # Express routes
│   │   ├── utils/
│   │   │   ├── initDb.js         # Database initialization
│   │   │   └── sweeper.js        # Background job
│   │   └── server.js             # Entry point
│   ├── migrations/schema.sql     # Database schema
│   └── .env                      # Environment variables
└── frontend/
    ├── src/
    │   ├── components/           # React components
    │   ├── context/AuthContext.jsx
    │   ├── services/api.js       # Axios instance
    │   ├── App.jsx
    │   └── main.jsx
    └── index.html
```

## Setup Instructions

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### 1. Database Setup

```bash
# Create database
createdb qa_system

# Run migration
psql -d qa_system -f backend/migrations/schema.sql
```

Or use the init script:
```bash
cd backend
npm install
npm run init-db
```

### 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env  # Edit with your database credentials
npm run dev
```

Server runs on `http://localhost:3001`

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` (proxies API to backend)

## Demo Credentials

| Username | Password | Role |
|----------|----------|------|
| qa_worker_1 | password123 | QA_WORKER |
| qa_worker_2 | password123 | QA_WORKER |
| supervisor_1 | password123 | SUPERVISOR |

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login, returns JWT
- `GET /api/auth/profile` - Get current user profile

### QA Worker
- `POST /api/calls/sample` - Get random call (atomic)
- `POST /api/calls/complete` - Mark call as completed
- `POST /api/calls/skip` - Skip call with justification
- `GET /api/calls/assigned` - Get assigned calls

### Supervisor
- `GET /api/supervisor/pending-skips` - List pending skips
- `POST /api/supervisor/resolve-skip` - Approve/Reject skip
- `GET /api/supervisor/stats` - Dashboard statistics

## Key Implementation Details

### Atomic Call Sampling
Uses PostgreSQL `FOR UPDATE SKIP LOCKED` to prevent race conditions:

```sql
BEGIN;
SELECT call_id, external_system_call_id 
FROM calls 
WHERE account_name = $1 
  AND line_of_business = $2 
  AND agent_name = $3 
  AND status = 'UNASSIGNED'
ORDER BY RANDOM() 
LIMIT 1 
FOR UPDATE SKIP LOCKED;

UPDATE calls 
SET status = 'ASSIGNED', assigned_to_user_id = $1, assigned_at = NOW() 
WHERE call_id = $2;
COMMIT;
```

### Abandoned Call Sweeper
Runs every 5 minutes, releases calls assigned > 30 minutes ago:

```sql
UPDATE calls 
SET status = 'UNASSIGNED', assigned_to_user_id = NULL, assigned_at = NULL
WHERE status = 'ASSIGNED' 
  AND assigned_at < NOW() - INTERVAL '30 minutes';
```

## Environment Variables

Backend `.env`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=qa_system
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=your-secret-key
PORT=3001
```

## License

MIT