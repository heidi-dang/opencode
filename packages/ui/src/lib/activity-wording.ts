/**
 * Wording packs for humanized agent activity stream.
 * Each tool/status pair has 4-6 approved text variants.
 * Variants are selected deterministically via stable hash.
 */

export type Wording = {
  title: string
  subtitle: string
}

// ── bash / run_command ──────────────────────────────

export const BASH_TYPECHECK: Wording[] = [
  { title: "Running a code sanity sweep", subtitle: "Checking for type errors" },
  { title: "Verifying the build", subtitle: "Making sure the types are happy" },
  { title: "Doing a final type check", subtitle: "Scanning for compile issues" },
  { title: "Checking code correctness", subtitle: "Looking for type mismatches" },
]

export const BASH_TEST: Wording[] = [
  { title: "Stress-testing the fix", subtitle: "Running proof checks" },
  { title: "Putting the fix on trial", subtitle: "Automated tests are running" },
  { title: "Running the test suite", subtitle: "Making sure nothing snapped" },
  { title: "Validating the changes", subtitle: "Tests are crunching results" },
]

export const BASH_BUILD: Wording[] = [
  { title: "Building the project", subtitle: "Compiling the latest changes" },
  { title: "Assembling the build", subtitle: "Packaging things up" },
  { title: "Running the build step", subtitle: "Putting it all together" },
  { title: "Compiling the code", subtitle: "Turning source into output" },
]

export const BASH_LINT: Wording[] = [
  { title: "Linting the code", subtitle: "Checking style and patterns" },
  { title: "Running the linter", subtitle: "Tidying up code style" },
  { title: "Checking code quality", subtitle: "Scanning for lint issues" },
  { title: "Cleaning up the code", subtitle: "Enforcing style rules" },
]

export const BASH_GIT: Wording[] = [
  { title: "Managing version control", subtitle: "Updating the repository" },
  { title: "Running a git operation", subtitle: "Syncing changes" },
  { title: "Working with git", subtitle: "Tracking file changes" },
  { title: "Updating the repo", subtitle: "Committing progress" },
]

export const BASH_GENERIC: Wording[] = [
  { title: "Running a command", subtitle: "" },
  { title: "Executing a shell task", subtitle: "" },
  { title: "Processing a command", subtitle: "" },
  { title: "Running a shell step", subtitle: "" },
]

// ── edit ─────────────────────────────────────────────

export const EDIT_RUNNING: Wording[] = [
  { title: "Patching code", subtitle: "" },
  { title: "Editing a file", subtitle: "" },
  { title: "Making a code change", subtitle: "" },
  { title: "Applying a fix", subtitle: "" },
]

export const EDIT_DONE: Wording[] = [
  { title: "Patched", subtitle: "" },
  { title: "Edited", subtitle: "" },
  { title: "Updated", subtitle: "" },
  { title: "Modified", subtitle: "" },
]

// ── write ────────────────────────────────────────────

export const WRITE_RUNNING: Wording[] = [
  { title: "Creating a file", subtitle: "" },
  { title: "Writing a new file", subtitle: "" },
  { title: "Generating code", subtitle: "" },
  { title: "Drafting a file", subtitle: "" },
]

export const WRITE_DONE: Wording[] = [
  { title: "Created", subtitle: "" },
  { title: "Wrote", subtitle: "" },
  { title: "Generated", subtitle: "" },
  { title: "Saved", subtitle: "" },
]

// ── verify ───────────────────────────────────────────

export const VERIFY_PASS: Wording[] = [
  { title: "Stamped this step as verified", subtitle: "Checks came back clean" },
  { title: "Verification passed", subtitle: "Evidence collected, no red flags" },
  { title: "Signed off on this step", subtitle: "All checks green" },
  { title: "Confirmed the fix works", subtitle: "Results look solid" },
]

export const VERIFY_FAIL: Wording[] = [
  { title: "Found something off", subtitle: "Going back in for another pass" },
  { title: "Verification flagged an issue", subtitle: "Needs another look" },
  { title: "Checks came back unhappy", subtitle: "Adjusting the approach" },
  { title: "Something needs attention", subtitle: "Re-examining the fix" },
]

export const VERIFY_RUNNING: Wording[] = [
  { title: "Verifying the changes", subtitle: "Running checks now" },
  { title: "Putting the fix on trial", subtitle: "Collecting evidence" },
  { title: "Running verification", subtitle: "Checking all the boxes" },
  { title: "Validating the work", subtitle: "Making sure everything holds" },
]

// ── task_boundary ────────────────────────────────────

export const BOUNDARY_START: Wording[] = [
  { title: "Starting a new mission", subtitle: "" },
  { title: "Kicking off a task", subtitle: "" },
  { title: "Beginning work", subtitle: "" },
  { title: "Spinning up a new task", subtitle: "" },
]

export const BOUNDARY_LOCK: Wording[] = [
  { title: "Locked the plan", subtitle: "Moving to execution" },
  { title: "Plan is locked in", subtitle: "Ready to start building" },
  { title: "Finalized the approach", subtitle: "Transitioning to execution" },
  { title: "Sealed the plan", subtitle: "Time to build" },
]

export const BOUNDARY_EXECUTION: Wording[] = [
  { title: "Starting execution", subtitle: "Plan is ready to build" },
  { title: "Crossing into build mode", subtitle: "Turning plan into changes" },
  { title: "Execution is underway", subtitle: "Applying the approved plan" },
  { title: "Beginning implementation", subtitle: "Leaving planning behind" },
]

export const BOUNDARY_COMPLETE: Wording[] = [
  { title: "Wrapped this task", subtitle: "Ready for handoff" },
  { title: "Mission complete", subtitle: "All items checked off" },
  { title: "Task finished cleanly", subtitle: "Boundary closed" },
  { title: "Closed this one out", subtitle: "Moving on" },
]

export const BOUNDARY_VERIFY: Wording[] = [
  { title: "Requesting verification", subtitle: "Transitioning to review" },
  { title: "Moving to verification", subtitle: "Time to validate the work" },
  { title: "Entering verification phase", subtitle: "Checking the results" },
  { title: "Starting the review pass", subtitle: "Let's see if it holds" },
]

export const BOUNDARY_GENERIC: Wording[] = [
  { title: "Updating task state", subtitle: "" },
  { title: "Adjusting the workflow", subtitle: "" },
  { title: "Progressing the task", subtitle: "" },
  { title: "Managing task lifecycle", subtitle: "" },
]

// ── search (grep/glob) ──────────────────────────────

export const SEARCH_RUNNING: Wording[] = [
  { title: "Searching through the code", subtitle: "" },
  { title: "Digging through files", subtitle: "" },
  { title: "Looking for matches", subtitle: "" },
  { title: "Scanning the codebase", subtitle: "" },
]

// ── read ─────────────────────────────────────────────

export const READ_RUNNING: Wording[] = [
  { title: "Reading files", subtitle: "" },
  { title: "Examining the code", subtitle: "" },
  { title: "Loading file contents", subtitle: "" },
  { title: "Reviewing the source", subtitle: "" },
]

// ── context group ────────────────────────────────────

export const CONTEXT_GATHERING: Wording[] = [
  { title: "Gathering context", subtitle: "" },
  { title: "Tracing the code path", subtitle: "" },
  { title: "Building a picture", subtitle: "" },
  { title: "Exploring the codebase", subtitle: "" },
]

export const CONTEXT_DONE: Wording[] = [
  { title: "Gathered context", subtitle: "" },
  { title: "Mapped the code path", subtitle: "" },
  { title: "Got the picture", subtitle: "" },
  { title: "Explored the codebase", subtitle: "" },
]

// ── webfetch / websearch ─────────────────────────────

export const WEB_FETCH: Wording[] = [
  { title: "Fetching a web page", subtitle: "" },
  { title: "Grabbing web content", subtitle: "" },
  { title: "Loading a page", subtitle: "" },
  { title: "Reading from the web", subtitle: "" },
]

export const WEB_SEARCH: Wording[] = [
  { title: "Searching the web", subtitle: "" },
  { title: "Looking it up online", subtitle: "" },
  { title: "Running a web search", subtitle: "" },
  { title: "Checking the internet", subtitle: "" },
]

// ── task (subagent) ──────────────────────────────────

export const SUBAGENT_RUNNING: Wording[] = [
  { title: "Delegating to a specialist", subtitle: "" },
  { title: "Spawning a sub-task", subtitle: "" },
  { title: "Handing off to a helper", subtitle: "" },
  { title: "Running a parallel task", subtitle: "" },
]

// ── apply_patch ──────────────────────────────────────

export const PATCH_RUNNING: Wording[] = [
  { title: "Applying a patch", subtitle: "" },
  { title: "Patching multiple files", subtitle: "" },
  { title: "Applying code changes", subtitle: "" },
  { title: "Updating files in bulk", subtitle: "" },
]
