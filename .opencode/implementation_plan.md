Plan to fix infinity_loop failure and re-run audit

Summary

- The infinity_loop tool failed due to an invalid id in .opencode/queue.json: "stability-001".
- The tool expects ids in the format task-YYYY-MM-DD-NNN.

Steps

1. Update .opencode/queue.json: replace the invalid id with a valid id following the pattern task-2026-03-15-001.
2. Re-run the infinity_loop audit (max_cycles=1, watch=false).
3. If the tool reports errors, capture output and iterate on fixes.

Risk & Safety

- This change only edits a local queue metadata file. No irreversible operations or git commits will be made without your approval.

Request

- Please approve the next step so I can apply the id fix and re-run the infinity_loop tool.
