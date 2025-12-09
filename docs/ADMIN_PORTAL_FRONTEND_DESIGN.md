# Admin Portal Frontend Design Document

## Table of Contents
1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Application Structure](#application-structure)
4. [Pages & Routes](#pages--routes)
5. [Component Architecture](#component-architecture)
6. [State Management](#state-management)
7. [API Integration](#api-integration)
8. [Authentication Flow](#authentication-flow)
9. [Role-Based UI](#role-based-ui)
10. [UI/UX Guidelines](#uiux-guidelines)

---

## Overview

This document outlines the frontend design for the Admin Portal, providing essential administrative capabilities for Super Admins and Agent Admins to manage users, view bet history, manage agents, and configure game settings.

**Essential Features Only:**
- Authentication (login/logout)
- Dashboard overview
- User management (CRUD)
- Bet history viewing
- Agent management (Super Admin only)
- Game configuration management (Super Admin only)

---

## Technology Stack

Based on existing frontend stack:

| Technology | Purpose |
|------------|---------|
| React 18 | UI Framework |
| TypeScript | Type Safety |
| Vite | Build Tool & Dev Server |
| Tailwind CSS | Styling |
| Zustand | State Management |
| Axios | HTTP Client |
| React Router | Navigation |

---

## Application Structure

```
admin-portal-fe/
├── src/
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── AppLayout.tsx          # Main layout with sidebar
│   │   │   ├── Sidebar.tsx             # Navigation sidebar
│   │   │   ├── Header.tsx              # Top header with user info
│   │   │   └── ProtectedRoute.tsx      # Route protection wrapper
│   │   ├── Auth/
│   │   │   └── LoginForm.tsx            # Login form
│   │   ├── Dashboard/
│   │   │   └── DashboardOverview.tsx    # Dashboard stats cards
│   │   ├── Users/
│   │   │   ├── UserList.tsx             # User list table
│   │   │   ├── UserForm.tsx             # Create/Edit user form
│   │   │   └── UserDetails.tsx          # User detail view
│   │   ├── PlayerBets/
│   │   │   ├── PlayerBetList.tsx        # Player bets table (renamed from BetList)
│   │   │   └── BetDetails.tsx           # Bet detail view
│   │   ├── PlayerSummary/
│   │   │   └── PlayerSummaryList.tsx    # Player summary table
│   │   ├── Agents/
│   │   │   ├── AgentList.tsx            # Agent list table
│   │   │   └── AgentForm.tsx            # Create/Edit agent form
│   │   ├── Config/
│   │   │   ├── ConfigList.tsx           # Config list table
│   │   │   └── ConfigForm.tsx           # Create/Edit config form
│   │   └── Common/
│   │       ├── Table.tsx                # Reusable table component
│   │       ├── Pagination.tsx          # Pagination component
│   │       ├── SearchInput.tsx         # Search input
│   │       ├── LoadingSpinner.tsx      # Loading indicator
│   │       └── Toast.tsx                # Toast notifications
│   ├── services/
│   │   ├── api.service.ts               # API client with interceptors
│   │   └── auth.service.ts              # Auth helper functions
│   ├── store/
│   │   ├── authStore.ts                 # Authentication state
│   │   ├── userStore.ts                 # User management state
│   │   ├── betStore.ts                  # Bet history state
│   │   ├── agentStore.ts                # Agent management state
│   │   └── configStore.ts               # Config management state
│   ├── types/
│   │   └── index.ts                     # TypeScript interfaces
│   ├── utils/
│   │   ├── formatters.ts                # Date/currency formatters
│   │   └── validators.ts                # Form validation
│   ├── hooks/
│   │   ├── useAuth.ts                   # Auth hook
│   │   └── usePagination.ts             # Pagination hook
│   ├── App.tsx                          # Main app component
│   ├── main.tsx                         # Entry point
│   └── index.css                        # Global styles
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## Pages & Routes

### Route Structure

```typescript
/                          → Login page (public)
/dashboard                 → Dashboard (protected)
/users                     → User list (protected)
/users/:userId/:agentId   → User details (protected)
/users/new                 → Create user (protected)
/player-bets               → Player bets (renamed from Bet History) (protected)
/player-bets/:betId        → Bet details (protected)
/agents                    → Agent list (Super Admin only)
/agents/new                → Create agent (Super Admin only)
/agents/:agentId           → Edit agent (Super Admin only)
/agents/:agentId/players   → Player Summary (Super Admin only)
/config                    → Config list (Super Admin only)
/config/new                → Create config (Super Admin only)
/config/:key               → Edit config (Super Admin only)
```

### Route Protection

- All routes except `/` require authentication
- `/agents/*` and `/config/*` routes require Super Admin role
- Agent Admins are automatically redirected if accessing Super Admin routes

---

## Component Architecture

### 1. Layout Components

#### AppLayout.tsx
- Main container with sidebar and header
- Handles responsive layout
- Wraps all protected pages

#### Sidebar.tsx
- Navigation menu
- Role-based menu items
- Active route highlighting
- Collapsible on mobile

**Menu Items:**
- Dashboard (all roles)
- Users (all roles)
- Player Bets (all roles) - renamed from Bet History
- Agents (Super Admin only)
- Game Config (Super Admin only)
- Logout (all roles)

#### Header.tsx
- User info display (username, role)
- Logout button
- Notifications indicator (optional)

### 2. Authentication Components

#### LoginForm.tsx
- Username/password input
- Login button
- Error message display
- Redirects to dashboard on success

### 3. Dashboard Components

#### DashboardOverview.tsx
- Key metrics cards:
  - Total Users
  - Total Agents (Super Admin only)
  - Total Bets
  - Total Bet Volume
  - Net Revenue
- Recent activity list (optional)

### 4. User Management Components

#### UserList.tsx
- Table with columns:
  - User ID
  - Username
  - Agent ID (Super Admin only)
  - Currency
  - Bet Limit
  - Created Date
  - Actions (View, Edit)
- Search input (userId, username)
- Filters:
  - Agent ID (Super Admin only)
  - Currency
  - Date range
- Pagination

#### UserForm.tsx
- Form fields:
  - User ID (required)
  - Agent ID (required, editable for Super Admin only)
  - Username (optional)
  - Currency (required)
  - Bet Limit (required)
  - Language (optional)
  - Password (optional)
- Create/Edit mode
- Validation
- Submit button

#### UserDetails.tsx
- User information display
- User statistics:
  - Total Bets
  - Total Bet Amount
  - Total Win Amount
  - Win Rate
  - Last Bet Date
- Link to user's bet history
- Edit button

### 5. Player Bets Components (Renamed from Bet History)

#### PlayerBetList.tsx (formerly BetList.tsx)
- Table with columns:
  - Bet ID
  - User ID
  - Agent ID (Super Admin only)
  - Platform
  - Game Type
  - Bet Amount
  - Win Amount
  - Currency
  - Difficulty
  - Status
  - Bet Date
  - Actions (View)
- Filters:
  - User ID (pre-filled when navigated from Player Summary)
  - Agent ID (Super Admin only)
  - Status
  - Difficulty
  - Currency
  - Date range (defaults to last 2 months, but only shows data from past 2 months due to BE constraint)
- Pagination
- Summary cards at top showing totals of ALL records (not just visible on current page):
  - Total Bets
  - Total Bet Amount
  - Total Win Amount
  - Net Revenue (Total Bet Amount - Total Win Amount)

#### BetDetails.tsx
- Bet information display
- Fairness data (if available)
- Game details
- Settlement information

### 6. Agent Management Components (Super Admin Only)

#### AgentList.tsx
- Table with columns:
  1. Agent ID
  2. Platform
  3. Game Type
  4. Bet Count
  5. Bet Amount
  6. Win/Loss (Player Win/Loss)
  7. Adjustment (always 0, visible but disabled)
  8. Total Win/Loss (Player Win/Loss + Adjustment)
  9. Margin % (Company earnings percentage)
  10. Company Total Win/Loss
  11. Actions (Edit Agent, View Users → redirects to Player Summary)
- **Data Structure**: Separate rows per agent-platform-gameType combination
- Filters:
  - Date range
  - Platform
  - Game Type
  - Agent ID (search)
  - Other basic filters
- Pagination
- Summary cards at top showing totals of ALL records (not just visible on current page):
  - Total Bet Count (across all agents/platforms/gameTypes)
  - Total Bet Amount
  - Total Win/Loss
  - Total Margin %
  - Company Total Win/Loss

#### AgentForm.tsx
- Form fields:
  - Agent ID (required)
  - Cert (required, masked input)
  - IP Address (required)
  - Callback URL (required)
  - Whitelist Status (checkbox)
- Create/Edit mode
- Validation

### 7. Player Summary Components (Super Admin Only)

#### PlayerSummaryList.tsx
- Table with columns:
  - Player ID
  - Platform
  - Game
  - Bet Count
  - Bet Amount
  - Player Win/Loss
  - Total Win/Loss
  - Actions (View Player Bets → redirects to Player Bets page with userId filter applied)
- **Data Structure**: Separate rows per player-platform-game combination
- Filters:
  - Player ID (search)
  - Platform
  - Game Type
  - Date range
  - Agent ID (pre-filled when navigated from Agents page, but user can clear it to see all players)
  - Other basic filters
- Pagination
- Summary cards at top showing totals of ALL records (not just visible on current page):
  - Total Players (unique count)
  - Total Bet Count
  - Total Bet Amount
  - Total Player Win/Loss
  - Total Win/Loss

### 8. Config Management Components (Super Admin Only)

#### ConfigList.tsx
- Table with columns:
  - Key
  - Value (truncated/masked if sensitive)
  - Updated Date
  - Actions (Edit, Delete)
- Search input

#### ConfigForm.tsx
- Form fields:
  - Key (required)
  - Value (required, textarea for long values)
- Create/Edit mode
- Validation

### 9. Common Components

#### Table.tsx
- Reusable table component
- Sortable columns
- Responsive design

#### Pagination.tsx
- Page navigation
- Items per page selector
- Page number display

#### SearchInput.tsx
- Search input with debounce
- Clear button

#### LoadingSpinner.tsx
- Loading indicator
- Full page or inline

#### Toast.tsx
- Success/error notifications
- Auto-dismiss
- Manual close

---

## State Management

### Auth Store (authStore.ts)

```typescript
interface AuthState {
  admin: Admin | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAccessToken: () => Promise<void>;
  checkAuth: () => Promise<void>;
}
```

### User Store (userStore.ts)

```typescript
interface UserState {
  users: User[];
  selectedUser: User | null;
  pagination: Pagination;
  filters: UserFilters;
  isLoading: boolean;
  error: string | null;
  
  fetchUsers: (filters?: UserFilters) => Promise<void>;
  fetchUser: (userId: string, agentId: string) => Promise<void>;
  createUser: (data: CreateUserDto) => Promise<void>;
  updateUser: (userId: string, agentId: string, data: UpdateUserDto) => Promise<void>;
  deleteUser: (userId: string, agentId: string) => Promise<void>;
}
```

### Bet Store (betStore.ts)

```typescript
interface BetState {
  bets: Bet[];
  selectedBet: Bet | null;
  pagination: Pagination;
  filters: BetFilters;
  summary: BetSummary | null;
  totals: BetTotals | null; // Totals for summary cards
  isLoading: boolean;
  error: string | null;
  
  fetchBets: (filters?: BetFilters) => Promise<void>;
  fetchBet: (betId: string) => Promise<void>;
  fetchStatistics: (filters?: BetFilters) => Promise<void>;
  fetchTotals: (filters?: BetFilters) => Promise<void>;
}

interface BetTotals {
  totalBets: number;
  totalBetAmount: string;
  totalWinAmount: string;
  netRevenue: string;
}
```

### Agent Store (agentStore.ts)

```typescript
interface AgentState {
  agents: Agent[];
  selectedAgent: Agent | null;
  pagination: Pagination;
  filters: AgentFilters;
  totals: AgentTotals | null; // Totals for summary cards
  isLoading: boolean;
  error: string | null;
  
  fetchAgents: (filters?: AgentFilters) => Promise<void>;
  fetchAgent: (agentId: string) => Promise<void>;
  createAgent: (data: CreateAgentDto) => Promise<void>;
  updateAgent: (agentId: string, data: UpdateAgentDto) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<void>;
  fetchAgentTotals: (filters?: AgentFilters) => Promise<void>;
}

interface AgentFilters {
  dateFrom?: string;
  dateTo?: string;
  platform?: string;
  gameType?: string;
  agentId?: string;
}

interface AgentTotals {
  totalBetCount: number;
  totalBetAmount: string;
  totalWinLoss: string;
  totalMarginPercent: number;
  companyTotalWinLoss: string;
}
```

### Player Summary Store (playerSummaryStore.ts)

```typescript
interface PlayerSummaryState {
  players: PlayerSummary[];
  pagination: Pagination;
  filters: PlayerSummaryFilters;
  totals: PlayerSummaryTotals | null;
  isLoading: boolean;
  error: string | null;
  
  fetchPlayers: (filters?: PlayerSummaryFilters) => Promise<void>;
  fetchTotals: (filters?: PlayerSummaryFilters) => Promise<void>;
}

interface PlayerSummary {
  playerId: string;
  platform: string;
  game: string; // Game name/code
  betCount: number;
  betAmount: string;
  playerWinLoss: string;
  totalWinLoss: string;
}

interface PlayerSummaryFilters {
  playerId?: string;
  platform?: string;
  gameType?: string;
  dateFrom?: string;
  dateTo?: string;
  agentId?: string; // Pre-filled when navigated from Agents page
}

interface PlayerSummaryTotals {
  totalPlayers: number;
  totalBetCount: number;
  totalBetAmount: string;
  totalPlayerWinLoss: string;
  totalWinLoss: string;
}
```

### Config Store (configStore.ts)

```typescript
interface ConfigState {
  configs: GameConfig[];
  selectedConfig: GameConfig | null;
  isLoading: boolean;
  error: string | null;
  
  fetchConfigs: () => Promise<void>;
  fetchConfig: (key: string) => Promise<void>;
  createConfig: (data: ConfigDto) => Promise<void>;
  updateConfig: (key: string, value: string) => Promise<void>;
  deleteConfig: (key: string) => Promise<void>;
}
```

---

## API Integration

### API Service (api.service.ts)

```typescript
class ApiService {
  private baseURL: string;
  private accessToken: string | null;
  
  // Auth endpoints
  login(username: string, password: string): Promise<LoginResponse>;
  refreshToken(refreshToken: string): Promise<RefreshResponse>;
  logout(): Promise<void>;
  getCurrentAdmin(): Promise<Admin>;
  
  // User endpoints
  getUsers(params: UserQueryParams): Promise<UserListResponse>;
  getUser(userId: string, agentId: string): Promise<UserResponse>;
  createUser(data: CreateUserDto): Promise<UserResponse>;
  updateUser(userId: string, agentId: string, data: UpdateUserDto): Promise<UserResponse>;
  deleteUser(userId: string, agentId: string): Promise<void>;
  
  // Bet endpoints (Player Bets)
  getBets(params: BetQueryParams): Promise<BetListResponse>;
  getBet(betId: string): Promise<BetResponse>;
  getBetStatistics(params: BetQueryParams): Promise<BetStatisticsResponse>;
  getBetTotals(params: BetQueryParams): Promise<BetTotalsResponse>;
  
  // Agent endpoints (Super Admin only)
  getAgents(params: AgentQueryParams): Promise<AgentListResponse>;
  getAgent(agentId: string): Promise<AgentResponse>;
  createAgent(data: CreateAgentDto): Promise<AgentResponse>;
  updateAgent(agentId: string, data: UpdateAgentDto): Promise<AgentResponse>;
  deleteAgent(agentId: string): Promise<void>;
  getAgentTotals(params: AgentQueryParams): Promise<AgentTotalsResponse>;
  
  // Player Summary endpoints (Super Admin only)
  getPlayerSummary(params: PlayerSummaryQueryParams): Promise<PlayerSummaryListResponse>;
  getPlayerSummaryTotals(params: PlayerSummaryQueryParams): Promise<PlayerSummaryTotalsResponse>;
  
  // Config endpoints (Super Admin only)
  getConfigs(): Promise<ConfigListResponse>;
  getConfig(key: string): Promise<ConfigResponse>;
  createConfig(data: ConfigDto): Promise<ConfigResponse>;
  updateConfig(key: string, value: string): Promise<ConfigResponse>;
  deleteConfig(key: string): Promise<void>;
  
  // Dashboard endpoint
  getDashboardOverview(): Promise<DashboardResponse>;
}
```

### Request Interceptors
- Add `Authorization: Bearer <token>` header
- Handle token refresh on 401 errors
- Retry failed requests with new token

### Response Interceptors
- Handle standard response format `{ status, data, ... }`
- Map error codes to user-friendly messages
- Handle 401 (unauthorized) → redirect to login
- Handle 403 (forbidden) → show error message

---

## Authentication Flow

### Login Flow

1. User enters username/password
2. Submit → `authStore.login()`
3. API call → `POST /admin/auth/login`
4. Store tokens and admin data
5. Save tokens to localStorage
6. Redirect to `/dashboard`

### Token Refresh Flow

1. On API call, check if token is expired
2. If expired, call `POST /admin/auth/refresh`
3. Update access token
4. Retry original request

### Logout Flow

1. User clicks logout
2. Call `POST /admin/auth/logout`
3. Clear tokens from store and localStorage
4. Redirect to `/`

### Protected Route Flow

1. Check if user is authenticated
2. If not, redirect to `/`
3. If accessing Super Admin route, check role
4. If not Super Admin, redirect to `/dashboard`

---

## Role-Based UI

### Conditional Rendering

```typescript
// In components
const { admin } = useAuthStore();

{admin?.role === AdminRole.SUPER_ADMIN && (
  <Link to="/agents">Agents</Link>
)}

{admin?.role === AdminRole.SUPER_ADMIN && (
  <SelectAgentFilter />
)}
```

### Route Protection

```typescript
// In App.tsx or router
<Route
  path="/agents"
  element={
    <ProtectedRoute requiredRole={AdminRole.SUPER_ADMIN}>
      <AgentList />
    </ProtectedRoute>
  }
/>
```

### Data Filtering

- Agent Admins: Automatically filter by their `agentId`
- Super Admins: Can filter by any agent or view all

---

## Data Constraints & Navigation Flow

### 2-Month Data Constraint

**Important**: The Player Bets page only displays data from the past 2 months. For example:
- If today is December 1, 2024, only bets from October 1, 2024 onwards will be shown
- The backend automatically enforces this constraint
- Date filters default to the last 2 months
- If a user selects a date range older than 2 months, it will be automatically adjusted

### Navigation Flow

1. **Agents Page** → Click "View Users" action on a row → **Player Summary Page** (with agentId filter pre-filled, but user can clear it to see all players)
2. **Player Summary Page** → Click "View Player Bets" action on a row → **Player Bets Page** (with userId filter pre-filled)
3. **Player Bets Page** → Can navigate back or clear filters to see all bets

### Calculation Formulas

#### Agent Statistics (per agent-platform-gameType combination)
- **Win/Loss**: `Sum(betAmount - winAmount)` for all bets in the combination
  - **Sign Convention**: Positive = company profit, Negative = players won more
- **Adjustment**: Always `0.00` (visible but disabled/read-only)
- **Total Win/Loss**: `Win/Loss + Adjustment`
- **Margin %**: `((Total Bet Amount - Total Win Amount) / Total Bet Amount) * 100`
- **Company Total Win/Loss**: `Total Bet Amount - Total Win Amount` (positive = company profit)

#### Player Statistics (per player-platform-game combination)
- **Player Win/Loss**: `Sum(betAmount - winAmount)` for player's bets in the combination
  - **Sign Convention**: Positive = company profit, Negative = players won more
- **Total Win/Loss**: Same as Player Win/Loss (adjustments not applied at player level)

### Data Source

- **All statistics and data**: Retrieved from BET table only
- **Admin edit operations**: Use ADMIN table for authentication and authorization
- **Data retention**: Backend scheduler automatically removes data older than 2 months from BET table

---

## UI/UX Guidelines

### Design System

**Colors:**
- Primary: Blue (#3B82F6)
- Success: Green (#10B981)
- Error: Red (#EF4444)
- Warning: Yellow (#F59E0B)
- Background: Light gray (#F9FAFB)
- Text: Dark gray (#111827)

**Typography:**
- Headings: Bold, 18-24px
- Body: Regular, 14-16px
- Small text: 12px

**Spacing:**
- Consistent padding: 16px, 24px, 32px
- Consistent margins: 8px, 16px, 24px

### Layout

- **Sidebar**: Fixed left, 240px width, collapsible
- **Header**: Fixed top, 64px height
- **Content**: Scrollable, with padding
- **Responsive**: Mobile-first, sidebar collapses on mobile

### Forms

- Label above input
- Required fields marked with *
- Validation errors below inputs
- Submit button at bottom
- Loading state on submit

### Tables

- Striped rows for readability
- Hover effect on rows
- Sortable columns (click header)
- Actions column on right
- Responsive: Scrollable on mobile

### Loading States

- Skeleton loaders for lists
- Spinner for forms
- Disable buttons during submission

### Error Handling

- Toast notifications for errors
- Inline errors for forms
- 404 page for not found
- 403 page for unauthorized access

### Responsive Design

- **Desktop**: Full sidebar, multi-column layout
- **Tablet**: Collapsible sidebar, 2-column layout
- **Mobile**: Hamburger menu, single column, stacked cards

---

## TypeScript Interfaces

### Core Types

```typescript
enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  AGENT = 'AGENT',
}

interface Admin {
  id: string;
  username: string;
  role: AdminRole;
  agentId?: string;
  email?: string;
  fullName?: string;
}

interface User {
  userId: string;
  agentId: string;
  username?: string;
  currency: string;
  betLimit: string;
  language?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

interface Bet {
  id: string;
  userId: string;
  agentId: string;
  platform?: string;
  gameType?: string;
  betAmount: string;
  winAmount?: string;
  currency: string;
  difficulty: Difficulty;
  status: BetStatus;
  betPlacedAt: string;
  settledAt?: string;
}

interface Agent {
  agentId: string;
  agentIPaddress: string;
  callbackURL: string;
  isWhitelisted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AgentWithStats extends Agent {
  platform: string;
  gameType: string;
  betCount: number;
  betAmount: string;
  winLoss: string; // Player Win/Loss (positive = company profit, negative = players won more)
  adjustment: string; // Always 0.00 (visible but read-only)
  totalWinLoss: string; // Win/Loss + Adjustment
  marginPercent: number; // Company earnings percentage: ((Bet Amount - Win Amount) / Bet Amount) * 100
  companyTotalWinLoss: string; // Bet Amount - Win Amount (positive = company profit)
}

interface GameConfig {
  id: number;
  key: string;
  value: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
```

---

## Environment Configuration

```typescript
// src/config/env.ts
export const ENV = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  ADMIN_API_PREFIX: '/admin/api/v1',
} as const;
```

---

## Implementation Priority

### Phase 1: Core Setup
1. Project setup (Vite + React + TypeScript + Tailwind)
2. Routing setup
3. API service with interceptors
4. Auth store and login page
5. Protected routes

### Phase 2: User Management
1. User list page
2. User details page
3. Create/Edit user form
4. User store integration

### Phase 3: Player Bets (Renamed from Bet History)
1. Player bets list page
2. Bet details page
3. Bet store integration
4. Filters and pagination
5. Totals/summary cards
6. 2-month data constraint implementation

### Phase 4: Dashboard
1. Dashboard overview page
2. Statistics cards
3. Dashboard API integration

### Phase 5: Super Admin Features
1. Agent management pages with statistics
2. Player Summary page
3. Config management pages
4. Role-based access control
5. Navigation flow (Agents → Player Summary → Player Bets)

---

## Summary

This frontend design provides:

1. ✅ **Essential features only** - No optional/advanced features
2. ✅ **Role-based access** - Super Admin and Agent Admin views
3. ✅ **Clean architecture** - Modular components and stores
4. ✅ **Type safety** - Full TypeScript coverage
5. ✅ **Responsive design** - Works on all devices
6. ✅ **Consistent UI** - Tailwind-based design system
7. ✅ **State management** - Zustand stores for each domain
8. ✅ **API integration** - Centralized service with interceptors

The design follows React best practices and integrates seamlessly with the backend API designed in the Admin Portal Backend Design document.




