#!/bin/bash
# PreToolUse hook: block edits to engine files.
# Engine files are bundled and must not be modified by the skill.

INPUT=$(cat)

# Extract file_path — prefer jq, fall back to python3
if command -v jq &>/dev/null; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
elif command -v python3 &>/dev/null; then
  FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)
else
  # Cannot parse JSON — fail closed (block) to be safe
  echo '{"decision":"block","reason":"Cannot parse hook input: neither jq nor python3 found."}'
  exit 0
fi

if [[ "$FILE_PATH" == *"/engine/"* ]]; then
  echo '{"decision":"block","reason":"Engine files (engine/*.js, engine/lesson.css) are bundled and must not be modified. Use createSceneRenderer from the existing engine instead."}'
else
  echo '{"decision":"allow"}'
fi
