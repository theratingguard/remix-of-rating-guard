#!/usr/bin/env bash
set -euo pipefail
root=/opt/rating-guard/public/reports
test -d "$root"
find "$root" -type f -name '*.pdf' -mmin +129600 -print -delete
