// Shared record of focus() calls, so a test can tell whether the text field
// or the focus handle took the keyboard.
export const focusLog = [];

export function resetFocusLog() {
  focusLog.length = 0;
}
