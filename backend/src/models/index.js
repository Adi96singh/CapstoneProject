const sequelize = require("../config/db");
const { DataTypes } = require("sequelize");

const User = require("./User")(sequelize, DataTypes);
const Department = require("./Department")(sequelize, DataTypes);
const Category = require("./Category")(sequelize, DataTypes);
const SlaRule = require("./SlaRule")(sequelize, DataTypes);
const Complaint = require("./Complaint")(sequelize, DataTypes);
const ComplaintImage = require("./ComplaintImage")(sequelize, DataTypes);
const ComplaintComment = require("./ComplaintComment")(sequelize, DataTypes);
const ComplaintAssignment = require("./ComplaintAssignment")(sequelize, DataTypes);
const ComplaintStatusHistory = require("./ComplaintStatusHistory")(sequelize, DataTypes);
const Notification = require("./Notification")(sequelize, DataTypes);
const NotificationTemplate = require("./NotificationTemplate")(sequelize, DataTypes);
const AuditLog = require("./AuditLog")(sequelize, DataTypes);
const PasswordResetToken = require("./PasswordResetToken")(sequelize, DataTypes);
const Escalation = require("./Escalation")(sequelize, DataTypes);
const Payment = require("./Payment")(sequelize, DataTypes);

// ---- Associations ----

// Department <-> User (head)
Department.belongsTo(User, { as: "head", foreignKey: "headUserId" });
User.belongsTo(Department, { as: "department", foreignKey: "departmentId" });
Department.hasMany(User, { as: "members", foreignKey: "departmentId" });

// Category
Category.belongsTo(Department, { foreignKey: "departmentId" });
Department.hasMany(Category, { foreignKey: "departmentId" });
Category.belongsTo(SlaRule, { foreignKey: "slaRuleId" });

// SlaRule
SlaRule.belongsTo(Category, { foreignKey: "categoryId" });

// Complaint core relations
Complaint.belongsTo(User, { as: "author", foreignKey: "userId" });
Complaint.belongsTo(User, { as: "staff", foreignKey: "staffId" });
Complaint.belongsTo(Category, { foreignKey: "categoryId" });
User.hasMany(Complaint, { as: "complaints", foreignKey: "userId" });

// Images
Complaint.hasMany(ComplaintImage, { as: "images", foreignKey: "complaintId", onDelete: "CASCADE" });
ComplaintImage.belongsTo(Complaint, { foreignKey: "complaintId" });

// Comments
Complaint.hasMany(ComplaintComment, { as: "comments", foreignKey: "complaintId", onDelete: "CASCADE" });
ComplaintComment.belongsTo(Complaint, { foreignKey: "complaintId" });
ComplaintComment.belongsTo(User, { foreignKey: "userId" });

// Assignments
Complaint.hasMany(ComplaintAssignment, { as: "assignments", foreignKey: "complaintId", onDelete: "CASCADE" });
ComplaintAssignment.belongsTo(Complaint, { foreignKey: "complaintId" });
ComplaintAssignment.belongsTo(User, { as: "staff", foreignKey: "staffId" });
ComplaintAssignment.belongsTo(User, { as: "assignedBy", foreignKey: "assignedById" });

// Status history
Complaint.hasMany(ComplaintStatusHistory, { as: "statusHistory", foreignKey: "complaintId", onDelete: "CASCADE" });
ComplaintStatusHistory.belongsTo(Complaint, { foreignKey: "complaintId" });
ComplaintStatusHistory.belongsTo(User, { as: "changedBy", foreignKey: "changedById" });

// Notifications
User.hasMany(Notification, { foreignKey: "userId", onDelete: "CASCADE" });
Notification.belongsTo(User, { foreignKey: "userId" });
Notification.belongsTo(Complaint, { foreignKey: "complaintId" });

// Audit logs
AuditLog.belongsTo(User, { foreignKey: "userId" });

// Password reset
User.hasMany(PasswordResetToken, { foreignKey: "userId", onDelete: "CASCADE" });
PasswordResetToken.belongsTo(User, { foreignKey: "userId" });

// Escalation
Complaint.hasMany(Escalation, { as: "escalations", foreignKey: "complaintId", onDelete: "CASCADE" });
Escalation.belongsTo(Complaint, { foreignKey: "complaintId" });

// Payment
Complaint.hasOne(Payment, { foreignKey: "complaintId" });
Payment.belongsTo(Complaint, { foreignKey: "complaintId" });
Payment.belongsTo(User, { foreignKey: "userId" });

module.exports = {
  sequelize,
  User,
  Department,
  Category,
  SlaRule,
  Complaint,
  ComplaintImage,
  ComplaintComment,
  ComplaintAssignment,
  ComplaintStatusHistory,
  Notification,
  NotificationTemplate,
  AuditLog,
  PasswordResetToken,
  Escalation,
  Payment,
};
