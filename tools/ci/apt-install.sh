#!/usr/bin/env bash
# Usage: tools/ci/apt-install.sh <package>...
#
# apt-get update + install with every attempt bounded and retried on a fresh connection.
# GitHub's Azure Ubuntu mirror sometimes trickles one download for 10-25 minutes; the step
# normally takes about 30 seconds (E2E runs 42165577460, 42165808629, 42166351677 and
# 42167225657 spent 14-25 minutes in it). A new attempt usually gets a fast connection,
# and packages already in /var/cache/apt/archives are not downloaded again.
set -uo pipefail

attempts=3
update_timeout=${APT_UPDATE_TIMEOUT:-120}
install_timeout=${APT_INSTALL_TIMEOUT:-240}
opts=(-o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30)

updated=0
for i in $(seq 1 "$attempts"); do
  if [ "$updated" = 0 ]; then
    if sudo timeout -k 10 "$update_timeout" apt-get "${opts[@]}" update; then
      updated=1
    else
      echo "::warning::apt-get update attempt $i/$attempts failed or ran over ${update_timeout}s"
      continue
    fi
  fi
  if sudo timeout -k 10 "$install_timeout" apt-get "${opts[@]}" install -y "$@"; then
    exit 0
  fi
  echo "::warning::apt-get install attempt $i/$attempts failed or ran over ${install_timeout}s"
  # A kill during unpack leaves dpkg half-configured; finish it before the next attempt.
  sudo dpkg --configure -a || true
done

echo "::error::apt-get could not install $* after $attempts attempts"
exit 1
