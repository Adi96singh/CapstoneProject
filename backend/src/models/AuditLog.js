module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "AuditLog",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: true },
      action: { type: DataTypes.STRING(80), allowNull: false },
      entityType: { type: DataTypes.STRING(60), allowNull: false },
      entityId: { type: DataTypes.UUID, allowNull: true },
      oldValue: { type: DataTypes.JSON, allowNull: true },
      newValue: { type: DataTypes.JSON, allowNull: true },
      ip: { type: DataTypes.STRING(60), allowNull: true },
    },
    { tableName: "audit_logs" }
  );
};
