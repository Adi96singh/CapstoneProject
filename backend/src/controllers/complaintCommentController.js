const commentService = require("../services/complaintCommentService");
const { success } = require("../utils/response");

async function list(req, res) {
  const comments = await commentService.listComments(req.user, req.params.id);
  return success(res, 200, { comments });
}

async function create(req, res) {
  const comment = await commentService.addComment(req.user, req.params.id, req.body);
  return success(res, 201, { comment });
}

module.exports = { list, create };
