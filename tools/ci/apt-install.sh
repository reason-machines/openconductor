#!/usr/bin/env bash
# Usage: APT_ARCHIVES=<dir> tools/ci/apt-install.sh <package>...
#
# apt-get update + install for CI, built for GitHub's Azure Ubuntu mirror, which sometimes serves
# at 30-50 kB/s for 10-25 minutes (E2E runs 42165577460, 42165808629, 42166351677, 42167225657,
# 42170012660). The step normally takes about 30 seconds.
#
# - Downloaded .debs go to $APT_ARCHIVES (when set), which the workflow restores and saves with
#   actions/cache, so a warm run downloads only packages that changed since the cache was saved.
# - Every attempt is bounded. A new attempt keeps what earlier ones downloaded and moves the
#   runner's mirror list (/etc/apt/apt-mirrors.txt) to its next mirror, because retrying the same
#   slow mirror did not get faster.
set -uo pipefail

attempts=3
update_timeout=${APT_UPDATE_TIMEOUT:-120}
install_timeout=${APT_INSTALL_TIMEOUT:-300}
mirrors=${APT_MIRRORS_FILE:-/etc/apt/apt-mirrors.txt}
opts=(-o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30)
if [ -n "${APT_ARCHIVES:-}" ]; then
  mkdir -p "$APT_ARCHIVES/partial"
  opts+=(-o "Dir::Cache::Archives=$APT_ARCHIVES" -o APT::Keep-Downloaded-Packages=true)
  echo "apt archive cache: $(find "$APT_ARCHIVES" -maxdepth 1 -name '*.deb' | wc -l) .debs"
fi

next_mirror() {
  [ -f "$mirrors" ] && [ "$(grep -c . "$mirrors")" -gt 1 ] || return 0
  # Lines may carry priority:N tags, which apt sorts by, so renumber them in the new order.
  { tail -n +2 "$mirrors"; head -n 1 "$mirrors"; } | awk '{ sub(/priority:[0-9]+/, "priority:" NR) } 1' > "${TMPDIR:-/tmp}/apt-mirrors.$$"
  sudo cp "${TMPDIR:-/tmp}/apt-mirrors.$$" "$mirrors"
  echo "apt mirror list now starts with: $(head -n 1 "$mirrors")"
}

# The cache action saves as the runner user; apt writes as root.
own_archives() {
  [ -n "${APT_ARCHIVES:-}" ] || return 0
  sudo rm -rf "$APT_ARCHIVES/partial" "$APT_ARCHIVES/lock"
  sudo chown -R "$(id -u):$(id -g)" "$APT_ARCHIVES"
}

status=1
updated=0
for i in $(seq 1 "$attempts"); do
  [ "$i" -gt 1 ] && next_mirror
  if [ "$updated" = 0 ]; then
    # The outer loop owns metadata retries. Internal retries can consume the whole
    # deadline without reporting an error; apt otherwise accepts failed indexes.
    if sudo timeout -k 10 "$update_timeout" apt-get "${opts[@]}" \
      -o Acquire::Retries=0 -o APT::Update::Error-Mode=any update; then
      updated=1
    else
      update_status=$?
      echo "::warning::apt-get update attempt $i/$attempts exited $update_status (deadline ${update_timeout}s)"
      continue
    fi
  fi
  if sudo timeout -k 10 "$install_timeout" apt-get "${opts[@]}" install -y "$@"; then
    status=0
    break
  fi
  echo "::warning::apt-get install attempt $i/$attempts failed or ran over ${install_timeout}s"
  # A kill during unpack leaves dpkg half-configured; finish it before the next attempt.
  sudo dpkg --configure -a || true
done

own_archives
[ "$status" = 0 ] || echo "::error::apt-get could not install $* after $attempts attempts"
exit "$status"
