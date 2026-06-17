import { describe, it, expect } from "vitest";
import {
  detectObviousOffTopic,
  isTriviallyAllowed,
  parseModerationVerdict,
} from "@/lib/user-chat-moderation";

describe("isTriviallyAllowed", () => {
  it("allows greetings in EN and FR", () => {
    expect(isTriviallyAllowed("bonjour")).toBe(true);
    expect(isTriviallyAllowed("Hello!")).toBe(true);
    expect(isTriviallyAllowed("salut tout")).toBe(false); // 'tout' not in set
  });

  it("allows simple yes/no and thanks", () => {
    expect(isTriviallyAllowed("oui")).toBe(true);
    expect(isTriviallyAllowed("No.")).toBe(true);
    expect(isTriviallyAllowed("merci")).toBe(true);
  });

  it("allows an emoji-only message", () => {
    expect(isTriviallyAllowed("👍")).toBe(true);
    expect(isTriviallyAllowed("😀🎉")).toBe(true);
  });

  it("does not short-circuit a greeting mixed with an insult", () => {
    expect(isTriviallyAllowed("bonjour connard")).toBe(false);
  });

  it("does not short-circuit a real question (sent to the LLM gate)", () => {
    expect(isTriviallyAllowed("what do you think about GPT-5?")).toBe(false);
  });

  it("rejects an empty message", () => {
    expect(isTriviallyAllowed("   ")).toBe(false);
  });
});

describe("parseModerationVerdict", () => {
  it("parses a clean allow", () => {
    expect(parseModerationVerdict('{"decision":"allow","reason":"ok"}')).toEqual({
      decision: "allow",
      reason: "ok",
    });
  });

  it("parses a reject with its reason", () => {
    expect(
      parseModerationVerdict('{"decision":"reject","reason":"off_topic"}'),
    ).toEqual({ decision: "reject", reason: "off_topic" });
    expect(
      parseModerationVerdict('{"decision":"reject","reason":"disrespect"}'),
    ).toEqual({ decision: "reject", reason: "disrespect" });
  });

  it("defaults a reason-less reject to off_topic", () => {
    expect(parseModerationVerdict('{"decision":"reject"}')).toEqual({
      decision: "reject",
      reason: "off_topic",
    });
  });

  it("fails open on malformed / empty / unknown output", () => {
    expect(parseModerationVerdict("not json")).toEqual({
      decision: "allow",
      reason: "ok",
    });
    expect(parseModerationVerdict("")).toEqual({ decision: "allow", reason: "ok" });
    expect(parseModerationVerdict('{"decision":"maybe"}')).toEqual({
      decision: "allow",
      reason: "ok",
    });
  });
});

describe("detectObviousOffTopic", () => {
  it("rejects a canonical gardening probe", () => {
    expect(detectObviousOffTopic("comment planter des choux dans mon jardin ?")).toBe(
      true,
    );
  });

  it("does not reject when the off-topic word is used in a tech context", () => {
    expect(
      detectObviousOffTopic("une app IoT pour arroser automatiquement le jardin"),
    ).toBe(false);
  });

  it("does not reject a normal tech question", () => {
    expect(detectObviousOffTopic("comment optimiser une API Next.js ?")).toBe(false);
  });
});
