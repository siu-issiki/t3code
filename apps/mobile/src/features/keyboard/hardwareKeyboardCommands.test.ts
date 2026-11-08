import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import {
  dispatchHardwareKeyboardCommand,
  getHardwareKeyboardCommandRegistrationVersion,
  parseActiveThreadPath,
  useHardwareKeyboardCommand,
} from "./hardwareKeyboardCommands";

describe("parseActiveThreadPath", () => {
  it("decodes route components", () => {
    expect(parseActiveThreadPath("/threads/local%20machine/thread%2Fone/review")).toEqual({
      environmentId: "local machine",
      threadId: "thread/one",
    });
  });

  it("ignores malformed encoded route components", () => {
    expect(parseActiveThreadPath("/threads/%E0%A4%A/thread-1")).toBeNull();
  });
});

describe("useHardwareKeyboardCommand", () => {
  it("keeps its registration across renders with fresh handlers and arrays", () => {
    const received: string[] = [];
    function Shortcut(props: { readonly label: string }) {
      useHardwareKeyboardCommand(["thread.jump.1"], () => {
        received.push(props.label);
      });
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(Shortcut, { label: "first" })));
    const version = getHardwareKeyboardCommandRegistrationVersion();

    act(() => root.render(createElement(Shortcut, { label: "second" })));
    expect(getHardwareKeyboardCommandRegistrationVersion()).toBe(version);
    expect(dispatchHardwareKeyboardCommand("thread.jump.1")).toBe(true);
    expect(received).toEqual(["second"]);

    act(() => root.unmount());
    expect(dispatchHardwareKeyboardCommand("thread.jump.1")).toBe(false);
  });
});
