module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "NotificationTemplate",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      event: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      subject: { type: DataTypes.STRING(200), allowNull: false },
      bodyHtml: { type: DataTypes.TEXT, allowNull: false },
    },
    { tableName: "notification_templates" }
  );
};
