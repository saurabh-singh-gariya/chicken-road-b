# Admin Portal Backend Design Document

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Current System Analysis](#current-system-analysis)
3. [Requirements](#requirements)
4. [Database Schema Design](#database-schema-design)
5. [Authentication & Authorization](#authentication--authorization)
6. [API Endpoints Design](#api-endpoints-design)
7. [Implementation Plan](#implementation-plan)
8. [Security Considerations](#security-considerations)
9. [Changes Required to User Side](#changes-required-to-user-side)
10. [Testing Strategy](#testing-strategy)

---

## Executive Summary

This document outlines the design for an Admin Portal backend system that enables:
- **Super Admin**: Full system access including user management, agent management, and game configuration
- **Agents/Admins**: Access to their associated users, user bet history, and user creation capabilities

The design maintains backward compatibility with existing agent-based user creation while adding role-based access control for administrative operations.

---

## Current System Analysis

### Existing Entities

#### 1. **User Entity**
- Composite Primary Key: `(userId, agentId)`
- Fields: `userId`, `agentId`, `currency`, `language`, `username`, `betLimit`, `avatar`, `passwordHash`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`
- Users are created via `/wallet/createMember` endpoint (protected by `AgentAuthGuard`)
- Users belong to a specific agent

#### 2. **Agents Entity**
- Primary Key: `agentId`
- Fields: `agentId`, `cert`, `agentIPaddress`, `callbackURL`, `isWhitelisted`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`
- Used for agent authentication via `AgentAuthGuard`
- No relationship to admin users currently

#### 3. **Bet Entity**
- Primary Key: `id` (UUID)
- Fields: `userId`, `operatorId` (agentId), `betAmount`, `winAmount`, `currency`, `status`, `difficulty`, `betPlacedAt`, `settledAt`, etc.
- Contains complete bet history with user and agent associations

#### 4. **Admin Entity** (Basic)
- Primary Key: `id` (UUID)
- Fields: `username`, `passwordHash`
- Currently minimal - no role system

#### 5. **GameConfig Entity**
- Primary Key: `id`
- Fields: `key`, `value`, `updatedAt`
- Key-value store for game configuration

### Current Authentication Flow

1. **Agent Authentication**: `AgentAuthGuard` validates `agentId` + `cert` + IP whitelist
2. **User Authentication**: JWT tokens issued via `/wallet/login` endpoints
3. **Admin Authentication**: Not implemented

### Current User Creation Flow

- Agents call `/wallet/createMember` with agent credentials
- System validates agent via `AgentAuthGuard`
- User is created/upserted with `createdBy = agentId`

---

## Requirements

### Functional Requirements

#### Super Admin Capabilities
1. **User Management**
   - View all users across all agents
   - Filter users by agent, currency, date range
   - View user details (profile, bet history, statistics)
   - Search users by userId, username
   - Export user data

2. **Agent Management**
   - Create new agents
   - View all agents
   - Update agent details (cert, IP, callback URL, whitelist status)
   - Delete/deactivate agents
   - View agent statistics (user count, bet volume, etc.)

3. **Game Configuration Management**
   - View all game configurations
   - Create/update/delete game config entries
   - Manage game-level settings (bet limits, difficulty settings, etc.)

4. **System Overview**
   - Dashboard with key metrics (total users, active agents, bet volume, etc.)
   - System health monitoring

#### Agent/Admin Capabilities
1. **User Management (Own Users Only)**
   - View all users associated with their agent
   - Create new users (via admin portal)
   - Update user details (username, betLimit, currency, etc.)
   - View user details and statistics

2. **Bet History**
   - View bet history for all their users
   - Filter by user, date range, status, difficulty
   - Export bet history
   - View bet statistics (total bets, win rate, volume, etc.)

3. **User Statistics**
   - View aggregated statistics for their users
   - Active users count
   - Bet volume and revenue

### Non-Functional Requirements
- Role-based access control (RBAC)
- Secure authentication (JWT with refresh tokens)
- Audit logging for admin actions
- API rate limiting
- Pagination for large datasets
- Data export capabilities (CSV/JSON)

---

## Database Schema Design

### 1. Enhanced Admin Entity

```typescript
@Entity({ name: 'admins' })
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  // NEW FIELDS
  @Column({ type: 'enum', enum: AdminRole, default: AdminRole.AGENT })
  role: AdminRole;

  @Column({ nullable: true })
  agentId?: string; // For AGENT role - links to Agents table

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  fullName?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  lastLoginAt?: Date;

  @Column({ nullable: true })
  createdBy?: string; // Admin ID who created this admin

  @Column({ nullable: true })
  updatedBy?: string;
}

export enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  AGENT = 'AGENT',
}
```

**Migration Notes:**
- Add `role` column with default `AGENT`
- Add `agentId` column (nullable, for agent admins)
- Add `isActive`, `email`, `fullName`, `lastLoginAt`, `createdBy`, `updatedBy`
- Existing admins should be migrated to `SUPER_ADMIN` role (or set manually)

### 2. Admin Session Entity (Optional - for refresh tokens)

```typescript
@Entity({ name: 'admin_sessions' })
export class AdminSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  adminId: string;

  @Column()
  refreshToken: string;

  @Column()
  ipAddress: string;

  @Column()
  userAgent?: string;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @Index()
  @Column()
  tokenHash: string; // Hashed version of refresh token
}
```

### 3. Audit Log Entity

```typescript
@Entity({ name: 'admin_audit_logs' })
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  adminId: string;

  @Column()
  action: string; // e.g., 'CREATE_USER', 'UPDATE_AGENT', 'DELETE_CONFIG'

  @Column({ type: 'enum', enum: AuditLogType })
  type: AuditLogType;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: any; // Store request details, old/new values, etc.

  @Column()
  ipAddress: string;

  @CreateDateColumn()
  createdAt: Date;
}

export enum AuditLogType {
  USER_MANAGEMENT = 'USER_MANAGEMENT',
  AGENT_MANAGEMENT = 'AGENT_MANAGEMENT',
  CONFIG_MANAGEMENT = 'CONFIG_MANAGEMENT',
  AUTHENTICATION = 'AUTHENTICATION',
  SYSTEM = 'SYSTEM',
}
```

### 4. No Changes Required to Existing Entities

- **User Entity**: No changes needed - already has `agentId` relationship
- **Agents Entity**: No changes needed - can be linked via `agentId` in Admin
- **Bet Entity**: No changes needed - already has `userId`, `operatorId` (agentId), `platform`, and `gameType` fields
- **Admin Entity**: Used for authentication and authorization (admin edit operations)

**Notes**: 
- The Bet entity already contains `platform` and `gameType` fields, which are used for filtering and aggregation in the new admin portal features.
- **All statistics and data**: Retrieved from BET table only
- **Admin operations**: Use ADMIN table for authentication and authorization
- **Data retention**: Backend scheduler automatically removes data older than 2 months from BET table (already implemented)

---

## Authentication & Authorization

### Authentication Flow

#### 1. Admin Login
```
POST /admin/auth/login
Body: { username, password }
Response: { accessToken, refreshToken, admin: { id, username, role, agentId } }
```

#### 2. Token Refresh
```
POST /admin/auth/refresh
Body: { refreshToken }
Response: { accessToken, refreshToken }
```

#### 3. Logout
```
POST /admin/auth/logout
Headers: { Authorization: Bearer <token> }
Response: { success: true }
```

### JWT Token Payload

```typescript
interface AdminTokenPayload {
  sub: string; // Admin ID
  username: string;
  role: AdminRole;
  agentId?: string; // Only for AGENT role
  iat: number;
  exp: number;
}
```

### Authorization Guards

#### 1. AdminAuthGuard
- Validates JWT token
- Extracts admin info from token
- Attaches admin to request object

#### 2. RolesGuard
- Checks admin role
- Can be used with decorators: `@Roles(AdminRole.SUPER_ADMIN)`

#### 3. AgentAccessGuard (for Agent role)
- Ensures agent admin can only access their own agent's data
- Validates `agentId` from token matches requested resource

### Role-Based Access Matrix

| Action | Super Admin | Agent Admin |
|--------|-------------|-------------|
| View all users | ✅ | ❌ |
| View own users | ✅ | ✅ |
| Create user (any agent) | ✅ | ❌ |
| Create user (own agent) | ✅ | ✅ |
| Update user (any agent) | ✅ | ❌ |
| Update user (own agent) | ✅ | ✅ |
| View all agents | ✅ | ❌ |
| Create agent | ✅ | ❌ |
| Update agent | ✅ | ❌ |
| Delete agent | ✅ | ❌ |
| View all bets | ✅ | ❌ |
| View own agent bets | ✅ | ✅ |
| Manage game config | ✅ | ❌ |
| View audit logs | ✅ | ❌ (or own only) |

---

## API Endpoints Design

### Base Path: `/admin/api/v1`

### Authentication Endpoints

#### POST `/admin/auth/login`
**Description**: Admin login
**Auth**: None
**Request Body**:
```json
{
  "username": "admin",
  "password": "password123"
}
```
**Response**:
```json
{
  "status": "0000",
  "accessToken": "jwt_token",
  "refreshToken": "refresh_token",
  "admin": {
    "id": "uuid",
    "username": "admin",
    "role": "SUPER_ADMIN",
    "agentId": null,
    "email": "admin@example.com",
    "fullName": "Super Admin"
  }
}
```

#### POST `/admin/auth/refresh`
**Description**: Refresh access token
**Auth**: None
**Request Body**:
```json
{
  "refreshToken": "refresh_token"
}
```

#### POST `/admin/auth/logout`
**Description**: Logout and invalidate refresh token
**Auth**: Required (AdminAuthGuard)

#### GET `/admin/auth/me`
**Description**: Get current admin profile
**Auth**: Required (AdminAuthGuard)

---

### User Management Endpoints

#### GET `/admin/users`
**Description**: List users
**Auth**: Required (AdminAuthGuard)
**Query Parameters**:
- `page`: number (default: 1)
- `limit`: number (default: 20, max: 100)
- `agentId`: string (filter by agent) - Super Admin only
- `currency`: string (filter by currency)
- `search`: string (search userId/username)
- `createdFrom`: date (ISO string)
- `createdTo`: date (ISO string)

**Response**:
```json
{
  "status": "0000",
  "data": {
    "users": [
      {
        "userId": "user123",
        "agentId": "agent001",
        "username": "Player One",
        "currency": "USD",
        "betLimit": "1000",
        "language": "en",
        "avatar": "url",
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

**Access Control**:
- Super Admin: Can see all users, can filter by any agentId
- Agent Admin: Can only see users from their agentId (agentId filter ignored, uses token's agentId)

#### GET `/admin/users/:userId/:agentId`
**Description**: Get user details
**Auth**: Required (AdminAuthGuard + AgentAccessGuard)
**Response**:
```json
{
  "status": "0000",
  "data": {
    "user": {
      "userId": "user123",
      "agentId": "agent001",
      "username": "Player One",
      "currency": "USD",
      "betLimit": "1000",
      "language": "en",
      "avatar": "url",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    },
    "statistics": {
      "totalBets": 150,
      "totalBetAmount": "50000.00",
      "totalWinAmount": "45000.00",
      "winRate": 0.65,
      "lastBetAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

#### POST `/admin/users`
**Description**: Create new user
**Auth**: Required (AdminAuthGuard + RolesGuard)
**Request Body**:
```json
{
  "userId": "newuser123",
  "agentId": "agent001",
  "currency": "USD",
  "betLimit": "1000",
  "language": "en",
  "username": "New Player",
  "password": "optional_password"
}
```
**Access Control**:
- Super Admin: Can create user for any agent
- Agent Admin: Can only create user for their own agentId

#### PATCH `/admin/users/:userId/:agentId`
**Description**: Update user
**Auth**: Required (AdminAuthGuard + AgentAccessGuard)
**Request Body** (all optional):
```json
{
  "username": "Updated Name",
  "betLimit": "2000",
  "currency": "EUR",
  "language": "fr",
  "avatar": "new_url",
  "password": "new_password"
}
```

#### DELETE `/admin/users/:userId/:agentId`
**Description**: Delete user (soft delete or hard delete based on requirements)
**Auth**: Required (AdminAuthGuard + AgentAccessGuard)

---

### Player Bets Endpoints (Renamed from Bet History)

#### GET `/admin/bets`
**Description**: List bets (Player Bets page)
**Auth**: Required (AdminAuthGuard)
**Query Parameters**:
- `page`: number
- `limit`: number
- `userId`: string (filter by user - pre-filled when navigated from Player Summary)
- `agentId`: string (filter by agent) - Super Admin only
- `status`: BetStatus enum
- `difficulty`: Difficulty enum
- `currency`: string
- `platform`: string
- `gameType`: string
- `fromDate`: date (ISO string) - defaults to 2 months ago if not provided
- `toDate`: date (ISO string) - defaults to today if not provided

**Note**: 
- Only returns bets from the past 2 months. If today is Dec 1, data will be from Oct 1 onwards.
- The backend should automatically filter bets to only include those from the past 2 months, regardless of the `fromDate` parameter.
- If `fromDate` is provided and is more than 2 months ago, it will be automatically adjusted to 2 months ago.
- This constraint applies to all bet-related queries in the admin portal.
- **Data Source**: All data retrieved from BET table only
- **Data Retention**: Backend scheduler automatically removes data older than 2 months from BET table (already implemented)

**Response**:
```json
{
  "status": "0000",
  "data": {
    "bets": [
      {
        "id": "uuid",
        "externalPlatformTxId": "tx123",
        "userId": "user123",
        "agentId": "agent001",
        "roundId": "round456",
        "platform": "SPADE",
        "gameType": "LIVE",
        "difficulty": "EASY",
        "betAmount": "100.00",
        "winAmount": "150.00",
        "currency": "USD",
        "status": "WON",
        "betPlacedAt": "2024-01-15T10:00:00Z",
        "settledAt": "2024-01-15T10:05:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 500,
      "totalPages": 25
    },
    "summary": {
      "totalBets": 500,
      "totalBetAmount": "50000.00",
      "totalWinAmount": "45000.00",
      "netRevenue": "5000.00"
    },
    "totals": {
      "totalBets": 500,
      "totalBetAmount": "50000.00",
      "totalWinAmount": "45000.00",
      "netRevenue": "5000.00"
    }
  }
}
```

**Access Control**:
- Super Admin: Can see all bets, can filter by any agentId
- Agent Admin: Can only see bets from their agentId

#### GET `/admin/bets/totals`
**Description**: Get bet totals for summary cards (totals of ALL records, not just visible on current page)
**Auth**: Required (AdminAuthGuard)
**Query Parameters**: Same as GET `/admin/bets` (filters applied)
**Response**:
```json
{
  "status": "0000",
  "data": {
    "totalBets": 500,
    "totalBetAmount": "50000.00",
    "totalWinAmount": "45000.00",
    "netRevenue": "5000.00"
  }
}
```

**Note**: Totals should be calculated across ALL matching records (respecting filters), not just the current page.

#### GET `/admin/bets/export`
**Description**: Export bets to CSV/JSON
**Auth**: Required (AdminAuthGuard)
**Query Parameters**: Same as GET `/admin/bets`
**Response**: CSV file or JSON download

#### GET `/admin/bets/statistics`
**Description**: Get bet statistics
**Auth**: Required (AdminAuthGuard)
**Query Parameters**: Same filters as GET `/admin/bets`
**Response**:
```json
{
  "status": "0000",
  "data": {
    "totalBets": 1000,
    "totalBetAmount": "100000.00",
    "totalWinAmount": "90000.00",
    "netRevenue": "10000.00",
    "winRate": 0.65,
    "averageBetAmount": "100.00",
    "byDifficulty": {
      "EASY": { "count": 400, "betAmount": "40000.00" },
      "MEDIUM": { "count": 300, "betAmount": "30000.00" },
      "HARD": { "count": 200, "betAmount": "20000.00" },
      "DAREDEVIL": { "count": 100, "betAmount": "10000.00" }
    },
    "byStatus": {
      "WON": 650,
      "LOST": 350
    }
  }
}
```

---

### Agent Management Endpoints (Super Admin Only)

#### GET `/admin/agents`
**Description**: List all agents with statistics
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)
**Query Parameters**:
- `page`: number
- `limit`: number
- `agentId`: string (search/filter by agentId)
- `platform`: string (filter by platform)
- `gameType`: string (filter by gameType)
- `fromDate`: date (ISO string)
- `toDate`: date (ISO string)
- `isWhitelisted`: boolean

**Response**:
```json
{
  "status": "0000",
  "data": {
    "agents": [
      {
        "agentId": "agent001",
        "platform": "SPADE",
        "gameType": "LIVE",
        "betCount": 5000,
        "betAmount": "500000.00",
        "winLoss": "-45000.00",
        "adjustment": "0.00",
        "totalWinLoss": "-45000.00",
        "marginPercent": 9.0,
        "companyTotalWinLoss": "50000.00",
        "cert": "***hidden***",
        "agentIPaddress": "192.168.1.1",
        "callbackURL": "https://agent.com/callback",
        "isWhitelisted": true,
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 10,
      "totalPages": 1
    },
    "totals": {
      "totalBetCount": 50000,
      "totalBetAmount": "5000000.00",
      "totalWinLoss": "-450000.00",
      "totalMarginPercent": 9.0,
      "companyTotalWinLoss": "500000.00"
    }
  }
}
```

**Data Structure Notes**:
- **Separate rows per agent-platform-gameType combination**: Each row represents aggregated statistics for a unique combination of agentId, platform, and gameType
- **Data Source**: All statistics calculated from BET table only

**Calculation Notes**:
- `winLoss`: Sum of (betAmount - winAmount) for all bets in the agent-platform-gameType combination
  - **Sign Convention**: Positive = company profit, Negative = players won more
- `adjustment`: Always 0.00 (visible but read-only for now)
- `totalWinLoss`: winLoss + adjustment
- `marginPercent`: `((Total Bet Amount - Total Win Amount) / Total Bet Amount) * 100` (company earnings percentage)
- `companyTotalWinLoss`: Total betAmount - Total winAmount (positive = company profit)

#### GET `/admin/agents/:agentId`
**Description**: Get agent details
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)

#### POST `/admin/agents`
**Description**: Create new agent
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)
**Request Body**:
```json
{
  "agentId": "newagent",
  "cert": "secret_cert",
  "agentIPaddress": "192.168.1.100",
  "callbackURL": "https://newagent.com/callback",
  "isWhitelisted": true
}
```

#### PATCH `/admin/agents/:agentId`
**Description**: Update agent
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)

#### DELETE `/admin/agents/:agentId`
**Description**: Delete agent (or deactivate)
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)

#### GET `/admin/agents/totals`
**Description**: Get agent totals for summary cards (totals of ALL records, not just visible on current page)
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)
**Query Parameters**: Same filters as GET `/admin/agents`
**Response**:
```json
{
  "status": "0000",
  "data": {
    "totalBetCount": 50000,
    "totalBetAmount": "5000000.00",
    "totalWinLoss": "-450000.00",
    "totalMarginPercent": 9.0,
    "companyTotalWinLoss": "500000.00"
  }
}
```

**Note**: Totals should be calculated across ALL matching records (respecting filters), not just the current page.

---

### Player Summary Endpoints (Super Admin Only)

#### GET `/admin/player-summary`
**Description**: List all players with their statistics
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)
**Query Parameters**:
- `page`: number
- `limit`: number
- `playerId`: string (search/filter by playerId)
- `platform`: string (filter by platform)
- `gameType`: string (filter by gameType)
- `agentId`: string (filter by agentId - pre-filled when navigated from Agents page)
- `fromDate`: date (ISO string)
- `toDate`: date (ISO string)

**Response**:
```json
{
  "status": "0000",
  "data": {
    "players": [
      {
        "playerId": "user123",
        "platform": "SPADE",
        "game": "ChickenRoad",
        "betCount": 150,
        "betAmount": "15000.00",
        "playerWinLoss": "-1350.00",
        "totalWinLoss": "-1350.00"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1000,
      "totalPages": 50
    },
    "totals": {
      "totalPlayers": 1000,
      "totalBetCount": 50000,
      "totalBetAmount": "5000000.00",
      "totalPlayerWinLoss": "-450000.00",
      "totalWinLoss": "-450000.00"
    }
  }
}
```

**Data Structure Notes**:
- **Separate rows per player-platform-game combination**: Each row represents aggregated statistics for a unique combination of playerId, platform, and game
- **Data Source**: All statistics calculated from BET table only
- **Agent Filter**: When navigated from Agents page, agentId filter is pre-filled but user can clear it to see all players

**Calculation Notes**:
- `playerWinLoss`: Sum of (betAmount - winAmount) for player's bets in the player-platform-game combination
  - **Sign Convention**: Positive = company profit, Negative = players won more
- `totalWinLoss`: Same as playerWinLoss (adjustments not applied at player level)

#### GET `/admin/player-summary/totals`
**Description**: Get player summary totals for summary cards (totals of ALL records, not just visible on current page)
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)
**Query Parameters**: Same filters as GET `/admin/player-summary`
**Response**:
```json
{
  "status": "0000",
  "data": {
    "totalPlayers": 1000,
    "totalBetCount": 50000,
    "totalBetAmount": "5000000.00",
    "totalPlayerWinLoss": "-450000.00",
    "totalWinLoss": "-450000.00"
  }
}
```

**Note**: 
- `totalPlayers` should be the unique count of players (not row count, since rows are per player-platform-game combination)
- Totals should be calculated across ALL matching records (respecting filters), not just the current page

---

### Game Configuration Endpoints (Super Admin Only)

#### GET `/admin/config`
**Description**: List all game configurations
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)
**Query Parameters**:
- `search`: string (search by key)

**Response**:
```json
{
  "status": "0000",
  "data": {
    "configs": [
      {
        "id": 1,
        "key": "jwt.secret",
        "value": "***hidden***",
        "updatedAt": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

#### GET `/admin/config/:key`
**Description**: Get specific config
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)

#### POST `/admin/config`
**Description**: Create/update config
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)
**Request Body**:
```json
{
  "key": "game.betLimit.max",
  "value": "10000"
}
```

#### DELETE `/admin/config/:key`
**Description**: Delete config
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)

---

### Dashboard/Statistics Endpoints

#### GET `/admin/dashboard/overview`
**Description**: Get dashboard overview
**Auth**: Required (AdminAuthGuard)
**Response**:
```json
{
  "status": "0000",
  "data": {
    "totalUsers": 1000,
    "totalAgents": 10,
    "activeUsers": 500,
    "totalBets": 50000,
    "totalBetVolume": "5000000.00",
    "totalWinAmount": "4500000.00",
    "netRevenue": "500000.00",
    "recentActivity": [...]
  }
}
```

**Access Control**:
- Super Admin: System-wide statistics
- Agent Admin: Statistics for their agent only

---

### Admin Management Endpoints (Super Admin Only)

#### GET `/admin/admins`
**Description**: List all admins
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)

#### POST `/admin/admins`
**Description**: Create new admin
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)
**Request Body**:
```json
{
  "username": "newadmin",
  "password": "securepassword",
  "role": "AGENT",
  "agentId": "agent001",
  "email": "admin@example.com",
  "fullName": "Agent Admin"
}
```

#### PATCH `/admin/admins/:id`
**Description**: Update admin
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)

#### DELETE `/admin/admins/:id`
**Description**: Delete/deactivate admin
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)

---

### Audit Log Endpoints (Super Admin Only)

#### GET `/admin/audit-logs`
**Description**: List audit logs
**Auth**: Required (AdminAuthGuard + RolesGuard - SUPER_ADMIN)
**Query Parameters**:
- `page`: number
- `limit`: number
- `adminId`: string
- `action`: string
- `type`: AuditLogType
- `fromDate`: date
- `toDate`: date

---

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1-2)

1. **Database Migrations**
   - Update Admin entity with new fields
   - Create AdminSession entity
   - Create AdminAuditLog entity
   - Run migrations

2. **Authentication Module**
   - Create `AdminAuthModule`
   - Implement `AdminAuthService` (login, refresh, logout)
   - Implement `AdminAuthGuard`
   - Implement password hashing (bcrypt)
   - JWT token generation for admins

3. **Authorization Module**
   - Create `RolesGuard`
   - Create `AgentAccessGuard`
   - Create `@Roles()` decorator
   - Create `@AgentAccess()` decorator

### Phase 2: User Management (Week 2-3)

1. **Admin User Module**
   - Create `AdminUserModule`
   - Implement `AdminUserService`
   - Create DTOs for user operations
   - Implement user CRUD endpoints
   - Add pagination and filtering
   - Implement user statistics

2. **Player Bets Module** (Renamed from Bet History)
   - Create `AdminBetModule`
   - Implement `AdminBetService`
   - Create bet listing endpoints
   - Implement bet statistics and totals (totals of ALL records, not just current page)
   - Add 2-month data constraint (only return bets from past 2 months - backend scheduler already removes older data)
   - Add export functionality
   - Add platform and gameType filters
   - **Data Source**: All data from BET table only

### Phase 3: Agent & Config Management (Week 3-4)

1. **Admin Agent Module**
   - Create `AdminAgentModule`
   - Extend existing `AgentsService` or create admin-specific service
   - Implement agent CRUD endpoints
   - Add agent statistics with aggregations:
     - **Group by**: agentId, platform, gameType (separate rows per combination)
     - Bet count, bet amount per agent-platform-gameType combination
     - Win/Loss calculations (positive = company profit, negative = players won more)
     - Margin percentage calculations: `((Bet Amount - Win Amount) / Bet Amount) * 100`
     - Company total win/loss: `Bet Amount - Win Amount`
   - Add platform and gameType filtering
   - Add date range filtering
   - Implement agent totals endpoint (totals of ALL records, not just current page)
   - **Data Source**: All statistics from BET table only

2. **Player Summary Module** (NEW)
   - Create `AdminPlayerSummaryModule`
   - Implement `AdminPlayerSummaryService`
   - Create player summary listing endpoint
   - Aggregate player statistics:
     - **Group by**: playerId, platform, game (separate rows per combination)
     - Bet count, bet amount per player-platform-game combination
     - Player win/loss calculations (positive = company profit, negative = players won more)
   - Add filtering by agentId (pre-filled when navigated from Agents page, but user can clear), platform, gameType, date range
   - Implement player summary totals endpoint (totals of ALL records, not just current page)
   - **Data Source**: All statistics from BET table only

3. **Admin Config Module**
   - Create `AdminConfigModule`
   - Extend existing `GameConfigService` or create admin-specific service
   - Implement config CRUD endpoints

### Phase 4: Dashboard & Audit (Week 4-5)

1. **Dashboard Module**
   - Create `AdminDashboardModule`
   - Implement dashboard statistics
   - Create overview endpoint

2. **Audit Logging**
   - Create `AdminAuditModule`
   - Implement audit log service
   - Add audit logging to all admin actions
   - Create audit log viewing endpoints

### Phase 5: Testing & Documentation (Week 5-6)

1. **Unit Tests**
   - Test all services
   - Test guards and decorators
   - Test DTOs validation

2. **Integration Tests**
   - Test API endpoints
   - Test authentication flows
   - Test authorization rules

3. **Documentation**
   - API documentation (Swagger/OpenAPI)
   - Update integration guide
   - Create admin user guide

---

## Security Considerations

### 1. Password Security
- Use bcrypt with salt rounds (minimum 10)
- Enforce strong password policy (min length, complexity)
- Implement password reset flow (future enhancement)

### 2. Token Security
- Short-lived access tokens (15-30 minutes)
- Longer-lived refresh tokens (7-30 days)
- Store refresh tokens securely (hashed in database)
- Implement token rotation on refresh
- Blacklist tokens on logout

### 3. Rate Limiting
- Implement rate limiting on login endpoint (e.g., 5 attempts per 15 minutes)
- Rate limit all admin endpoints
- Different limits for different endpoints

### 4. IP Whitelisting (Optional)
- Allow IP whitelisting for admin access
- Store allowed IPs per admin

### 5. Audit Logging
- Log all admin actions
- Log authentication attempts (success and failure)
- Log sensitive operations (user deletion, config changes)
- Store IP addresses and user agents

### 6. Input Validation
- Validate all input using DTOs with class-validator
- Sanitize user inputs
- Prevent SQL injection (TypeORM handles this)
- Prevent XSS attacks

### 7. CORS Configuration
- Restrict CORS to admin portal domain only
- Do not allow credentials from untrusted origins

### 8. Sensitive Data Masking
- Mask sensitive fields in responses (cert, password hashes)
- Only show last 4 characters of sensitive data when needed

---

## Changes Required to User Side

### Analysis: Do We Need Changes?

**Answer: NO MAJOR CHANGES REQUIRED**

The existing user creation flow via `/wallet/createMember` should remain unchanged. However, we can add an **optional** enhancement:

### Optional Enhancement: User Creation via Admin Portal

If agents want to create users through the admin portal instead of (or in addition to) the wallet API:

1. **New Endpoint**: `POST /admin/users` (already designed above)
   - This uses admin authentication instead of agent authentication
   - Still creates users in the same way
   - Maintains same User entity structure

2. **No Changes to Existing Flow**
   - `/wallet/createMember` continues to work as before
   - Both methods create users identically
   - Users created via admin portal are indistinguishable from wallet API users

### Recommended Approach

**Keep both methods available:**
- **Wallet API** (`/wallet/createMember`): For automated/API-based user creation
- **Admin Portal** (`/admin/users`): For manual user creation by admins

This provides flexibility without breaking existing integrations.

### Frontend Considerations (If Building Admin Portal Frontend)

If you plan to build an admin portal frontend, you would need:
1. Login page
2. Dashboard
3. User management pages
4. Bet history pages
5. Agent management pages (Super Admin only)
6. Config management pages (Super Admin only)

But this is **outside the scope of this backend design document**.

---

## Testing Strategy

### Unit Tests

1. **AdminAuthService**
   - Test login with valid/invalid credentials
   - Test token generation
   - Test refresh token flow
   - Test logout

2. **Guards**
   - Test AdminAuthGuard with valid/invalid tokens
   - Test RolesGuard with different roles
   - Test AgentAccessGuard with agent restrictions

3. **Services**
   - Test user CRUD operations
   - Test bet filtering and pagination
   - Test agent management
   - Test config management

### Integration Tests

1. **Authentication Flow**
   - Test complete login → access → refresh → logout flow
   - Test token expiration handling

2. **Authorization**
   - Test Super Admin can access all endpoints
   - Test Agent Admin restricted to own data
   - Test unauthorized access attempts

3. **API Endpoints**
   - Test all CRUD operations
   - Test pagination
   - Test filtering
   - Test error handling

### E2E Tests (Optional)

1. **Admin Portal Workflows**
   - Complete user creation workflow
   - Bet history viewing workflow
   - Agent management workflow

---

## Module Structure

```
src/
├── modules/
│   ├── admin-auth/
│   │   ├── admin-auth.module.ts
│   │   ├── admin-auth.service.ts
│   │   ├── admin-auth.controller.ts
│   │   ├── guards/
│   │   │   ├── admin-auth.guard.ts
│   │   │   ├── roles.guard.ts
│   │   │   └── agent-access.guard.ts
│   │   ├── decorators/
│   │   │   ├── roles.decorator.ts
│   │   │   └── current-admin.decorator.ts
│   │   └── dto/
│   │       ├── login.dto.ts
│   │       └── refresh.dto.ts
│   ├── admin-user/
│   │   ├── admin-user.module.ts
│   │   ├── admin-user.service.ts
│   │   ├── admin-user.controller.ts
│   │   └── dto/
│   │       ├── create-user.dto.ts
│   │       ├── update-user.dto.ts
│   │       └── user-query.dto.ts
│   ├── admin-bet/
│   │   ├── admin-bet.module.ts
│   │   ├── admin-bet.service.ts
│   │   ├── admin-bet.controller.ts
│   │   └── dto/
│   │       ├── bet-query.dto.ts
│   │       └── bet-totals.dto.ts
│   ├── admin-player-summary/
│   │   ├── admin-player-summary.module.ts
│   │   ├── admin-player-summary.service.ts
│   │   ├── admin-player-summary.controller.ts
│   │   └── dto/
│   │       ├── player-summary-query.dto.ts
│   │       └── player-summary-totals.dto.ts
│   ├── admin-agent/
│   │   ├── admin-agent.module.ts
│   │   ├── admin-agent.service.ts
│   │   ├── admin-agent.controller.ts
│   │   └── dto/
│   │       ├── create-agent.dto.ts
│   │       ├── update-agent.dto.ts
│   │       ├── agent-query.dto.ts
│   │       └── agent-totals.dto.ts
│   ├── admin-config/
│   │   ├── admin-config.module.ts
│   │   ├── admin-config.service.ts
│   │   ├── admin-config.controller.ts
│   │   └── dto/
│   │       └── config.dto.ts
│   ├── admin-dashboard/
│   │   ├── admin-dashboard.module.ts
│   │   ├── admin-dashboard.service.ts
│   │   └── admin-dashboard.controller.ts
│   └── admin-audit/
│       ├── admin-audit.module.ts
│       ├── admin-audit.service.ts
│       └── admin-audit.controller.ts
├── entities/
│   ├── admin.entity.ts (updated)
│   ├── admin-session.entity.ts (new)
│   └── admin-audit-log.entity.ts (new)
```

---

## Environment Variables

Add to `.env`:

```env
# Admin Portal JWT
ADMIN_JWT_SECRET=your_admin_jwt_secret_here
ADMIN_JWT_EXPIRES_IN=30m
ADMIN_JWT_REFRESH_EXPIRES_IN=7d

# Admin Portal Settings
ADMIN_PORTAL_ENABLED=true
ADMIN_RATE_LIMIT_TTL=900
ADMIN_RATE_LIMIT_MAX=100
ADMIN_LOGIN_RATE_LIMIT_MAX=5
ADMIN_LOGIN_RATE_LIMIT_TTL=900
```

---

## Summary

This design provides:

1. ✅ **Role-based access control** with Super Admin and Agent Admin roles
2. ✅ **Complete user management** for both roles with appropriate restrictions
3. ✅ **Player Bets access** (renamed from Bet History) with filtering, statistics, and 2-month data constraint
4. ✅ **Agent management with statistics** for Super Admin:
   - Agent-level aggregations (bet count, bet amount, win/loss, margin %, company win/loss)
   - Platform and gameType filtering
   - Date range filtering
   - Navigation to Player Summary
5. ✅ **Player Summary** for Super Admin:
   - Player-level statistics aggregation
   - Navigation to Player Bets with pre-filled filters
6. ✅ **Game configuration management** for Super Admin
7. ✅ **Secure authentication** with JWT and refresh tokens
8. ✅ **Audit logging** for all admin actions
9. ✅ **Backward compatibility** with existing wallet API
10. ✅ **No breaking changes** to existing user creation flow
11. ✅ **Data constraints**: Only past 2 months of bet data available (e.g., if today is Dec 1, data from Oct 1 onwards)

The design is modular, scalable, and follows NestJS best practices. Implementation can be done incrementally following the phased approach outlined above.

## Key Features Added

### Agents Page
- Tabular view with agent statistics
- Columns: Agent ID, Platform, Game Type, Bet Count, Bet Amount, Win/Loss, Adjustment (0), Total Win/Loss, Margin %, Company Total Win/Loss
- Actions: Edit Agent, View Users (navigates to Player Summary)
- Filters: Date range, platform, gameType, agentId
- Summary totals at bottom or in cards

### Player Summary Page
- Tabular view with player statistics
- Columns: Player ID, Platform, Bet Count, Bet Amount, Player Win/Loss, Total Win/Loss
- Actions: View Player Bets (navigates to Player Bets with userId filter)
- Filters: Player ID, platform, gameType, date range, agentId (pre-filled from Agents page)
- Summary totals at bottom or in cards

### Player Bets Page (Renamed from Bet History)
- All existing bet columns plus Platform and Game Type
- Date filters default to last 2 months
- Only shows data from past 2 months
- Summary totals at bottom or in cards

