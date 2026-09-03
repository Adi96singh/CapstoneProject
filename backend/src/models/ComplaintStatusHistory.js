module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "ComplaintStatusHistory",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      complaintId: { type: DataTypes.UUID, allowNull: false },
      fromStatus: { type: DataTypes.STRING(30), allowNull: true },
      toStatus: { type: DataTypes.STRING(30), allowNull: false },
      changedById: { type: DataTypes.UUID, allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: "complaint_status_history" }
  );
};
