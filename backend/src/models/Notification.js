module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "Notification",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      complaintId: { type: DataTypes.UUID, allowNull: true },
      title: { type: DataTypes.STRING(150), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      type: { type: DataTypes.STRING(50), allowNull: false, defaultValue: "GENERAL" },
      isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: "notifications" }
  );
};
