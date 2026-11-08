import {
  resolvePendingUserInputAnswer,
  type PendingUserInputDraftAnswer,
} from "@t3tools/client-runtime/state/pending-user-input";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { ThreadUserInputQuestion } from "@t3tools/client-runtime/state/thread-requests";
import { THREAD_JUMP_KEYBINDING_COMMANDS } from "@t3tools/contracts";

import type { ThreadListV2ListItem } from "../threads/threadListV2";
import {
  USER_INPUT_OPTION_COMMANDS,
  useHardwareKeyboardCommand,
  type HardwareKeyboardCommand,
} from "./hardwareKeyboardCommands";

type ThreadShortcutListItem = ThreadListV2ListItem | { readonly type: "v2-show-more" };

export function threadJumpIndex(command: HardwareKeyboardCommand) {
  return THREAD_JUMP_KEYBINDING_COMMANDS.findIndex((candidate) => candidate === command);
}

export function threadJumpTarget(
  items: ReadonlyArray<ThreadShortcutListItem>,
  command: HardwareKeyboardCommand,
) {
  let index = threadJumpIndex(command);
  if (index < 0) return null;
  for (const item of items) {
    const thread = item.type === "v2-thread" ? item.item.thread : null;
    if (thread !== null && index-- === 0) return thread;
  }
  return null;
}

export function useThreadJumpShortcuts(
  items: ReadonlyArray<ThreadShortcutListItem>,
  onSelectThread: (thread: EnvironmentThreadShell) => void,
) {
  const jumpToThread = (command: HardwareKeyboardCommand) => {
    const thread = threadJumpTarget(items, command);
    if (thread !== null) onSelectThread(thread);
    return true;
  };
  useHardwareKeyboardCommand(THREAD_JUMP_KEYBINDING_COMMANDS, jumpToThread);
}

/** Digit N answers the first unanswered question, or the last one once all are answered. */
export function userInputOptionTarget(
  questions: ReadonlyArray<ThreadUserInputQuestion>,
  drafts: Readonly<Record<string, PendingUserInputDraftAnswer>>,
  command: HardwareKeyboardCommand,
) {
  const index = USER_INPUT_OPTION_COMMANDS.findIndex((candidate) => candidate === command);
  if (index < 0) return null;
  const question =
    questions.find(
      (candidate) => resolvePendingUserInputAnswer(candidate, drafts[candidate.id]) === null,
    ) ?? questions.at(-1);
  const option = question?.options[index];
  if (!question || !option) return null;
  return { question, value: option.value ?? option.label.trim() };
}
