const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");
const { User, Department } = require("../models");
const logger = require("../config/logger");

async function ensureDemoUsers() {
  try {
    const userCount = await User.count();
    if (userCount > 0) return;

    logger.info("[seed] No users found, creating default demo users...");
    const hash = (pw) => bcrypt.hashSync(pw, 10);

    const facilitiesDept = await Department.findOne({ where: { name: "Facilities & Maintenance" } });
    const itDept = await Department.findOne({ where: { name: "IT & Technology" } });

    await User.bulkCreate([
      {
        id: randomUUID(),
        name: "Admin User",
        email: "admin@solveit.app",
        passwordHash: hash("Admin@123"),
        role: "admin",
        isActive: true,
      },
      {
        id: randomUUID(),
        name: "Fiona Facilities",
        email: "staff.facilities@solveit.app",
        passwordHash: hash("Staff@123"),
        role: "staff",
        departmentId: facilitiesDept ? facilitiesDept.id : null,
        isActive: true,
      },
      {
        id: randomUUID(),
        name: "Ivan IT",
        email: "staff.it@solveit.app",
        passwordHash: hash("Staff@123"),
        role: "staff",
        departmentId: itDept ? itDept.id : null,
        isActive: true,
      },
      {
        id: randomUUID(),
        name: "Demo Student",
        email: "user@solveit.app",
        passwordHash: hash("User@123"),
        role: "user",
        isActive: true,
      },
    ]);

    logger.info("[seed] Default demo users created: admin@solveit.app, user@solveit.app, staff.facilities@solveit.app");
  } catch (err) {
    logger.warn(`[seed] Failed to ensure demo users: ${err.message}`);
  }
}

module.exports = { ensureDemoUsers };
