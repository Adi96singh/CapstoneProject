const { SlaRule, Category } = require("../models");
const { ApiError } = require("../utils/response");
const { cacheWrap, delCache, buildKey } = require("../utils/cache");

const LIST_KEY = buildKey("sla-rules");
const TTL = 600; // 10 min — config data, queried on every complaint creation

async function list() {
  return cacheWrap(LIST_KEY, TTL, () =>
    SlaRule.findAll({
      include: [{ model: Category, attributes: ["id", "name"] }],
      order: [["priority", "ASC"]],
    })
  );
}

async function create(payload) {
  const rule = await SlaRule.create(payload);
  await delCache(LIST_KEY);
  return rule;
}

async function update(id, payload) {
  const rule = await SlaRule.findByPk(id);
  if (!rule) throw new ApiError(404, "SLA rule not found");
  Object.assign(rule, payload);
  await rule.save();
  await delCache(LIST_KEY);
  return rule;
}

async function remove(id) {
  const rule = await SlaRule.findByPk(id);
  if (!rule) throw new ApiError(404, "SLA rule not found");
  await rule.destroy();
  await delCache(LIST_KEY);
}

module.exports = { list, create, update, remove };
