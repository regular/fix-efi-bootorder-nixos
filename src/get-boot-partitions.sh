set -euo pipefail
lsblk -o PARTUUID,mountpoint | grep '/boot'
