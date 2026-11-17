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

/** The question on screen: the one the user moved to, else the first unanswered, else the last. */
export function activeUserInputQuestion(
  questions: ReadonlyArray<ThreadUserInputQuestion>,
  drafts: Readonly<Record<string, PendingUserInputDraftAnswer>>,
  activeQuestionId: string | null,
) {
  return (
    questions.find((candidate) => candidate.id === activeQuestionId) ??
    questions.find(
      (candidate) => resolvePendingUserInputAnswer(candidate, drafts[candidate.id]) === null,
    ) ??
    questions.at(-1)
  );
}

/** Digit N picks option N of the active question. */
export function userInputOptionTarget(
  questions: ReadonlyArray<ThreadUserInputQuestion>,
  drafts: Readonly<Record<string, PendingUserInputDraftAnswer>>,
  activeQuestionId: string | null,
  command: HardwareKeyboardCommand,
) {
  const index = USER_INPUT_OPTION_COMMANDS.findIndex((candidate) => candidate === command);
  if (index < 0) return null;
  const question = activeUserInputQuestion(questions, drafts, activeQuestionId);
  const option = question?.options[index];
  if (!question || !option) return null;
  return { question, value: option.value ?? option.label.trim() };
}

/** The next unanswered question after this one, wrapping, else this one. */
export function nextUnansweredUserInputQuestion(
  questions: ReadonlyArray<ThreadUserInputQuestion>,
  drafts: Readonly<Record<string, PendingUserInputDraftAnswer>>,
  questionId: string,
): string {
  const index = questions.findIndex((candidate) => candidate.id === questionId);
  for (let offset = 1; offset < questions.length; offset += 1) {
    const candidate = questions[(index + offset) % questions.length];
    if (candidate && resolvePendingUserInputAnswer(candidate, drafts[candidate.id]) === null) {
      return candidate.id;
    }
  }
  return questionId;
}
