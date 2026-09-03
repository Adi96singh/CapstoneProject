const { rankByWorkload } = require("../src/services/assignmentService");
const {
  DEFAULT_HOURS,
  resolutionHoursFor,
  deadlineFromHours,
} = require("../src/services/slaService");

describe("Assignment scoring: rankByWorkload", () => {
  const staffA = { id: "a" };
  const staffB = { id: "b" };
  const staffC = { id: "c" };

  test("picks the staff member with the fewest active complaints first", () => {
    const workloadMap = new Map([
      ["a", 5],
      ["b", 1],
      ["c", 3],
    ]);
    const ranked = rankByWorkload([staffA, staffB, staffC], workloadMap);
    expect(ranked.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  test("staff with no recorded workload count as zero and rank first", () => {
    const workloadMap = new Map([["a", 2]]); // b, c have none
    const ranked = rankByWorkload([staffA, staffB, staffC], workloadMap);
    expect(ranked[0].id).not.toBe("a");
  });

  test("does not mutate the input array", () => {
    const input = [staffA, staffB, staffC];
    const workloadMap = new Map([
      ["a", 5],
      ["b", 1],
    ]);
    rankByWorkload(input, workloadMap);
    expect(input.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});

describe("SLA calculation", () => {
  test("falls back to DEFAULT_HOURS when no rule is configured", () => {
    expect(resolutionHoursFor(null, "CRITICAL")).toBe(DEFAULT_HOURS.CRITICAL.resolutionHours);
    expect(resolutionHoursFor(null, "LOW")).toBe(DEFAULT_HOURS.LOW.resolutionHours);
  });

  test("uses the configured rule's resolutionHours when a rule is found", () => {
    const rule = { resolutionHours: 5 };
    expect(resolutionHoursFor(rule, "CRITICAL")).toBe(5);
  });

  test("CRITICAL has a tighter SLA window than LOW", () => {
    expect(DEFAULT_HOURS.CRITICAL.resolutionHours).toBeLessThan(DEFAULT_HOURS.LOW.resolutionHours);
  });

  test("deadlineFromHours adds the correct offset", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const deadline = deadlineFromHours(24, from);
    expect(deadline.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });
});
