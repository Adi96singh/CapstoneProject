const categoryService = require("../services/categoryService");
const { success } = require("../utils/response");

async function list(req, res) {
  return success(res, 200, { categories: await categoryService.list() });
}

module.exports = { list };
