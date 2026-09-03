const { v4: uuidv4 } = require("uuid");
const streamifier = require("streamifier");
const cloudinary = require("../config/cloudinary");
const { Complaint, ComplaintImage } = require("../models");
const { ApiError } = require("../utils/response");
const { fileProcessingQueue } = require("../jobs/queues");

function uploadBuffer(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "solveit/complaints", public_id: publicId, resource_type: "auto" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

async function addImage(user, complaintId, file) {
  const complaint = await Complaint.findByPk(complaintId);
  if (!complaint) throw new ApiError(404, "Complaint not found");

  const isOwner = complaint.userId === user.id;
  const isStaffOnIt = complaint.staffId === user.id;
  if (!isOwner && !isStaffOnIt && user.role !== "admin") {
    throw new ApiError(403, "You do not have access to this complaint");
  }

  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    throw new ApiError(503, "File storage is not configured on this server");
  }

  const publicId = uuidv4(); // never trust the original filename
  const result = await uploadBuffer(file.buffer, publicId);

  const image = await ComplaintImage.create({
    complaintId,
    url: result.secure_url,
    publicId: result.public_id,
    filename: file.originalname,
  });

  await fileProcessingQueue.add("process-upload", {
    complaintId,
    imageId: image.id,
    uploadedById: user.id,
  });

  return image;
}

async function removeImage(user, complaintId, imageId) {
  const image = await ComplaintImage.findOne({ where: { id: imageId, complaintId } });
  if (!image) throw new ApiError(404, "Image not found");

  const complaint = await Complaint.findByPk(complaintId);
  if (complaint.userId !== user.id && user.role !== "admin") {
    throw new ApiError(403, "Only the complaint author or an admin can remove images");
  }

  if (image.publicId) {
    await cloudinary.uploader.destroy(image.publicId).catch(() => null);
  }
  await image.destroy();
}

module.exports = { addImage, removeImage };
