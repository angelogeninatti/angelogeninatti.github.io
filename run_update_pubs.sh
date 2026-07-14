#!/usr/bin/env bash
# Run update_pubs.py and send a desktop notification if publications changed.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON=/home/angelo/anaconda3/bin/python3
LOG="$SCRIPT_DIR/update_pubs.log"

# Grab DISPLAY and DBUS from the active user session so notify-send works.
export DISPLAY=:0
for pid in $(pgrep -u angelo 2>/dev/null); do
    if [ -r "/proc/$pid/environ" ]; then
        dbus=$(tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | grep '^DBUS_SESSION_BUS_ADDRESS=' | head -1 | cut -d= -f2-)
        if [ -n "$dbus" ]; then
            export DBUS_SESSION_BUS_ADDRESS="$dbus"
            break
        fi
    fi
done

# Run the script and capture output.
OUTPUT=$("$PYTHON" "$SCRIPT_DIR/update_pubs.py" 2>&1)
EXIT_CODE=$?

# Log with timestamp.
echo "=== $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG"
echo "$OUTPUT" >> "$LOG"
echo "" >> "$LOG"

# Notify only when something changed (output does NOT contain "already up to date").
if echo "$OUTPUT" | grep -q "already up to date"; then
    exit 0
fi

if [ $EXIT_CODE -ne 0 ]; then
    notify-send --urgency=critical "Publications update failed" "$OUTPUT" 2>/dev/null || true
    exit $EXIT_CODE
fi

# Extract the summary lines (last few lines before the tip).
SUMMARY=$(echo "$OUTPUT" | grep -E "new entry|DOI added|appended|received" | head -5 | tr '\n' '\n')
notify-send --urgency=normal "Publications updated" "${SUMMARY:-See $LOG for details}" 2>/dev/null || true
