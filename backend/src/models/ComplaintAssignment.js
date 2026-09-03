module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "ComplaintAssignment",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      complaintId: { type: DataTypes.UUID, allowNull: false },
      staffId: { type: DataTypes.UUID, allowNull: false },
      assignedById: { type: DataTypes.UUID, allowNull: true },
      assignedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: "complaint_assignments" }
  );
};
