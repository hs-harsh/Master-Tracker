/**
 * Blocks guest (demo) accounts from the handful of endpoints that send email
 * from this deployment. Those mails go to the OWNER's inbox, not the guest's,
 * so letting a demo account trigger them gives the guest nothing and gives the
 * owner spam.
 *
 * Deliberately NOT applied to the AI routes: guests get the full product,
 * including Add with AI / Edit with AI, so the demo shows what the app does.
 * That does mean a guest spends the owner's Anthropic budget — the PIN on
 * guest sign-in (GUEST_PIN) is what limits who can do that.
 *
 * Mount AFTER `auth`, so req.user is populated.
 */
module.exports = (req, res, next) => {
  if (req.user?.isGuest) {
    return res.status(403).json({
      error: 'Sending email is off in the guest demo. Everything else works.',
    });
  }
  next();
};
