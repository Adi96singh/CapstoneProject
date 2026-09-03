const multer = require("multer");
const { ApiError } = require("../utils/response");

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new ApiError(400, "Only JPEG, PNG, or PDF files are allowed"));
    }
    cb(null, true);
  },
});

module.exports = upload;
