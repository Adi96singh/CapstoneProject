const { Department, User } = require("../models");
const { ApiError } = require("../utils/response");
const { cacheWrap, delCache, buildKey } = require("../utils/cache");

const LIST_KEY = buildKey("departments");
const TTL = 600; // 10 min — rarely changes, high-frequency reads

async function list() {
  return cacheWrap(LIST_KEY, TTL, () =>
    Department.findAll({
      include: [{ model: User, as: "head", attributes: ["id", "name", "email"] }],
      order: [["name", "ASC"]],
    })
  );
}

async function create(payload) {
  const dept = await Department.create(payload);
  await delCache(LIST_KEY);
  return dept;
}

async function update(id, payload) {
  const dept = await Department.findByPk(id);
  if (!dept) throw new ApiError(404, "Department not found");
  Object.assign(dept, payload);
  await dept.save();
  await delCache(LIST_KEY);
  return dept;
}

async function remove(id) {
  const dept = await Department.findByPk(id);
  if (!dept) throw new ApiError(404, "Department not found");
  await dept.destroy();
  await delCache(LIST_KEY);
}

module.exports = { list, create, update, remove };
