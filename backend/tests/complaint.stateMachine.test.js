const { Sequelize, DataTypes } = require("sequelize");

describe("Complaint state machine", () => {
  let Complaint;

  beforeAll(() => {
    // Sequelize instance created purely so Complaint.init() has a dialect to
    // attach to — no connection is opened and no queries are run. We use the
    // mysql dialect (mysql2 is a runtime dependency) rather than sqlite so the
    // suite does not depend on sqlite3's native binding compiling correctly.
    const seq = new Sequelize("solveit_test", "root", "", {
      dialect: "mysql",
      logging: false,
    });
    Complaint = require("../src/models/Complaint")(seq, DataTypes);
  });

  test("allows OPEN -> ASSIGNED", () => {
    expect(Complaint.canTransition("OPEN", "ASSIGNED")).toBe(true);
  });

  test("rejects skipping the pipeline (OPEN -> RESOLVED)", () => {
    expect(Complaint.canTransition("OPEN", "RESOLVED")).toBe(false);
  });

  test("allows RESOLVED -> CLOSED", () => {
    expect(Complaint.canTransition("RESOLVED", "CLOSED")).toBe(true);
  });

  test("allows RESOLVED -> REOPENED and REOPENED -> IN_PROGRESS", () => {
    expect(Complaint.canTransition("RESOLVED", "REOPENED")).toBe(true);
    expect(Complaint.canTransition("REOPENED", "IN_PROGRESS")).toBe(true);
  });

  test("CLOSED and REJECTED are terminal states", () => {
    expect(Complaint.canTransition("CLOSED", "OPEN")).toBe(false);
    expect(Complaint.canTransition("REJECTED", "OPEN")).toBe(false);
  });
});

describe("Role transition policy", () => {
  const { ROLE_TRANSITIONS } = require("../src/services/complaintService");

  function canRole(role, from, to) {
    return (ROLE_TRANSITIONS[role] || []).some(([f, t]) => f === from && t === to);
  }

  test("users cannot assign complaints", () => {
    expect(canRole("user", "OPEN", "ASSIGNED")).toBe(false);
  });

  test("users can close their resolved complaint", () => {
    expect(canRole("user", "RESOLVED", "CLOSED")).toBe(true);
  });

  test("users can reopen a resolved complaint", () => {
    expect(canRole("user", "RESOLVED", "REOPENED")).toBe(true);
  });

  test("staff can move a complaint through the working pipeline", () => {
    expect(canRole("staff", "OPEN", "ASSIGNED")).toBe(true);
    expect(canRole("staff", "ASSIGNED", "IN_PROGRESS")).toBe(true);
    expect(canRole("staff", "IN_PROGRESS", "RESOLVED")).toBe(true);
  });

  test("staff cannot reject a complaint (admin-only)", () => {
    expect(canRole("staff", "OPEN", "REJECTED")).toBe(false);
  });

  test("admin can reject and escalate", () => {
    expect(canRole("admin", "OPEN", "REJECTED")).toBe(true);
    expect(canRole("admin", "OPEN", "ESCALATED")).toBe(true);
  });
});
