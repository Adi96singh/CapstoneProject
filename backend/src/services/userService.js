const { Op } = require("sequelize");
const { User, Department } = require("../models");
const { ApiError } = require("../utils/response");
const { cacheWrap, delCache, buildKey } = require("../utils/cache");
const assignmentService = require("./assignmentService");

async function list(query) {
  const where = {};
  if (query.role) where.role = query.role;
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${query.search}%` } },
      { email: { [Op.like]: `%${query.search}%` } },
    ];
  }
  return User.findAll({
    where,
    include: [{ model: Department, as: "department", attributes: ["id", "name"] }],
    order: [["createdAt", "DESC"]],
  });
}

async function updateUser(id, payload, actingAdmin) {
  const user = await User.findByPk(id);
  if (!user) throw new ApiError(404, "User not found");

  const allowed = ["name", "role", "departmentId", "isActive"];
  for (const key of allowed) {
    if (payload[key] !== undefined) {
      user[key] = payload[key] === "" ? null : payload[key];
    }
  }

  if (payload.role && payload.role === "admin" && actingAdmin.role !== "admin") {
    throw new ApiError(403, "Only an admin can grant admin role");
  }

  await user.save();
  return user;
}

/** Staff workload snapshot, cached briefly since it drives the auto-assign scoring input. */
async function staffWorkload() {
  const key = buildKey("staff-workload");
  const TTL = 120; // 2 min — assignment algorithm input
  return cacheWrap(key, TTL, async () => {
    const staff = await User.findAll({
      where: { role: "staff", isActive: true },
      include: [{ model: Department, as: "department", attributes: ["id", "name"] }],
    });
    const workloadMap = await assignmentService.getWorkloadMap(staff.map((s) => s.id));
    return staff.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      department: s.department ? s.department.name : null,
      activeComplaints: workloadMap.get(s.id) || 0,
    }));
  });
}

async function invalidateWorkloadCache() {
  await delCache(buildKey("staff-workload"));
}

module.exports = { list, updateUser, staffWorkload, invalidateWorkloadCache };
