import type { ThreadUserInputQuestion } from "@t3tools/client-runtime/state/thread-requests";
import { describe, expect, it } from "vite-plus/test";

import { userInputOptionTarget } from "./threadKeyboardShortcuts";

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
    expect(userInputOptionTarget(questions, {}, "userInputOption.2")).toMatchObject({
      question: { id: "first" },
      value: "B",
    });
    expect(
      userInputOptionTarget(
        questions,
        { first: { selectedOptionValues: ["A"] } },
        "userInputOption.3",
      ),
    ).toMatchObject({ question: { id: "second" }, value: "E" });
  });

  it("falls back to the last question and ignores missing options", () => {
    const drafts = {
      first: { selectedOptionValues: ["A"] },
      second: { selectedOptionValues: ["C"] },
    };
    expect(userInputOptionTarget(questions, drafts, "userInputOption.2")).toMatchObject({
      question: { id: "second" },
      value: "D",
    });
    expect(userInputOptionTarget(questions, drafts, "userInputOption.4")).toBeNull();
    expect(userInputOptionTarget(questions, {}, "thread.jump.1")).toBeNull();
  });
});
