/**
 * Email Classification Engine
 * Categorizes emails into: BOUNCE, TRANSACTIONAL, NOTIFICATION, MARKETING, HUMAN, NEWSLETTER, UNKNOWN
 */

export class EmailClassifier {
  constructor() {
    this.categories = {
      BOUNCE: 1.0,
      TRANSACTIONAL: 0.9,
      NOTIFICATION: 0.85,
      MARKETING: 0.8,
      NEWSLETTER: 0.75,
      HUMAN: 0.6,
      UNKNOWN: 0.0,
    };

    // Common transactional senders
    this.transactionalPatterns = {
      from: [
        /noreply@/i,
        /no-reply@/i,
        /notifications?@/i,
        /notify@/i,
        /support@/i,
        /security@/i,
        /billing@/i,
        /invoices?@/i,
        /receipts?@/i,
        /orders?@/i,
        /accounts?@/i,
        /team@/i,
      ],
      subject: [
        /password reset/i,
        /reset your password/i,
        /verify your email/i,
        /confirm your email/i,
        /email verification/i,
        /order confirmation/i,
        /order #\d+/i,
        /receipt/i,
        /invoice/i,
        /payment received/i,
        /subscription/i,
        /welcome to/i,
        /account created/i,
        /security alert/i,
        /suspicious activity/i,
      ],
    };

    // Notification patterns
    this.notificationPatterns = {
      from: [
        /notifications?@/i,
        /alerts?@/i,
        /updates?@/i,
        /activity@/i,
        /digest@/i,
      ],
      subject: [
        /activity on/i,
        /you have (?:\d+|a) new/i,
        /new (?:comment|reply|message|mention)/i,
        /reminder:/i,
        /upcoming/i,
        /(?:daily|weekly|monthly) (?:summary|digest|report)/i,
        /someone.*(?:liked|commented|shared)/i,
        /\d+ new notification/i,
      ],
    };

    // Marketing patterns
    this.marketingPatterns = {
      subject: [
        /sale/i,
        /\d+% off/i,
        /discount/i,
        /limited time/i,
        /exclusive offer/i,
        /deal of the day/i,
        /free shipping/i,
        /buy now/i,
        /shop now/i,
        /don't miss/i,
        /last chance/i,
        /special offer/i,
        /promotion/i,
      ],
    };

    // Newsletter indicators
    this.newsletterPatterns = {
      subject: [
        /newsletter/i,
        /weekly roundup/i,
        /this week in/i,
        /edition #?\d+/i,
        /volume \d+/i,
      ],
    };
  }

  /**
   * Classify an email
   * @param {Object} email - Email object with subject, from, to, body, headers
   * @returns {Object} { category: string, confidence: number }
   */
  classify(email) {
    const from = (email.from || "").toLowerCase();
    const subject = (email.subject || "").toLowerCase();
    const body = (email.body || "").toLowerCase();
    const headers = email.headers || {};

    // 1. Check for BOUNCE (highest priority)
    if (this.isBounce(email)) {
      return { category: "BOUNCE", confidence: 1.0 };
    }

    // 2. Check for TRANSACTIONAL
    if (this.isTransactional(email)) {
      return { category: "TRANSACTIONAL", confidence: 0.9 };
    }

    // 3. Check for NOTIFICATION
    if (this.isNotification(email)) {
      return { category: "NOTIFICATION", confidence: 0.85 };
    }

    // 4. Check for NEWSLETTER
    if (this.isNewsletter(email)) {
      return { category: "NEWSLETTER", confidence: 0.75 };
    }

    // 5. Check for MARKETING
    if (this.isMarketing(email)) {
      return { category: "MARKETING", confidence: 0.8 };
    }

    // 6. Check for HUMAN (person-to-person)
    if (this.isHuman(email)) {
      return { category: "HUMAN", confidence: 0.7 };
    }

    // Default to UNKNOWN
    return { category: "UNKNOWN", confidence: 0.0 };
  }

  isBounce(email) {
    const from = (email.from || "").toLowerCase();
    const subject = (email.subject || "").toLowerCase();

    const bounceIndicators = [
      from.includes("mailer-daemon"),
      from.includes("postmaster"),
      from.includes("mail-daemon"),
      subject.includes("undelivered"),
      subject.includes("failure notice"),
      subject.includes("returned mail"),
      subject.includes("delivery status notification"),
      subject.includes("mail delivery failed"),
      subject.includes("undeliverable"),
      subject.includes("bounce"),
      subject.includes("permanent error"),
      subject.includes("delivery failure"),
    ];

    return bounceIndicators.some((indicator) => indicator);
  }

  isTransactional(email) {
    const from = (email.from || "").toLowerCase();
    const subject = (email.subject || "").toLowerCase();
    const headers = email.headers || {};

    // Check from patterns
    const fromMatch = this.transactionalPatterns.from.some((pattern) =>
      pattern.test(from),
    );

    // Check subject patterns
    const subjectMatch = this.transactionalPatterns.subject.some((pattern) =>
      pattern.test(subject),
    );

    // Transactional emails typically don't have List-Unsubscribe
    const hasListUnsubscribe =
      headers["list-unsubscribe"] || headers["List-Unsubscribe"];

    // Must match at least one pattern and not have unsubscribe header
    return (fromMatch || subjectMatch) && !hasListUnsubscribe;
  }

  isNotification(email) {
    const from = (email.from || "").toLowerCase();
    const subject = (email.subject || "").toLowerCase();

    // Check from patterns
    const fromMatch = this.notificationPatterns.from.some((pattern) =>
      pattern.test(from),
    );

    // Check subject patterns
    const subjectMatch = this.notificationPatterns.subject.some((pattern) =>
      pattern.test(subject),
    );

    return fromMatch || subjectMatch;
  }

  isMarketing(email) {
    const subject = (email.subject || "").toLowerCase();
    const body = (email.body || "").toLowerCase();
    const headers = email.headers || {};

    // Marketing emails usually have List-Unsubscribe header
    const hasListUnsubscribe =
      headers["list-unsubscribe"] || headers["List-Unsubscribe"];

    // Check for many links in body (marketing emails are link-heavy)
    const linkCount = (body.match(/https?:\/\//g) || []).length;
    const hasManyLinks = linkCount > 5;

    // Check subject patterns
    const subjectMatch = this.marketingPatterns.subject.some((pattern) =>
      pattern.test(subject),
    );

    // Must have unsubscribe header OR match patterns AND have many links
    return hasListUnsubscribe || (subjectMatch && hasManyLinks);
  }

  isNewsletter(email) {
    const subject = (email.subject || "").toLowerCase();
    const headers = email.headers || {};

    // Newsletters typically have both List-Unsubscribe and List-Post
    const hasListUnsubscribe =
      headers["list-unsubscribe"] || headers["List-Unsubscribe"];
    const hasListPost = headers["list-post"] || headers["List-Post"];

    // Check subject patterns
    const subjectMatch = this.newsletterPatterns.subject.some((pattern) =>
      pattern.test(subject),
    );

    // Must have list headers OR match newsletter subject patterns
    return (hasListUnsubscribe && hasListPost) || subjectMatch;
  }

  isHuman(email) {
    const from = (email.from || "").toLowerCase();
    // Handle both string and array formats
    const toArray = Array.isArray(email.to)
      ? email.to
      : email.to
        ? [email.to]
        : [];
    const to = toArray.map((addr) => addr.toLowerCase());
    const headers = email.headers || {};

    // Not from common automated senders
    const automatedSenders = [
      "noreply",
      "no-reply",
      "notifications",
      "alert",
      "updates",
      "newsletter",
      "marketing",
      "info",
      "support",
    ];

    const isAutomated = automatedSenders.some((sender) =>
      from.includes(sender),
    );

    // Has Reply-To that looks personal
    const replyTo = headers["reply-to"] || headers["Reply-To"] || "";
    const hasPersonalReplyTo =
      replyTo && !automatedSenders.some((sender) => replyTo.includes(sender));

    // Single recipient (more likely person-to-person)
    const isSingleRecipient = to.length === 1;

    // No list headers
    const hasListHeaders =
      headers["list-unsubscribe"] ||
      headers["List-Unsubscribe"] ||
      headers["list-id"] ||
      headers["List-Id"];

    // Human if: not automated, has personal reply-to, single recipient, no list headers
    return (
      !isAutomated &&
      (hasPersonalReplyTo || isSingleRecipient) &&
      !hasListHeaders
    );
  }

  /**
   * Get all category names
   * @returns {Array<string>}
   */
  getCategories() {
    return Object.keys(this.categories);
  }
}
