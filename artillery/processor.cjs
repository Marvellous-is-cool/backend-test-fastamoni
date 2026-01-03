const { randomUUID } = require("crypto");

module.exports = {
  setUnique: setUnique,
};

function setUnique(context, events, done) {
  // Generate unique UUID for this user
  context.vars.uuid = randomUUID();

  // Generate unique idempotency key for donation
  context.vars.idempotencyKey = randomUUID();

  // Set password
  context.vars.password = "Password@123";

  // Get receiver ID from environment
  context.vars.receiverId = process.env.receiver_ID || "1";

  return done();
}
