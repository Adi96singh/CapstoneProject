module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "Payment",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      complaintId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      // Cashfree fields
      cfOrderId: { type: DataTypes.STRING, allowNull: true },
      cfSessionId: { type: DataTypes.STRING(512), allowNull: true },
      // Legacy Stripe field kept for migration safety
      stripeSessionId: { type: DataTypes.STRING, allowNull: true },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: "INR" },
      status: {
        type: DataTypes.ENUM("PENDING", "PAID", "FAILED", "REFUNDED"),
        allowNull: false,
        defaultValue: "PENDING",
      },
      gateway: {
        type: DataTypes.ENUM("CASHFREE", "STRIPE", "MANUAL"),
        allowNull: false,
        defaultValue: "CASHFREE",
      },
    },
    { tableName: "payments" }
  );
};
