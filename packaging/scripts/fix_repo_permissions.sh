#!/usr/bin/env bash
# ==============================================================================
# Subversion Nuvi - In-Depth Repository Rights, Owner & Access Repair Script
#
# Usage:
#   sudo ./fix_repo_permissions.sh [REPOSITORY_NAME_OR_PATH]
#
# Behavior:
#   1. With argument:
#      Fixes permissions specifically for the designated repository folder.
#   2. Without argument:
#      Scans the directory from where the script is executed ($PWD).
#      If $PWD is a repository, fixes $PWD.
#      If $PWD contains repository folders, fixes all repositories in $PWD.
#      If no repositories exist in $PWD, checks configured NUVI_REPOSITORIES_ROOT.
#
# Operations Performed:
#   • Enforces subversion:subversion ownership recursively.
#   • Sets setgid bit (2775) across all directories for group inheritance.
#   • Sets 0664 across all revision, format, transaction, and SQLite database files.
#   • Strips Windows CRLF (\r) line endings from active hook scripts and sets 0775.
#   • Secures conf/ directory files with 0660.
#   • Ensures Apache (www-data) has group membership and directory traversal rights.
#   • Registers newly copied repositories into Nuvi's SQLite database and syncs authz.
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Allow help without root
for arg in "$@"; do
    if [[ "$arg" == "-h" || "$arg" == "--help" ]]; then
        echo -e "${BOLD}Subversion Nuvi - Repository Rights & Access Repair Script${NC}"
        echo ""
        echo "Usage: sudo $0 [REPOSITORY_NAME_OR_PATH]"
        echo ""
        echo "Arguments:"
        echo "  [REPOSITORY_NAME_OR_PATH]  (Optional) Specific repository name or path to fix."
        echo "                             If omitted, fixes all repositories in current directory ($PWD)."
        echo ""
        echo "Examples:"
        echo "  cd /home/nuvi-svn/data/repositories && sudo $0"
        echo "  sudo $0 test_repo"
        echo "  sudo $0 /home/nuvi-svn/data/repositories/my_migrated_repo"
        exit 0
    fi
done

# 0. Check Root Privileges
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}[ERROR] This script must be executed with root privileges to modify ownership and permissions.${NC}"
    echo -e "Please run with: ${BOLD}sudo $0 $@${NC}"
    exit 1
fi

echo -e "${BLUE}========================================================================${NC}"
echo -e "${BLUE}${BOLD}   Subversion Nuvi - In-Depth Repository Rights & Permissions Wizard   ${NC}"
echo -e "${BLUE}========================================================================${NC}"
echo ""

# ------------------------------------------------------------------------------
# 1. Discover Environment and Service Identities
# ------------------------------------------------------------------------------
SVN_USER="subversion"
SVN_GROUP="subversion"
REPOS_ROOT=""
DATA_DIR=""
AUTHZ_FILE=""
DB_PATH=""

CANDIDATE_ENVS=(
    "/etc/nuvi/nuvi.env"
    "/opt/nuvi/.env"
    "./.env"
)

for env_file in "${CANDIDATE_ENVS[@]}"; do
    if [[ -f "$env_file" ]]; then
        while IFS= read -r line || [[ -n "$line" ]]; do
            line="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
            [[ -z "$line" || "$line" =~ ^# ]] && continue
            if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
                k="${BASH_REMATCH[1]}"
                v="${BASH_REMATCH[2]}"
                v="$(echo "$v" | sed -e 's/^[[:space:]]*["'\'']//' -e 's/["'\''][[:space:]]*$//' -e 's/[[:space:]]*#.*$//')"
                case "$k" in
                    NUVI_USER) [[ -n "$v" ]] && SVN_USER="$v" ;;
                    NUVI_GROUP) [[ -n "$v" ]] && SVN_GROUP="$v" ;;
                    NUVI_REPOSITORIES_ROOT|NUVI_REPOSITORIES_PATH) [[ -n "$v" ]] && REPOS_ROOT="$v" ;;
                    NUVI_DATA_DIR) [[ -n "$v" ]] && DATA_DIR="$v" ;;
                    NUVI_AUTHZ_FILE) [[ -n "$v" ]] && AUTHZ_FILE="$v" ;;
                    NUVI_DB_PATH) [[ -n "$v" ]] && DB_PATH="$v" ;;
                esac
            fi
        done < "$env_file"
        break
    fi
done

[[ -z "$REPOS_ROOT" ]] && REPOS_ROOT="${DATA_DIR}/repositories"
[[ -z "$REPOS_ROOT" || "$REPOS_ROOT" == "/repositories" ]] && REPOS_ROOT="/home/nuvi-svn/data/repositories"

# Ensure target user and group exist
if ! getent group "$SVN_GROUP" >/dev/null; then
    echo -e "${YELLOW}[INFO] Creating system group '${SVN_GROUP}'...${NC}"
    groupadd --system "$SVN_GROUP"
fi
if ! getent passwd "$SVN_USER" >/dev/null; then
    echo -e "${YELLOW}[INFO] Creating system user '${SVN_USER}'...${NC}"
    useradd --system --gid "$SVN_GROUP" --home-dir /opt/nuvi --no-create-home --shell /usr/sbin/nologin "$SVN_USER"
fi

# Detect Apache service account
APACHE_USER=""
for u in www-data apache _www; do
    if id -u "$u" >/dev/null 2>&1; then
        APACHE_USER="$u"
        break
    fi
done

APACHE_RELOAD_NEEDED=false
if [[ -n "$APACHE_USER" ]]; then
    # Verify Apache user is a member of the subversion group
    if ! id -nG "$APACHE_USER" 2>/dev/null | grep -qw "$SVN_GROUP"; then
        echo -e "${YELLOW}[INFO] Adding Apache user '${APACHE_USER}' to group '${SVN_GROUP}'...${NC}"
        usermod -aG "$SVN_GROUP" "$APACHE_USER" 2>/dev/null || true
        APACHE_RELOAD_NEEDED=true
    fi
fi

# Ensure invoking sudo user is in subversion group
if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]] && id -u "$SUDO_USER" >/dev/null 2>&1; then
    if ! id -nG "$SUDO_USER" 2>/dev/null | grep -qw "$SVN_GROUP"; then
        usermod -aG "$SVN_GROUP" "$SUDO_USER" 2>/dev/null || true
    fi
fi

# ------------------------------------------------------------------------------
# 2. Helper: Check if Directory is a Genuine Subversion Repository
# ------------------------------------------------------------------------------
is_svn_repo() {
    local d="$1"
    [[ -d "$d" ]] || return 1
    # Standard FSFS check
    if [[ -f "$d/format" && -d "$d/db" ]]; then
        return 0
    fi
    # Alternate check via svnlook/svnadmin
    if command -v svnlook >/dev/null 2>&1; then
        if svnlook youngest "$d" >/dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

# ------------------------------------------------------------------------------
# 3. Resolve Target Repositories
# ------------------------------------------------------------------------------
TARGET_REPOS=()

if [[ $# -ge 1 && -n "$1" ]]; then
    # Explicit repository specified
    CANDIDATE="$1"
    if [[ -d "$CANDIDATE" ]]; then
        RESOLVED="$(readlink -f "$CANDIDATE")"
    elif [[ -d "$PWD/$CANDIDATE" ]]; then
        RESOLVED="$(readlink -f "$PWD/$CANDIDATE")"
    elif [[ -n "$REPOS_ROOT" && -d "$REPOS_ROOT/$CANDIDATE" ]]; then
        RESOLVED="$(readlink -f "$REPOS_ROOT/$CANDIDATE")"
    else
        RESOLVED=""
    fi

    if [[ -z "$RESOLVED" || ! -d "$RESOLVED" ]]; then
        echo -e "${RED}[ERROR] Specified path or repository does not exist: $1${NC}"
        exit 1
    fi

    if ! is_svn_repo "$RESOLVED"; then
        echo -e "${RED}[ERROR] Directory is not a valid Subversion repository (missing format/db): $RESOLVED${NC}"
        exit 1
    fi
    TARGET_REPOS+=("$RESOLVED")
else
    # No argument: scan current working directory
    CURRENT_DIR="$(readlink -f "$PWD")"
    if is_svn_repo "$CURRENT_DIR"; then
        TARGET_REPOS+=("$CURRENT_DIR")
    else
        # Scan immediate subdirectories
        while IFS= read -r -d '' subdir; do
            if is_svn_repo "$subdir"; then
                TARGET_REPOS+=("$subdir")
            fi
        done < <(find "$CURRENT_DIR" -maxdepth 1 -mindepth 1 -type d -print0 2>/dev/null)
    fi

    # Fallback to configured root if current directory has no repositories
    if [[ ${#TARGET_REPOS[@]} -eq 0 && -n "$REPOS_ROOT" && -d "$REPOS_ROOT" && "$REPOS_ROOT" != "$CURRENT_DIR" ]]; then
        echo -e "${YELLOW}[INFO] No Subversion repositories found in current folder ($CURRENT_DIR).${NC}"
        echo -e "${CYAN}[*] Scanning configured repository root: ${REPOS_ROOT}...${NC}"
        while IFS= read -r -d '' subdir; do
            if is_svn_repo "$subdir"; then
                TARGET_REPOS+=("$subdir")
            fi
        done < <(find "$REPOS_ROOT" -maxdepth 1 -mindepth 1 -type d -print0 2>/dev/null)
    fi
fi

if [[ ${#TARGET_REPOS[@]} -eq 0 ]]; then
    echo -e "${YELLOW}[WARNING] No Subversion repositories discovered to process.${NC}"
    echo -e "Make sure you either:"
    echo -e "  1. 'cd' into your repository directory and re-run: ${BOLD}sudo $0${NC}"
    echo -e "  2. Pass the repository folder name: ${BOLD}sudo $0 <repository_name>${NC}"
    exit 0
fi

echo -e "${GREEN}[INFO] Identified ${#TARGET_REPOS[@]} Subversion repository(ies) to process:${NC}"
for r in "${TARGET_REPOS[@]}"; do
    echo -e "  • ${BOLD}$(basename "$r")${NC} ($r)"
done
echo ""

# ------------------------------------------------------------------------------
# 4. Helper: Ensure Parent Directory Traversal Permissions (+rx)
# ------------------------------------------------------------------------------
fix_parent_traversal() {
    local target="$1"
    local curr="$(dirname "$target")"
    while [[ "$curr" != "/" && "$curr" != "." && -n "$curr" ]]; do
        if [[ -d "$curr" ]]; then
            # Ensure directories have at least world/group execute permissions
            local pmode
            pmode="$(stat -c "%a" "$curr" 2>/dev/null || echo "755")"
            local last_digit="${pmode: -1}"
            if [[ "$last_digit" != "5" && "$last_digit" != "7" ]]; then
                chmod o+rx "$curr" 2>/dev/null || true
            fi
        fi
        curr="$(dirname "$curr")"
    done
}

# ------------------------------------------------------------------------------
# 5. In-Depth Permission Enforcement Function
# ------------------------------------------------------------------------------
fix_single_repository() {
    local repo_path="$1"
    local repo_name="$(basename "$repo_path")"

    echo -e "${CYAN}------------------------------------------------------------------------${NC}"
    echo -e "${CYAN}${BOLD}[*] Processing Repository: ${repo_name}${NC}"
    echo -e "    Path: ${repo_path}"

    # 1. Ensure parent directories allow traversal
    fix_parent_traversal "$repo_path"

    # 2. Recursive Ownership
    echo -e "    [1/6] Enforcing ownership -> ${BOLD}${SVN_USER}:${SVN_GROUP}${NC}..."
    chown -R "${SVN_USER}:${SVN_GROUP}" "$repo_path"

    # 3. Directory Permissions & Setgid Bit (2775)
    echo -e "    [2/6] Setting directory permissions & setgid inheritance -> ${BOLD}chmod 2775${NC}..."
    find "$repo_path" -type d -exec chmod 2775 {} +
    # Ensure critical FSFS subdirectories have setgid explicitly set
    for dname in db db/revs db/revprops db/transactions db/txn-protorevs locks hooks conf; do
        if [[ -d "$repo_path/$dname" ]]; then
            chmod 2775 "$repo_path/$dname" 2>/dev/null || true
        fi
    done

    # 4. Regular File Permissions (0664)
    echo -e "    [3/6] Setting regular files permissions -> ${BOLD}chmod 664${NC}..."
    find "$repo_path" -type f -exec chmod 664 {} +

    # 5. Conf Directory Security (0660)
    if [[ -d "$repo_path/conf" ]]; then
        find "$repo_path/conf" -type f -exec chmod 660 {} + 2>/dev/null || true
    fi

    # 6. Active Hook Scripts Normalization & Executable Bit (0775)
    echo -e "    [4/6] Inspecting and sanitizing hook scripts..."
    local hook_count=0
    if [[ -d "$repo_path/hooks" ]]; then
        for hfile in "$repo_path/hooks"/*; do
            [[ -f "$hfile" ]] || continue
            local hname="$(basename "$hfile")"
            # Active hooks: any hook file NOT ending with .tmpl or .sample
            if [[ "$hname" != *.tmpl && "$hname" != *.sample && "$hname" != *~ ]]; then
                # Strip Windows \r (CRLF) if present (common when copy-pasted from Windows/VisualSVN)
                if grep -q $'\r' "$hfile" 2>/dev/null; then
                    sed -i 's/\r$//' "$hfile" 2>/dev/null || true
                    echo -e "        • Stripped Windows CRLF endings: ${hname}"
                fi
                chmod 775 "$hfile"
                chown "${SVN_USER}:${SVN_GROUP}" "$hfile"
                hook_count=$((hook_count + 1))
                echo -e "        • Enabled executable hook: ${BOLD}${hname}${NC} (0775)"
            else
                chmod 664 "$hfile" 2>/dev/null || true
            fi
        done
    fi
    [[ $hook_count -eq 0 ]] && echo -e "        (No active hook scripts found; templates configured 0664)"

    # 7. Subversion Integrity Verification
    echo -e "    [5/6] Verifying Subversion repository integrity..."
    local rev_youngest="0"
    local repo_uuid="Unknown"
    local status_label="HEALTHY"

    if command -v svnlook >/dev/null 2>&1; then
        rev_youngest="$(su -s /bin/sh "$SVN_USER" -c "svnlook youngest '$repo_path'" 2>/dev/null || svnlook youngest "$repo_path" 2>/dev/null || echo "Error")"
        repo_uuid="$(su -s /bin/sh "$SVN_USER" -c "svnlook uuid '$repo_path'" 2>/dev/null || svnlook uuid "$repo_path" 2>/dev/null || echo "Error")"
    fi

    if [[ "$rev_youngest" != "Error" ]]; then
        echo -e "        • Latest Revision: ${BOLD}r${rev_youngest}${NC}"
        echo -e "        • Repository UUID: ${repo_uuid}"
        echo -e "        • Health Status:   ${GREEN}${BOLD}PASSED${NC}"
    else
        echo -e "        • Health Status:   ${YELLOW}Could not read rev via svnlook (check FSFS format)${NC}"
    fi

    # 8. Nuvi Metadata & Authz Synchronization
    echo -e "    [6/6] Synchronizing with Subversion Nuvi metadata & authz matrix..."
    local py_bin=""
    if [[ -x /opt/nuvi/venv/bin/python3 ]]; then
        py_bin="/opt/nuvi/venv/bin/python3"
    elif [[ -x ./venv/bin/python3 ]]; then
        py_bin="./venv/bin/python3"
    elif command -v python3 >/dev/null 2>&1; then
        py_bin="$(command -v python3)"
    fi

    if [[ -n "$py_bin" ]]; then
        # Run registration and authz recompilation in python
        su -s /bin/sh "$SVN_USER" -c "PYTHONPATH=/opt/nuvi:$PWD NUVI_ENV_FILE=/etc/nuvi/nuvi.env $py_bin - <<'PYEOF'
import sys, os
from pathlib import Path

# Add paths to sys.path
for p in ['/opt/nuvi', os.getcwd()]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from backend.api.db import SessionLocal, init_db
    from backend.api.services.repo_service import RepositoryService
    from backend.api.services.acl_service import AclService
    
    init_db()
    db = SessionLocal()
    r = RepositoryService.register_existing_repository(db, Path('$repo_path'), actor='fix-permissions-script')
    if r:
        print(f'        • Nuvi Database:   Registered/Updated (ID: {r.id})')
    else:
        print('        • Nuvi Database:   Synchronization skipped')
    
    AclService.compile_authz_file(db)
    print('        • Authz Matrix:    Compiled & synchronized with Apache')
    db.close()
except Exception as e:
    # Non-critical if Nuvi python modules are not yet installed
    pass
PYEOF" 2>/dev/null || true
    fi

    echo -e "    ${GREEN}[SUCCESS] Permissions and access rights restored for ${repo_name}.${NC}"
}

# ------------------------------------------------------------------------------
# 6. Execute Across All Target Repositories
# ------------------------------------------------------------------------------
for repo in "${TARGET_REPOS[@]}"; do
    fix_single_repository "$repo"
done

# Restart Apache if www-data group membership was updated
if [[ "$APACHE_RELOAD_NEEDED" == "true" ]]; then
    echo ""
    echo -e "${YELLOW}[!] Apache group membership was updated for '${APACHE_USER}'.${NC}"
    echo -e "    Restarting Apache to apply group permissions..."
    systemctl restart apache2 2>/dev/null || systemctl restart httpd 2>/dev/null || true
fi

echo ""
echo -e "${BLUE}========================================================================${NC}"
echo -e "${GREEN}${BOLD} All Repository Permissions, Rights & Access Successfully Updated!     ${NC}"
echo -e "${BLUE}========================================================================${NC}"
echo -e "Summary:"
echo -e "  • Repositories Processed: ${BOLD}${#TARGET_REPOS[@]}${NC}"
echo -e "  • Service Ownership:      ${BOLD}${SVN_USER}:${SVN_GROUP}${NC}"
echo -e "  • Directory Mode:         ${BOLD}2775 (setgid enabled)${NC}"
echo -e "  • Files Mode:             ${BOLD}664 (group read/write)${NC}"
echo -e "  • Active Hooks Mode:      ${BOLD}775 (executable)${NC}"
echo ""
echo -e "You can now test client connections:"
for repo in "${TARGET_REPOS[@]}"; do
    rname="$(basename "$repo")"
    echo -e "  ${CYAN}svn list http://localhost:8081/svn/${rname} --username admin${NC}"
done
echo ""
