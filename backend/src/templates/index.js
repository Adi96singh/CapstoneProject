// Minimal inline HTML email templates. Each is a pure function (data) => html
// so the email worker can render+send without any templating dependency.

const wrapper = (title, bodyHtml) => `
<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; background:#f4f5f7; padding:24px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;border:1px solid #e5e7eb;">
      <h2 style="color:#1f2937;margin-top:0;">SolveIt</h2>
      <h3 style="color:#111827;">${title}</h3>
      ${bodyHtml}
      <p style="color:#9ca3af;font-size:12px;margin-top:32px;">This is an automated message from SolveIt.</p>
    </div>
  </body>
</html>`;

const templates = {
  "password-reset": (data) =>
    wrapper(
      "Reset your password",
      `<p>Hi ${data.name},</p>
       <p>Click the button below to reset your SolveIt password. This link expires in 30 minutes.</p>
       <p><a href="${data.resetUrl}" style="background:#4f46e5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Reset password</a></p>
       <p>If you didn't request this, you can safely ignore this email.</p>`
    ),

  "complaint-assigned": (data) =>
    wrapper(
      "A complaint has been assigned to you",
      `<p>Hi ${data.staffName},</p>
       <p>Complaint <strong>${data.refNo}</strong> — "${data.title}" has been assigned to you.</p>
       <p><a href="${data.complaintUrl}">View complaint</a></p>`
    ),

  "status-changed": (data) =>
    wrapper(
      "Your complaint status has changed",
      `<p>Hi ${data.userName},</p>
       <p>Complaint <strong>${data.refNo}</strong> — "${data.title}" is now <strong>${data.toStatus}</strong>.</p>
       <p><a href="${data.complaintUrl}">View complaint</a></p>`
    ),

  "complaint-escalated": (data) =>
    wrapper(
      "A complaint has been escalated",
      `<p>Complaint <strong>${data.refNo}</strong> — "${data.title}" breached its SLA and has been
       escalated (priority ${data.fromPriority} → ${data.toPriority}).</p>
       <p><a href="${data.complaintUrl}">View complaint</a></p>`
    ),
};

function render(name, data) {
  const fn = templates[name];
  if (!fn) throw new Error(`Unknown email template: ${name}`);
  return fn(data);
}

module.exports = { render };
