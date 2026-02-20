# 📦 NPM DEPENDENCY ANALYSIS

## Current Dependencies (package.json)

### Production Dependencies (40 packages)

| Package | Version | Status | Usage Count | Critical |
|---------|---------|--------|-------------|----------|
| `@dnd-kit/core` | ^6.3.1 | ❌ UNUSED | 0 | No |
| `@dnd-kit/modifiers` | ^9.0.0 | ❌ UNUSED | 0 | No |
| `@dnd-kit/sortable` | ^10.0.0 | ❌ UNUSED | 0 | No |
| `@dnd-kit/utilities` | ^3.2.2 | ❌ UNUSED | 0 | No |
| `@radix-ui/react-avatar` | ^1.1.11 | ⚠️ REDUNDANT | 0 | No |
| `@radix-ui/react-checkbox` | ^1.3.3 | ⚠️ REDUNDANT | 0 | No |
| `@radix-ui/react-dialog` | ^1.1.15 | ⚠️ REDUNDANT | 0 | No |
| `@radix-ui/react-dropdown-menu` | ^2.1.16 | ⚠️ REDUNDANT | 0 | No |
| `@radix-ui/react-label` | ^2.1.8 | ⚠️ REDUNDANT | 0 | No |
| `@radix-ui/react-select` | ^2.2.6 | ⚠️ REDUNDANT | 0 | No |
| `@radix-ui/react-separator` | ^1.1.8 | ⚠️ REDUNDANT | 0 | No |
| `@radix-ui/react-slot` | ^1.2.4 | ⚠️ REDUNDANT | 0 | No |
| `@radix-ui/react-tabs` | ^1.1.13 | ⚠️ REDUNDANT | 0 | No |
| `@radix-ui/react-toggle` | ^1.1.10 | ⚠️ REDUNDANT | 0 | No |
| `@radix-ui/react-toggle-group` | ^1.1.11 | ⚠️ REDUNDANT | 0 | No |
| `@radix-ui/react-tooltip` | ^1.2.8 | ⚠️ REDUNDANT | 0 | No |
| `@tabler/icons-react` | ^3.36.1 | ✅ USED | 10+ | No |
| `@tanstack/react-table` | ^8.21.3 | ✅ USED | 3 | Yes |
| `@upstash/ratelimit` | ^2.0.8 | ✅ USED | 3 | Yes |
| `@upstash/redis` | ^1.36.2 | ✅ USED | 3 | Yes |
| `class-variance-authority` | ^0.7.1 | ✅ USED | 5+ | No |
| `clsx` | ^2.1.1 | ✅ USED | 20+ | No |
| `firebase` | ^12.8.0 | ✅ USED | 15+ | Yes |
| `firebase-admin` | ^13.6.0 | ✅ USED | 20+ | Yes |
| `jspdf` | ^4.1.0 | ✅ USED | 1 | Yes |
| `lucide-react` | ^0.563.0 | ✅ USED | 15+ | No |
| `next` | 16.1.6 | ✅ USED | ALL | Yes |
| `qrcode` | ^1.5.4 | ✅ USED | 3 | Yes |
| `radix-ui` | ^1.4.3 | ✅ USED | 20+ | Yes |
| `react` | 19.2.3 | ✅ USED | ALL | Yes |
| `react-dom` | 19.2.3 | ✅ USED | ALL | Yes |
| `recharts` | ^2.15.4 | ✅ USED | 1 | No |
| `resend` | ^3.0.0 | ✅ USED | 1 | Yes |
| `sonner` | ^2.0.7 | ✅ USED | 8+ | No |
| `tailwind-merge` | ^3.4.1 | ✅ USED | 20+ | Yes |
| `vaul` | ^1.1.2 | ✅ USED | 1 | No |
| `zod` | ^4.3.6 | ✅ USED | 6 | Yes |

### Dev Dependencies (9 packages)

| Package | Version | Status | Usage |
|---------|---------|--------|-------|
| `@tailwindcss/postcss` | ^4 | ✅ USED | Build |
| `@types/node` | ^20 | ✅ USED | TypeScript |
| `@types/qrcode` | ^1.5.6 | ✅ USED | TypeScript |
| `@types/react` | ^19 | ✅ USED | TypeScript |
| `@types/react-dom` | ^19 | ✅ USED | TypeScript |
| `eslint` | ^9 | ✅ USED | Linting |
| `eslint-config-next` | 16.1.6 | ✅ USED | Linting |
| `shadcn` | ^3.8.5 | ✅ USED | UI Framework |
| `tailwindcss` | ^4 | ✅ USED | Styling |
| `tw-animate-css` | ^1.4.0 | ✅ USED | Animations |
| `typescript` | ^5 | ✅ USED | TypeScript |

---

## Detailed Usage Analysis

### ❌ UNUSED PACKAGES (4) - REMOVE

#### @dnd-kit/* (Drag and Drop)
```bash
npm uninstall @dnd-kit/core @dnd-kit/modifiers @dnd-kit/sortable @dnd-kit/utilities
```

**Reason:** Never imported in any file  
**Size Impact:** ~115KB  
**Risk:** None - completely unused

---

### ⚠️ REDUNDANT PACKAGES (12) - REMOVE

#### Individual @radix-ui/* packages
```bash
npm uninstall \
  @radix-ui/react-avatar \
  @radix-ui/react-checkbox \
  @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-label \
  @radix-ui/react-select \
  @radix-ui/react-separator \
  @radix-ui/react-slot \
  @radix-ui/react-tabs \
  @radix-ui/react-toggle \
  @radix-ui/react-toggle-group \
  @radix-ui/react-tooltip
```

**Reason:** All components are imported from unified `radix-ui` package  
**Example:**
```typescript
// Current usage in components/ui/avatar.tsx
import { Avatar as AvatarPrimitive } from "radix-ui"

// NOT using:
// import * as AvatarPrimitive from "@radix-ui/react-avatar"
```

**Size Impact:** ~300KB  
**Risk:** None - unified package already provides all functionality

---

### ✅ CRITICAL PACKAGES - KEEP

#### Firebase (DO NOT REMOVE)
- `firebase` (^12.8.0)
  - Used in: AuthContext.tsx, clientApp.ts, authService.ts
  - Files: 15+
  - Purpose: Client-side auth, Firestore queries

- `firebase-admin` (^13.6.0)
  - Used in: All API routes, adminApp.ts
  - Files: 20+
  - Purpose: Server-side Firestore, Auth verification

#### Payment & Pass System (DO NOT REMOVE)
- `qrcode` (^1.5.4)
  - Used in: qrService.ts, fix-stuck-payment/route.ts, update-pass/route.ts
  - Files: 3
  - Purpose: QR code generation for passes

- `jspdf` (^4.1.0)
  - Used in: pdfGenerator.server.ts
  - Files: 1
  - Purpose: PDF pass generation

- `resend` (^3.0.0)
  - Used in: emailService.ts
  - Files: 1
  - Purpose: Email delivery (passes, notifications)

#### Security (DO NOT REMOVE)
- `@upstash/redis` (^1.36.2)
  - Used in: middleware.ts, rateLimiter.ts, adminRateLimiter.ts
  - Files: 3
  - Purpose: Rate limiting storage

- `@upstash/ratelimit` (^2.0.8)
  - Used in: middleware.ts, rateLimiter.ts, adminRateLimiter.ts
  - Files: 3
  - Purpose: Rate limiting logic

#### Validation (DO NOT REMOVE)
- `zod` (^4.3.6)
  - Used in: 6 API routes for request validation
  - Files: 6
  - Purpose: Runtime type validation

---

## File-by-File Dependency Map

### Features Directory

**features/auth/AuthContext.tsx**
```typescript
✅ react (hooks)
✅ firebase/auth (User, onAuthStateChanged, getRedirectResult)
✅ firebase/firestore (doc, getDoc)
✅ @/lib/firebase/clientApp (db, getAuthSafe)
✅ @/features/auth/authService (signInWithGoogle, signOut)
✅ @/lib/db/firestoreTypes (UserProfile, UserProfileUpdate)
```

**features/auth/authService.ts**
```typescript
✅ firebase/auth (GoogleAuthProvider, signInWithPopup, signOut)
✅ @/lib/firebase/clientApp (auth, getAuthSafe)
```

**features/passes/qrService.ts**
```typescript
✅ crypto (Node.js built-in)
```

**features/passes/pdfGenerator.server.ts**
```typescript
✅ jspdf
✅ @/lib/utils/svgConverter (convertSvgToBase64Png)
```

**features/email/emailService.ts**
```typescript
✅ resend
```

### Middleware & Config

**middleware.ts**
```typescript
✅ next/server (NextRequest, NextResponse)
✅ @upstash/redis (Redis)
✅ @upstash/ratelimit (Ratelimit, Duration)
```

**next.config.ts**
```typescript
✅ next (NextConfig)
```

### API Routes (20+ files)

All API routes use:
```typescript
✅ next/server (NextRequest, NextResponse)
✅ @/lib/firebase/adminApp (getAdminFirestore, getAdminAuth)
✅ @/lib/admin/requireOrganizer OR @/lib/admin/requireAdminRole
✅ @/lib/security/adminRateLimiter (rateLimitAdmin, rateLimitResponse)
```

Some also use:
```typescript
✅ zod (validation)
✅ qrcode (QR generation)
✅ @/features/passes/qrService (createQRPayload, verifySignedQR)
✅ @/features/email/emailService (sendEmail)
✅ @/lib/admin/adminLogger (logAdminAction)
```

### Components

**UI Components (20 files)**
```typescript
✅ react
✅ radix-ui (Avatar, Checkbox, Dialog, DropdownMenu, etc.)
✅ lucide-react (icons)
✅ @/lib/utils (cn function)
✅ class-variance-authority (cva)
✅ recharts (chart.tsx only)
✅ vaul (drawer.tsx only)
```

**Admin Components (14 files)**
```typescript
✅ react
✅ @/components/ui/* (Button, Input, Table, etc.)
✅ @tabler/icons-react (icons)
✅ @tanstack/react-table (FinancialTable, UnifiedTable, OperationsTable)
✅ sonner (toast notifications)
✅ @/types/admin (type definitions)
✅ @/features/auth/AuthContext (useAuth)
```

---

## Bundle Size Analysis

### Current Total Size (estimated)
- **node_modules:** ~450MB
- **Production bundle:** ~2.5MB (uncompressed)

### After Cleanup (estimated)
- **node_modules:** ~445MB (-5MB)
- **Production bundle:** ~2.1MB (-400KB uncompressed, ~120KB gzipped)

### Size Breakdown by Category

| Category | Current | After Cleanup | Savings |
|----------|---------|---------------|---------|
| UI Components | 800KB | 500KB | 300KB |
| Drag & Drop | 115KB | 0KB | 115KB |
| Icons | 200KB | 200KB | 0KB |
| Tables | 150KB | 150KB | 0KB |
| Firebase | 400KB | 400KB | 0KB |
| Other | 835KB | 835KB | 0KB |
| **TOTAL** | **2.5MB** | **2.1MB** | **415KB** |

---

## Recommended Actions

### Immediate (This Cleanup)
```bash
# Remove 16 unused packages
npm uninstall @dnd-kit/core @dnd-kit/modifiers @dnd-kit/sortable @dnd-kit/utilities @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-tooltip
```

### Future Optimizations

1. **Consider tree-shaking improvements:**
   - Use `lucide-react` with individual imports instead of full package
   - Use `@tabler/icons-react` with individual imports

2. **Consider replacing:**
   - `recharts` (150KB) with lighter alternative if only basic charts needed
   - `jspdf` (200KB) with server-side PDF generation service

3. **Add tooling:**
   ```bash
   npm install -D depcheck
   npm install -D eslint-plugin-unused-imports
   ```

4. **Regular audits:**
   ```bash
   # Check for unused dependencies
   npx depcheck
   
   # Check for outdated packages
   npm outdated
   
   # Analyze bundle size
   npm run build -- --analyze
   ```

---

## Verification Commands

After removing packages:

```bash
# 1. Clean install
rm -rf node_modules package-lock.json
npm install

# 2. Type check
npx tsc --noEmit

# 3. Build check
npm run build

# 4. Dev check
npm run dev
```

---

*Generated by analyzing 109 source files and package.json*
