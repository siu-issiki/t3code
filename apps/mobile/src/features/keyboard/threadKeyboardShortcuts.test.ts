import type { ThreadUserInputQuestion } from "@t3tools/client-runtime/state/thread-requests";
import { describe, expect, it } from "vite-plus/test";

import { userInputOptionTarget, nextUnansweredUserInputQuestion } from "./threadKeyboardShortcuts";

function question(id: string, labels: ReadonlyArray<string>): ThreadUserInputQuestion {
  return {
    id,
    header: id,
    question: id,
    multiSelect: false,
    options: labels.map((label) => ({ label, description: label })),
  };
}

describe("userInputOptionTarget", () => {
  const questions = [question("first", ["A", "B"]), question("second", ["C", "D", "E"])];

  it("answers the first unanswered question", () => {
    expect(userInputOptionTarget(questions, {}, null, "userInputOption.2")).toMatchObject({
      question: { id: "first" },
      value: "B",
    });
    expect(
      userInputOptionTarget(
        questions,
        { first: { selectedOptionValues: ["A"] } },
        null,
        "userInputOption.3",
      ),
    ).toMatchObject({ question: { id: "second" }, value: "E" });
  });

  it("falls back to the last question and ignores missing options", () => {
    const drafts = {
      first: { selectedOptionValues: ["A"] },
      second: { selectedOptionValues: ["C"] },
    };
    expect(userInputOptionTarget(questions, drafts, null, "userInputOption.2")).toMatchObject({
      question: { id: "second" },
      value: "D",
    });
    expect(userInputOptionTarget(questions, drafts, null, "userInputOption.4")).toBeNull();
    expect(userInputOptionTarget(questions, {}, null, "thread.jump.1")).toBeNull();
  });

  it("targets the question the keyboard moved to, even once answered", () => {
    const drafts = { first: { selectedOptionValues: ["A"] } };
    expect(userInputOptionTarget(questions, drafts, "first", "userInputOption.2")).toMatchObject({
      question: { id: "first" },
      value: "B",
    });
    expect(userInputOptionTarget(questions, drafts, "gone", "userInputOption.1")).toMatchObject({
      question: { id: "second" },
      value: "C",
    });
  });
});

describe("nextUnansweredUserInputQuestion", () => {
  const questions = [question("a", ["1"]), question("b", ["1"]), question("c", ["1"])];

  it("moves to the next unanswered question, wrapping, and stays once all are answered", () => {
    expect(
      nextUnansweredUserInputQuestion(questions, { a: { selectedOptionValues: ["1"] } }, "a"),
    ).toBe("b");
    expect(
      nextUnansweredUserInputQuestion(
        questions,
        { b: { selectedOptionValues: ["1"] }, c: { selectedOptionValues: ["1"] } },
        "c",
      ),
    ).toBe("a");
    const answered = Object.fromEntries(
      questions.map((entry) => [entry.id, { selectedOptionValues: ["1"] }]),
    );
    expect(nextUnansweredUserInputQuestion(questions, answered, "b")).toBe("b");
  });
});
