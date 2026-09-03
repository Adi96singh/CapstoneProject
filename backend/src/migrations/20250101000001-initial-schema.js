"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const { UUID, UUIDV4, STRING, TEXT, BOOLEAN, ENUM, DATE, INTEGER, DECIMAL, JSON } = Sequelize;
    const now = { type: DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") };

    await queryInterface.createTable("departments", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      name: { type: STRING(100), allowNull: false, unique: true },
      description: { type: TEXT, allowNull: true },
      head_user_id: { type: UUID, allowNull: true },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.createTable("users", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      name: { type: STRING(120), allowNull: false },
      email: { type: STRING(150), allowNull: false, unique: true },
      password_hash: { type: STRING, allowNull: false },
      role: { type: ENUM("user", "staff", "admin"), allowNull: false, defaultValue: "user" },
      department_id: {
        type: UUID,
        allowNull: true,
        references: { model: "departments", key: "id" },
        onDelete: "SET NULL",
      },
      is_active: { type: BOOLEAN, allowNull: false, defaultValue: true },
      avatar: { type: STRING, allowNull: true },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.addConstraint("departments", {
      fields: ["head_user_id"],
      type: "foreign key",
      name: "fk_departments_head_user",
      references: { table: "users", field: "id" },
      onDelete: "SET NULL",
    });

    await queryInterface.createTable("sla_rules", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      priority: { type: ENUM("LOW", "MEDIUM", "HIGH", "CRITICAL"), allowNull: false },
      category_id: { type: UUID, allowNull: true },
      response_hours: { type: INTEGER, allowNull: false, defaultValue: 24 },
      resolution_hours: { type: INTEGER, allowNull: false, defaultValue: 72 },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.createTable("categories", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      name: { type: STRING(100), allowNull: false },
      description: { type: TEXT, allowNull: true },
      department_id: {
        type: UUID,
        allowNull: true,
        references: { model: "departments", key: "id" },
        onDelete: "SET NULL",
      },
      sla_rule_id: {
        type: UUID,
        allowNull: true,
        references: { model: "sla_rules", key: "id" },
        onDelete: "SET NULL",
      },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.addConstraint("sla_rules", {
      fields: ["category_id"],
      type: "foreign key",
      name: "fk_sla_rules_category",
      references: { table: "categories", field: "id" },
      onDelete: "CASCADE",
    });

    await queryInterface.createTable("complaints", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      ref_no: { type: STRING(20), allowNull: false, unique: true },
      title: { type: STRING(200), allowNull: false },
      description: { type: TEXT, allowNull: false },
      status: {
        type: ENUM(
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
        type: ENUM("LOW", "MEDIUM", "HIGH", "CRITICAL"),
        allowNull: false,
        defaultValue: "MEDIUM",
      },
      category_id: {
        type: UUID,
        allowNull: true,
        references: { model: "categories", key: "id" },
        onDelete: "SET NULL",
      },
      user_id: {
        type: UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      staff_id: {
        type: UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      location_text: { type: STRING(255), allowNull: true },
      sla_deadline: { type: DATE, allowNull: true },
      idempotency_key: { type: STRING(100), allowNull: true, unique: true },
      is_premium: { type: BOOLEAN, allowNull: false, defaultValue: false },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.createTable("complaint_images", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      complaint_id: {
        type: UUID,
        allowNull: false,
        references: { model: "complaints", key: "id" },
        onDelete: "CASCADE",
      },
      url: { type: STRING, allowNull: false },
      public_id: { type: STRING, allowNull: true },
      filename: { type: STRING, allowNull: true },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.createTable("complaint_comments", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      complaint_id: {
        type: UUID,
        allowNull: false,
        references: { model: "complaints", key: "id" },
        onDelete: "CASCADE",
      },
      user_id: {
        type: UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      content: { type: TEXT, allowNull: false },
      is_internal: { type: BOOLEAN, allowNull: false, defaultValue: false },
      sentiment: { type: ENUM("POSITIVE", "NEUTRAL", "NEGATIVE", "URGENT"), allowNull: true },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.createTable("complaint_assignments", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      complaint_id: {
        type: UUID,
        allowNull: false,
        references: { model: "complaints", key: "id" },
        onDelete: "CASCADE",
      },
      staff_id: {
        type: UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      assigned_by_id: {
        type: UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      assigned_at: { ...now },
      note: { type: TEXT, allowNull: true },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.createTable("complaint_status_history", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      complaint_id: {
        type: UUID,
        allowNull: false,
        references: { model: "complaints", key: "id" },
        onDelete: "CASCADE",
      },
      from_status: { type: STRING(30), allowNull: true },
      to_status: { type: STRING(30), allowNull: false },
      changed_by_id: {
        type: UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      reason: { type: TEXT, allowNull: true },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.createTable("notifications", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      user_id: {
        type: UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      complaint_id: {
        type: UUID,
        allowNull: true,
        references: { model: "complaints", key: "id" },
        onDelete: "SET NULL",
      },
      title: { type: STRING(150), allowNull: false },
      message: { type: TEXT, allowNull: false },
      type: { type: STRING(50), allowNull: false, defaultValue: "GENERAL" },
      is_read: { type: BOOLEAN, allowNull: false, defaultValue: false },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.createTable("notification_templates", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      event: { type: STRING(80), allowNull: false, unique: true },
      subject: { type: STRING(200), allowNull: false },
      body_html: { type: TEXT, allowNull: false },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.createTable("audit_logs", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      user_id: {
        type: UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      action: { type: STRING(80), allowNull: false },
      entity_type: { type: STRING(60), allowNull: false },
      entity_id: { type: UUID, allowNull: true },
      old_value: { type: JSON, allowNull: true },
      new_value: { type: JSON, allowNull: true },
      ip: { type: STRING(60), allowNull: true },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.createTable("password_reset_tokens", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      user_id: {
        type: UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      token_hash: { type: STRING, allowNull: false },
      expires_at: { type: DATE, allowNull: false },
      used_at: { type: DATE, allowNull: true },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.createTable("escalations", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      complaint_id: {
        type: UUID,
        allowNull: false,
        references: { model: "complaints", key: "id" },
        onDelete: "CASCADE",
      },
      triggered_at: { ...now },
      reason: { type: STRING(255), allowNull: false },
      from_priority: { type: STRING(20), allowNull: true },
      to_priority: { type: STRING(20), allowNull: true },
      created_at: now,
      updated_at: now,
    });

    await queryInterface.createTable("payments", {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      complaint_id: {
        type: UUID,
        allowNull: false,
        references: { model: "complaints", key: "id" },
        onDelete: "CASCADE",
      },
      user_id: {
        type: UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      stripe_session_id: { type: STRING, allowNull: true },
      amount: { type: DECIMAL(10, 2), allowNull: false },
      status: {
        type: ENUM("PENDING", "PAID", "FAILED", "REFUNDED"),
        allowNull: false,
        defaultValue: "PENDING",
      },
      created_at: now,
      updated_at: now,
    });
  },

  async down(queryInterface) {
    // Drop in reverse dependency order
    await queryInterface.dropTable("payments");
    await queryInterface.dropTable("escalations");
    await queryInterface.dropTable("password_reset_tokens");
    await queryInterface.dropTable("audit_logs");
    await queryInterface.dropTable("notification_templates");
    await queryInterface.dropTable("notifications");
    await queryInterface.dropTable("complaint_status_history");
    await queryInterface.dropTable("complaint_assignments");
    await queryInterface.dropTable("complaint_comments");
    await queryInterface.dropTable("complaint_images");
    await queryInterface.dropTable("complaints");
    await queryInterface.dropTable("categories");
    await queryInterface.dropTable("sla_rules");
    await queryInterface.removeConstraint("departments", "fk_departments_head_user");
    await queryInterface.dropTable("users");
    await queryInterface.dropTable("departments");
  },
};
