set -euo pipefail
lsblk -o PARTUUID,mountpoint | grep '\s/boot$' | awk '{print $1}'
