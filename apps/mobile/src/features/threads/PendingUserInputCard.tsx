import { Button } from "../../components/ui/Button";
import { QuestionAttachments } from "./QuestionAttachments";
import type { EnvironmentId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import type { ThreadUserInputQuestion } from "@t3tools/client-runtime/state/thread-requests";
import {
  markdownProseDirection,
  textDirection,
  type TextDirection,
} from "@t3tools/shared/textDirection";
import { useNavigation } from "@react-navigation/native";
import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { ControlPill } from "../../components/ui/ControlPill";
import { cn } from "../../lib/cn";
import { resolveMarkdownLinkPresentation } from "../../lib/markdownLinks";
import { SelectableMarkdownText } from "../../native/SelectableMarkdownText";
import { useOpenPullRequest } from "../../native/useOpenPullRequest";
import { useMarkdownPreviewStyles } from "../files/FileMarkdownPreview";
import {
  fileRoutePathSegments,
  resolveFileLinkPath,
  resolveWorkspaceRelativeFilePath,
} from "../files/filePath";
import { useLiveThreadLinkLabels } from "../../state/entities";
import {
  USER_INPUT_OPTION_COMMANDS,
  useHardwareKeyboardCommand,
  type HardwareKeyboardCommand,
} from "../keyboard/hardwareKeyboardCommands";
import {
  activeUserInputQuestion,
  nextUnansweredUserInputQuestion,
  userInputOptionTarget,
} from "../keyboard/threadKeyboardShortcuts";
import {
  isPendingUserInputOptionSelected,
  resolvePendingUserInputAnswer,
  type PendingUserInputDraftAnswer,
} from "@t3tools/client-runtime/state/pending-user-input";
import type { PendingUserInput } from "../../lib/threadActivity";

const USER_INPUT_KEYBOARD_COMMANDS: ReadonlyArray<HardwareKeyboardCommand> = [
  ...USER_INPUT_OPTION_COMMANDS,
  "userInputNextQuestion",
  "userInputPreviousQuestion",
  "userInputSubmit",
];

const AUTO_ADVANCE_DELAY_MS = 200;

export interface PendingUserInputCardProps {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly workspaceRoot: string | null;
  readonly canOperateThread: boolean;
  readonly pendingUserInput: PendingUserInput;
  readonly maxHeight: DerivedValue<number>;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly onStopThread?: () => void;
  readonly cardProgress: SharedValue<number>;
  readonly cardCoverage: SharedValue<number>;
  readonly onInputFocusChange?: (focused: boolean) => void;
  readonly drafts: Record<string, PendingUserInputDraftAnswer>;
  readonly answers: Record<string, string | ReadonlyArray<string>> | null;
  readonly respondingUserInputId: RuntimeRequestId | null;
  readonly onSelectOption: (
    requestId: RuntimeRequestId,
    question: ThreadUserInputQuestion,
    value: string,
  ) => void;
  readonly onChangeCustomAnswer: (
    requestId: RuntimeRequestId,
    questionId: string,
    customAnswer: string,
  ) => void;
  readonly onSubmit: () => Promise<unknown>;
  readonly onDismiss: () => Promise<unknown>;
}

function proseDirectionStyle(text: string, setDirection: TextDirection | undefined) {
  const direction = textDirection(text);
  return {
    ...(direction ? { direction, writingDirection: direction } : null),
    textAlign: (direction === "rtl") === (setDirection === "rtl") ? "left" : "right",
  } as const;
}

function QuestionText(props: {
  readonly markdown: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly workspaceRoot: string | null;
  readonly setDirection: TextDirection | undefined;
  readonly preserveSoftBreaks?: boolean;
}) {
  const styles = useMarkdownPreviewStyles();
  const markdown = useLiveThreadLinkLabels(props.markdown, props.environmentId);
  const navigation = useNavigation();
  const openPullRequest = useOpenPullRequest();
  const openLink = (href: string) => {
    const link = resolveMarkdownLinkPresentation(href);
    if (link.kind !== "file") {
      void openPullRequest(href);
      return;
    }
    const path = resolveFileLinkPath(props.workspaceRoot, link.path);
    if (path === null) return;
    navigation.navigate("ThreadFile", {
      environmentId: String(props.environmentId),
      threadId: String(props.threadId),
      path: fileRoutePathSegments(
        resolveWorkspaceRelativeFilePath(props.workspaceRoot, path) ?? path,
      ),
      ...(link.line ? { line: String(link.line) } : {}),
    });
  };
  return (
    <SelectableMarkdownText
      markdown={markdown}
      textStyle={styles.nativeTextStyle}
      writingDirection={markdownProseDirection(markdown)}
      // Android's renderer aligns relative to each paragraph's direction.
      textAlign={
        Platform.OS === "android" ? undefined : props.setDirection === "rtl" ? "right" : "left"
      }
      onLinkPress={openLink}
      preserveSoftBreaks={props.preserveSoftBreaks}
    />
  );
}

export function PendingUserInputCard(props: PendingUserInputCardProps) {
  const questionCount = props.pendingUserInput.questions.length;
  const canRespond = props.pendingUserInput.responseCapability !== "not_resumable";
  const isResponding = props.respondingUserInputId === props.pendingUserInput.requestId;
  const responseDisabled = !canRespond || isResponding;
  const { questions, requestId } = props.pendingUserInput;
  // Question ids repeat across requests, so the choice only applies to the request it was made on.
  const [shownQuestion, setShownQuestion] = useState<{
    readonly requestId: RuntimeRequestId;
    readonly questionId: string;
  } | null>(null);
  const shownQuestionId = shownQuestion?.requestId === requestId ? shownQuestion.questionId : null;
  const activeQuestion = activeUserInputQuestion(questions, props.drafts, shownQuestionId);
  const activeIndex = questions.findIndex((question) => question.id === activeQuestion?.id);
  const isLastQuestion = activeIndex === questionCount - 1;
  const showQuestion = (questionId: string) => setShownQuestion({ requestId, questionId });
  const showQuestionAt = (index: number) => {
    const question = questions[Math.min(Math.max(index, 0), questionCount - 1)];
    if (question) showQuestion(question.id);
  };
  const inputDisabled = responseDisabled || props.collapsed || !props.canOperateThread;
  const selectOption = (question: ThreadUserInputQuestion, value: string) => {
    // Pin the question, or answering it would swap the page to the next unanswered one at once.
    showQuestion(question.id);
    props.onSelectOption(requestId, question, value);
    const next = questions[questions.findIndex((candidate) => candidate.id === question.id) + 1];
    if (question.multiSelect || !next) return;
    // Moving to another question first wins over the pending advance.
    setTimeout(() => {
      setShownQuestion((current) =>
        current?.requestId === requestId && current.questionId === question.id
          ? { requestId, questionId: next.id }
          : current,
      );
    }, AUTO_ADVANCE_DELAY_MS);
  };
  useHardwareKeyboardCommand(inputDisabled ? [] : USER_INPUT_KEYBOARD_COMMANDS, (command) => {
    if (command === "userInputSubmit") {
      if (props.answers !== null) void props.onSubmit();
      else if (activeQuestion)
        showQuestion(nextUnansweredUserInputQuestion(questions, props.drafts, activeQuestion.id));
      return;
    }
    if (command === "userInputNextQuestion" || command === "userInputPreviousQuestion") {
      showQuestionAt(activeIndex + (command === "userInputNextQuestion" ? 1 : -1));
      return;
    }
    const target = userInputOptionTarget(questions, props.drafts, shownQuestionId, command);
    if (target !== null) selectOption(target.question, target.value);
  });
  const setDirection = markdownProseDirection(
    props.pendingUserInput.questions
      .flatMap((question) => [
        question.header,
        question.question,
        ...question.options.flatMap((option) => [option.label, option.description ?? ""]),
      ])
      .join(" "),
  );

  const activeDraft = activeQuestion ? props.drafts[activeQuestion.id] : undefined;
  const canAdvance =
    activeQuestion !== undefined &&
    resolvePendingUserInputAnswer(activeQuestion, activeDraft) !== null;

  const { cardCoverage, cardProgress, maxHeight } = props;
  const barHeightRef = useRef(0);
  const cardHeightRef = useRef(0);
  const cardHeight = useSharedValue(0);
  const notifyCoverage = () => {
    // The card resizes with the keyboard every frame, so easing each sample would leave the
    // feed inset and floating controls trailing it.
    cardCoverage.set(Math.max(0, cardHeightRef.current - barHeightRef.current));
  };
  const handleBarLayout = (event: LayoutChangeEvent) => {
    barHeightRef.current = event.nativeEvent.layout.height;
    notifyCoverage();
  };
  const handleCardLayout = (event: LayoutChangeEvent) => {
    cardHeightRef.current = event.nativeEvent.layout.height;
    cardHeight.set(event.nativeEvent.layout.height);
    notifyCoverage();
  };
  const cardAnimatedStyle = useAnimatedStyle(() => {
    const progress = cardProgress.value;
    const travel = Platform.OS === "android" ? cardCoverage.value : cardHeight.value;
    return {
      maxHeight: maxHeight.value,
      opacity:
        Platform.OS === "android"
          ? Math.min(1, (progress * cardHeight.value) / Math.max(1, cardHeight.value - travel))
          : 1,
      transform: [{ translateY: (1 - progress) * travel }],
    };
  });
  // Android hit-tests inside the parent; its height is also the space the card takes below the feed.
  const androidBoundsStyle = useAnimatedStyle(() => ({
    paddingTop: cardCoverage.value * cardProgress.value,
  }));
  const overlayHeightStyle = useAnimatedStyle(() => ({ height: maxHeight.value }));

  const stopButton = props.onStopThread ? (
    <ControlPill
      accessibilityLabel="Stop"
      icon="stop.fill"
      variant="danger"
      className="h-9 w-9"
      disabled={!props.canOperateThread}
      onPress={props.onStopThread}
    />
  ) : null;
  const bar = (
    <View
      onLayout={handleBarLayout}
      pointerEvents={props.collapsed ? "auto" : "none"}
      accessibilityElementsHidden={!props.collapsed}
      importantForAccessibility={props.collapsed ? "auto" : "no-hide-descendants"}
      className="flex-row items-center gap-2 rounded-full border border-border bg-card-alt py-1.5 pl-4 pr-1.5"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Expand user input, ${questionCount} question${
          questionCount === 1 ? "" : "s"
        }`}
        onPress={props.onToggleCollapsed}
        className="min-h-10 flex-1 flex-row items-center gap-2 active:opacity-70"
      >
        <Text className="font-t3-bold text-2xs uppercase tracking-[1.1px] text-foreground-secondary">
          User input needed
        </Text>
        <Text className="font-sans text-xs text-foreground-muted">
          {questionCount} question{questionCount === 1 ? "" : "s"}
        </Text>
        <View className="flex-1" />
        <SymbolView
          name="chevron.up"
          size={12}
          tintColorClassName={"accent-icon-subtle"}
          type="monochrome"
        />
      </Pressable>
      {stopButton}
    </View>
  );
  const card = (
    <Animated.View
      onLayout={handleCardLayout}
      pointerEvents={props.collapsed ? "none" : "auto"}
      accessibilityElementsHidden={props.collapsed}
      importantForAccessibility={props.collapsed ? "no-hide-descendants" : "auto"}
      className="overflow-hidden gap-2.5 rounded-[20px] border border-border bg-card-alt p-4"
      style={cardAnimatedStyle}
    >
      <View className="flex-row items-start gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Collapse user input"
          onPress={props.onToggleCollapsed}
          className="flex-1 flex-row items-start gap-2"
        >
          <View className="flex-1 gap-2.5">
            <View className="flex-row items-center gap-2">
              <Text className="font-t3-bold text-2xs uppercase tracking-[1.1px] text-foreground-secondary">
                User input needed
              </Text>
              {questionCount > 1 ? (
                <Text className="font-sans text-xs text-foreground-muted">
                  {activeIndex + 1}/{questionCount}
                </Text>
              ) : null}
            </View>
            <Text className="font-t3-bold text-lg text-foreground">
              Fill in the pending answers
            </Text>
          </View>
          <View className="h-8 w-8 items-center justify-center rounded-full bg-subtle-strong">
            <SymbolView
              name="chevron.down"
              size={13}
              tintColorClassName={"accent-icon-subtle"}
              type="monochrome"
            />
          </View>
        </Pressable>
        {stopButton}
      </View>
      <ScrollView
        key={activeQuestion?.id}
        bounces={false}
        className="min-h-0"
        contentContainerClassName="gap-2.5 pb-1"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
        style={{ flexShrink: 1 }}
      >
        {!canRespond ? (
          <Text className="font-sans text-sm leading-5 text-foreground-muted">
            The provider process for this request is no longer available. Interrupt or restart the
            run to continue.
          </Text>
        ) : null}
        {activeQuestion ? (
          <View className="gap-2 pt-1">
            <Text
              className="font-t3-bold text-xs uppercase tracking-[1px] text-foreground-muted"
              style={proseDirectionStyle(activeQuestion.header, setDirection)}
            >
              {activeQuestion.header}
            </Text>
            <QuestionText
              markdown={activeQuestion.question}
              environmentId={props.environmentId}
              threadId={props.threadId}
              workspaceRoot={props.workspaceRoot}
              setDirection={setDirection}
              preserveSoftBreaks
            />
            <View className="gap-2">
              {activeQuestion.options.map((option) => {
                const optionValue = option.value ?? option.label.trim();
                const selected = isPendingUserInputOptionSelected(
                  activeQuestion,
                  activeDraft,
                  optionValue,
                );
                const description =
                  option.description !== option.label ? option.description : undefined;
                return (
                  <View key={optionValue} className="gap-1.5">
                    <Pressable
                      accessibilityRole={activeQuestion.multiSelect ? "checkbox" : "radio"}
                      accessibilityState={{ checked: selected, disabled: responseDisabled }}
                      disabled={responseDisabled}
                      className={cn(
                        "min-h-12 w-full rounded-2xl border px-3.5 py-3",
                        selected ? "border-primary bg-primary/10" : "border-border bg-input",
                      )}
                      onPress={() => selectOption(activeQuestion, optionValue)}
                    >
                      <View className="min-w-0 flex-1 gap-0.5">
                        <Text
                          className={cn(
                            "font-t3-bold text-sm",
                            selected ? "text-foreground" : "text-foreground-secondary",
                          )}
                          style={proseDirectionStyle(option.label, setDirection)}
                        >
                          {option.label}
                        </Text>
                        {description ? (
                          <Text
                            className="font-sans text-sm leading-5 text-foreground-muted"
                            style={proseDirectionStyle(description, setDirection)}
                          >
                            {description}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                    {option.preview ? (
                      <View className="px-3.5">
                        <QuestionText
                          markdown={option.preview}
                          environmentId={props.environmentId}
                          threadId={props.threadId}
                          workspaceRoot={props.workspaceRoot}
                          setDirection={setDirection}
                          preserveSoftBreaks
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
            {activeQuestion.allowCustomAnswer !== false ? (
              <QuestionAttachments
                key={`${requestId}:${activeQuestion.id}`}
                requestId={requestId}
                question={activeQuestion}
                questions={questions}
                disabled={responseDisabled}
                value={activeDraft?.customAnswer ?? ""}
                onChangeText={(value) => {
                  showQuestion(activeQuestion.id);
                  props.onChangeCustomAnswer(requestId, activeQuestion.id, value);
                }}
                onInputFocusChange={props.onInputFocusChange}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <View className="flex-row gap-2">
        {activeIndex > 0 ? (
          <Button
            label="Previous"
            disabled={isResponding}
            onPress={() => showQuestionAt(activeIndex - 1)}
          />
        ) : null}
        <View className="flex-1">
          {isLastQuestion ? (
            <Button
              label={questionCount > 1 ? "Submit answers" : "Submit answer"}
              fullWidth
              tone={props.answers ? "primary" : "secondary"}
              disabled={!props.canOperateThread || responseDisabled || props.answers === null}
              onPress={() => void props.onSubmit()}
            />
          ) : (
            <Button
              label="Next question"
              fullWidth
              tone={canAdvance ? "primary" : "secondary"}
              disabled={isResponding || !canAdvance}
              onPress={() => showQuestionAt(activeIndex + 1)}
            />
          )}
        </View>
      </View>
      {props.pendingUserInput.dismissible ? (
        <Button
          label="Dismiss without answering"
          tone="text"
          disabled={isResponding}
          onPress={() => void props.onDismiss()}
        />
      ) : null}
      {!props.canOperateThread ? (
        <Text className="font-sans text-xs text-foreground-tertiary">
          This connection cannot submit answers.
        </Text>
      ) : null}
    </Animated.View>
  );
  return (
    <Animated.View
      className="relative"
      style={Platform.OS === "android" ? androidBoundsStyle : undefined}
    >
      {bar}
      <Animated.View
        pointerEvents={props.collapsed ? "none" : "box-none"}
        className="absolute inset-x-0 bottom-0 justify-end overflow-hidden"
        style={overlayHeightStyle}
      >
        {card}
      </Animated.View>
    </Animated.View>
  );
}
