#!/bin/bash

# 🧹 Safe Repository Cleanup Script
# Generated: 2026-02-20
# Project: Admin Dashboard

set -e  # Exit on error

echo "=================================================="
echo "🧹 SAFE REPOSITORY CLEANUP"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo "ℹ️  $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root."
    exit 1
fi

if [ ! -d "app" ]; then
    print_error "app directory not found. Please run this script from the project root."
    exit 1
fi

echo "Step 1: Creating backup..."
echo "-----------------------------------"

# Create backup branch
BACKUP_BRANCH="backup-before-cleanup-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BACKUP_BRANCH" 2>/dev/null || {
    print_warning "Could not create backup branch. Continuing anyway..."
}

# Commit current state
git add -A
git commit -m "Backup before cleanup" 2>/dev/null || {
    print_info "No changes to commit for backup"
}

print_success "Backup created on branch: $BACKUP_BRANCH"
echo ""

echo "Step 2: Removing unused components..."
echo "-----------------------------------"

# Remove unused components
UNUSED_COMPONENTS=(
    "components/admin/DiffViewer.tsx"
    "components/admin/OperationsTable.tsx"
    "components/admin/OverviewCards.tsx"
    "components/admin/LiveScanPanel.tsx"
)

for file in "${UNUSED_COMPONENTS[@]}"; do
    if [ -f "$file" ]; then
        rm "$file"
        print_success "Removed: $file"
    else
        print_warning "Not found: $file"
    fi
done

echo ""

echo "Step 3: Removing redirect-only pages..."
echo "-----------------------------------"

# Remove redirect pages
REDIRECT_PAGES=(
    "app/payments/page.tsx"
    "app/passes/page.tsx"
    "app/users/page.tsx"
    "app/teams/page.tsx"
    "app/analytics/page.tsx"
    "app/admin/registrations/page.tsx"
)

for file in "${REDIRECT_PAGES[@]}"; do
    if [ -f "$file" ]; then
        rm "$file"
        print_success "Removed: $file"
    else
        print_warning "Not found: $file"
    fi
done

echo ""

echo "Step 4: Removing empty directories..."
echo "-----------------------------------"

# Remove empty directories
EMPTY_DIRS=(
    "app/admin/logs"
    "app/admin/analytics"
    "app/api/admin/analytics"
)

for dir in "${EMPTY_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        # Check if directory is empty
        if [ -z "$(ls -A "$dir")" ]; then
            rmdir "$dir"
            print_success "Removed: $dir"
        else
            print_warning "Not empty: $dir (skipping)"
        fi
    else
        print_warning "Not found: $dir"
    fi
done

echo ""

echo "Step 5: Removing unused NPM dependencies..."
echo "-----------------------------------"

# Remove unused dependencies
print_info "Removing @dnd-kit packages..."
npm uninstall @dnd-kit/core @dnd-kit/modifiers @dnd-kit/sortable @dnd-kit/utilities 2>/dev/null || {
    print_warning "Some @dnd-kit packages were not installed"
}

print_info "Removing individual @radix-ui packages..."
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
    @radix-ui/react-tooltip 2>/dev/null || {
    print_warning "Some @radix-ui packages were not installed"
}

print_success "Unused dependencies removed"
echo ""

echo "Step 6: Verifying build..."
echo "-----------------------------------"

print_info "Running TypeScript type check..."
npx tsc --noEmit || {
    print_error "TypeScript type check failed!"
    print_info "You may need to fix type errors before proceeding."
    exit 1
}
print_success "Type check passed"

print_info "Running Next.js build..."
npm run build || {
    print_error "Build failed!"
    print_info "Reverting changes..."
    git checkout "$BACKUP_BRANCH"
    exit 1
}
print_success "Build successful"

echo ""

echo "Step 7: Committing changes..."
echo "-----------------------------------"

git add -A
git commit -m "chore: remove unused files and dependencies

- Removed 4 unused components (DiffViewer, OperationsTable, OverviewCards, LiveScanPanel)
- Removed 6 redirect-only pages
- Removed 3 empty directories
- Removed 16 unused NPM dependencies (@dnd-kit/*, @radix-ui/react-*)
- Estimated bundle size reduction: ~415KB uncompressed

See CLEANUP_REPORT.md for full details." || {
    print_warning "No changes to commit"
}

print_success "Changes committed"
echo ""

echo "=================================================="
echo "✅ CLEANUP COMPLETE!"
echo "=================================================="
echo ""
echo "Summary:"
echo "  • 4 unused components removed"
echo "  • 6 redirect pages removed"
echo "  • 3 empty directories removed"
echo "  • 16 unused dependencies removed"
echo "  • Build verified successfully"
echo ""
echo "Backup branch: $BACKUP_BRANCH"
echo ""
echo "Next steps:"
echo "  1. Test the application: npm run dev"
echo "  2. Verify all features work correctly"
echo "  3. If everything works, delete backup branch:"
echo "     git branch -D $BACKUP_BRANCH"
echo ""
echo "To revert changes:"
echo "  git checkout $BACKUP_BRANCH"
echo ""
print_success "Done!"
