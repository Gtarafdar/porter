#!/bin/bash
# Double-click helper for a *source checkout* only. Prefer /Applications/Porter.app for end users.
cd "$(dirname "$0")"
exec /bin/bash "./start-porter.sh"
