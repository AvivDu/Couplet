# Track B: Groups & Connections Feature — Developer Handoff

## Overview

This document describes the full implementation of the **Groups & Connections** feature for Couplet. This is the app's core differentiator: users can create named sharing groups (e.g. "Family", "Work"), share their coupons to those groups, and other members can see the shared coupons.

> **Note on P2P:** Full WebRTC device-to-device code transfer is deferred to v2. For this sprint, sharing means group members can **see coupon metadata** (store name, category, expiry, balance). The actual secret coupon code stays on the owner's device and is not transferred.

---

## Design System (must follow for all new UI)

```
Background:     #F5F0E6  (cream)
Primary:        #E8604C  (coral) — buttons, active states
Navy text:      #1A2332
Muted text:     #A8997A  — placeholders, subtitles
Border:         #C4B8A0
```

- Inputs: underline only (`borderBottomWidth: 1.5, borderBottomColor: '#C4B8A0'`), no box
- Buttons: `borderRadius: 30` (pill), coral background
- Cards: `borderRadius: 16`, solid background color
- All screens: `SafeAreaView` with cream background, `headerShown: false`
- Tab bar: cream bg, coral active color

---

## Part 1: Server Changes

### 1.1 New Group Schema

Add to `server/src/db.ts` (alongside existing User and Coupon):

```typescript
interface Group {
  group_id: string;       // UUID
  name: string;           // e.g. "Family"
  admin_user_id: string;  // creator, has full control
  user_id_list: string[]; // all members including admin
  coupon_id_list: string[]; // coupons shared into this group
  created_at: string;     // ISO timestamp
}
```

Add Mongoose schema and these db functions:

```typescript
db.createGroup(group: Group): Promise<void>
db.getGroupsByUser(userId: string): Promise<Group[]>       // groups where userId is in user_id_list
db.getGroupById(id: string): Promise<Group | null>
db.addMemberToGroup(groupId: string, userId: string): Promise<Group | null>
db.removeMemberFromGroup(groupId: string, userId: string, adminId: string): Promise<Group | null>
  // only succeeds if adminId === group.admin_user_id
db.addCouponToGroup(groupId: string, couponId: string): Promise<Group | null>
db.removeCouponFromGroup(groupId: string, couponId: string, requesterId: string): Promise<Group | null>
  // only succeeds if requesterId is admin OR coupon owner
db.findUsersByQuery(query: string): Promise<User[]>        // search by email or username (partial match)
```

---

### 1.2 New Server Routes

Create `server/src/routes/groups.ts`. All routes are protected with `authMiddleware`.

#### Groups CRUD

```
POST   /groups
  Body:    { name: string }
  Returns: Group (201)
  Logic:   Creates group with creator as admin and first member

GET    /groups
  Returns: Group[] — all groups where current user is a member

GET    /groups/:id
  Returns: Group + enriched member info (username, email per member)
  Error:   404 if not found, 403 if current user is not a member
```

#### Member Management

```
POST   /groups/:id/members
  Body:    { identifier: string }  ← email OR username
  Returns: Updated Group
  Logic:   Looks up user by email or username, adds to group
  Errors:  404 user not found, 409 already a member, 403 only admin can add

DELETE /groups/:id/members/:userId
  Returns: 204
  Logic:   Admin removes a member; also removes that user's owned coupons from the group
  Errors:  403 if requester is not admin, 400 cannot remove admin
```

#### Coupon Sharing

```
POST   /groups/:id/coupons/:couponId
  Returns: Updated Group
  Logic:   Adds coupon to group's coupon_id_list
           Requester must be a member of the group and own the coupon
  Errors:  403, 404

DELETE /groups/:id/coupons/:couponId
  Returns: 204
  Logic:   Removes coupon from group
           Requester must be admin OR owner of the coupon
  Errors:  403, 404
```

#### User Search (for adding members)

```
GET    /users/search?q=<query>
  Returns: Array of { user_id, username, email } — excludes current user
  Logic:   Case-insensitive partial match on username OR email
  Limit:   10 results max
```

#### Register routes in `server/src/index.ts`:

```typescript
import groupsRouter from './routes/groups';
import usersRouter from './routes/users';  // or inline in groups.ts

app.use('/groups', groupsRouter);
app.use('/users', usersRouter);
```

---

## Part 2: Client — New API Functions

Add to `client/services/api.ts`:

```typescript
// Group types
export interface GroupMeta {
  group_id: string;
  name: string;
  admin_user_id: string;
  user_id_list: string[];
  coupon_id_list: string[];
  created_at: string;
}

export interface GroupMember {
  user_id: string;
  username: string;
  email: string;
}

export interface GroupDetail extends GroupMeta {
  members: GroupMember[];
}

// Group API calls
export const getGroups = () => api.get<GroupMeta[]>('/groups');
export const createGroup = (name: string) => api.post<GroupMeta>('/groups', { name });
export const getGroup = (id: string) => api.get<GroupDetail>(`/groups/${id}`);
export const addMember = (groupId: string, identifier: string) =>
  api.post<GroupMeta>(`/groups/${groupId}/members`, { identifier });
export const removeMember = (groupId: string, userId: string) =>
  api.delete(`/groups/${groupId}/members/${userId}`);
export const shareToGroup = (groupId: string, couponId: string) =>
  api.post<GroupMeta>(`/groups/${groupId}/coupons/${couponId}`);
export const revokeFromGroup = (groupId: string, couponId: string) =>
  api.delete(`/groups/${groupId}/coupons/${couponId}`);
export const searchUsers = (query: string) =>
  api.get<GroupMember[]>(`/users/search?q=${encodeURIComponent(query)}`);
```

---

## Part 3: Client — New Screens & Components

### 3.1 Add Connections Tab

In `client/app/(tabs)/_layout.tsx`, add a third tab:

```tsx
<Tabs.Screen
  name="connections"
  options={{
    title: 'Groups',
    headerShown: false,
    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👥</Text>,
  }}
/>
```

---

### 3.2 Connections Screen (`client/app/(tabs)/connections.tsx`)

**Purpose:** Lists all groups the user belongs to. Main entry point for group management.

**Layout:**
```
┌─────────────────────────────────┐
│  Groups                [+]      │  ← header, + opens create modal
├─────────────────────────────────┤
│  ┌─────────────────────────┐    │
│  │  Family          3 members│  │  ← GroupCard (tap → GroupDetail modal)
│  │  Admin: you              │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │  Work            5 members│  │
│  └─────────────────────────┘    │
│                                 │
│     (empty state if no groups)  │
└─────────────────────────────────┘
```

**Behavior:**
- On mount / focus: call `getGroups()`, store in state
- Pull-to-refresh
- Tap `[+]` → show a bottom sheet modal with a single text input "Group name" + "Create" button
  - On create: call `createGroup(name)`, append to list
- Tap a GroupCard → open `GroupDetail` modal
- Empty state: "No groups yet" with a subtext "Tap + to create your first group"

---

### 3.3 GroupCard Component (`client/components/GroupCard.tsx`)

**Props:**
```typescript
interface Props {
  group: GroupMeta;
  currentUserId: string;
  onPress: () => void;
}
```

**Layout:**
```
┌──────────────────────────────────────┐
│  👥  Family                          │
│      3 members · 2 coupons shared    │
│      [Admin] badge if currentUser is admin │
└──────────────────────────────────────┘
```

**Style:** White/cream card, `borderRadius: 16`, coral accent for admin badge. Match the general card style from `CouponCard.tsx` for consistency.

---

### 3.4 GroupDetail Modal (`client/components/GroupDetail.tsx`)

**Props:**
```typescript
interface Props {
  groupId: string | null;
  visible: boolean;
  onClose: () => void;
  currentUserId: string;
}
```

**Layout:**
```
┌─────────────────────────────────┐
│  ← Close            Family      │
├─────────────────────────────────┤
│  MEMBERS (3)                    │
│  ┌─── AV  Aviv Duzy (you) ────┐ │
│  │         Admin              │ │
│  └────────────────────────────┘ │
│  ┌─── RK  Roni Kenigsberg ───┐  │
│  │                [Remove]   │  │  ← remove button only visible to admin
│  └────────────────────────────┘ │
│                                 │
│  [+ Add member]  ← search box   │
│                                 │
│  SHARED COUPONS (2)             │
│  ┌────────────────────────────┐ │
│  │  🏷️  H&M  · Fashion        │ │
│  │  Expires Jan 2026  [Revoke]│ │  ← revoke only if admin or coupon owner
│  └────────────────────────────┘ │
└─────────────────────────────────┘
```

**Behavior:**
- On open: call `getGroup(groupId)` to get enriched member info + coupon list
- **Add member:**
  - Show a text input, user types email or username
  - Optionally: debounced `searchUsers(query)` to show suggestions as they type
  - On submit: call `addMember(groupId, identifier)`, refresh group
- **Remove member (admin only):**
  - Confirm alert: "Remove {username} from this group?"
  - Call `removeMember(groupId, userId)`
  - Refresh group
- **Revoke coupon (admin or coupon owner):**
  - Confirm alert: "Remove this coupon from the group?"
  - Call `revokeFromGroup(groupId, couponId)`
  - Refresh group

> The shared coupons list shows metadata fetched from the server (store name, category, expiry). The local coupon code is never sent to the group — members just see the coupon exists.

---

### 3.5 "Share to Group" button in CouponDetail

In `client/components/CouponDetail.tsx`, add a **"Share to Group"** button below the Edit button in the detail view:

```tsx
<TouchableOpacity style={styles.shareBtn} onPress={handleShareToGroup}>
  <Text style={styles.shareBtnText}>Share to Group</Text>
</TouchableOpacity>
```

**handleShareToGroup flow:**
1. Call `getGroups()` to fetch the user's groups
2. If no groups → Alert: "You have no groups yet. Create one in the Groups tab."
3. If groups exist → show a bottom sheet modal listing groups
4. User taps a group → call `shareToGroup(groupId, coupon.coupon_id)`
5. Show success: "Coupon shared to {group name}"

**Button style:** Same as Edit button but secondary (outlined, coral border, no fill).

---

## Part 4: Integration Points with Existing Code

| Existing file | What to add/change |
|---|---|
| `client/app/(tabs)/_layout.tsx` | Add third tab "connections" |
| `client/services/api.ts` | Add group API functions + types |
| `client/components/CouponDetail.tsx` | Add "Share to Group" button + handler |
| `server/src/db.ts` | Add Group schema + db functions |
| `server/src/index.ts` | Register `/groups` and `/users` routes |

---

## Part 5: Suggested Build Order

Work can be split between two developers:

### Developer A — Server
1. Add Group Mongoose schema to `db.ts`
2. Implement all `db.*` group functions
3. Build `routes/groups.ts` with all endpoints
4. Build `routes/users.ts` (search endpoint)
5. Register routes in `index.ts`
6. Test with Postman/curl:
   - Register 2 test users → create group → add second user → share a coupon → verify GET /groups returns it for both users

### Developer B — Client
1. Add group API types + functions to `api.ts`
2. Add Connections tab to `_layout.tsx`
3. Build `GroupCard.tsx` component
4. Build `connections.tsx` screen (list + create)
5. Build `GroupDetail.tsx` modal (members + shared coupons)
6. Add "Share to Group" button to `CouponDetail.tsx`

> Developer B can use mock data / stub API calls while Developer A finishes the server, then wire them together.

---

## Part 6: Verification Checklist

- [ ] User A creates a group → appears in their Groups tab
- [ ] User A adds User B by username → User B sees the group in their Groups tab
- [ ] User A shares coupon X to the group → User B's GroupDetail shows that coupon's metadata
- [ ] User B does NOT see coupon X in their personal "My Coupons" tab (it's not theirs)
- [ ] User A removes User B → User B no longer sees the group
- [ ] User A revokes coupon from group → coupon disappears from GroupDetail for all members
- [ ] Non-admin member cannot remove other members
- [ ] Non-owner, non-admin cannot revoke a coupon

---

## Notes & Decisions

- **Coupon codes are never shared** — only metadata (store name, category, expiry, balance, status) is visible to group members. The code stays in local device storage on the owner's phone.
- **One admin per group** — the creator. Admin cannot be removed from their own group.
- **Search is server-side** — `GET /users/search?q=` does the lookup, client just displays results.
- **No real-time updates** — groups refresh on screen focus and pull-to-refresh. Websocket/push updates are v2.
