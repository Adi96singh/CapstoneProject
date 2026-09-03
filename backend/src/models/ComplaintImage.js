module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "ComplaintImage",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      complaintId: { type: DataTypes.UUID, allowNull: false },
      url: { type: DataTypes.STRING, allowNull: false },
      publicId: { type: DataTypes.STRING, allowNull: true },
      filename: { type: DataTypes.STRING, allowNull: true },
    },
    { tableName: "complaint_images" }
  );
};
