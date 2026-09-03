const imageService = require("../services/complaintImageService");
const { success, ApiError } = require("../utils/response");

async function upload(req, res) {
  if (!req.file) throw new ApiError(400, "No file uploaded (field name must be 'image')");
  const image = await imageService.addImage(req.user, req.params.id, req.file);
  return success(res, 201, { image });
}

async function remove(req, res) {
  await imageService.removeImage(req.user, req.params.id, req.params.imageId);
  return success(res, 200, { message: "Image removed" });
}

module.exports = { upload, remove };
