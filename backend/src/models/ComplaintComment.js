module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "ComplaintComment",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      complaintId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      content: { type: DataTypes.TEXT, allowNull: false },
      isInternal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sentiment: {
        type: DataTypes.ENUM("POSITIVE", "NEUTRAL", "NEGATIVE", "URGENT"),
        allowNull: true,
      },
    },
    { tableName: "complaint_comments" }
  );
};
