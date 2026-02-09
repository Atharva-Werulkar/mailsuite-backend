export class BounceDetector {
  constructor() {
    this.bounceIndicators = {
      fromPatterns: [
        /mailer-daemon@/i,
        /postmaster@/i,
        /noreply@/i,
        /no-reply@/i,
        /mail-daemon@/i,
        /mailerdaemon@/i,
      ],
      subjectPatterns: [
        /undelivered/i,
        /failure/i,
        /returned mail/i,
        /delivery status notification/i,
        /mail delivery failed/i,
        /undeliverable/i,
        /not delivered/i,
        /delivery failure/i,
        /bounce/i,
        /permanent error/i,
        /temporary failure/i,
      ],
    };

    this.hardBounceCodes = ["550", "551", "552", "553", "554"];
    this.softBounceCodes = ["450", "451", "452", "453"];
  }

  isBounceMessage(email) {
    const from = email.from?.toLowerCase() || "";
    const subject = email.subject?.toLowerCase() || "";
    const headers = email.headers || new Map();

    // Check From address
    const fromMatch = this.bounceIndicators.fromPatterns.some((pattern) =>
      pattern.test(from),
    );

    // Check Subject
    const subjectMatch = this.bounceIndicators.subjectPatterns.some((pattern) =>
      pattern.test(subject),
    );

    // Check Content-Type for delivery status
    const contentType = headers.get("content-type") || "";
    const isDeliveryStatus =
      /multipart\/report.*report-type=delivery-status/i.test(contentType);

    return fromMatch || subjectMatch || isDeliveryStatus;
  }

  parseBounce(email) {
    const body = email.body || "";
    const subject = email.subject || "";

    // Extract failed recipient email
    const failedRecipient = this.extractRecipientEmail(body, subject);

    // Extract SMTP error code
    const errorCode = this.extractErrorCode(body);

    // Extract diagnostic message
    const diagnostic = this.extractDiagnostic(body);

    // If no diagnostic found, log sample for debugging (first 500 chars)
    if (!diagnostic && process.env.DEBUG_BOUNCES === "true") {
      console.log("⚠️ No diagnostic extracted. Body sample:");
      console.log(body.substring(0, 500).replace(/\s+/g, " "));
      console.log("---");
    }

    // Classify bounce type
    const bounceType = this.classifyBounceType(errorCode, body);

    return {
      failedRecipient,
      errorCode: errorCode || "UNKNOWN",
      diagnostic: diagnostic || "No diagnostic information available",
      bounceType,
    };
  }

  extractRecipientEmail(body, subject) {
    // Common patterns for failed recipient (in order of specificity)
    const patterns = [
      // Specific bounce patterns (highest priority)
      /(?:failed|undelivered).*?(?:to|for|recipient)[:\s]+<?([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i,
      /Final-Recipient:.*?rfc822;\s*([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /Original-Recipient:.*?([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,

      // Angle bracket format (common in SMTP)
      /<([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/,

      // Contextual patterns
      /(?:to|for|recipient|user):\\s*([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,

      // Generic email pattern (lowest priority)
      /\\b([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\\b/,
    ];

    // Track all potential emails to choose the best one
    const potentialEmails = new Set();

    for (const pattern of patterns) {
      const matches = body.matchAll(new RegExp(pattern, "gi"));
      for (const match of matches) {
        if (match && match[1]) {
          const email = match[1].trim().toLowerCase();
          if (this.isValidEmail(email)) {
            potentialEmails.add(email);
          }
        }
      }

      // Also check subject
      const subjectMatch = subject.match(pattern);
      if (subjectMatch && subjectMatch[1]) {
        const email = subjectMatch[1].trim().toLowerCase();
        if (this.isValidEmail(email)) {
          potentialEmails.add(email);
        }
      }
    }

    // Filter out known system addresses
    const systemAddresses = [
      "mailer-daemon@",
      "postmaster@",
      "noreply@",
      "no-reply@",
    ];

    const validEmails = Array.from(potentialEmails).filter((email) => {
      return !systemAddresses.some((sys) => email.startsWith(sys));
    });

    // Return the first valid email found
    return validEmails.length > 0 ? validEmails[0] : null;
  }

  isValidEmail(email) {
    if (!email || typeof email !== "string") return false;

    email = email.trim().toLowerCase();

    // Email should be reasonable length
    if (email.length > 254 || email.length < 5) {
      return false;
    }

    // Basic email validation
    const emailRegex = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return false;
    }

    const [localPart, domain] = email.split("@");

    // Validate local part
    if (!localPart || localPart.length > 64) {
      return false;
    }

    // Reject if local part looks like a hex string or UUID (likely message ID)
    if (/^[0-9a-f]{8,}/.test(localPart)) {
      return false;
    }

    // Reject if contains multiple dots in sequence
    if (/\.{2,}/.test(email)) {
      return false;
    }

    // Validate domain
    if (!domain || domain.length < 3 || domain.length > 253) {
      return false;
    }

    // Reject known invalid patterns
    const invalidPatterns = [
      /https?:\/\//i, // URLs
      /<[^>]+>/, // HTML tags
      /\s/, // Whitespace
      /["'<>]/, // HTML characters
      /^[0-9a-f-]{36}@/i, // UUIDs
      /\.(png|jpg|jpeg|gif|svg|mp4|pdf|doc|zip)$/i, // File extensions
      /^[0-9a-f]{8}\.[0-9a-f]{8}/i, // Message ID format
      /@mx\.(google|yahoo|outlook)\.com$/i, // Mail server addresses (not user emails)
    ];

    for (const pattern of invalidPatterns) {
      if (pattern.test(email)) {
        return false;
      }
    }

    // Domain should have valid TLD
    const tld = domain.split(".").pop();
    if (!tld || tld.length < 2 || /^[0-9]+$/.test(tld)) {
      return false;
    }

    // Reject if domain is all numbers (except TLD)
    const domainWithoutTLD = domain.split(".").slice(0, -1).join(".");
    if (/^[0-9.]+$/.test(domainWithoutTLD)) {
      return false;
    }

    return true;
  }

  extractErrorCode(body) {
    // SMTP error codes (3-digit)
    const codeMatch = body.match(/\b([245]\d{2})\b/);
    return codeMatch ? codeMatch[1] : null;
  }

  extractDiagnostic(body) {
    // Comprehensive diagnostic extraction patterns
    const diagnosticPatterns = [
      // Standard SMTP format with enhanced status code
      /\b[245]\d{2}\s+[45]\.\d+\.\d+\s+(.+?)(?:\n\n|\r\n\r\n|$)/s,

      // SMTP error code with message
      /\b[245]\d{2}\s+[<#]?[45]\.\d+\.\d+[>#]?\s+(.+?)(?:\n\n|\r\n\r\n|$)/s,

      // Common bounce message formats
      /(?:Diagnostic-Code|diagnostic-code):\s*(?:smtp|SMTP);\s*(.+?)(?:\n\n|\r\n\r\n|$)/is,
      /(?:Status|status):\s*[45]\.\d+\.\d+\s+\((.+?)\)/is,
      /(?:Remote-MTA|Final-Recipient).*?\n.*?(?:Status|Action).*?\n.*?Diagnostic.*?:\s*(.+?)(?:\n\n|\r\n\r\n|$)/is,

      // Gmail-specific formats
      /Address not found.*?Your message wasn't delivered to.*?because.*?(.+?)(?:\.|\n)/is,
      /(The email account that you tried to reach does not exist[^\n]+)/i,
      /(The recipient server did not accept our requests[^\n]+)/i,

      // Outlook/Exchange formats
      /(?:Delivery has failed|did not reach the following recipient).*?\n\s*(.+?)(?:\n\n|\r\n\r\n|$)/is,

      // Generic SMTP response (strict)
      /\b[245]\d{2}\s+([^\n]+?)\s+(?:[a-z0-9-]+\s+-\s+gsmtp|$)/i,

      // Common error phrases (more specific)
      /((?:user|mailbox|recipient|address)\s+.*?(?:unknown|not found|does not exist|invalid|disabled|rejected))/i,
      /((?:quota|mailbox)\s+.*?(?:full|exceeded|over limit))/i,
    ];

    for (const pattern of diagnosticPatterns) {
      const match = body.match(pattern);
      if (match && match[1]) {
        let diagnostic = match[1].trim();

        // Clean and validate the diagnostic message
        diagnostic = this.cleanDiagnostic(diagnostic);

        // Only return if we have meaningful content
        if (this.isValidDiagnostic(diagnostic)) {
          return diagnostic.slice(0, 300); // Limit length to 300 chars
        }
      }
    }

    return null;
  }

  cleanDiagnostic(text) {
    if (!text) return "";

    let cleaned = text;

    // Remove URLs
    cleaned = cleaned.replace(/https?:\/\/[^\s)]+/gi, "");

    // Remove email addresses (except in meaningful error context)
    cleaned = cleaned.replace(
      /[a-z0-9.-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
      (match) => {
        // Keep if it's part of an error message
        if (/recipient|address|mailbox|user/i.test(cleaned)) {
          return "[email]";
        }
        return "";
      },
    );

    // Remove HTML tags and artifacts
    cleaned = cleaned.replace(/<[^>]+>/g, "");
    cleaned = cleaned.replace(/&[a-z]+;/gi, "");

    // Remove asterisks and decorative characters
    cleaned = cleaned.replace(/\*{3,}/g, "");
    cleaned = cleaned.replace(/={3,}/g, "");
    cleaned = cleaned.replace(/-{3,}/g, "");

    // Remove parentheses with only URLs
    cleaned = cleaned.replace(/\(\s*\)/g, "");

    // Replace newlines and excessive whitespace
    cleaned = cleaned.replace(/[\r\n]+/g, " ");
    cleaned = cleaned.replace(/\s+/g, " ");

    // Remove leading/trailing punctuation
    cleaned = cleaned.replace(/^[:\-–—,;.\s]+/, "");
    cleaned = cleaned.replace(/[:\-–—,;\s]+$/, "");

    // Remove generic disclaimer fragments
    const disclaimerPatterns = [
      /please notify the sender.*?(?:immediately|and)/i,
      /this (?:message|email) (?:is|was|contains).*?confidential/i,
      /if you (?:are not|received this).*?(?:intended|error)/i,
      /you are receiving this.*?because/i,
      /unsubscribe.*?here/i,
      /\bGDPR compliant\b/i,
      /terms of service/i,
      /privacy policy/i,
    ];

    for (const pattern of disclaimerPatterns) {
      cleaned = cleaned.replace(pattern, "");
    }

    return cleaned.trim();
  }

  isValidDiagnostic(text) {
    if (!text || text.length < 10) return false;

    // Must contain letters
    if (!/[a-zA-Z]/.test(text)) return false;

    // Should not be mostly URLs or special characters
    const specialCharCount = (text.match(/[^a-zA-Z0-9\s]/g) || []).length;
    if (specialCharCount > text.length * 0.4) return false;

    // Should not contain common non-diagnostic phrases
    const invalidPhrases = [
      /get ready for/i,
      /take a quick look/i,
      /you are receiving this/i,
      /enable auto/i,
      /schedule.*notetaker/i,
      /capture every conversation/i,
      /committed to protecting/i,
      /review our terms/i,
    ];

    for (const phrase of invalidPhrases) {
      if (phrase.test(text)) return false;
    }

    // Should contain meaningful bounce-related terms or be a proper sentence
    const meaningfulTerms = [
      /\b(?:deliver|bounce|fail|reject|error|invalid|exist|quota|full|unknown|temporary|permanent)\b/i,
      /\b(?:recipient|mailbox|address|account|user|server)\b/i,
      /\b\d{3}\b/, // SMTP codes
    ];

    const hasMeaningfulContent = meaningfulTerms.some((term) =>
      term.test(text),
    );
    return hasMeaningfulContent;
  }

  classifyBounceType(errorCode, body) {
    if (!errorCode) {
      // Try to determine from message content
      if (
        /user.*not.*found|mailbox.*not.*found|account.*disabled/i.test(body)
      ) {
        return "HARD";
      }
      if (/mailbox.*full|quota.*exceeded|temporarily/i.test(body)) {
        return "SOFT";
      }
      return "UNKNOWN";
    }

    if (this.hardBounceCodes.includes(errorCode)) {
      return "HARD";
    }

    if (this.softBounceCodes.includes(errorCode)) {
      return "SOFT";
    }

    // 5xx codes are generally hard bounces
    if (errorCode.startsWith("5")) {
      return "HARD";
    }

    // 4xx codes are generally soft bounces
    if (errorCode.startsWith("4")) {
      return "SOFT";
    }

    return "UNKNOWN";
  }
}
