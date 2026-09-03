module.exports = (sequelize, DataTypes) => {
  const Complaint = sequelize.define(
    "Complaint",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      refNo: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      title: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      status: {
        type: DataTypes.ENUM(
          "OPEN",
          "ASSIGNED",
          "IN_PROGRESS",
          "WAITING_FOR_USER",
          "RESOLVED",
          "REOPENED",
          "CLOSED",
          "ESCALATED",
          "REJECTED"
        ),
        allowNull: false,
        defaultValue: "OPEN",
      },
      priority: {
        type: DataTypes.ENUM("LOW", "MEDIUM", "HIGH", "CRITICAL"),
        allowNull: false,
        defaultValue: "MEDIUM",
      },
      categoryId: { type: DataTypes.UUID, allowNull: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      staffId: { type: DataTypes.UUID, allowNull: true },
      locationText: { type: DataTypes.STRING(255), allowNull: true },
      slaDeadline: { type: DataTypes.DATE, allowNull: true },
      idempotencyKey: { type: DataTypes.STRING(100), allowNull: true, unique: true },
      isPremium: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: "complaints",
      hooks: {
        beforeValidate: (complaint) => {
          if (!complaint.refNo) {
            const rand = Math.floor(1000 + Math.random() * 9000);
            complaint.refNo = `SLV-${Date.now().toString(36).toUpperCase()}${rand}`;
          }
        },
      },
    }
  );

  // Allowed transitions for the complaint lifecycle state machine
  Complaint.TRANSITIONS = {
    OPEN: ["ASSIGNED", "IN_PROGRESS", "ESCALATED", "REJECTED"],
    ASSIGNED: ["IN_PROGRESS", "RESOLVED", "ESCALATED", "REJECTED"],
    IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED", "ESCALATED", "REJECTED"],
    WAITING_FOR_USER: ["IN_PROGRESS", "RESOLVED", "REJECTED"],
    RESOLVED: ["CLOSED", "REOPENED"],
    REOPENED: ["IN_PROGRESS", "ASSIGNED", "RESOLVED"],
    ESCALATED: ["ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED"],
    REJECTED: ["REOPENED"],
    CLOSED: ["REOPENED"],
  };

  Complaint.canTransition = (from, to) => (Complaint.TRANSITIONS[from] || []).includes(to);

  return Complaint;
};
