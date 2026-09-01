/**
 * Blocks guest (demo) accounts from endpoints that spend the owner's money or
 * reach the outside world — the Anthropic-billed AI routes and the email
 * senders. Guest sign-in is unauthenticated by design, so without this anyone
 * on the internet could run up the API bill or send mail from the deployment.
 *
 * Mount AFTER `auth`, so req.user is populated.
 */
module.exports = (req, res, next) => {
  if (req.user?.isGuest) {
    return res.status(403).json({
      error: 'Not available in the guest demo. Create an account to use this.',
    });
  }
  next();
};
