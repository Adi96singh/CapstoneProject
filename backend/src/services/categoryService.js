const { Category, Department, SlaRule } = require("../models");
const { ApiError } = require("../utils/response");
const { cacheWrap, delCache, buildKey } = require("../utils/cache");

const LIST_KEY = buildKey("categories");
const TTL = 600; // 10 min — rarely changes, high-frequency reads (used on every complaint form)

const INCLUDE = [
  { model: Department, attributes: ["id", "name"] },
  { model: SlaRule, attributes: ["id", "priority", "responseHours", "resolutionHours"] },
];

async function list() {
  return cacheWrap(LIST_KEY, TTL, () => Category.findAll({ include: INCLUDE, order: [["name", "ASC"]] }));
}

async function create(payload) {
  const category = await Category.create(payload);
  await delCache(LIST_KEY);
  return category;
}

async function update(id, payload) {
  const category = await Category.findByPk(id);
  if (!category) throw new ApiError(404, "Category not found");
  Object.assign(category, payload);
  await category.save();
  await delCache(LIST_KEY);
  return category;
}

async function remove(id) {
  const category = await Category.findByPk(id);
  if (!category) throw new ApiError(404, "Category not found");
  await category.destroy();
  await delCache(LIST_KEY);
}

module.exports = { list, create, update, remove };
