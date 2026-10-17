// A Telegram invite link (t.me/+code or t.me/joinchat/code) or a public group's t.me/<name>; same rule as the
// backend's notification_routes.INVITE, so the operator gets a precise message before saving.
export const INVITE = /^https:\/\/t\.me\/(\+[A-Za-z0-9_-]{8,64}|joinchat\/[A-Za-z0-9_-]{8,64}|[A-Za-z][A-Za-z0-9_]{4,31})$/;
