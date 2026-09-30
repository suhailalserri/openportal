# Privacy Policy — AI Platform / منصة الذكاء الاصطناعي

**Last Updated:** September 24, 2026

---

## 1. Information We Collect

### 1.1 Account Information
- Email address
- Password (stored as a secure hash — we never see your password)
- Display name (optional)
- Profile avatar (optional)

### 1.2 Usage Data
- Conversation history (messages sent and received)
- Files you upload to a conversation and voice recordings, if and when those features are available (stored privately; only you can access them), and the text we extract from uploaded documents so the AI can read them (stored with the file and deleted with it)
- Credit balance and transaction history
- Which AI models you use
- Approximate token usage per request

### 1.3 Technical Data
- IP address (for security and fraud prevention)
- Browser type and device information (User-Agent)
- Login timestamps
- Automatic error reports when the app fails (page path, browser type, technical error details; see Section 3)

---

## 2. How We Use Your Information

| Data | Purpose |
|------|---------|
| Email | Account verification, notifications, support |
| Conversations | Delivering AI responses, storing your history |
| Usage logs | Billing accuracy, fraud prevention |
| IP address | Security, fraud detection, rate limiting |
| Error reports | Finding and fixing technical faults |

---

## 3. AI Provider Data Sharing

**Important:** When you send a message, the content is transmitted to third-party AI providers
to generate a response:

- **OpenAI** (gpt-4o, gpt-4o-mini): openai.com/privacy
- **Anthropic** (Claude): anthropic.com/privacy
- **Google** (Gemini): policies.google.com/privacy
- **DeepSeek**: deepseek.com/privacy

We transmit only the message content required to generate a response. If you attach a document or an image to a message, the text extracted from the document or the image itself (with its metadata, such as location data, removed) is sent to the AI provider together with that message. Attachments are never sent on later messages unless you attach them again. If you use voice input, the recording is sent to the AI provider to be converted into text; we delete the recording from our storage as soon as the transcription finishes (or within 24 hours if it could not finish) and we do not keep it. We do not share your
email address or account details with AI providers.

**We do NOT use your conversations to train AI models.**

### Error Monitoring Provider

When the app fails, an automatic error report may be sent to **Sentry** (sentry.io/privacy)
so we can fix the problem. A report contains technical details only: the page path, browser
and device type, and the technical trace of the error. It may also include your IP address as
seen by Sentry's servers. We configure it to exclude your messages, cookies and request
contents, and we do not use it for advertising or tracking.

---

## 4. Data Retention

| Data Type | Retention Period |
|-----------|-----------------|
| Account information | Until account deletion |
| Conversations (free users) | 90 days |
| Conversations (paid users) | 12 months |
| Files attached to a conversation | Until you delete the conversation or your account (removed within about 30 minutes of deletion) |
| Voice recordings | Deleted right after transcription; at most 24 hours if that fails |
| Uploads that were never completed | 1 hour |
| Transaction records | 5 years (legal requirement) |
| System logs | 30 days |
| Error reports | Up to 90 days |
| IP addresses | 90 days |

---

## 5. Your Rights

You have the right to:
- **Access** your data (download from Settings > Data & Privacy)
- **Delete** your account and all associated data (Settings > Data & Privacy)
- **Correct** inaccurate information (update in Settings)
- **Port** your data (export conversations as JSON)

Data deletion requests are processed within **30 days**.

---

## 6. Cookies

We use essential cookies for:
- Maintaining your login session
- Remembering your language preference

We do not use tracking or advertising cookies.

---

## 7. Security

- Passwords are hashed using bcrypt (never stored in plaintext)
- All data in transit uses TLS 1.2+
- Database access is restricted to internal networks only
- API keys are hashed and never stored in plaintext

---

## 8. Children

This Service is not directed to children under 18. We do not knowingly collect data from minors.

---

## 9. Changes to This Policy

We will notify you by email of material changes 14 days before they take effect.

---

## 10. Contact

For privacy questions or data requests: privacy@openportal.site

