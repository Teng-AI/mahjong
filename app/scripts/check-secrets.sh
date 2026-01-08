#!/bin/bash
# Pre-commit hook to detect potential secrets

# Patterns that might indicate secrets
PATTERNS=(
  'AIza[0-9A-Za-z_-]{35}'           # Google API Key
  'AKIA[0-9A-Z]{16}'                 # AWS Access Key
  'sk-[a-zA-Z0-9]{48}'               # OpenAI API Key
  'ghp_[a-zA-Z0-9]{36}'              # GitHub Personal Access Token
  'sk_live_[a-zA-Z0-9]{24,}'         # Stripe Live Key
  'password\s*[=:]\s*["\047][^"\047]+["\047]'  # password = "..." or password: "..."
  'secret\s*[=:]\s*["\047][^"\047]+["\047]'    # secret = "..." or secret: "..."
)

# Files to ignore (already in .env or config)
IGNORE_FILES=(
  ".env"
  ".env.local"
  ".env.*.local"
  "firebase-config.mjs"  # This loads from env, not hardcoded
)

FOUND_SECRETS=0

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|mjs|ts|tsx|json|yml|yaml|md|txt|sh)$')

for file in $STAGED_FILES; do
  # Skip ignored files
  skip=false
  for ignore in "${IGNORE_FILES[@]}"; do
    if [[ "$file" == *"$ignore"* ]]; then
      skip=true
      break
    fi
  done

  if [ "$skip" = true ]; then
    continue
  fi

  # Check each pattern
  for pattern in "${PATTERNS[@]}"; do
    if git diff --cached "$file" | grep -qE "$pattern"; then
      echo "⚠️  Potential secret detected in $file"
      echo "   Pattern: $pattern"
      FOUND_SECRETS=1
    fi
  done
done

if [ $FOUND_SECRETS -eq 1 ]; then
  echo ""
  echo "❌ Commit blocked: Potential secrets detected!"
  echo "   Please remove secrets and use environment variables instead."
  echo "   If this is a false positive, use: git commit --no-verify"
  exit 1
fi

exit 0
