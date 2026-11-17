import { StackActions, useNavigation } from "@react-navigation/native";
import { Platform } from "react-native";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  canSnooze,
  resolveSnoozePresets,
  type SnoozePreset,
} from "@t3tools/client-runtime/state/thread-settled";
import { resolveThreadReferenceCopyTarget } from "@t3tools/client-runtime/thread-reference";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import type { SnoozePresetSetting } from "@t3tools/contracts/settings";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
  type ReactNode,
} from "react";

import * as Dialog from "../../components/ui/Dialog";
import { useNowAfter } from "../../lib/clock";
import { copyThreadReference } from "../../lib/copyThreadReference";
import { useThreadListActions } from "../home/useThreadListActions";
import {
  firstWorkspaceDetailOpen,
  workspaceHasColumns,
} from "../layout/workspace/workspace-selection-store";
import { T3KeyboardCommands } from "../../native/T3KeyboardCommands";
import { useServerConfigs, useThreadShell } from "../../state/entities";
import { useEnvironmentScope } from "../../state/session";
import type { GitActionProgress } from "../../state/use-vcs-action-state";
import { CustomSnoozeSheet } from "../threads/CustomSnoozeSheet";
import { GitActionProgressOverlay } from "../threads/GitActionProgressOverlay";
import {
  resolveThreadListV2SnoozeGateExpiryMs,
  resolveThreadListV2SnoozeMenuSelection,
} from "../threads/threadListV2";
import { CommandPalette } from "./CommandPalette";
import type { CommandPaletteItem } from "./commandPaletteItems";
import {
  dispatchHardwareKeyboardCommand,
  getRegisteredHardwareKeyboardCommands,
  markHardwareKeyboardCommandReceived,
  parseActiveThreadPath,
  subscribeToHardwareKeyboardCommandRegistrations,
  type HardwareKeyboardCommand,
} from "./hardwareKeyboardCommands";
import { selectWorkspaceDetail } from "../layout/workspace/workspace-detail-selection";

const EMPTY_COPY_FEEDBACK: GitActionProgress = {
  phase: "idle",
  label: null,
  description: null,
};
const COPY_FEEDBACK_DISMISS_MS = 3_000;

const CommandPaletteContext = createContext<ReactNode>(null);

interface SnoozeMenu {
  readonly thread: EnvironmentThreadShell;
  readonly shown: ReadonlyArray<SnoozePreset>;
  readonly presets: ReadonlyArray<SnoozePresetSetting> | undefined;
}

/** Render inside the workspace so palette actions share its navigation and pane state. */
export function HardwareKeyboardCommandOverlay() {
  return use(CommandPaletteContext);
}

export function HardwareKeyboardCommandProvider({
  children,
  pathname,
}: PropsWithChildren<{ readonly pathname: string }>) {
  const navigation = useNavigation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [snoozeMenu, setSnoozeMenu] = useState<SnoozeMenu | null>(null);
  const [customSnoozeThread, setCustomSnoozeThread] = useState<EnvironmentThreadShell | null>(null);
  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    setSnoozeMenu(null);
  }, []);
  const activeThreadRef = useMemo(() => parseActiveThreadPath(pathname), [pathname]);
  const activeThread = useThreadShell(activeThreadRef);
  const { settleThread, snoozeThread, unsettleThread } = useThreadListActions();
  const serverConfigs = useServerConfigs();
  const canOperateActiveThread = useEnvironmentScope(
    activeThreadRef?.environmentId ?? null,
    AuthOrchestrationOperateScope,
  );
  const activeSnoozePresets =
    activeThreadRef === null
      ? undefined
      : serverConfigs.get(activeThreadRef.environmentId)?.settings.snoozePresets;
  const snoozeGateExpiryMs =
    activeThread === null
      ? null
      : resolveThreadListV2SnoozeGateExpiryMs(activeThread, {
          now: activeThread.latestUserMessageAt ?? "",
        });
  const snoozeGateNowMs = useNowAfter(snoozeGateExpiryMs === null ? null : snoozeGateExpiryMs + 1);
  const canSnoozeActiveThread =
    activeThread !== null &&
    canOperateActiveThread &&
    serverConfigs.has(activeThread.environmentId) &&
    canSnooze(activeThread, { now: new Date(snoozeGateNowMs).toISOString() });
  const copyTarget = useMemo(
    () =>
      activeThreadRef === null
        ? null
        : resolveThreadReferenceCopyTarget({
            threadRef: activeThreadRef,
            title: activeThread?.title ?? "",
            pullRequests: activeThread?.pullRequests,
            linkedPullRequestUrl:
              (activeThread?.linkedPullRequest ?? activeThread?.branchPullRequest)?.url ?? null,
          }),
    [activeThread, activeThreadRef],
  );
  const [copyFeedback, setCopyFeedback] = useState<GitActionProgress>(EMPTY_COPY_FEEDBACK);
  const copyRequestIdRef = useRef(0);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissCopyFeedback = useCallback(() => {
    if (copyFeedbackTimerRef.current !== null) {
      clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }
    setCopyFeedback(EMPTY_COPY_FEEDBACK);
  }, []);
  const showCopyFeedback = useCallback((feedback: GitActionProgress) => {
    if (copyFeedbackTimerRef.current !== null) {
      clearTimeout(copyFeedbackTimerRef.current);
    }
    setCopyFeedback(feedback);
    copyFeedbackTimerRef.current = setTimeout(() => {
      copyFeedbackTimerRef.current = null;
      setCopyFeedback(EMPTY_COPY_FEEDBACK);
    }, COPY_FEEDBACK_DISMISS_MS);
  }, []);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears the copy feedback timer on unmount
  useEffect(
    () => () => {
      if (copyFeedbackTimerRef.current !== null) {
        clearTimeout(copyFeedbackTimerRef.current);
      }
    },
    [],
  );
  const registeredCommands = useSyncExternalStore(
    subscribeToHardwareKeyboardCommandRegistrations,
    getRegisteredHardwareKeyboardCommands,
    getRegisteredHardwareKeyboardCommands,
  );
  const enabledCommands = useMemo(() => {
    const commands = new Set<HardwareKeyboardCommand>(registeredCommands);
    commands.add("newTask");
    commands.add("commandPalette");
    if (pathname !== "/" && !pathname.startsWith("/threads/")) {
      for (const command of commands) {
        if (command.startsWith("thread.jump.")) commands.delete(command);
      }
    }
    if (pathname !== "/" || navigation.canGoBack()) commands.add("back");
    if (activeThreadRef !== null) {
      commands.add("files");
      commands.add("terminal");
      commands.add("review");
      commands.add("focusComposer");
      if (pathname.split("/")[4] !== "terminal") {
        commands.add("copyThreadReference");
        commands.add("settleThread");
        if (canSnoozeActiveThread) commands.add("snoozeThread");
      }
    }
    return [...commands];
  }, [activeThreadRef, canSnoozeActiveThread, pathname, registeredCommands, navigation]);

  const onCommand = useCallback(
    (command: HardwareKeyboardCommand) => {
      markHardwareKeyboardCommandReceived();
      if (command === "commandPalette") {
        setPaletteOpen(true);
        return;
      }
      if (dispatchHardwareKeyboardCommand(command)) return;

      if (command === "copyThreadReference") {
        if (copyTarget === null) return;
        const requestId = ++copyRequestIdRef.current;
        void copyThreadReference(copyTarget).then((didCopy) => {
          if (requestId !== copyRequestIdRef.current) return;
          showCopyFeedback(
            didCopy
              ? {
                  phase: "success",
                  label: copyTarget.successTitle,
                  description: copyTarget.description,
                }
              : {
                  phase: "error",
                  label: copyTarget.failureTitle,
                  description: "Try again.",
                },
          );
        });
        return;
      }

      if (command === "settleThread") {
        if (activeThread === null) return;
        void (activeThread.settledOverride === "settled" ? unsettleThread : settleThread)(
          activeThread,
        );
        return;
      }

      if (command === "snoozeThread") {
        if (activeThread === null) return;
        setSnoozeMenu({
          thread: activeThread,
          shown: resolveSnoozePresets(
            new Date(),
            activeSnoozePresets ? { presets: activeSnoozePresets } : {},
          ),
          presets: activeSnoozePresets,
        });
        return;
      }

      if (command === "newTask") {
        navigation.dispatch(selectWorkspaceDetail({ name: "Thread", params: { draft: {} } }));
        return;
      }
      if (command === "back") {
        // Beside a visible list, the first detail page has nothing to go back to.
        if (Platform.OS === "ios" && workspaceHasColumns() && firstWorkspaceDetailOpen(navigation))
          return;
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.dispatch(StackActions.replace("Home"));
        }
        return;
      }

      const thread = parseActiveThreadPath(pathname);
      if (!thread) return;
      if (command === "files" && !/\/files(?:\/|$)/.test(pathname)) {
        navigation.navigate("ThreadFiles", thread);
      }
      if (command === "terminal" && !/\/terminal(?:\/|$)/.test(pathname)) {
        navigation.navigate("ThreadTerminal", thread);
      }
      if (command === "review" && !/\/review(?:\/|$)/.test(pathname)) {
        navigation.navigate("ThreadReview", thread);
      }
    },
    [
      activeSnoozePresets,
      activeThread,
      copyTarget,
      navigation,
      pathname,
      settleThread,
      showCopyFeedback,
      unsettleThread,
    ],
  );

  const snoozeItems = useMemo<ReadonlyArray<CommandPaletteItem> | undefined>(() => {
    if (snoozeMenu === null) return undefined;
    const { thread, shown, presets } = snoozeMenu;
    return [
      ...shown.map((preset): CommandPaletteItem => ({
        key: `snooze:${preset.id}`,
        kind: "action",
        title: preset.label,
        detail: preset.whenLabel,
        searchTerms: [preset.whenLabel],
        run: () => {
          const selection = resolveThreadListV2SnoozeMenuSelection({
            event: `snooze:${preset.id}`,
            displayedPresets: shown,
            now: new Date(),
            presets,
          });
          if (selection._tag === "selected") {
            void snoozeThread(thread, selection.preset.snoozedUntil);
          } else if (selection._tag === "expired") {
            Dialog.alert(
              "Could not snooze thread",
              "That snooze time has passed. Choose another time.",
            );
          }
        },
      })),
      {
        key: "snooze:custom",
        kind: "action",
        title: "Custom…",
        searchTerms: ["date", "time", "duration"],
        run: () => setCustomSnoozeThread(thread),
      },
    ];
  }, [snoozeMenu, snoozeThread]);

  const palette = useMemo(
    () => (
      <>
        {paletteOpen || snoozeItems ? (
          <CommandPalette
            pathname={pathname}
            onClose={closePalette}
            onCommand={onCommand}
            snoozeItems={snoozeItems}
          />
        ) : null}
        {customSnoozeThread ? (
          <CustomSnoozeSheet
            onClose={() => setCustomSnoozeThread(null)}
            onSnooze={(snoozedUntil) => void snoozeThread(customSnoozeThread, snoozedUntil)}
          />
        ) : null}
      </>
    ),
    [closePalette, customSnoozeThread, onCommand, paletteOpen, pathname, snoozeItems, snoozeThread],
  );

  return (
    <CommandPaletteContext value={palette}>
      <T3KeyboardCommands enabledCommands={enabledCommands} onCommand={onCommand}>
        {children}
      </T3KeyboardCommands>
      <GitActionProgressOverlay progress={copyFeedback} onDismiss={dismissCopyFeedback} />
    </CommandPaletteContext>
  );
}
