// A Telegram invite link (t.me/+code or t.me/joinchat/code) or a public group's t.me/<name>; same rule as the
// backend's notification_routes.INVITE, so the operator gets a precise message before saving.
export const INVITE = /^https:\/\/t\.me\/(\+[A-Za-z0-9_-]{8,64}|joinchat\/[A-Za-z0-9_-]{8,64}|[A-Za-z][A-Za-z0-9_]{4,31})$/;

/**
 * The ASAPify alert group. The join page always lists it, before an operator saves its invite link on the Admin page
 * and while the API cannot be reached; a group the API lists with the same link replaces it (with its own title).
 */
export const ALERT_GROUP_URL = 'https://t.me/+dWeL0KTSkbYxOTE9';
