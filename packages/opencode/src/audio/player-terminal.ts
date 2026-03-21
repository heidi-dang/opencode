export function playTerminalBell() {
  if (!process.stdout.isTTY) return false
  process.stdout.write("\u0007")
  return true
}