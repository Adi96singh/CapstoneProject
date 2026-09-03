module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "Escalation",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      complaintId: { type: DataTypes.UUID, allowNull: false },
      triggeredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      reason: { type: DataTypes.STRING(255), allowNull: false },
      fromPriority: { type: DataTypes.STRING(20), allowNull: true },
      toPriority: { type: DataTypes.STRING(20), allowNull: true },
    },
    { tableName: "escalations" }
  );
};
