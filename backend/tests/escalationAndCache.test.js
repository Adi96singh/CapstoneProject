const { nextPriority, NON_TERMINAL_STATUSES } = require("../src/services/escalationService");
const { buildKey } = require("../src/utils/cache");

describe("escalationService.nextPriority", () => {
  test("bumps LOW -> MEDIUM -> HIGH -> CRITICAL", () => {
    expect(nextPriority("LOW")).toBe("MEDIUM");
    expect(nextPriority("MEDIUM")).toBe("HIGH");
    expect(nextPriority("HIGH")).toBe("CRITICAL");
  });

  test("CRITICAL stays CRITICAL (already max)", () => {
    expect(nextPriority("CRITICAL")).toBe("CRITICAL");
  });

  test("unknown priority is returned unchanged", () => {
    expect(nextPriority("WEIRD")).toBe("WEIRD");
  });
});

describe("escalationService.NON_TERMINAL_STATUSES", () => {
  test("does not include terminal states", () => {
    expect(NON_TERMINAL_STATUSES).not.toContain("CLOSED");
    expect(NON_TERMINAL_STATUSES).not.toContain("REJECTED");
    expect(NON_TERMINAL_STATUSES).not.toContain("ESCALATED");
  });

  test("includes the active working states", () => {
    expect(NON_TERMINAL_STATUSES).toEqual(
      expect.arrayContaining(["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "REOPENED"])
    );
  });
});

describe("cache.buildKey", () => {
  test("namespaces keys under solveit:", () => {
    expect(buildKey("categories")).toBe("solveit:categories");
  });

  test("joins multiple parts with colons", () => {
    expect(buildKey("analytics", "7d")).toBe("solveit:analytics:7d");
  });
});
