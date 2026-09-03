module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "SlaRule",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      priority: {
        type: DataTypes.ENUM("LOW", "MEDIUM", "HIGH", "CRITICAL"),
        allowNull: false,
      },
      categoryId: { type: DataTypes.UUID, allowNull: true },
      responseHours: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 24 },
      resolutionHours: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 72 },
    },
    { tableName: "sla_rules" }
  );
};
