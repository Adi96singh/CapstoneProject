"use strict";
const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const hash = (pw) => bcrypt.hashSync(pw, 10);

    const deptFacilities = randomUUID();
    const deptIT = randomUUID();

    await queryInterface.bulkInsert("departments", [
      { id: deptFacilities, name: "Facilities", description: "Hostel/building maintenance", created_at: now, updated_at: now },
      { id: deptIT, name: "IT Services", description: "Network, accounts, devices", created_at: now, updated_at: now },
    ]);

    const adminId = randomUUID();
    const staffFacilitiesId = randomUUID();
    const staffITId = randomUUID();
    const userId = randomUUID();

    await queryInterface.bulkInsert("users", [
      { id: adminId, name: "Admin", email: "admin@solveit.app", password_hash: hash("Admin@123"), role: "admin", is_active: true, created_at: now, updated_at: now },
      { id: staffFacilitiesId, name: "Fiona Facilities", email: "staff.facilities@solveit.app", password_hash: hash("Staff@123"), role: "staff", department_id: deptFacilities, is_active: true, created_at: now, updated_at: now },
      { id: staffITId, name: "Ivan IT", email: "staff.it@solveit.app", password_hash: hash("Staff@123"), role: "staff", department_id: deptIT, is_active: true, created_at: now, updated_at: now },
      { id: userId, name: "Uma Student", email: "user@solveit.app", password_hash: hash("User@123"), role: "user", is_active: true, created_at: now, updated_at: now },
    ]);

    await queryInterface.bulkUpdate(
      "departments",
      { head_user_id: staffFacilitiesId },
      { id: deptFacilities }
    );
    await queryInterface.bulkUpdate(
      "departments",
      { head_user_id: staffITId },
      { id: deptIT }
    );

    const catPlumbing = randomUUID();
    const catElectrical = randomUUID();
    const catWifi = randomUUID();
    const catAccounts = randomUUID();

    await queryInterface.bulkInsert("categories", [
      { id: catPlumbing, name: "Plumbing", department_id: deptFacilities, created_at: now, updated_at: now },
      { id: catElectrical, name: "Electrical", department_id: deptFacilities, created_at: now, updated_at: now },
      { id: catWifi, name: "Wi-Fi / Network", department_id: deptIT, created_at: now, updated_at: now },
      { id: catAccounts, name: "Account Access", department_id: deptIT, created_at: now, updated_at: now },
    ]);

    await queryInterface.bulkInsert("sla_rules", [
      { id: randomUUID(), priority: "LOW", category_id: null, response_hours: 48, resolution_hours: 168, created_at: now, updated_at: now },
      { id: randomUUID(), priority: "MEDIUM", category_id: null, response_hours: 24, resolution_hours: 72, created_at: now, updated_at: now },
      { id: randomUUID(), priority: "HIGH", category_id: null, response_hours: 8, resolution_hours: 24, created_at: now, updated_at: now },
      { id: randomUUID(), priority: "CRITICAL", category_id: null, response_hours: 2, resolution_hours: 8, created_at: now, updated_at: now },
    ]);

    await queryInterface.bulkInsert("complaints", [
      {
        id: randomUUID(),
        ref_no: `SLV-DEMO${Math.floor(1000 + Math.random() * 9000)}`,
        title: "Leaking tap in Block C washroom",
        description: "The common washroom tap on the 2nd floor of Block C has been leaking for two days.",
        status: "OPEN",
        priority: "MEDIUM",
        category_id: catPlumbing,
        user_id: userId,
        location_text: "Block C, 2nd floor",
        sla_deadline: new Date(now.getTime() + 72 * 60 * 60 * 1000),
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("complaints", null, {});
    await queryInterface.bulkDelete("sla_rules", null, {});
    await queryInterface.bulkDelete("categories", null, {});
    await queryInterface.bulkDelete("users", null, {});
    await queryInterface.bulkDelete("departments", null, {});
  },
};
