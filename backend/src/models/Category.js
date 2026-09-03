module.exports = (sequelize, DataTypes) => {
  const Category = sequelize.define(
    "Category",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      departmentId: { type: DataTypes.UUID, allowNull: true },
      slaRuleId: { type: DataTypes.UUID, allowNull: true },
    },
    { tableName: "categories" }
  );

  return Category;
};
